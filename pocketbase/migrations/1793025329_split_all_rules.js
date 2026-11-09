/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const auditCol = app.findCollectionByNameOrId('audit_logs')
  const rAll = app.findRecordsByFilter(
    'audit_logs',
    'registro_id = "diag_all_rules"',
    '-created',
    1,
    0,
  )
  if (!rAll || rAll.length === 0) return
  const fullObj = JSON.parse(rAll[0].getString('detalhes') || '{}')
  for (const k in fullObj) {
    const r = new Record(auditCol)
    r.set('colecao', 'produtos_spincare')
    r.set('registro_id', 'diag_all_' + k)
    r.set('acao', 'DIAG')
    r.set('status_novo', 'info')
    r.set('detalhes', JSON.stringify(fullObj[k]))
    app.save(r)
  }
})
