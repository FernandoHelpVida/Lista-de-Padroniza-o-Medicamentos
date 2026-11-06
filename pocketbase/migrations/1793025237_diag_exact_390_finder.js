/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const disps = app.findRecordsByFilter('dispensacoes_spincare', 'id != ""', '', 0, 0)
  const auditCol = app.findCollectionByNameOrId('audit_logs')

  let enoxDisps = []
  for (let i = 0; i < disps.length; i++) {
    const d = disps[i]
    let payload = {}
    try {
      payload = JSON.parse(d.getString('payload') || '{}')
    } catch (_) {}
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
        enoxDisps.push({
          id: d.getInt('spincare_id'),
          exp: d.getString('expected_deliver_dt'),
          crt: String(payload.creation_dt || '').slice(0, 10),
          ini: String(payload.initial_dt || '').slice(0, 10),
          ret: d.getString('returned_dt'),
          status: d.getString('status'),
          sent: Number(it.sent_qt || 0),
          qt: Number(it.qt || 0),
          returned_qt: Number(it.returned_qt || 0),
        })
      }
    }
  }

  // Buscar combinações que somam 390
  // Por exemplo: sent_qt em setembro (308) + ?
  // Ou criação em setembro (401) - 11?
  // O que dá 390?
  let findings = []

  // Testar todas as somas de sent_qt filtrando por várias datas
  // Ou subconjunto de enoxDisps que soma 390
  // Quantas dispensações temos com Enox?
  findings.push('total_enox_dispensacoes=' + enoxDisps.length)

  // Em setembro crt dá 401. Quais dispensações estão em crt setembro?
  const crtSept = enoxDisps.filter((x) => x.crt.startsWith('2026-09'))
  findings.push(
    'crt_sept_items=' +
      JSON.stringify(
        crtSept.map((x) => ({
          id: x.id,
          crt: x.crt,
          exp: x.exp,
          sent: x.sent,
          qt: x.qt,
          ret: x.returned_qt,
          st: x.status,
        })),
      ),
  )

  // Em setembro exp dá 308. Quais dispensações estão em exp setembro?
  const expSept = enoxDisps.filter((x) => x.exp.startsWith('2026-09'))
  findings.push(
    'exp_sept_items=' +
      JSON.stringify(
        expSept.map((x) => ({
          id: x.id,
          exp: x.exp,
          crt: x.crt,
          sent: x.sent,
          qt: x.qt,
          ret: x.returned_qt,
          st: x.status,
        })),
      ),
  )

  const r = new Record(auditCol)
  r.set('colecao', 'produtos_spincare')
  r.set('registro_id', 'diag_exact_390_finder')
  r.set('acao', 'FINDINGS')
  r.set('detalhes', findings.join(' | ').slice(0, 4900))
  app.save(r)
})
