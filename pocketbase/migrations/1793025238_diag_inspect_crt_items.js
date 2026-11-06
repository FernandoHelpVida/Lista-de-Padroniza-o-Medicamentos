/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const disps = app.findRecordsByFilter('dispensacoes_spincare', 'id != ""', '', 0, 0)
  const auditCol = app.findCollectionByNameOrId('audit_logs')

  let crtItems = []
  for (let i = 0; i < disps.length; i++) {
    const d = disps[i]
    let payload = {}
    try {
      payload = JSON.parse(d.getString('payload') || '{}')
    } catch (_) {}
    const crt = String(payload.creation_dt || '').slice(0, 10)
    if (!crt.startsWith('2026-09')) continue

    let itens = []
    try {
      itens = JSON.parse(d.getString('itens') || '[]')
    } catch (_) {}
    if (!itens || itens.length === 0)
      itens = payload.items || payload.itens || payload.products || []

    for (let k = 0; k < itens.length; k++) {
      const it = itens[k]
      const pid = Number(it.product_id || 0)
      const pds = String(it.product_ds || it.description || '').toUpperCase()
      if (pid === 2916 || pds.includes('ENOXAPARINA 40')) {
        crtItems.push({
          id: d.getInt('spincare_id'),
          crt: crt,
          exp: d.getString('expected_deliver_dt'),
          sent: Number(it.sent_qt || 0),
          qt: Number(it.qt || 0),
          ret: Number(it.returned_qt || 0),
          status: d.getString('status'),
        })
      }
    }
  }

  // crtItems tem soma de sent_qt = 401. Quais são esses itens?
  // Qual deles tem sent=11? 401 - 11 = 390!
  // Vamos gravar todos eles claramente
  let txt = 'Total crtItems: ' + crtItems.length + '. '
  let sum = 0
  for (let j = 0; j < crtItems.length; j++) {
    const it = crtItems[j]
    sum += it.sent
    txt +=
      '[' +
      it.id +
      ': sent=' +
      it.sent +
      ' ret=' +
      it.ret +
      ' st=' +
      it.status +
      ' exp=' +
      it.exp +
      ' crt=' +
      it.crt +
      '] '
  }
  txt += 'TotalSum=' + sum

  const r = new Record(auditCol)
  r.set('colecao', 'produtos_spincare')
  r.set('registro_id', 'diag_crt_sept_all_items')
  r.set('acao', 'ITEMS_EXACT')
  r.set('detalhes', txt.slice(0, 4900))
  app.save(r)
})
