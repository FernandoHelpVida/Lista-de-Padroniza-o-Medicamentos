/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
  if (!records || records.length === 0) return
  const cfgRec = records[0]
  const baseUrl = (
    cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
  )
    .trim()
    .replace(/\/+$/, '')
  let apiToken = (cfgRec.getString('api_token') || '').trim()
  if (apiToken.startsWith('Bearer ')) apiToken = apiToken.substring(7).trim()

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

  const testIds = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
  const results = {}

  for (let idx = 0; idx < testIds.length; idx++) {
    const pId = testIds[idx]
    let allStocks = []
    for (let p = 1; p <= 10; p++) {
      const url =
        baseUrl +
        '/integration-engine/get/stocks?token=' +
        encodeURIComponent(apiToken) +
        '&product_id=' +
        pId +
        '&page_number=' +
        p +
        '&page_size=500'
      const resp = $http.send({ url: url, method: 'GET', timeout: 30 })
      if (resp.statusCode !== 200) break
      let list = []
      try {
        list = resp.json || JSON.parse(resp.raw || '[]')
      } catch (_) {}
      if (Array.isArray(list.items)) list = list.items
      if (!Array.isArray(list) || list.length === 0) break
      allStocks = allStocks.concat(list)
    }

    const prodStocks = allStocks.filter((x) => {
      if (!x) return false
      const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
      return Number(pid) === pId
    })
    const compras = prodStocks.filter(
      (x) =>
        x &&
        x.operation_type === 'Entrada' &&
        String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
    )
    const sortedCompras = compras.slice().sort((a, b) => {
      const dtA = String(a.movement_dt || '')
      const dtB = String(b.movement_dt || '')
      if (dtB !== dtA) return dtB.localeCompare(dtA)
      return num(b.id) - num(a.id)
    })

    const lastNf = sortedCompras[0]
    const uc = lastNf ? parseMoney(lastNf.cost_unit_price) : 0

    // Balances
    let balPositive = 0
    for (let b = 0; b < prodStocks.length; b++) {
      const v = num(prodStocks[b].stock_balance)
      if (v > 0) {
        balPositive = v
        break
      }
    }
    const balFirst = prodStocks.length > 0 ? num(prodStocks[0].stock_balance) : 0
    const balLast = prodStocks.length > 0 ? num(prodStocks[prodStocks.length - 1].stock_balance) : 0

    // Compute CM with target = balPositive
    const calcWeighted = (target) => {
      if (!(target > 0) || sortedCompras.length === 0) return uc
      let needed = target
      let wSum = 0
      let qSum = 0
      for (let i = 0; i < sortedCompras.length; i++) {
        const c = sortedCompras[i]
        const q = num(c.quantity !== undefined ? c.quantity : c.qt)
        const cost = parseMoney(c.cost_unit_price)
        if (cost > 0) {
          const loteQ = q > 0 ? q : needed
          const take = Math.min(needed, loteQ)
          if (take > 0) {
            wSum += take * cost
            qSum += take
            needed -= take
          }
          if (needed <= 0) break
        }
      }
      return qSum > 0 ? Math.round((wSum / qSum) * 100) / 100 : uc
    }

    results[pId] = {
      uc: uc,
      balPositive: balPositive,
      balFirst: balFirst,
      balLast: balLast,
      cmWithPositive: calcWeighted(balPositive),
      cmWithFirst: calcWeighted(balFirst),
      cmWithLast: calcWeighted(balLast),
      comprasCount: sortedCompras.length,
    }
  }

  const auditCol = app.findCollectionByNameOrId('audit_logs')
  const r = new Record(auditCol)
  r.set('colecao', 'produtos_spincare')
  r.set('registro_id', 'diag_all_rules')
  r.set('acao', 'DIAG')
  r.set('status_novo', 'info')
  r.set('detalhes', JSON.stringify(results))
  app.save(r)
})
