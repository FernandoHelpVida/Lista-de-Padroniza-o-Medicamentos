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

      // Busca direta de 418 com page 1
      const res = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const d = res.json || JSON.parse(res.raw || '[]')
      const items = Array.isArray(d) ? d : d && d.items ? d.items : []
      const p = items.find((x) => String(x.prescription_number || x.id) === '75147')
      if (p) {
        cfg.set(
          'last_test_message',
          JSON.stringify({
            id: p.id,
            num: p.prescription_number,
            patient_id: p.patient_id,
            patient_name: p.patient_name,
            initial_dt: p.initial_dt,
            final_dt: p.final_dt,
            creation_dt: p.creation_dt,
            items: p.items,
          }).slice(0, 950),
        )
      } else {
        // busca em page 2 ou 3
        const res2 = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?patient_id=418&page_number=2&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const d2 = res2.json || JSON.parse(res2.raw || '[]')
        const items2 = Array.isArray(d2) ? d2 : d2 && d2.items ? d2.items : []
        const p2 = items2.find((x) => String(x.prescription_number || x.id) === '75147')
        if (p2) {
          cfg.set(
            'last_test_message',
            JSON.stringify({
              id: p2.id,
              num: p2.prescription_number,
              patient_id: p2.patient_id,
              patient_name: p2.patient_name,
              initial_dt: p2.initial_dt,
              final_dt: p2.final_dt,
              creation_dt: p2.creation_dt,
              items: p2.items,
            }).slice(0, 950),
          )
        } else {
          cfg.set('last_test_message', 'NOT_FOUND_IN_P1_P2')
        }
      }
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
