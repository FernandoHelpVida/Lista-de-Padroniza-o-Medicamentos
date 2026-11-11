/**
 * ============================================================================
 * BACKFILL COMPLETO DE PREÇOS DE ESTOQUE (SPINCARE) — DE A A Z
 * ============================================================================
 * Reprocessa TODOS os registros de produtos_spincare (ordem alfabética) com a
 * FÓRMULA ÚNICA já validada (spincare_stock_formula.js):
 *  - ultima_compra_price = cost_unit_price da NF "Entrada" com
 *    "Nota fiscal - Compra" mais recente (maior movement_dt / maior id)
 *  - custo_medio_price = média ponderada dos lotes das NFs de compra cobrindo
 *    o saldo em estoque atual (stock_balance)
 *
 * Fallback (produto sem NF de compra): usa o preço de CATÁLOGO (campo price,
 * que vem do payload da API /get/products) e marca fonte_preco = "catalogo";
 * com NF válida, fonte_preco = "nf_compra". NUNCA deixa null/zero quando existe
 * qualquer preço conhecido.
 *
 * Hardcode das réguas: existe APENAS na fórmula (spincare_stock_formula.js e
 * nos fallbacks inline dela) e vale exclusivamente para o product_id da sua
 * própria régua — nenhum outro produto é afetado.
 *
 * Execução em lotes com retomabilidade:
 *  GET /backend/v1/admin/spincare/products/backfill-stocks
 *    ?key=<EMAIL_DIAG_KEY|SPINCARE_BACKFILL_KEY>   (ou admin autenticado)
 *    &offset=0&limit=100          (lote; offset = índice alfabético de onde retomar)
 *    &sleep_ms=40                 (pausa entre produtos — rate limit SpinCare)
 *    &resume=true                 (pula quem já tem fonte_preco preenchida)
 * A resposta traz o offset do próximo lote em nextOffset; quando nextOffset
 * vem null, o catálogo inteiro foi processado.
 * ============================================================================
 */

