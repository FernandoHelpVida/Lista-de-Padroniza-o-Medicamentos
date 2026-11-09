routerAdd('GET', '/backend/v1/admin/spincare/products/test-runner', (e) => {
  const app = e.app
  const recs = app.findRecordsByFilter(
    'audit_logs',
    'registro_id ~ "diag_distinct_"',
    '-created',
    10,
    0,
  )
  const items = recs.map((r) => JSON.parse(r.getString('detalhes') || '{}'))
  return e.json(200, { items: items })
})
