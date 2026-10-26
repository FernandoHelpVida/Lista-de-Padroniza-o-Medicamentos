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

      // Fetch patient 418 page 3
      const resP418 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=3&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 20,
      })
      const dP418 = resP418.json || JSON.parse(resP418.raw || '[]')
      const p418Items = Array.isArray(dP418) ? dP418 : dP418 && dP418.items ? dP418.items : []
      const p75147 = p418Items.find((x) => String(x.prescription_number || x.id) === '75147')

      const items = (p75147 && p75147.items) || []
      const lantusItem = items.find((it) => {
        const s = JSON.stringify(it).toLowerCase()
        return s.includes('lantus') || s.includes('insulina')
      })

      cfg.set('last_test_message', 'LANTUS_FULL: ' + JSON.stringify(lantusItem))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
