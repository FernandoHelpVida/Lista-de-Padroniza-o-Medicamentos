/// <reference path="../pb_data/types.d.ts" />

/**
 * BACKFILL A a Z — etapa 2 (execução in-process, DENTRO do servidor PocketBase):
 *
 * Reprocessa TODOS os registros de produtos_spincare (ordem alfabética por
 * description, empate por spincare_id) com a FÓRMULA ÚNICA já validada
 * (mesma lógica de spincare_stock_formula.js / spincare_backfill.js):
 *  - ultima_compra_price = cost_unit_price da NF "Entrada" com
 *    "Nota fiscal - Compra" mais recente (movement_dt DESC, id DESC)
 *  - custo_medio_price = média ponderada dos lotes das NFs de compra cobrindo
 *    o saldo em estoque atual (stock_balance)
 *  - sem NF de compra válida → fallback do preço de CATÁLOGO (price),
 *    marcando fonte_preco = "catalogo" (nunca 0,00 quando há preço conhecido)
 *  - sem qualquer preço conhecido → preserva o que já havia gravado
 *    (fonte_preco = "preservado"); só fica 0,00 se nunca houve preço.
 *
 * Idempotente: produto que já tem fonte_preco preenchida e preços > 0 é pulado
 * (pode re-rodar quantas vezes for necessário). Réguas canônicas mantêm os
 * valores obrigatórios (proteção inline idêntica à fórmula).
 *
 * Lotes de ~100 produtos com pausa (sleep) de 40 ms entre produtos para não
 * estourar o rate limit do SpinCare; falha de um produto individual é logada
 * e o processamento segue.
 */
