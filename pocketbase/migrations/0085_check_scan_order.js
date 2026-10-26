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

      // Fetch page 1 and page 35 of get/prescriptions?initial_dt=2026-01-01 00:00:00&final_dt=2026-09-30 23:59:59
      const getPage = (p) => {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?initial_dt=2026-01-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        return Array.isArray(d) ? d : d && d.items ? d.items : []
      }

      const p1 = getPage(1)
      const p35 = getPage(35)

      const info = {
        p1_len: p1.length,
        p1_first: p1[0] ? { id: p1[0].id, creation_dt: p1[0].creation_dt, initial_dt: p1[0].initial_dt } : null,
        p1_last: p1[p1.length - 1] ? { id: p1[p1.length - 1].id, creation_dt: p1[p1.length - 1].creation_dt, initial_dt: p1[p1.length - 1].initial_dt } : null,
        p35_len: p35.length,
        p35_first: p35[0] ? { id: p35[0].id, creation_dt: p35[0].creation_dt, initial_dt: p35[0].initial_dt } : null,
        p35_last: p35[p35.length - 1] ? { id: p35[p35.length - 1].id, creation_dt: p35[p35.length - 1].creation_dt, initial_dt: p35[p35.length - 1].initial_dt } : null,
      }

      cfg.set('last_test_message', 'M85_PAGES: ' + JSON.stringify(info))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
