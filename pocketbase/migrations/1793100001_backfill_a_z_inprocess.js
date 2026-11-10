///
/// Backfill A–Z in-process com apuração de estoques SpinCare (fórmula única validada).
///
/// Contexto: a migração 1793100000 (fonte_preco + limpeza de descrições) zerou as
/// réguas canônicas. Esta migração:
///   1. NUNCA grava 0: só escreve quando tem valor calculado válido (> 0).
///   2. Réguas canônicas: os 7 produtos são CALCULADOS da fonte (/get/stocks) e
///      comparados com a régua de validação; divergência => grava o valor
///      calculado, registra auditoria e o log mostra a divergência — mas nunca
///      grava zero.
///   3. Varredura A–Z de TODOS os produtos (mesmo quem já tem valor), em lotes,
///      com skip apenas para quem já tem valores coerentes (> 0 nos dois campos
///      e fonte_preco preenchida).
///   4. Fallback para produto sem NF de compra: preço de catálogo com
///      fonte_preco = 'catalogo'; se também não houver catálogo, preserva o
///      que já estava gravado (fonte_preco = 'preservado'). Nunca grava 0.
///
/// A fórmula é a mesma de pocketbase/hooks/spincare_stock_formula.js:
///   - última compra = cost_unit_price da última NF "Entrada" com
///     "Nota fiscal - Compra" (ordenação por data desc, invoice desc).
///   - custo médio = média ponderada dos lotes de entrada que cobrem o SALDO
///     DISPONÍVEL (total_qt - reserved_qt) em estoque.
///
migrate(
  (app) => {
    const startTime = new Date().getTime()
    const BATCH_LIMIT = 100
    const SLEEP_MS = 120

    // Régua de validação (valores provados contra a tela do SpinCare).
    // Usados APENAS para comparar com o valor CALCULADO da fonte; a gravação
    // usa o valor calculado (e registra divergência quando houver).
    const REGUAS_VALIDACAO = {
      2942: { desc: 'ESCOPOLAMINA 10MG+DIPIRONA 250MG', uc: 0.31, cm: 0.3 },
      4575: { desc: 'DIPIRONA 300MG', uc: 3.52, cm: 3.52 },
      2645: { desc: 'BUPRENORFINA 10MG ADESIVO', uc: 54.5, cm: 54.5 },
      2915: { desc: 'ENOXAPARINA 20MG', uc: 8.4, cm: 9.5 },
      2916: { desc: 'ENOXAPARINA 40MG', uc: 10.0, cm: 10.12 },
      2917: { desc: 'ENOXAPARINA 60MG', uc: 15.0, cm: 15.7 },
      2578: { desc: 'BACLOFENO 10MG CP', uc: 0.13, cm: 0.13 },
    }

    // ---- Credenciais SpinCare (mesmas dos hooks existentes) ----
    const getSpinConfig = (key, fallback) => {
      try {
        const recs = app.findRecordsByFilter('spincare_config', 'key = "' + key + '"', '', 1, 0)
        if (recs && recs.length > 0) return recs[0].getString('value') || fallback
      } catch (_) {}
      return fallback
    }

    const config = {
      base_url: getSpinConfig('base_url', 'https://homolog-api.spincare.com.br'),
      client_id: getSpinConfig('client_id', ''),
      client_secret: getSpinConfig('client_secret', ''),
      username: getSpinConfig('username', ''),
      password: getSpinConfig('password', ''),
    }
    const envBase = $os.getenv('SPINCARE_BASE_URL')
    const envClient = $os.getenv('SPINCARE_CLIENT_ID')
    const envSecret = $os.getenv('SPINCARE_CLIENT_SECRET')
    const envUser = $os.getenv('SPINCARE_USERNAME')
    const envPass = $os.getenv('SPINCARE_PASSWORD')
    if (envBase && !config.base_url) config.base_url = envBase
    if (envClient) config.client_id = envClient
    if (envSecret) config.client_secret = envSecret
    if (envUser) config.username = envUser
    if (envPass) config.password = envPass

    const baseUrl = String(config.base_url || '').replace(/\/$/, '')
    let apiToken = ''

    const parseMoney = (v) => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'number') return isFinite(v) ? v : 0
      const s = String(v)
        .trim()
        .replace(/[^\d.,-]/g, '')
      if (!s) return 0
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.'))
          return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
        return parseFloat(s.replace(/,/g, '')) || 0
      }
      if (s.indexOf(',') >= 0) return parseFloat(s.replace(',', '.')) || 0
      return parseFloat(s) || 0
    }

    // ==== Fórmula validada (espelho de spincare_stock_formula.js) ====
    const computeStockValuesInline = (allStocks, prodId) => {
      if (!allStocks || !allStocks.length) return { ultimaCompra: null, custoMedio: null }

      const toNum = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : 0
        return parseMoney(v)
      }

      const lotes = []
      for (let i = 0; i < allStocks.length; i++) {
        const s = allStocks[i] || {}
        const tipoMov = String(s.movement_type || s.tipo || s.type || '').trim()
        const docTipo = String(s.document_type || s.document || '').trim()
        const nfCompra =
          (tipoMov.toLowerCase() === 'entrada' || docTipo.toLowerCase() === 'entrada') &&
          (String(s.obs || '')
            .toLowerCase()
            .indexOf('nota fiscal - compra') >= 0 ||
            String(s.document_desc || s.document_description || '')
              .toLowerCase()
              .indexOf('compra') >= 0)
        if (!nfCompra) continue
        const cost = toNum(s.cost_unit_price !== undefined ? s.cost_unit_price : s.cost_price)
        const qt = toNum(s.qt !== undefined ? s.qt : s.quantity)
        const dt = String(s.date || s.dt || s.movement_date || '').trim()
        const inv = String(s.invoice || s.invoice_number || s.nf || '').trim()
        lotes.push({ cost, qt, dt, inv })
      }
      if (!lotes.length) return { ultimaCompra: null, custoMedio: null }

      // Ordena por data desc, depois invoice desc
      lotes.sort((a, b) => {
        const da = a.dt.split(' ')[0].split('-').reverse().join('-')
        const db = b.dt.split(' ')[0].split('-').reverse().join('-')
        if (da > db) return -1
        if (da < db) return 1
        return a.inv > b.inv ? -1 : a.inv < b.inv ? 1 : 0
      })

      const ultimaCompra = lotes[0].cost > 0 ? lotes[0].cost : null

      // Saldo disponível total
      let saldo = 0
      for (let i = 0; i < allStocks.length; i++) {
        const s = allStocks[i] || {}
        const tipoMov = String(s.movement_type || s.tipo || s.type || '')
          .trim()
          .toLowerCase()
        const qt = toNum(s.qt !== undefined ? s.qt : s.quantity)
        if (tipoMov === 'entrada') saldo += qt
        else if (tipoMov === 'saida') saldo -= qt
      }
      saldo = Math.max(0, saldo)

      // Média ponderada dos lotes que cobrem o saldo
      let restante = saldo
      let somaCusto = 0
      let somaQt = 0
      for (let i = 0; i < lotes.length && restante > 0; i++) {
        const usar = Math.min(lotes[i].qt, restante)
        somaCusto += usar * lotes[i].cost
        somaQt += usar
        restante -= usar
      }
      const custoMedio = somaQt > 0 ? somaCusto / somaQt : null

      return {
        ultimaCompra,
        custoMedio: custoMedio !== null ? Number(custoMedio.toFixed(4)) : null,
      }
    }

    // ==== Autenticação SpinCare ====
    const fetchFreshToken = () => {
      try {
        const resp = $http.send({
          url: baseUrl + '/auth/oauth/token',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:
            'grant_type=password&username=' +
            encodeURIComponent(config.username) +
            '&password=' +
            encodeURIComponent(config.password) +
            '&client_id=' +
            encodeURIComponent(config.client_id) +
            '&client_secret=' +
            encodeURIComponent(config.client_secret),
          timeout: 25,
        })
        if (resp && resp.statusCode === 200) {
          const j = resp.json
          if (j && (j.access_token || j.token)) {
            apiToken = j.access_token || j.token
            return apiToken
          }
        } else {
          console.error(
            '[Backfill Migração] Falha de autenticação: HTTP ' + (resp ? resp.statusCode : 'null'),
          )
        }
      } catch (authErr) {
        console.error('[Backfill Migração] Erro ao renovar token:', authErr)
      }
      return ''
    }
    if (!apiToken) apiToken = fetchFreshToken()
    if (!apiToken) {
      console.error('[Backfill Migração] Sem token de API SpinCare disponível.')
      return
    }

    const requestStocks = (prodId) => {
      let allStocks = []
      for (let p = 1; p <= 10; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(apiToken) +
          '&product_id=' +
          prodId +
          '&page_number=' +
          p +
          '&page_size=500'
        let resp = null
        try {
          resp = $http.send({
            url: url,
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-SpinCare-Migracao/1.0' },
            timeout: 25,
          })
        } catch (_) {
          break
        }
        if (resp && resp.statusCode === 401) {
          const fresh = fetchFreshToken()
          if (fresh) {
            try {
              resp = $http.send({
                url: url.replace(encodeURIComponent(apiToken), encodeURIComponent(fresh)),
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                  'User-Agent': 'HelpVida-SpinCare-Migracao/1.0',
                },
                timeout: 25,
              })
            } catch (_) {
              break
            }
          }
        }
        if (!resp || resp.statusCode !== 200) break
        let list = []
        try {
          list = resp.json || JSON.parse(resp.raw || '[]')
        } catch (_) {
          list = []
        }
        if (Array.isArray(list)) {
          allStocks = allStocks.concat(list)
          if (list.length < 500) break
        } else if (list && Array.isArray(list.items)) {
          allStocks = allStocks.concat(list.items)
          if (list.items.length < 500) break
        } else {
          break
        }
      }
      return allStocks
    }

    // ==== Varredura completa, em lotes de 100 ====
    let totalNoBanco = 0
    try {
      totalNoBanco = app.countRecords('produtos_spincare')
    } catch (_) {
      totalNoBanco = app.findRecordsByFilter('produtos_spincare', 'id != ""', '', 1, 0).length
    }
    console.log(
      '[Backfill Migração] Iniciando varredura A a Z in-process: ' +
        totalNoBanco +
        ' produtos, lote=' +
        BATCH_LIMIT +
        ', sleep=' +
        SLEEP_MS +
        'ms',
    )

    let offset = 0
    let processados = 0
    let atualizados = 0
    let pulados = 0
    let semCompras = 0
    let fallbackCatalogo = 0
    let preservados = 0
    let semPreco = 0
    let divergencias = 0
    let erros = 0
    const amostras = []
    const divergenciaLog = []

    while (true) {
      const produtos = app.findRecordsByFilter(
        'produtos_spincare',
        'id != ""',
        'description,spincare_id',
        BATCH_LIMIT,
        offset,
      )
      if (!produtos || produtos.length === 0) break

      for (let i = 0; i < produtos.length; i++) {
        const rec = produtos[i]
        const prodId = Number(rec.getInt('spincare_id'))
        if (!prodId) {
          pulados++
          continue
        }

        // Idempotência: quem já tem preços > 0 e fonte_preco coerente não reprocessa —
        // EXCETO réguas canônicas, que são sempre recalculadas da fonte (prova).
        const fonteAtual = rec.getString('fonte_preco')
        const ucAtual = rec.getFloat('ultima_compra_price')
        const cmAtual = rec.getFloat('custo_medio_price')
        const ehRegua = !!REGUAS_VALIDACAO[prodId]
        if (!ehRegua && fonteAtual && ucAtual > 0 && cmAtual > 0) {
          pulados++
          continue
        }

        // Sanitização de segurança: nunca gravar sufixo de diagnóstico "[D:"
        const descAtual = rec.getString('description')
        let dirty = false
        if (descAtual.indexOf(' [D:') >= 0 || descAtual.indexOf(' [DIAG:') >= 0) {
          rec.set('description', descAtual.split(' [D:')[0].split(' [DIAG:')[0].trim())
          dirty = true
        }

        try {
          if (ehRegua) {
            // Réguas: calcula da FONTE e compara com a régua de validação.
            const allStocks = requestStocks(prodId)
            const calc = computeStockValuesInline(allStocks, prodId)
            const regua = REGUAS_VALIDACAO[prodId]
            if (
              calc &&
              calc.ultimaCompra !== null &&
              calc.ultimaCompra > 0 &&
              calc.custoMedio !== null &&
              calc.custoMedio > 0
            ) {
              const ucCalc = Number(calc.ultimaCompra.toFixed(2))
              const cmCalc = Number(calc.custoMedio.toFixed(2))
              if (ucCalc !== regua.uc || cmCalc !== regua.cm) {
                divergencias++
                const msg =
                  'DIVERGÊNCIA régua ' +
                  prodId +
                  ' (' +
                  regua.desc +
                  '): calculado UC=' +
                  ucCalc +
                  ' CM=' +
                  cmCalc +
                  ' vs régua UC=' +
                  regua.uc +
                  ' CM=' +
                  regua.cm
                divergenciaLog.push(msg)
                console.error('[Backfill Migração] ' + msg)
              }
              rec.set('ultima_compra_price', ucCalc)
              rec.set('custo_medio_price', cmCalc)
              rec.set('fonte_preco', 'nf_compra')
              dirty = true
            } else if (!divergenciaLog.length) {
              // Não conseguiu calcular (stocks vazio/erro): NÃO grava zero.
              console.error(
                '[Backfill Migração] Régua ' +
                  prodId +
                  ' (' +
                  regua.desc +
                  '): sem NF de compra na API — mantendo valores atuais (' +
                  ucAtual +
                  '/' +
                  cmAtual +
                  ')',
              )
            }
          } else {
            const allStocks = requestStocks(prodId)
            const calc = computeStockValuesInline(allStocks, prodId)

            let fontePreco = ''
            let ucFinal = 0
            let cmFinal = 0
            if (
              calc &&
              calc.ultimaCompra !== null &&
              (calc.ultimaCompra > 0 || calc.custoMedio > 0)
            ) {
              ucFinal = calc.ultimaCompra > 0 ? calc.ultimaCompra : calc.custoMedio
              cmFinal = calc.custoMedio > 0 ? calc.custoMedio : calc.ultimaCompra
              fontePreco = 'nf_compra'
            } else {
              semCompras++
              const catalogPrice = rec.getFloat('price')
              if (catalogPrice > 0) {
                ucFinal = catalogPrice
                cmFinal = catalogPrice
                fontePreco = 'catalogo'
                fallbackCatalogo++
              } else if (ucAtual > 0 || cmAtual > 0) {
                // Sem preço de catálogo e sem NF: preserva o que já havia gravado
                ucFinal = ucAtual
                cmFinal = cmAtual
                fontePreco = 'preservado'
                preservados++
              } else {
                semPreco++
              }
            }

            if (fontePreco) {
              rec.set('ultima_compra_price', ucFinal)
              rec.set('custo_medio_price', cmFinal)
              rec.set('fonte_preco', fontePreco)
              dirty = true
            }
          }

          if (dirty) {
            rec.set('synced_at', new Date().toISOString())
            app.save(rec)
            atualizados++
          }

          processados++
          if (amostras.length < 20) {
            amostras.push({
              spincare_id: prodId,
              description: rec.getString('description'),
              price: rec.getFloat('price'),
              ultima_compra: rec.getFloat('ultima_compra_price'),
              custo_medio: rec.getFloat('custo_medio_price'),
              fonte_preco: rec.getString('fonte_preco'),
            })
          }
        } catch (prodErr) {
          erros++
          console.error('[Backfill Migração] Erro no produto ' + prodId + ':', prodErr)
        }

        if (SLEEP_MS > 0) {
          try {
            sleep(SLEEP_MS)
          } catch (_) {}
        }
      }

      offset += produtos.length
      console.log(
        '[Backfill Migração] Lote concluído até offset ' +
          offset +
          '/' +
          totalNoBanco +
          ': processados=' +
          processados +
          ', atualizados=' +
          atualizados +
          ', pulados=' +
          pulados +
          ', semCompras=' +
          semCompras +
          ', fallbackCatalogo=' +
          fallbackCatalogo +
          ', preservados=' +
          preservados +
          ', semPreco=' +
          semPreco +
          ', divergencias=' +
          divergencias +
          ', erros=' +
          erros,
      )
      if (produtos.length < BATCH_LIMIT) break
      try {
        sleep(500)
      } catch (_) {}
    }

    const durationSec = Math.round((new Date().getTime() - startTime) / 1000)
    console.log(
      '[Backfill Migração] Varredura A a Z concluída em ' +
        durationSec +
        's: processados=' +
        processados +
        ', atualizados=' +
        atualizados +
        ', pulados=' +
        pulados +
        ', semCompras=' +
        semCompras +
        ', fallbackCatalogo=' +
        fallbackCatalogo +
        ', preservados=' +
        preservados +
        ', semPreco=' +
        semPreco +
        ', divergencias=' +
        divergencias +
        ', erros=' +
        erros +
        ' (total na coleção: ' +
        totalNoBanco +
        ')',
    )
    if (divergenciaLog.length) {
      console.error('[Backfill Migração] RESUMO DE DIVERGÊNCIAS:\n' + divergenciaLog.join('\n'))
    }

    // Auditoria do backfill
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'produtos_spincare')
      auditRecord.set('registro_id', 'backfill_estoques_a_z_migracao')
      auditRecord.set('acao', 'SPINCARE_BACKFILL_STOCKS_A_Z_MIGRACAO')
      auditRecord.set('usuario_nome', 'migracao_backfill')
      auditRecord.set('usuario_role', 'sistema')
      auditRecord.set('status_novo', divergencias > 0 ? 'divergencia' : 'sucesso')
      auditRecord.set(
        'detalhes',
        'Backfill A a Z in-process: total=' +
          totalNoBanco +
          ', processados=' +
          processados +
          ', atualizados=' +
          atualizados +
          ', pulados=' +
          pulados +
          ', sem_compras=' +
          semCompras +
          ', fallback_catalogo=' +
          fallbackCatalogo +
          ', preservados=' +
          preservados +
          ', sem_preco=' +
          semPreco +
          ', divergencias=' +
          divergencias +
          ', erros=' +
          erros +
          ', duracao=' +
          durationSec +
          's',
      )
      app.save(auditRecord)
    } catch (_) {}
  },
  (app) => {},
)
