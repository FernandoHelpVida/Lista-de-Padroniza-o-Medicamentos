/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec34 = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_0034"')
      const d = rec34 ? rec34.getString('detalhes') : 'no_rec'
      const parsed = JSON.parse(d)
      const matches = parsed.matchesSept || []
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set(
          'last_test_message',
          'M34_LEN:' + matches.length + ' DATA:' + JSON.stringify(matches).slice(0, 1800),
        )
        app.save(cfg)
      }
    } catch (err) {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set('last_test_message', 'ERR49: ' + String(err))
        app.save(cfg)
      }
    }
  },
  (app) => {},
)
