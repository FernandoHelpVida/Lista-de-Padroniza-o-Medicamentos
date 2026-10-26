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
          '/integration-engine/get/prescriptions?initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=1&page_size=10&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      const d = res.json || JSON.parse(res.raw || '[]')
      const items = Array.isArray(d) ? d : d && d.items ? d.items : []
      const first = items[0]
      console.log(
        'SEPT_SAMPLE:',
        JSON.stringify({
          count: items.length,
          first_pnum: first ? first.prescription_number : null,
          first_init: first ? first.initial_dt : null,
          first_final: first ? first.final_dt : null,
          first_created: first ? first.creation_dt : null,
        }),
      )
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
