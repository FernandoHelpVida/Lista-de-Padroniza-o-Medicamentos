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

      for (let p = 3; p <= 6; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?patient_id=418&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        const pMatch = items.find((x) => String(x.prescription_number || x.id) === '75147')
        if (pMatch) {
          cfg.set(
            'last_test_message',
            JSON.stringify({
              foundOnPage: p,
              id: pMatch.id,
              num: pMatch.prescription_number,
              patient_id: pMatch.patient_id,
              patient_name: pMatch.patient_name,
              initial_dt: pMatch.initial_dt,
              final_dt: pMatch.final_dt,
              creation_dt: pMatch.creation_dt,
              items: pMatch.items,
            }).slice(0, 950),
          )
          app.save(cfg)
          return
        }
      }
      cfg.set('last_test_message', 'NOT_FOUND_P3_P6')
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
