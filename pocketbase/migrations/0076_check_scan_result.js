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

      const res73 = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      // Let's test calling check-medication endpoint directly via internal loopback or replicating the exact logic
      // But wait! Can we check what 0073 logged or saved? In 0073 we ran:
      // cfg.set('last_test_message', JSON.stringify({ foundPage, totalFetched }))
      // But 0074 overwrote last_test_message!
      // Let's test directly if 75147 is in get/prescriptions?initial_dt=2026-01-01 00:00:00
      let foundPage = 0
      let totalFetched = 0
      for (let p = 1; p <= 35; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?initial_dt=2026-01-01%2000%3A00%3A00&final_dt=2026-12-31%2023%3A59%3A59&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        totalFetched += items.length
        const match = items.find((x) => String(x.prescription_number || x.id) === '75147')
        if (match) {
          foundPage = p
          break
        }
        if (items.length < 100) break
      }
      cfg.set('last_test_message', 'SCAN_RESULT: ' + JSON.stringify({ foundPage, totalFetched }))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
