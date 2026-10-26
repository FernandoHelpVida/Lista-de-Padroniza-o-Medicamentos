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

      // How many patients total in /get/patients?
      let totalPatients = 0
      let ademirPat = null
      for (let p = 1; p <= 10; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/patients?page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        totalPatients += items.length
        const found = items.find((x) => {
          const n = (x.name || x.nome || '').toUpperCase()
          return n.includes('ADEMIR') && n.includes('ROSTIROLLA')
        })
        if (found) {
          ademirPat = { id: found.id, name: found.name || found.nome, page: p }
        }
        if (items.length < 100) break
      }

      // Check how many prescriptions patient 418 has in 2026:
      let p418_2026_count = 0
      let has75147 = false
      for (let p = 1; p <= 5; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?patient_id=' +
            ademirPat.id +
            '&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 20,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        p418_2026_count += items.length
        if (items.some((x) => String(x.prescription_number || x.id) === '75147')) {
          has75147 = true
        }
        if (items.length < 100) break
      }

      cfg.set(
        'last_test_message',
        'CENSUS: ' +
          JSON.stringify({
            totalPatients,
            ademirPat,
            p418_2026_count,
            has75147,
          }),
      )
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
