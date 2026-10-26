/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_0101"')
      const d = JSON.parse(rec.getString('detalhes') || '{}')
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set('last_test_message', 'M102: ' + JSON.stringify(d.lantusItem).slice(0, 950))
        app.save(cfg)
      }
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
