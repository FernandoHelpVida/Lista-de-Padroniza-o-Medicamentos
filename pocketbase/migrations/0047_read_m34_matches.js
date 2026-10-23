/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec34 = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_0034"')
      if (rec34) {
        const parsed = JSON.parse(rec34.getString('detalhes') || '{}')
        const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
        if (cfg) {
          cfg.set(
            'last_test_message',
            'M34_MATCHES: ' + JSON.stringify(parsed.matchesSept || []).slice(0, 1000),
          )
          app.save(cfg)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
