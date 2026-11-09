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

      // Vamos testar /get/products?product_id=2942 ou /get/product?product_id=2942
      const endpoints = [
        '/integration-engine/get/products?token=' +
          encodeURIComponent(token) +
          '&product_id=2942&page_number=1&page_size=10',
        '/integration-engine/get/product?token=' + encodeURIComponent(token) + '&product_id=2942',
      ]

      for (let eIdx = 0; eIdx < endpoints.length; eIdx++) {
        const ep = endpoints[eIdx]
        const res = $http.send({
          url: baseUrl + ep,
          method: 'GET',
          headers: { Accept: 'application/json' },
          timeout: 15,
        })
        const r = new Record(coll)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_ep_' + eIdx)
        r.set('acao', 'EP_TEST')
        let rawSnippet = String(res.raw || '').substring(0, 500)
        r.set('detalhes', JSON.stringify({ ep: ep, status: res.statusCode, raw: rawSnippet }))
        app.save(r)
      }
    } catch (_) {}
  },
  (app) => {},
)
