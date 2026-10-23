/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec34 = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_0034"')
      if (rec34) {
        const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
        if (cfg) {
          cfg.set('last_test_message', 'M34: ' + rec34.getString('detalhes').slice(0, 500))
          app.save(cfg)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
