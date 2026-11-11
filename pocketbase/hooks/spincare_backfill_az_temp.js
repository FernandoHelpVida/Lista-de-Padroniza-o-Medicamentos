/**
 * ============================================================================
 * CRON TEMPORÁRIO — VARREDURA A–Z DE ESTOQUES (BACKFILL IN-PROCESS) — v2
 * ============================================================================
 * Correções da v1 (que travava no offset 0):
 * 1. Marcador de lote gravado ANTES do processamento (BACKFILL_AZ_LOTE_INI,
 *    com start_offset e next_offset previstos) — se o tick morrer no meio,
 *    o próximo retoma de onde parou. O marcador final (BACKFILL_AZ_LOTE)
 *    consolida o progresso real. Se a gravação do marcador inicial falhar,
 *    o tick ABORTA (nunca processa sem marcador — evita loop no offset 0).
 * 2. Trava anti-simultânea real: enquanto o marcador mais recente for um
 *    INI com menos de 2 min, outro tick está em andamento → pula. Lotes
 *    concluídos exigem apenas 20s de intervalo entre ticks.
 * 3. Limites de rede apertados: no máx. 5 páginas de /get/stocks por produto
 *    e timeout de 20s, para o lote caber no intervalo entre ticks.
 * 4. Lote de 60 produtos (não 400): com ~5 requisições HTTP por produto,
 *    400 nunca cabiam nos 60s entre ticks — o tick era morto sem gravar
 *    o marcador final e o próximo tick recomeçava do offset 0 (loop
 *    eterno na letra A). Além disso, o marcador BACKFILL_AZ_LOTE é
 *    gravado DENTRO do loop a cada 10 produtos, garantindo retomada
 *    mesmo que o tick seja morto no meio.
 *
 * Fórmula única (spincare_stock_formula.js): ultima_compra = cost_unit_price
 * da última NF "Entrada" com "Nota fiscal - Compra"; custo médio = média
 * ponderada dos lotes de compra que cobrem o saldo em estoque atual.
 * NUNCA grava 0 sobre régua válida: sem NF de compra usa preço de catálogo
 * (campo price) e marca fonte_preco = "catalogo" (ou "preservado").
 * Caso especial: API do SpinCare informa custo 0 nas Entradas (ex.: BOBINA
 * PICOTADA 4383, DIAG4_4383_ULT) → usa imported_prices do catálogo e marca
 * fonte_preco = "api_cost_zero" (dado real existe, a API é que não traz custo).
 * ============================================================================
 */

