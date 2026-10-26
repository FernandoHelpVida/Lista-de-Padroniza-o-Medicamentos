/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "m1793023750_probe"')
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg && rec) {
        cfg.set('last_test_message', 'M51: ' + rec.getString('detalhes').slice(0, 950))
        app.save(cfg)
      }
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
