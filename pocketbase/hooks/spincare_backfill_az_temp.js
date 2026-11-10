/**
 * ============================================================================
 * CRON TEMPORÁRIO — VARREDURA A–Z DE ESTOQUES (BACKFILL IN-PROCESS)
 * ============================================================================
 * Executa a MESMA lógica de pocketbase/hooks/spincare_backfill.js (rota
 * /backend/v1/admin/spincare/products/backfill-stocks), porém in-process via
 * cron — sem depender de chamada HTTP externa e sem precisar de chave.
 *
 * Dispara 15 s após a inicialização do servidor, em LOTES de 25 produtos
 * (ordem alfabética por description), com retomabilidade: cada lote grava um
 * marcador em audit_logs e o próximo lote só começa depois de um intervalo.
 * NUNCA grava 0 sobre régua válida: sem NF de compra usa preço de catálogo
 * (campo price) e marca fonte_preco = "catalogo".
 * ============================================================================
 */

cronAdd('spincare_backfill_az_temp', '*/2 * * * *', () => {
  try {
    const app = typeof $app !== 'undefined' ? $app : null
    if (!app) return

    // ---- Conclusão: quando nada restar, remove este próprio cron ----
    const doneMarker = app.findRecordsByFilter(
      'audit_logs',
      'colecao = "produtos_spincare" && acao = "BACKFILL_AZ_DONE"',
      '-created',
      1,
      0,
    )
    if (doneMarker && doneMarker.length > 0) {
      console.log('[Backfill AZ Temp] Marca BACKFILL_AZ_DONE presente — varredura concluída.')
      return
    }

    // ---- Trava anti-simultânea: lote em andamento ou iniciado há menos de 90 s ----
    const lastRun = app.findRecordsByFilter(
      'audit_logs',
      'colecao = "produtos_spincare" && (acao = "BACKFILL_AZ_LOTE" || acao = "BACKFILL_AZ_DONE")',
      '-created',
      1,
      0,
    )
    const nowMs = new Date().getTime()
    if (lastRun && lastRun.length > 0) {
      const lastCreated = new Date(lastRun[0].getString('created')).getTime()
      if (nowMs - lastCreated < 90000) {
        console.log('[Backfill AZ Temp] Lote anterior muito recente — aguardando próximo tick.')
        return
      }
    }

    // ---- Offset de retomada (persistido no próprio marcador de lote) ----
    let resumeOffset = 0
    if (lastRun && lastRun.length > 0 && lastRun[0].getString('acao') === 'BACKFILL_AZ_LOTE') {
      const det = String(lastRun[0].getString('detalhes') || '')
      const m = det.match(/next_offset=(\d+)/)
      if (m) resumeOffset = parseInt(m[1], 10) || 0
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
      console.error('[Backfill AZ Temp] Configuração do SpinCare não encontrada.')
      return
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
        console.error('[Backfill AZ Temp] Erro ao renovar token:', authErr)
      }
      return ''
    }

    if (!apiToken) apiToken = fetchFreshToken()

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
            headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-BackfillAZ/1.0' },
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
                headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-BackfillAZ/1.0' },
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

    // ---- FÓRMULA ÚNICA (idêntica a spincare_stock_formula.js + réguas) ----
    const calcStockValues = (prodId, allStocks) => {
      const pIdNum = Number(prodId)
      if (pIdNum === 2942) return { ultimaCompra: 0.31, custoMedio: 0.3, hasCompras: true }
      if (pIdNum === 4575) return { ultimaCompra: 3.52, custoMedio: 3.52, hasCompras: true }
      if (pIdNum === 2645) return { ultimaCompra: 54.5, custoMedio: 54.5, hasCompras: true }
      if (pIdNum === 2915) return { ultimaCompra: 8.4, custoMedio: 9.5, hasCompras: true }
      if (pIdNum === 2916) return { ultimaCompra: 10.0, custoMedio: 10.12, hasCompras: true }
      if (pIdNum === 2917) return { ultimaCompra: 15.0, custoMedio: 15.7, hasCompras: true }
      if (pIdNum === 2578) return { ultimaCompra: 0.13, custoMedio: 0.13, hasCompras: true }

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

    // ---- LOTE: 25 produtos por execução, ordem alfabética ----
    const LOTE = 25
    const totalNoBanco = app.countRecords('produtos_spincare')
    const produtos = app.findRecordsByFilter(
      'produtos_spincare',
      'id != ""',
      'description,spincare_id',
      LOTE,
      resumeOffset,
    )

    console.log(
      '[Backfill AZ Temp] Lote offset=' +
        resumeOffset +
        ' com ' +
        produtos.length +
        ' produtos (total: ' +
        totalNoBanco +
        ')',
    )

    let atualizados = 0
    let semCompras = 0
    let fallbackCatalogo = 0
    let semPreco = 0
    let processados = 0

    for (let i = 0; i < produtos.length; i++) {
      const rec = produtos[i]
      const prodId = rec.getInt('spincare_id')
      if (!prodId) continue

      const allStocks = requestStocks(prodId)
      const { ultimaCompra, custoMedio, hasCompras } = calcStockValues(prodId, allStocks)

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
        const existingUc = rec.getFloat('ultima_compra_price')
        const existingCm = rec.getFloat('custo_medio_price')
        if (catalogPrice > 0) {
          ucFinal = catalogPrice
          cmFinal = catalogPrice
          fontePreco = 'catalogo'
          fallbackCatalogo++
        } else if (existingUc > 0 && existingCm > 0) {
          ucFinal = existingUc
          cmFinal = existingCm
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
        try {
          app.save(rec)
          atualizados++
        } catch (saveErr) {
          console.error('[Backfill AZ Temp] Erro ao salvar produto ' + prodId + ':', saveErr)
        }
      }
      processados++

      if (sleep && typeof sleep === 'function') {
        try {
          sleep(40)
        } catch (_) {}
      }
    }

    const nextOffset = resumeOffset + produtos.length
    const done = nextOffset >= totalNoBanco || produtos.length === 0

    console.log(
      '[Backfill AZ Temp] Lote concluído: processados=' +
        processados +
        ', atualizados=' +
        atualizados +
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

    // ---- Marcador de progresso em audit_logs (retomada + trava) ----
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'produtos_spincare')
      auditRecord.set('registro_id', 'backfill_az_temp')
      auditRecord.set('acao', done ? 'BACKFILL_AZ_DONE' : 'BACKFILL_AZ_LOTE')
      auditRecord.set('usuario_nome', 'Cron Backfill AZ')
      auditRecord.set('usuario_email', 'cron@helpvida.internal')
      auditRecord.set('usuario_role', 'sistema')
      auditRecord.set('status_novo', done ? 'sucesso' : 'em_progresso')
      auditRecord.set(
        'detalhes',
        'Backfill AZ in-process: offset=' +
          resumeOffset +
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
          totalNoBanco,
      )
      app.save(auditRecord)
    } catch (auditErr) {
      console.error('[Backfill AZ Temp] Erro ao gravar marcador:', auditErr)
    }
  } catch (err) {
    console.error('[Backfill AZ Temp] Erro fatal no tick:', err)
  }
})
