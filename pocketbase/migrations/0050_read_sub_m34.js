/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec34 = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_0034"')
      const d = rec34 ? rec34.getString('detalhes') : 'no_rec'
      const idx = d.indexOf('"matchesSept":')
      const sub = idx >= 0 ? d.slice(idx, idx + 1800) : 'not_found_matchesSept'
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set('last_test_message', sub)
        app.save(cfg)
      }
    } catch (err) {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        cfg.set('last_test_message', 'ERR50: ' + String(err))
        app.save(cfg)
      }
    }
  },
  (app) => {},
)