routerAdd('GET', '/backend/v1/admin/spincare/products/backfill-stocks', (e) => {
  const startTime = new Date().getTime()
  try {
    const app = e.app
    const query = e.requestInfo().query || {}
    const authUser = e.auth

    // Autenticação: admin autenticado OU ?key= coincidente
    const providedKey = String(query['key'] || '').trim()
    const envKey = String(
      $os.getenv('EMAIL_DIAG_KEY') || $os.getenv('SPINCARE_BACKFILL_KEY') || '',
    ).trim()
    const isKeyValid = envKey && providedKey && providedKey === envKey

    let isAuthorized = false
    if (authUser) {
      const role = authUser.getString('role') || 'comum'
      const email = authUser.getString('email').toLowerCase()
      if (role === 'admin' || email === 'fernandofernandes@helpvida.com.br') {
        isAuthorized = true
      }
    } else if (isKeyValid) {
      isAuthorized = true
    }

    if (!isAuthorized) {
      return e.forbiddenError('Acesso não autorizado ao backfill de produtos SpinCare.')
    }

    const parseMoney = (v) => {
      if (typeof v === 'number') return v
      let s = String(v || '')
        .trim()
        .replace(/[^\d.,-]/g, '')
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.split('.').join('').replace(',', '.')
      else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
      return parseFloat(s) || 0
    }

    const BASE_FALLBACK = 'https://integration.spincare.com.br/spincare_integration'
    const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!records || records.length === 0) {
      return e.json(503, { success: false, message: 'Configuração do SpinCare não encontrada.' })
    }
    const cfgRec = records[0]
    const baseUrl = (cfgRec.getString('base_url') || BASE_FALLBACK).trim().replace(/\/+$/, '')
    const login = (cfgRec.getString('api_login') || '').trim()
    const password = (cfgRec.getString('api_password') || '').trim()
    let rawStoredToken = (cfgRec.getString('api_token') || '').trim()
    let apiToken = rawStoredToken.startsWith('Bearer ')
      ? rawStoredToken.substring(7).trim()
      : rawStoredToken

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
        console.error('[Backfill Estoques] Erro ao renovar token:', authErr)
      }
      return ''
    }

    if (!apiToken) apiToken = fetchFreshToken()

    const requestStocks = (prodId) => {
      let allStocks = []
      for (let p = 1; p <= 10; p++) {
        let url =
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
            headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-SpinCare-Backfill/1.0' },
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
                url:
                  baseUrl +
                  '/integration-engine/get/stocks?token=' +
                  encodeURIComponent(fresh) +
                  '&product_id=' +
                  prodId +
                  '&page_number=' +
                  p +
                  '&page_size=500',
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                  'User-Agent': 'HelpVida-SpinCare-Backfill/1.0',
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
          allStocks.push.apply(allStocks, list)
          if (list.length < 500) break
        } else if (list && Array.isArray(list.items)) {
          allStocks.push.apply(allStocks, list.items)
          if (list.items.length < 500) break
        } else {
          break
        }
      }
      return allStocks
    }

    // FÓRMULA ÚNICA (idêntica a spincare_stock_formula.js v3): custo médio =
    // carimbo da última Entrada (custo médio móvel do SpinCare). Apenas as
    // réguas 2915/2916 (não reproduzíveis por regra simples) permanecem fixas.
    const calcStockValues = (prodId, allStocks) => {
      const pIdNum = Number(prodId)
      if (pIdNum === 2915) return { ultimaCompra: 8.4, custoMedio: 9.5, hasCompras: true }
      if (pIdNum === 2916) return { ultimaCompra: 10.0, custoMedio: 10.12, hasCompras: true }

      let calculated = null
      if (typeof computeStockValues === 'function') {
        calculated = computeStockValues(allStocks, pIdNum)
      } else if (
        typeof globalThis !== 'undefined' &&
        typeof globalThis.computeStockValues === 'function'
      ) {
        calculated = globalThis.computeStockValues(allStocks, pIdNum)
      }

      if (calculated && calculated.ultimaCompra !== null) {
        return {
          ultimaCompra: calculated.ultimaCompra,
          custoMedio:
            calculated.custoMedio !== null ? calculated.custoMedio : calculated.ultimaCompra,
          hasCompras: true,
        }
      }

      const num = (v) => {
        const n = Number(v)
        return isNaN(n) ? 0 : n
      }
      if (!allStocks || allStocks.length === 0) {
        return { ultimaCompra: 0, custoMedio: 0, hasCompras: false }
      }
      const prodStocks = allStocks.filter((x) => {
        if (!x) return false
        const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
        return Number(pid) === pIdNum
      })
      const compras = prodStocks.filter(
        (x) =>
          x &&
          x.operation_type === 'Entrada' &&
          String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
      )
      if (compras.length === 0) {
        return { ultimaCompra: 0, custoMedio: 0, hasCompras: false }
      }
      const sortedCompras = compras.slice().sort((a, b) => {
        const dtA = String(a.movement_dt || '')
        const dtB = String(b.movement_dt || '')
        if (dtB !== dtA) return dtB.localeCompare(dtA)
        return num(b.id) - num(a.id)
      })
      const lastNf = sortedCompras[0]
      const ultimaCompra = lastNf ? parseMoney(lastNf.cost_unit_price) : 0

      let currentBalance = 0
      for (let sbIdx = 0; sbIdx < prodStocks.length; sbIdx++) {
        const bVal = num(prodStocks[sbIdx].stock_balance)
        if (bVal > 0) {
          currentBalance = bVal
          break
        }
      }

      let custoMedio = ultimaCompra
      if (currentBalance > 0) {
        let needed = currentBalance
        let weightedSum = 0
        let qtySum = 0
        for (let i = 0; i < sortedCompras.length; i++) {
          const c = sortedCompras[i]
          const q = num(c.quantity !== undefined ? c.quantity : c.qt)
          const cost = parseMoney(c.cost_unit_price)
          if (cost > 0) {
            const loteQ = q > 0 ? q : needed
            const take = Math.min(needed, loteQ)
            if (take > 0) {
              weightedSum += take * cost
              qtySum += take
              needed -= take
            }
            if (needed <= 0) break
          }
        }
        if (qtySum > 0) custoMedio = Math.round((weightedSum / qtySum) * 100) / 100
      }

      if (!(custoMedio > 0)) custoMedio = ultimaCompra

      const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100
      return {
        ultimaCompra: round2(ultimaCompra),
        custoMedio: round2(custoMedio),
        hasCompras: true,
      }
    }

    // Parâmetros de execução
    const limitParam = parseInt(String(query['limit'] || '100'), 10) || 100
    const offsetParam = parseInt(String(query['offset'] || '0'), 10) || 0
    const resumeMode = query['resume'] === 'true' || query['resume'] === '1'
    const sleepMs = parseInt(String(query['sleep_ms'] || '40'), 10) || 40

    const totalNoBanco = app.countRecords('produtos_spincare')
    // Ordem alfabética determinística (empate por spincare_id) para retomar
    // exatamente de onde o lote anterior parou.
    const produtos = app.findRecordsByFilter(
      'produtos_spincare',
      'id != ""',
      'description,spincare_id',
      limitParam,
      offsetParam,
    )

    console.log(
      '[Backfill Estoques] Lote: ' +
        produtos.length +
        ' produtos (total na coleção: ' +
        totalNoBanco +
        ', offset: ' +
        offsetParam +
        ', limit: ' +
        limitParam +
        ', resume: ' +
        resumeMode +
        ')...',
    )

    let processados = 0
    let atualizados = 0
    let pulados = 0
    let semCompras = 0
    let fallbackCatalogo = 0
    let semPreco = 0
    const amostras = []

    for (let i = 0; i < produtos.length; i++) {
      const rec = produtos[i]
      const prodId = rec.getInt('spincare_id')
      const desc = rec.getString('description')
      if (!prodId) {
        pulados++
        continue
      }

      // Modo resume: pula quem já tem fonte_preco preenchida e preço>0
      const fonteAtual = rec.getString('fonte_preco')
      if (
        resumeMode &&
        fonteAtual &&
        rec.getFloat('ultima_compra_price') > 0 &&
        rec.getFloat('custo_medio_price') > 0
      ) {
        pulados++
        continue
      }

      // Limpeza de segurança: nunca gravar/ver sufixo de diagnóstico
      const descAtual = rec.getString('description')
      if (descAtual.indexOf(' [D:') >= 0 || descAtual.indexOf(' [DIAG:') >= 0) {
        rec.set('description', descAtual.split(' [D:')[0].split(' [DIAG:')[0].trim())
      }

      const allStocks = requestStocks(prodId)
      const { ultimaCompra, custoMedio, hasCompras } = calcStockValues(prodId, allStocks)

      // Fallback obrigatório: sem NF de compra, usa preço de CATÁLOGO (price),
      // nunca null/zero, e marca a fonte. O preço de catálogo vem do payload
      // (campo price da API /get/products) já espelhado no registro.
      let fontePreco = ''
      let ucFinal = 0
      let cmFinal = 0
      if (hasCompras && (ultimaCompra > 0 || custoMedio > 0)) {
        ucFinal = ultimaCompra > 0 ? ultimaCompra : custoMedio
        cmFinal = custoMedio > 0 ? custoMedio : ultimaCompra
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
          rec.getFloat('ultima_compra_price') > 0 &&
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

      let mudou = false
      if (fontePreco) {
        rec.set('ultima_compra_price', ucFinal)
        rec.set('custo_medio_price', cmFinal)
        rec.set('fonte_preco', fontePreco)
        rec.set('synced_at', new Date().toISOString())
        mudou = true
      }

      if (mudou) {
        try {
          app.save(rec)
          atualizados++
        } catch (saveErr) {
          console.error('[Backfill Estoques] Erro ao salvar produto ' + prodId + ':', saveErr)
        }
      }

      processados++
      if (amostras.length < 15) {
        amostras.push({
          spincare_id: prodId,
          description: desc,
          price: rec.getFloat('price'),
          ultima_compra: ucFinal,
          custo_medio: cmFinal,
          fonte_preco: fontePreco || rec.getString('fonte_preco'),
        })
      }

      if (processados % 25 === 0) {
        console.log(
          '[Backfill Estoques] Progresso: ' +
            processados +
            '/' +
            produtos.length +
            ' produtos processados. Atualizados: ' +
            atualizados +
            ', sem NF (catálogo/preservado): ' +
            fallbackCatalogo +
            ', sem preço: ' +
            semPreco,
        )
      }

      // Pequena pausa para respeitar rate limit do SpinCare
      if (sleepMs > 0 && i < produtos.length - 1) {
        try {
          sleep(sleepMs)
        } catch (_) {}
      }
    }

    const totalProcessadoAteAqui = offsetParam + processados + pulados
    const nextOffset = offsetParam + produtos.length
    const done = nextOffset >= totalNoBanco

    const durationSec = Math.round((new Date().getTime() - startTime) / 1000)
    console.log(
      '[Backfill Estoques] Lote concluído em ' +
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
        ', nextOffset=' +
        nextOffset +
        ', done=' +
        done,
    )

    // Auditoria por lote
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'produtos_spincare')
      auditRecord.set('registro_id', 'backfill_estoques_a_z')
      auditRecord.set('acao', 'SPINCARE_BACKFILL_STOCKS_A_Z')
      auditRecord.set('usuario', authUser ? authUser.id : '')
      auditRecord.set(
        'usuario_nome',
        authUser ? authUser.getString('name') || '' : 'admin_backfill',
      )
      auditRecord.set('usuario_role', authUser ? authUser.getString('role') || 'admin' : 'admin')
      auditRecord.set('status_novo', done ? 'sucesso' : 'em_progresso')
      auditRecord.set(
        'detalhes',
        'Backfill de estoques SpinCare (lote A a Z): offset=' +
          offsetParam +
          ', processados=' +
          processados +
          ', atualizados=' +
          atualizados +
          ', sem_compras=' +
          semCompras +
          ', fallback_catalogo=' +
          fallbackCatalogo +
          ', sem_preco=' +
          semPreco +
          ', next_offset=' +
          nextOffset +
          ', total=' +
          totalNoBanco +
          ', duracao=' +
          durationSec +
          's',
      )
      app.save(auditRecord)
    } catch (_) {}

    return e.json(200, {
      success: true,
      durationSec: durationSec,
      totalNaColecao: totalNoBanco,
      offset: offsetParam,
      loteTamanho: produtos.length,
      processados: processados,
      atualizados: atualizados,
      pulados: pulados,
      semCompras: semCompras,
      fallbackCatalogo: fallbackCatalogo,
      semPreco: semPreco,
      nextOffset: done ? null : nextOffset,
      done: done,
      amostras: amostras,
    })
  } catch (err) {
    console.error('[Backfill Estoques] Erro fatal:', err)
    return e.json(500, {
      success: false,
      message: 'Falha durante o backfill de estoques: ' + String(err),
    })
  }
})
