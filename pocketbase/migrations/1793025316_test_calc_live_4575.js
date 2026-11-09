/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const cfgs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!cfgs || cfgs.length === 0) return
      const cfg = cfgs[0]
      const baseUrl = (
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      const login = (cfg.getString('api_login') || '').trim()
      const password = (cfg.getString('api_password') || '').trim()

      let token = ''
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
        if (typeof resToken.json === 'string') token = resToken.json
        else if (resToken.json && typeof resToken.json === 'object')
          token = resToken.json.token || resToken.json.access_token || ''
        if (!token && resToken.raw) token = resToken.raw.replace(/^"|"$/g, '').trim()
        if (token.startsWith('Bearer ')) token = token.substring(7).trim()
      }

      const url =
        baseUrl +
        '/integration-engine/get/stocks?token=' +
        encodeURIComponent(token) +
        '&product_id=4575&page_number=1&page_size=500'
      const res = $http.send({
        url: url,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 15,
      })

      let rawData = []
      try {
        rawData = res.json || JSON.parse(res.raw || '[]')
      } catch (_) {}
      if (rawData && rawData.items) rawData = rawData.items

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

      const compras = rawData.filter(
        (x) =>
          x &&
          x.operation_type === 'Entrada' &&
          String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
      )
      const sortedCompras = compras.slice().sort((a, b) => num(b.id) - num(a.id))
      const sortedAll = rawData.slice().sort((a, b) => num(b.id) - num(a.id))
      const currentBalance = num(
        sortedAll[0].balance !== undefined ? sortedAll[0].balance : sortedAll[0].stock_balance,
      )

      let needed = currentBalance
      let weightedSum = 0
      let qtySum = 0
      for (let i = 0; i < sortedCompras.length; i++) {
        const c = sortedCompras[i]
        const q = num(c.quantity !== undefined ? c.quantity : c.qt)
        const cost = parseMoney(c.cost_unit_price)
        if (q > 0 && cost > 0) {
          const take = Math.min(needed, q)
          weightedSum += take * cost
          qtySum += take
          needed -= take
          if (needed <= 0) break
        }
      }
      const custoMedio = qtySum > 0 ? weightedSum / qtySum : 0
      const ultimaCompra = sortedCompras[0] ? parseMoney(sortedCompras[0].cost_unit_price) : 0

      const coll = app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(coll)
      auditRec.set('colecao', 'produtos_spincare')
      auditRec.set('registro_id', '4575')
      auditRec.set('acao', 'TEST_STOCKS_4575')
      auditRec.set(
        'detalhes',
        JSON.stringify({
          statusCode: res.statusCode,
          totalStocks: rawData.length,
          comprasCount: compras.length,
          currentBalance: currentBalance,
          qtySum: qtySum,
          weightedSum: weightedSum,
          custoMedio: custoMedio,
          custoMedioFixed: Number(custoMedio.toFixed(4)),
          custoMedioRound: Number(custoMedio.toFixed(2)),
          ultimaCompra: ultimaCompra,
        }),
      )
      app.save(auditRec)
    } catch (err) {
      try {
        const coll = app.findCollectionByNameOrId('audit_logs')
        const auditRec = new Record(coll)
        auditRec.set('colecao', 'produtos_spincare')
        auditRec.set('registro_id', '4575')
        auditRec.set('acao', 'TEST_STOCKS_4575_ERR')
        auditRec.set('detalhes', String(err))
        app.save(auditRec)
      } catch (e2) {}
    }
  },
  (app) => {},
)
