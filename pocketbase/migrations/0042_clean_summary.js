/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const res = $http.send({
        url: 'http://127.0.0.1:8090/backend/v1/spincare/internal-diag-probe',
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 10,
      })
      const body = res.json || JSON.parse(res.raw || '{}')
      const finalData = body.final || {}

      // Grava de forma limpa em audit_logs com texto claro
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_final_summary')
      rec.set('acao', 'DIAG_FINAL_SUMMARY')
      rec.set('usuario_nome', 'Migration 0042')
      rec.set('status_novo', String(finalData.count))
      rec.set('detalhes', JSON.stringify(finalData).slice(0, 3900))
      app.save(rec)
    } catch (err) {}
  },
  (app) => {},
)
