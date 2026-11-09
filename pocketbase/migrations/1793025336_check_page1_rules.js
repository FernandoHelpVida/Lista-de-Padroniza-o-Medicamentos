/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const coll = app.findCollectionByNameOrId('audit_logs')
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

      const testIds = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
      for (let i = 0; i < testIds.length; i++) {
        const pid = testIds[i]
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(token) +
          '&product_id=' +
          pid +
          '&page_number=1&page_size=10'
        const res = $http.send({
          url: url,
          method: 'GET',
          headers: { Accept: 'application/json' },
          timeout: 20,
        })
        let raw = []
        try {
          raw = res.json || JSON.parse(res.raw || '[]')
        } catch (_) {}
        if (raw && raw.items) raw = raw.items
        if (!Array.isArray(raw)) raw = []

        // Top 2 itens
        const top2 = raw.slice(0, 2).map((x) => ({
          id: x.id,
          type: x.operation_type,
          ds: x.operation_ds,
          cost: x.cost_unit_price,
          bal: x.balance,
          stk_bal: x.stock_balance,
        }))

        const r = new Record(coll)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_page1_' + pid)
        r.set('acao', 'PAGE1')
        r.set('detalhes', JSON.stringify({ pid: pid, count: raw.length, top2: top2 }))
        app.save(r)
      }
    } catch (_) {}
  },
  (app) => {},
)
