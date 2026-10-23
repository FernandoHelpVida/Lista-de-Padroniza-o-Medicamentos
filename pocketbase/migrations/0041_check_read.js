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
      const sample = (body.data && body.data.sample) || []

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_final_read')
      rec.set('acao', 'DIAG_FINAL_READ')
      // Salva campos cruciais de sample
      rec.set(
        'detalhes',
        JSON.stringify({
          count: sample.length,
          first: sample[0]
            ? {
                id: sample[0].id,
                prescription_number: sample[0].prescription_number,
                patient_id: sample[0].patient_id,
                patient_name: sample[0].patient_name,
                professional_name: sample[0].professional_name,
                initial_dt: sample[0].initial_dt,
                final_dt: sample[0].final_dt,
                creation_dt: sample[0].creation_dt,
                items: sample[0].items || sample[0].itens,
              }
            : null,
          second: sample[1]
            ? {
                id: sample[1].id,
                prescription_number: sample[1].prescription_number,
                initial_dt: sample[1].initial_dt,
                final_dt: sample[1].final_dt,
                creation_dt: sample[1].creation_dt,
              }
            : null,
        }).slice(0, 3900),
      )
      app.save(rec)
    } catch (err) {}
  },
  (app) => {},
)
