/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_0065_live"')
      const d = rec ? rec.getString('detalhes') : 'no_rec'
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      if (cfg) {
        let p75147Obj = null
        try {
          const parsed = JSON.parse(d)
          p75147Obj = parsed.p75147_full
        } catch (_) {}
        if (p75147Obj) {
          const summary = JSON.stringify({
            id: p75147Obj.id,
            num: p75147Obj.prescription_number,
            patient_id: p75147Obj.patient_id,
            patient_name: p75147Obj.patient_name,
            initial_dt: p75147Obj.initial_dt,
            final_dt: p75147Obj.final_dt,
            creation_dt: p75147Obj.creation_dt,
            prescription_date: p75147Obj.prescription_date,
            items: p75147Obj.items,
          })
          cfg.set('last_test_message', summary.slice(0, 950))
        } else {
          cfg.set('last_test_message', 'NO_P75147_IN_JSON: ' + d.slice(0, 400))
        }
        app.save(cfg)
      }
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
