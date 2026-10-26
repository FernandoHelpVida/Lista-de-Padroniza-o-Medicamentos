/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "m1793023750_probe"')
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg && rec) {
        const full = rec.getString('detalhes')
        // We want to see: initial_dt, final_dt, lantus item, has75147InWidePeriod, etc.
        const parsed = JSON.parse(full)
        const summary = {
          initial_dt: parsed.p75147Direct ? parsed.p75147Direct.initial_dt : null,
          final_dt: parsed.p75147Direct ? parsed.p75147Direct.final_dt : null,
          patient_name: parsed.p75147Direct ? parsed.p75147Direct.patient_name : null,
          professional_name: parsed.p75147Direct ? parsed.p75147Direct.professional_name : null,
          lantus: parsed.p75147Direct ? parsed.p75147Direct.lantus : null,
          periodExactCount: parsed.periodExactCount,
          has75147InExactPeriod: parsed.has75147InExactPeriod,
          widePeriodCount: parsed.widePeriodCount,
          has75147InWidePeriod: parsed.has75147InWidePeriod,
        }
        cfg.set('last_test_message', 'M52: ' + JSON.stringify(summary).slice(0, 950))
        app.save(cfg)
      }
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
