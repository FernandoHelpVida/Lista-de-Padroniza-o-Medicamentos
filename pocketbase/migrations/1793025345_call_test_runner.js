/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const res = $http.send({
        url: 'http://127.0.0.1:8090/backend/v1/admin/spincare/products/test-runner',
        method: 'GET',
        timeout: 5,
      })
      const coll = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_http_res')
      r.set('acao', 'HTTP_RES')
      r.set('detalhes', res.raw || '')
      app.save(r)
    } catch (e) {
      console.log('HTTP error:', e)
    }
  },
  (app) => {},
)
