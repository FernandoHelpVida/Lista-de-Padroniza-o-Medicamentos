/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const recs = app.findRecordsByFilter('audit_logs', 'registro_id ~ "diag"', '-created', 10, 0)
      const list = recs.map((r) => r.getString('registro_id'))
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set('last_test_message', 'RECS: ' + list.join(','))
        app.save(cfg)
      }
    } catch (err) {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set('last_test_message', 'ERR: ' + String(err))
        app.save(cfg)
      }
    }
  },
  (app) => {},
)
