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

      // Vamos buscar até 10 páginas de 2916 (Enoxaparina 40mg) e ver quais movimentações existem
      let allStocks2916 = []
      for (let p = 1; p <= 10; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(token) +
          '&product_id=2916&page_number=' +
          p +
          '&page_size=500'
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
        if (!Array.isArray(raw) || raw.length === 0) break
        allStocks2916 = allStocks2916.concat(raw)
      }

      // Ordenar por id desc (mais recente primeiro)
      allStocks2916.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))

      const top5_2916 = allStocks2916.slice(0, 5).map((x) => ({
        id: x.id,
        type: x.operation_type,
        ds: x.operation_ds,
        bal: x.balance,
        stk_bal: x.stock_balance,
        qt: x.quantity !== undefined ? x.quantity : x.qt,
        cost: x.cost_unit_price,
      }))

      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_2916_top')
      r.set('acao', '2916_TOP')
      r.set('detalhes', JSON.stringify({ total: allStocks2916.length, top5: top5_2916 }))
      app.save(r)
    } catch (_) {}
  },
  (app) => {},
)
