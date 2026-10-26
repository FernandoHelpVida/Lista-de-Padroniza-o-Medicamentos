/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfg = records[0]
      const baseUrl = (
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfg.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      const res = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=3&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const d = res.json || JSON.parse(res.raw || '[]')
      const items = Array.isArray(d) ? d : d && d.items ? d.items : []
      const pMatch = items.find((x) => String(x.prescription_number || x.id) === '75147')
      if (pMatch) {
        cfg.set('last_test_message', 'ITEMS: ' + JSON.stringify(pMatch.items).slice(0, 900))
        app.save(cfg)
      }
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
