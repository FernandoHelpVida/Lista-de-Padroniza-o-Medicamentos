/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfg = records[0]
      const msg = cfg.getString('last_test_message')

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(auditCol)
      auditRec.set('colecao', 'spincare_middleware')
      auditRec.set('registro_id', 'diag_0108')
      auditRec.set('acao', 'ADEMIR_VERIFICATION_RESULT')
      auditRec.set('usuario_nome', 'Migration 0108')
      auditRec.set('status_novo', 'ok')
      auditRec.set('detalhes', msg.slice(0, 4000))
      app.save(auditRec)
      console.log('ADEMIR_VERIFICATION_RESULT:', msg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
