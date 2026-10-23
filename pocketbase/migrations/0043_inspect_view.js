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
      const summaryStr = body.summary || '{}'
      const obj = typeof summaryStr === 'string' ? JSON.parse(summaryStr) : summaryStr

      // Salva campos específicos em linhas de audit_logs para visualização fácil
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_view_p75147')
      rec.set('acao', 'DIAG_VIEW')
      rec.set('usuario_nome', obj.first ? obj.first.professional_name : 'none')
      rec.set('status_novo', obj.first ? obj.first.prescription_number : 'none')
      rec.set(
        'detalhes',
        JSON.stringify({
          prescNum: obj.first ? obj.first.prescription_number : null,
          prescritora: obj.first ? obj.first.professional_name : null,
          initial_dt: obj.first ? obj.first.initial_dt : null,
          final_dt: obj.first ? obj.first.final_dt : null,
          creation_dt: obj.first ? obj.first.creation_dt : null,
          patient_name: obj.first ? obj.first.patient_name : null,
          items: obj.first ? obj.first.items : null,
          secondNum: obj.second ? obj.second.prescription_number : null,
          secondInit: obj.second ? obj.second.initial_dt : null,
          secondFinal: obj.second ? obj.second.final_dt : null,
        }),
      )
      app.save(rec)
    } catch (err) {}
  },
  (app) => {},
)
