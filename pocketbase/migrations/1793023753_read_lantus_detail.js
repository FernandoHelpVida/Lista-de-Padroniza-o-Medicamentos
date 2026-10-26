/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "m1793023750_probe"')
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg && rec) {
        const full = rec.getString('detalhes')
        const parsed = JSON.parse(full)
        const lantus = parsed.p75147Direct ? parsed.p75147Direct.lantus : null
        const info = {
          lantus,
          periodExactCount: parsed.periodExactCount,
          has75147InExactPeriod: parsed.has75147InExactPeriod,
          widePeriodCount: parsed.widePeriodCount,
          has75147InWidePeriod: parsed.has75147InWidePeriod,
        }
        cfg.set('last_test_message', 'M53: ' + JSON.stringify(info).slice(0, 950))
        app.save(cfg)
      }
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
