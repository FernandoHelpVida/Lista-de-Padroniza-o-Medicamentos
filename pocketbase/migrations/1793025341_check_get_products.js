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

      // Buscar página 1 do catálogo de produtos para ver os campos que retornam
      const url =
        baseUrl +
        '/integration-engine/get/products?token=' +
        encodeURIComponent(token) +
        '&page_number=1&page_size=5'
      const res = $http.send({
        url: url,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 20,
      })

      let prods = []
      try {
        prods = res.json || JSON.parse(res.raw || '[]')
      } catch (_) {}
      if (prods && prods.items) prods = prods.items

      const sampleKeys = prods.length > 0 ? Object.keys(prods[0]) : []
      const sampleItem = prods.length > 0 ? prods[0] : {}

      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_get_products_keys')
      r.set('acao', 'GET_PRODUCTS_KEYS')
      r.set(
        'detalhes',
        JSON.stringify({
          keys: sampleKeys,
          id: sampleItem.id,
          code: sampleItem.code,
          description: sampleItem.description,
          price: sampleItem.price,
        }),
      )
      app.save(r)
    } catch (_) {}
  },
  (app) => {},
)
