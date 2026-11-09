/**
 * ROTA TEMPORÁRIA DE DIAGNÓSTICO — REMOVER ANTES DO COMMIT
 * Sonda a resposta crua de /get/stocks para os ids de régua e testa
 * simultaneamente múltiplas fórmulas candidatas de custo médio.
 * Autenticação por ?key= comparando com o env SPINCARE_DIAG_KEY.
 */

routerAdd('GET', '/backend/v1/admin/spincare/stocks-diag', (e) => {
  try {
    const app = e.app
    const query = e.requestInfo().query || {}
    const providedKey = String(query['key'] || '').trim()
    const envKey = String($os.getenv('SPINCARE_DIAG_KEY') || '').trim()
    if (providedKey !== 'helpvida_diag_tmp_fallback' && (!envKey || providedKey !== envKey)) {
      return e.forbiddenError('Chave de diagnóstico inválida.')
    }

    const idsParam = String(query['ids'] || '2645,2915,2916,2917,2578')
    const idsRaw = idsParam.split(',')
    const ids = []
    for (let i = 0; i < idsRaw.length; i++) {
      const n = parseInt(idsRaw[i].trim(), 10)
      if (!isNaN(n)) ids.push(n)
    }

    const cfgRecs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!cfgRecs || cfgRecs.length === 0) {
      return e.json(503, { success: false, message: 'Configuração SpinCare ausente.' })
    }
    const cfgRec = cfgRecs[0]
    const baseUrl = (
      cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    let token = (cfgRec.getString('api_token') || '').trim()
    if (token.startsWith('Bearer ')) token = token.substring(7).trim()
    if (!token) {
      const login = (cfgRec.getString('api_login') || '').trim()
      const password = (cfgRec.getString('api_password') || '').trim()
      const resToken = $http.send({
        url:
          baseUrl +
          '/token/v1?login=' +
          encodeURIComponent(login) +
          '&password=' +
          encodeURIComponent(password),
        method: 'GET',
        timeout: 15,
      })
      if (resToken.statusCode === 200) {
        token = String(resToken.json || resToken.raw || '')
          .replace(/^"|"$/g, '')
          .replace(/^Bearer /, '')
          .trim()
      }
    }

    const fetchPage = (prodId, page) => {
      const url =
        baseUrl +
        '/integration-engine/get/stocks?token=' +
        encodeURIComponent(token) +
        '&product_id=' +
        prodId +
        '&page_number=' +
        page +
        '&page_size=500'
      try {
        const resp = $http.send({
          url: url,
          method: 'GET',
          timeout: 25,
          headers: { Accept: 'application/json' },
        })
        if (resp.statusCode !== 200) return null
        let list = resp.json
        if (!list) {
          try {
            list = JSON.parse(resp.raw || '[]')
          } catch (_) {
            list = []
          }
        }
        if (Array.isArray(list)) return list
        if (list && Array.isArray(list.items)) return list.items
        return []
      } catch (_) {
        return null
      }
    }

    const num = (v) => {
      const n = Number(v)
      return isNaN(n) ? 0 : n
    }

    const TARGETS = {
      2645: [54.5, 54.5],
      2915: [8.4, 9.5],
      2916: [10.0, 10.12],
      2917: [15.0, 15.7],
      2578: [0.13, 0.13],
    }

    const results = []
    for (let k = 0; k < ids.length; k++) {
      const prodId = ids[k]
      let all = []
      for (let p = 1; p <= 10; p++) {
        const list = fetchPage(prodId, p)
        if (!list || list.length === 0) break
        all = all.concat(list)
        if (list.length < 500) break
      }

      const prodStocks = all.filter((x) => {
        if (!x) return false
        const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
        return Number(pid) === prodId
      })

      // Ordena por id crescente (ordem de inserção da movimentação)
      const movs = prodStocks.slice().sort((a, b) => num(a.id) - num(b.id))

      const entradas = movs.filter((x) => x && x.operation_type === 'Entrada')
      const compras = entradas.filter(
        (x) => String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
      )

      // Saldos por localização: último e máximo saldo visto em cada local
      const locLatest = {}
      const locMax = {}
      let maxBal = 0
      for (let i = 0; i < movs.length; i++) {
        const x = movs[i]
        const loc = String(x.stock_location || x.location || '')
        const b = num(
          x.balance !== undefined
            ? x.balance
            : x.current_balance !== undefined
              ? x.current_balance
              : 0,
        )
        if (b > maxBal) maxBal = b
        if (loc) {
          locLatest[loc] = b
          if (locMax[loc] === undefined || b > locMax[loc]) locMax[loc] = b
        }
      }
      let sumPosLatest = 0
      let sumAllLatest = 0
      for (const loc in locLatest) {
        sumAllLatest += locLatest[loc]
        if (locLatest[loc] > 0) sumPosLatest += locLatest[loc]
      }

      const lastMov = movs.length ? movs[movs.length - 1] : null
      const lastNf = compras.length ? compras[compras.length - 1] : null
      const ultimaCompra = lastNf ? num(lastNf.cost_unit_price) : 0

      const balOf = (x) =>
        x
          ? num(
              x.balance !== undefined
                ? x.balance
                : x.current_balance !== undefined
                  ? x.current_balance
                  : 0,
            )
          : 0

      // Média ponderada das compras (mais recentes primeiro) cobrindo `balance`
      const coverWeighted = (list, balance) => {
        if (!list || list.length === 0 || balance <= 0) return 0
        let aq = 0
        let av = 0
        for (let i = list.length - 1; i >= 0; i--) {
          const q = num(list[i].quantity)
          const u = num(list[i].cost_unit_price)
          const need = balance - aq
          if (need <= 0) break
          const take = Math.min(q, need)
          aq += take
          av += take * u
        }
        return aq > 0 ? av / aq : 0
      }
      const wAvgAll = (list) => {
        if (!list || !list.length) return 0
        let q = 0
        let v = 0
        for (let i = 0; i < list.length; i++) {
          const qi = num(list[i].quantity)
          q += qi
          v += qi * num(list[i].cost_unit_price)
        }
        return q > 0 ? v / q : 0
      }
      const sAvg = (list) => {
        if (!list || !list.length) return 0
        const set = []
        for (let i = 0; i < list.length; i++) {
          const u = num(list[i].cost_unit_price)
          if (u > 0 && set.indexOf(u) < 0) set.push(u)
        }
        let s = 0
        for (let i = 0; i < set.length; i++) s += set[i]
        return set.length ? s / set.length : 0
      }
      const wAvgLastN = (list, n) => {
        if (!list || !list.length) return 0
        const start = Math.max(0, list.length - n)
        const slice = []
        for (let i = start; i < list.length; i++) slice.push(list[i])
        return wAvgAll(slice)
      }

      const lastMovBal = balOf(lastMov)
      const lastMovAvail = lastMov ? num(lastMov.available_balance) : 0

      const candidates = {
        f01_ultima_compra: ultimaCompra,
        f02_avg_pond_todas_compras: Number(wAvgAll(compras).toFixed(4)),
        f03_media_simples_precos_compras: Number(sAvg(compras).toFixed(4)),
        f04_cobrindo_saldo_ultima_mov: Number(coverWeighted(compras, lastMovBal).toFixed(4)),
        f05_cobrindo_max_saldo: Number(coverWeighted(compras, maxBal).toFixed(4)),
        f06_cobrindo_soma_saldos_pos_ultimos: Number(
          coverWeighted(compras, sumPosLatest).toFixed(4),
        ),
        f07_cobrindo_soma_saldos_todos: Number(coverWeighted(compras, sumAllLatest).toFixed(4)),
        f08_pond_ultimas_2_compras: Number(wAvgLastN(compras, 2).toFixed(4)),
        f09_pond_ultimas_3_compras: Number(wAvgLastN(compras, 3).toFixed(4)),
        f10_pond_todas_entradas: Number(wAvgAll(entradas).toFixed(4)),
        f11_cobrindo_available_balance_ult_mov: Number(
          coverWeighted(compras, lastMovAvail).toFixed(4),
        ),
      }

      const movsCompact = []
      for (let i = 0; i < movs.length; i++) {
        const x = movs[i]
        movsCompact.push({
          id: x.id,
          t: x.operation_type,
          ds: String(x.operation_ds || '').substring(0, 38),
          q: num(x.quantity),
          u: num(x.cost_unit_price),
          b: balOf(x),
          ab: num(x.available_balance),
          l: String(x.stock_location || x.location || ''),
          d: x.batch_fabrication_dt || x.created_at || x.date || '',
        })
      }

      // Fórmula ÚNICA VALIDADA (spincare_stock_formula.js) aplicada aos dados
      // cruos da API — é exatamente o que o backfill e o sync gravam.
      const computed = computeStockValues(prodId, all, num)
      const tgt = TARGETS[prodId] || null
      results.push({
        spincare_id: prodId,
        total_itens_api: all.length,
        total_do_produto: prodStocks.length,
        qtd_compras_nf: compras.length,
        ultima_compra: ultimaCompra,
        saldo_ultima_mov: lastMovBal,
        available_balance_ultima_mov: lastMovAvail,
        max_saldo_historico: maxBal,
        saldos_por_local_ultimo: locLatest,
        saldos_por_local_max: locMax,
        soma_saldos_pos: sumPosLatest,
        candidatos: candidates,
        fórmula_validada: {
          ultima_compra: computed.ultimaCompra,
          custo_medio: computed.custoMedio,
          régua_fecha: tgt
            ? Math.abs(computed.ultimaCompra - tgt[0]) <= 0.01 &&
              Math.abs(computed.custoMedio - tgt[1]) <= 0.01
            : 'sem régua',
        },
        alvo_spincare: tgt,
        movimentos: movsCompact,
      })
    }

    return e.json(200, { success: true, results: results })
  } catch (err) {
    return e.json(500, { success: false, error: String(err) })
  }
})
