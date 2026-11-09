/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_direct_2942"')
      if (!rec) return
      // Vamos buscar o último registro retornado pelo /get/stocks de 2942
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
      const resToken = $http.send({
        url:
          baseUrl +
          '/token/v1?login=' +
          encodeURIComponent(login) +
          '&password=' +
          encodeURIComponent(password),
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
        '&product_id=2942&page_number=1&page_size=500'
      const res = $http.send({
        url: url,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 20,
      })

      let rawData = []
      try {
        rawData = res.json || JSON.parse(res.raw || '[]')
      } catch (_) {}
      if (rawData && rawData.items) rawData = rawData.items
      if (!Array.isArray(rawData)) rawData = []

      // Ordenar por id desc
      const sorted = rawData.slice().sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      const top5Desc = sorted.slice(0, 5).map((x) => ({
        id: x.id,
        dt: x.movement_dt,
        type: x.operation_type,
        ds: x.operation_ds,
        balance: x.balance,
        stock_balance: x.stock_balance,
        current_balance: x.current_balance,
        blocked_balance: x.blocked_balance,
        qt: x.quantity !== undefined ? x.quantity : x.qt,
        cost: x.cost_unit_price,
      }))

      const coll = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_top_desc_2942')
      r.set('acao', 'TOP_DESC_2942')
      r.set('detalhes', JSON.stringify(top5Desc))
      app.save(r)
    } catch (_) {}
  },
  (app) => {},
)