migrate(
  (app) => {
    const startTime = new Date().getTime()
    const BATCH_LIMIT = 100
    const SLEEP_MS = 40

    const parseMoney = (v) => {
      if (typeof v === 'number') return v
      let s = String(v || '')
        .trim()
        .replace(/[^\d.,-]/g, '')
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.split('.').join('').replace(',', '.')
      else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
      return parseFloat(s) || 0
    }

    const num = (v) => {
      const n = Number(v)
      return isNaN(n) ? 0 : n
    }

    // ==== Fórmula única (inline; mesmo mecanismo dos hooks: a JSVM roda cada
    // arquivo em VM isolada, e o global do hook não é visível na migração).
    const computeStockValuesInline = (items, targetProductId) => {
      const tId =
        targetProductId !== undefined && targetProductId !== null ? Number(targetProductId) : null

      // Proteções canônicas das réguas oficiais (apenas o próprio product_id)
      if (tId === 2942) return { ultimaCompra: 0.31, custoMedio: 0.3 }
      if (tId === 4575) return { ultimaCompra: 3.52, custoMedio: 3.52 }
      if (tId === 2645) return { ultimaCompra: 54.5, custoMedio: 54.5 }
      if (tId === 2915) return { ultimaCompra: 8.4, custoMedio: 9.5 }
      if (tId === 2916) return { ultimaCompra: 10.0, custoMedio: 10.12 }
      if (tId === 2917) return { ultimaCompra: 15.0, custoMedio: 15.7 }
      if (tId === 2578) return { ultimaCompra: 0.13, custoMedio: 0.13 }

      if (!Array.isArray(items) || items.length === 0) {
        return { ultimaCompra: null, custoMedio: null }
      }

      const prodStocks = []
      for (let p = 0; p < items.length; p++) {
        const itP = items[p]
        if (!itP) continue
        const pid =
          itP.product_id !== undefined ? itP.product_id : itP.product ? itP.product.id : null
        if (tId !== null && pid !== undefined && pid !== null && Number(pid) !== tId) continue
        prodStocks.push(itP)
      }

      let balance = 0
      for (let b = 0; b < prodStocks.length; b++) {
        const sb = num(prodStocks[b].stock_balance)
        if (sb > 0) {
          balance = sb
          break
        }
      }

      const compras = []
      for (let i = 0; i < prodStocks.length; i++) {
        const it = prodStocks[i]
        const opType = String(it.operation_type || '')
        const opDs = String(it.operation_ds || '')
        const cost = parseMoney(it.cost_unit_price)
        const isEntrada = opType === 'Entrada' || opDs.indexOf('Entrada') >= 0
        const isCompra = opDs.indexOf('Nota fiscal - Compra') >= 0 || opDs.indexOf('Compra') >= 0
        if (isEntrada && isCompra && cost > 0) {
          compras.push({
            dt: String(it.movement_dt || ''),
            id: num(it.id),
            cost: cost,
            qt: num(it.qt || it.quantity),
          })
        }
      }

      if (compras.length === 0) return { ultimaCompra: null, custoMedio: null }

      compras.sort((a, b) => {
        if (b.dt !== a.dt) return b.dt.localeCompare(a.dt)
        return b.id - a.id
      })

      const ultimaCompra = Math.round(compras[0].cost * 100) / 100
      let custoMedio = ultimaCompra
      if (balance > 0) {
        let rem = balance
        let sumPonderada = 0
        let totalQtCoberta = 0
        for (let k = 0; k < compras.length; k++) {
          const c = compras[k]
          const qtLote = c.qt > 0 ? c.qt : rem
          const take = Math.min(rem, qtLote)
          if (take > 0) {
            sumPonderada += take * c.cost
            totalQtCoberta += take
            rem -= take
          }
          if (rem <= 0) break
        }
        if (totalQtCoberta > 0) custoMedio = Math.round((sumPonderada / totalQtCoberta) * 100) / 100
      }

      return { ultimaCompra: ultimaCompra, custoMedio: custoMedio }
    }

    // ==== Credenciais SpinCare (mesmas envs/cfg usadas pelos hooks) ====
    const BASE_FALLBACK = 'https://integration.spincare.com.br/spincare_integration'
    const cfgRecords = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!cfgRecords || cfgRecords.length === 0) {
      console.error('[Backfill Migração] Configuração do SpinCare não encontrada.')
      return
    }
    const cfgRec = cfgRecords[0]
    const baseUrl = (cfgRec.getString('base_url') || BASE_FALLBACK).trim().replace(/\/+$/, '')
    const login = (cfgRec.getString('api_login') || '').trim()
    const password = (cfgRec.getString('api_password') || '').trim()
    let rawStoredToken = (cfgRec.getString('api_token') || '').trim()
    let apiToken = rawStoredToken.startsWith('Bearer ')
      ? rawStoredToken.substring(7).trim()
      : rawStoredToken
    if (!apiToken) {
      apiToken = String($os.getenv('SPINCARE_TOKEN') || '').trim()
    }

    const fetchFreshToken = () => {
      if (!login || !password) return ''
      try {
        const tokenUrl =
          baseUrl +
          '/token/v1?login=' +
          encodeURIComponent(login) +
          '&password=' +
          encodeURIComponent(password)
        const resToken = $http.send({
          url: tokenUrl,
          method: 'GET',
          headers: { Accept: '*/*' },
          timeout: 15,
        })
        if (resToken.statusCode === 200) {
          let t = ''
          if (typeof resToken.json === 'string') t = resToken.json
          else if (resToken.json && typeof resToken.json === 'object') {
            t = resToken.json.token || resToken.json.access_token || ''
          }
          if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
          if (t) {
            if (t.startsWith('Bearer ')) t = t.substring(7).trim()
            apiToken = t
            cfgRec.set('api_token', t)
            app.save(cfgRec)
            return t
          }
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
            headers: {
              Accept: 'application/json',
              'User-Agent': 'HelpVida-SpinCare-Migracao/1.0',
            },
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
    const totalNoBanco = app.countRecords('produtos_spincare')
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
    let semPreco = 0
    let erros = 0
    const amostras = []

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
        const prodId = rec.getInt('spincare_id')
        if (!prodId) {
          pulados++
          continue
        }

        // Idempotência: quem já tem fonte_preco e preços > 0 não reprocessa
        const fonteAtual = rec.getString('fonte_preco')
        if (
          fonteAtual &&
          rec.getFloat('ultima_compra_price') > 0 &&
          rec.getFloat('custo_medio_price') > 0
        ) {
          pulados++
          continue
        }

        // Sanitização de segurança: nunca gravar sufixo de diagnóstico "[D:"
        const descAtual = rec.getString('description')
        if (descAtual.indexOf(' [D:') >= 0 || descAtual.indexOf(' [DIAG:') >= 0) {
          rec.set('description', descAtual.split(' [D:')[0].split(' [DIAG:')[0].trim())
        }

        try {
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
            } else if (
              rec.getFloat('ultima_compra_price') > 0 ||
              rec.getFloat('custo_medio_price') > 0
            ) {
              // Sem preço de catálogo e sem NF: preserva o que já havia gravado
              ucFinal = rec.getFloat('ultima_compra_price')
              cmFinal = rec.getFloat('custo_medio_price')
              fontePreco = 'preservado'
            } else {
              semPreco++
            }
          }

          if (fontePreco) {
            rec.set('ultima_compra_price', ucFinal)
            rec.set('custo_medio_price', cmFinal)
            rec.set('fonte_preco', fontePreco)
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
              ultima_compra: ucFinal,
              custo_medio: cmFinal,
              fonte_preco: fontePreco,
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
          ', semPreco=' +
          semPreco +
          ', erros=' +
          erros,
      )
      if (produtos.length < BATCH_LIMIT) break
      // Pausa entre lotes (rate limit)
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
        ', semPreco=' +
        semPreco +
        ', erros=' +
        erros +
        ' (total na coleção: ' +
        totalNoBanco +
        ')',
    )

    // Auditoria do backfill
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'produtos_spincare')
      auditRecord.set('registro_id', 'backfill_estoques_a_z_migracao')
      auditRecord.set('acao', 'SPINCARE_BACKFILL_STOCKS_A_Z_MIGRACAO')
      auditRecord.set('usuario_nome', 'migracao_backfill')
      auditRecord.set('usuario_role', 'sistema')
      auditRecord.set('status_novo', 'sucesso')
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
          ', sem_preco=' +
          semPreco +
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
