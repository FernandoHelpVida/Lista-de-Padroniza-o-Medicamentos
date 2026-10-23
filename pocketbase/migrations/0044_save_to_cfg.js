/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const res = $http.send({
        url: 'http://127.0.0.1:8090/backend/v1/spincare/internal-diag-probe',
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 10,
      })
      const body = res.json || JSON.parse(res.raw || '{}')
      const view = body.view || {}
      // Grava campos do item no spincare_config no campo last_test_message para visualizarmos ou em audit_logs
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set(
          'last_test_message',
          JSON.stringify({
            prescNum: view.prescNum,
            prescritora: view.prescritora,
            initial_dt: view.initial_dt,
            final_dt: view.final_dt,
            creation_dt: view.creation_dt,
            patient_name: view.patient_name,
            secondNum: view.secondNum,
            itemsCount: (view.items || []).length,
            items: view.items,
          }).slice(0, 1950),
        )
        app.save(cfg)
      }
    } catch (err) {}
  },
  (app) => {},
)
