/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const last = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_sept_enox_390"')
  if (!last) return
  const data = JSON.parse(last.getString('detalhes') || '{}')
  const auditCol = app.findCollectionByNameOrId('audit_logs')

  // Salvar somas resumidas
  const r1 = new Record(auditCol)
  r1.set('colecao', 'produtos_spincare')
  r1.set('registro_id', 'diag_sept_enox_summary')
  r1.set('acao', 'SOMAS')
  r1.set(
    'detalhes',
    JSON.stringify({
      exp_sent_qt: data.exp_sent_qt,
      exp_sent_plus_returned: data.exp_sent_plus_returned,
      crt_sent_qt: data.crt_sent_qt,
      crt_sent_plus_returned: data.crt_sent_plus_returned,
      ini_sent_qt: data.ini_sent_qt,
      exp_or_crt_sent_qt: data.exp_or_crt_sent_qt,
      exp_or_ret_sent_qt: data.exp_or_ret_sent_qt,
    }),
  )
  app.save(r1)

  // Salvar raw_details em blocos menores
  const items = data.raw_details || []
  for (let i = 0; i < items.length; i += 5) {
    const chunk = items.slice(i, i + 5)
    const rChunk = new Record(auditCol)
    rChunk.set('colecao', 'produtos_spincare')
    rChunk.set('registro_id', 'diag_sept_enox_details')
    rChunk.set('acao', 'CHUNK_' + i)
    rChunk.set('detalhes', JSON.stringify(chunk))
    app.save(rChunk)
  }
})
