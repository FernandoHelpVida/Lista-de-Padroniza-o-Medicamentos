/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfg = records[0]

      const internalUrl = 'http://127.0.0.1:8090/backend/v1/spincare/internal-diag-probe?cmd=' + encodeURIComponent('/integration-engine/get/prescriptions?prescription_number=75147')
      const res = $http.send({
        url: internalUrl,
        method: 'GET',
        timeout: 25,
      })
      const d = res.json || JSON.parse(res.raw || '{}')
      cfg.set('last_test_message', 'M92_PROBE_75147: ' + JSON.stringify(d))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