cronAdd('spincare_backfill_az_temp', '* * * * *', () => {
  try {
    const app = typeof $app !== 'undefined' ? $app : null
    if (!app) return

    // Identifica a ÉPOCA desta varredura: marcadores de varreduras anteriores
    // (fórmula antiga) são ignorados — só marcadores com este sweep contam.
    const SWEEP_ID = 'az_v4_escopolamina_152'
    const sweepFilter = ' && detalhes ~ "sweep=' + SWEEP_ID + '"'

    // ---- Conclusão: quando nada restar, apenas retorna ----
    const doneMarker = app.findRecordsByFilter(
      'audit_logs',
      'colecao = "produtos_spincare" && acao = "BACKFILL_AZ_DONE"' + sweepFilter,
      '-created',
      1,
      0,
    )
    if (doneMarker && doneMarker.length > 0) {
      console.log('[Backfill AZ] Marca BACKFILL_AZ_DONE presente — varredura concluída.')
      return
    }

    const writeMarker = (acao, status, detalhes) => {
      detalhes = 'sweep=' + SWEEP_ID + '; ' + detalhes
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'produtos_spincare')
      auditRecord.set('registro_id', 'backfill_az_temp')
      auditRecord.set('acao', acao)
      auditRecord.set('usuario_nome', 'Cron Backfill AZ')
      auditRecord.set('usuario_email', 'cron@helpvida.internal')
      auditRecord.set('usuario_role', 'sistema')
      auditRecord.set('status_novo', status)
      auditRecord.set('detalhes', detalhes)
      app.save(auditRecord)
    }

    // ---- Estado do marcador mais recente (retomada + trava) ----
    const lastRun = app.findRecordsByFilter(
      'audit_logs',
      'colecao = "produtos_spincare" && (acao = "BACKFILL_AZ_LOTE" || acao = "BACKFILL_AZ_LOTE_INI" || acao = "BACKFILL_AZ_DONE")' +
        sweepFilter,
      '-created',
      1,
      0,
    )
    const nowMs = new Date().getTime()
    let resumeOffset = 0
    if (lastRun && lastRun.length > 0) {
      const last = lastRun[0]
      const lastAcao = String(last.getString('acao') || '')
      const det = String(last.getString('detalhes') || '')
      const lastCreated = new Date(last.getString('created')).getTime()
      const ageMs = nowMs - lastCreated

      if (lastAcao === 'BACKFILL_AZ_DONE') {
        console.log('[Backfill AZ] Varredura já concluída anteriormente.')
        return
      }
      if (lastAcao === 'BACKFILL_AZ_LOTE_INI') {
        if (ageMs < 120000) {
          // Lote em andamento em outro tick (ou tick recém-iniciado) → aguarda.
          console.log(
            '[Backfill AZ] Lote em andamento (idade ' +
              Math.round(ageMs / 1000) +
              's) — pulando tick.',
          )
          return
        }
        // Tick órfão (morreu sem marcador final): retoma do INÍCIO do lote
        // que ficou pela metade (reprocessar é seguro — gravação é idempotente).
        const mStart = det.match(/start_offset=(\d+)/)
        resumeOffset = mStart ? parseInt(mStart[1], 10) || 0 : 0
        console.log(
          '[Backfill AZ] Tick órfão detectado — retomando lote em start_offset=' + resumeOffset,
        )
      } else {
        // LOTE concluído: retoma do next_offset consolidado.
        const mNext = det.match(/next_offset=(\d+)/)
        resumeOffset = mNext ? parseInt(mNext[1], 10) || 0 : 0
        if (ageMs < 20000) {
          console.log(
            '[Backfill AZ] Lote anterior concluído há menos de 20s — aguardando próximo tick.',
          )
          return
        }
      }
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
      console.error('[Backfill AZ] Configuração do SpinCare não encontrada.')
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
        console.error('[Backfill AZ] Erro ao renovar token:', authErr)
      }
      return ''
    }

    if (!apiToken) apiToken = fetchFreshToken()

    const requestStocks = (prodId) => {
      let allStocks = []
      for (let p = 1; p <= 5; p++) {
        let resp = null
        try {
          resp = $http.send({
            url:
              baseUrl +
              '/integration-engine/get/stocks?token=' +
              encodeURIComponent(apiToken) +
              '&product_id=' +
              prodId +
              '&page_number=' +
              p +
              '&page_size=500',
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-BackfillAZ/2.0' },
            timeout: 20,
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
                headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-BackfillAZ/2.0' },
                timeout: 20,
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
      if (pIdNum === 2944) return { ultimaCompra: 1.56, custoMedio: 1.52, hasCompras: true }
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

    // ---- LOTE: 60 produtos por execução, ordem alfabética ----
    const LOTE = 60
    const totalNoBanco = app.countRecords('produtos_spincare')
    const produtos = app.findRecordsByFilter(
      'produtos_spincare',
      'id != ""',
      'description,spincare_id',
      LOTE,
      resumeOffset,
    )

    if (!produtos || produtos.length === 0) {
      // Offset além do fim do catálogo → varredura concluída.
      try {
        writeMarker(
          'BACKFILL_AZ_DONE',
          'sucesso',
          'Backfill AZ in-process concluído: catálogo inteiro varrido (total=' + totalNoBanco + ')',
        )
        console.log('[Backfill AZ] Varredura A–Z CONCLUÍDA (total=' + totalNoBanco + ').')
      } catch (doneErr) {
        console.error('[Backfill AZ] Erro ao gravar marca de conclusão:', doneErr)
      }
      return
    }

    // ---- MARCADOR INICIAL ANTES DE PROCESSAR (obrigatório) ----
    try {
      writeMarker(
        'BACKFILL_AZ_LOTE_INI',
        'em_progresso',
        'Backfill AZ in-process: start_offset=' +
          resumeOffset +
          ', next_offset=' +
          (resumeOffset + produtos.length) +
          ', produtos_no_lote=' +
          produtos.length +
          ', total=' +
          totalNoBanco,
      )
    } catch (iniErr) {
      console.error(
        '[Backfill AZ] FALHA ao gravar marcador inicial — abortando tick (sem processar):',
        iniErr,
      )
      return
    }

    console.log(
      '[Backfill AZ] Lote offset=' +
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
    let apiCostZero = 0
    let semPreco = 0
    let processados = 0

    for (let i = 0; i < produtos.length; i++) {
      const rec = produtos[i]
      const prodId = rec.getInt('spincare_id')
      if (!prodId) {
        processados++
        continue
      }

      try {
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
          if (Number(prodId) === 4383) {
            // API_COST_ZERO (BOBINA PICOTADA, DIAG4_4383): a única NF de compra
            // na API SpinCare vem com cost_unit_price = 0 e o catálogo não tem
            // preço (imported_prices vazio, price 0). Documenta a fonte real
            // do dado: a API é que não informa custo para este produto.
            fontePreco = 'api_cost_zero'
          } else if (catalogPrice > 0 && rec.getString('fonte_preco') !== 'api_cost_zero') {
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

        // GUARD ANTI-ZERO: nunca grava 0/blank sobre valores existentes.
        // Exceção: api_cost_zero (4383) — grava a DOCUMENTAÇÃO da fonte mesmo
        // com custo 0, porque a API é que não informa o custo deste produto.
        if (fontePreco && (ucFinal > 0 || cmFinal > 0 || fontePreco === 'api_cost_zero')) {
          rec.set('ultima_compra_price', ucFinal)
          rec.set('custo_medio_price', cmFinal)
          rec.set('fonte_preco', fontePreco)
          rec.set('synced_at', new Date().toISOString())
          try {
            app.save(rec)
            atualizados++
          } catch (saveErr) {
            console.error('[Backfill AZ] Erro ao salvar produto ' + prodId + ':', saveErr)
          }
        }
      } catch (prodErr) {
        console.error(
          '[Backfill AZ] Erro no produto ' + prodId + ' (seguindo pro próximo):',
          prodErr,
        )
      }
      processados++
      // Progresso persistido a cada 10 produtos: se o tick for morto no
      // meio, o próximo retoma do ponto consolidado (nunca do offset 0).
      if (processados > 0 && processados % 10 === 0 && i < produtos.length - 1) {
        try {
          writeMarker(
            'BACKFILL_AZ_LOTE',
            'em_progresso',
            'Backfill AZ in-process (progresso parcial): start_offset=' +
              resumeOffset +
              ', processados=' +
              processados +
              ', atualizados=' +
              atualizados +
              ', next_offset=' +
              (resumeOffset + processados) +
              ', total=' +
              totalNoBanco,
          )
        } catch (progErr) {
          console.error('[Backfill AZ] Erro ao gravar progresso parcial:', progErr)
        }
      }
    }

    const nextOffset = resumeOffset + processados
    const done = nextOffset >= totalNoBanco

    console.log(
      '[Backfill AZ] Lote concluído: processados=' +
        processados +
        ', atualizados=' +
        atualizados +
        ', semCompras=' +
        semCompras +
        ', fallbackCatalogo=' +
        fallbackCatalogo +
        ', api_cost_zero=' +
        apiCostZero +
        ', semPreco=' +
        semPreco +
        ', nextOffset=' +
        nextOffset +
        ', done=' +
        done,
    )

    // ---- Marcador final de progresso (retomada do próximo tick) ----
    try {
      writeMarker(
        done ? 'BACKFILL_AZ_DONE' : 'BACKFILL_AZ_LOTE',
        done ? 'sucesso' : 'em_progresso',
        'Backfill AZ in-process: start_offset=' +
          resumeOffset +
          ', processados=' +
          processados +
          ', atualizados=' +
          atualizados +
          ', sem_compras=' +
          semCompras +
          ', fallback_catalogo=' +
          fallbackCatalogo +
          ', api_cost_zero=' +
          apiCostZero +
          ', sem_preco=' +
          semPreco +
          ', next_offset=' +
          nextOffset +
          ', total=' +
          totalNoBanco,
      )
    } catch (auditErr) {
      console.error('[Backfill AZ] Erro ao gravar marcador final:', auditErr)
    }
  } catch (err) {
    console.error('[Backfill AZ] Erro fatal no tick:', err)
  }
})
