/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      const msg = cfg.getString('last_test_message')

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0082')
      rec.set('acao', 'DIAG_M82_READ')
      rec.set('usuario_nome', 'Migration 0082')
      rec.set('status_novo', 'ok')
      rec.set('detalhes', msg.slice(0, 4000))
      app.save(rec)

      // Also parse and set compact info in last_test_message:
      const cleanJson = msg.replace('M81_DIAG: ', '')
      const parsed = JSON.parse(cleanJson)
      cfg.set(
        'last_test_message',
        'M82_SUMMARY: wideScan_found=' +
          parsed.wideScan_found +
          ', page=' +
          parsed.wideScan_page +
          ', total=' +
          parsed.wideScan_total +
          ', patName=' +
          parsed.p75147_patient_name +
          ', initDt=' +
          parsed.p75147_initial_dt +
          ', patId=' +
          parsed.p75147_patient_id,
      )
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
