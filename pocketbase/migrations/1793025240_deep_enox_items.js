/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const disps = app.findRecordsByFilter('dispensacoes_spincare', 'id != ""', '', 0, 0)

  // Vamos inspecionar as 12 dispensações
  const ids = [58121, 58393, 58453, 58459, 58484, 58543, 58544, 58585, 58610, 58657, 58673, 58683]
  let info = []

  for (let i = 0; i < disps.length; i++) {
    const d = disps[i]
    const spId = d.getInt('spincare_id')
    if (ids.indexOf(spId) === -1) continue

    let payload = {}
    try {
      payload = JSON.parse(d.getString('payload') || '{}')
    } catch (_) {}

    // Inspecionar todos os campos da dispensação
    let items = payload.items || payload.itens || []
    let enoxItem = items.find(
      (it) => Number(it.product_id) === 2916 || String(it.product_ds || '').includes('ENOX'),
    )

    info.push({
      id: spId,
      status: payload.status,
      status_id: payload.status_id,
      patient_id: payload.patient_id,
      patient_name: payload.patient_name,
      budget_id: payload.budget_id,
      expected: payload.expected_deliver_dt,
      creation: payload.creation_dt,
      initial: payload.initial_dt,
      final: payload.final_dt,
      sent_reason: payload.send_reason,
      item_fields: enoxItem
        ? Object.keys(enoxItem)
            .map((k) => k + ':' + enoxItem[k])
            .join(', ')
        : 'no_item',
    })
  }

  // Também verificar se existe alguma combinação de dispensações que soma 390
  // Todas as dispensações de Enoxaparina no ano ou no mês:
  let allEnoxItens = []
  for (let i = 0; i < disps.length; i++) {
    const d = disps[i]
    let payload = {}
    try {
      payload = JSON.parse(d.getString('payload') || '{}')
    } catch (_) {}
    let items = payload.items || payload.itens || []
    for (let k = 0; k < items.length; k++) {
      const it = items[k]
      if (Number(it.product_id) === 2916) {
        allEnoxItens.push({
          disp_id: d.getInt('spincare_id'),
          crt: String(payload.creation_dt || '').slice(0, 10),
          exp: String(payload.expected_deliver_dt || '').slice(0, 10),
          ini: String(payload.initial_dt || '').slice(0, 10),
          fim: String(payload.final_dt || '').slice(0, 10),
          sent: Number(it.sent_qt || 0),
          qt: Number(it.qt || 0),
          ret: Number(it.returned_qt || 0),
          cons: Number(it.consumption_qt || 0),
        })
      }
    }
  }

  // Verificar se há soma de sent exatamente 390 em subconjuntos com algum critério
  // Ex: final_dt em setembro?
  let sumFimSept = 0
  let countFimSept = 0
  for (let m = 0; m < allEnoxItens.length; m++) {
    if (allEnoxItens[m].fim.startsWith('2026-09')) {
      sumFimSept += allEnoxItens[m].sent
      countFimSept++
    }
  }

  throw new Error(
    'DETAIL_INFO: sumFimSept=' +
      sumFimSept +
      ' countFim=' +
      countFimSept +
      ' | SAMPLE_ITEM: ' +
      (info[0] ? info[0].item_fields : '') +
      ' | SAMPLE2: ' +
      (info[1] ? info[1].item_fields : ''),
  )
})
