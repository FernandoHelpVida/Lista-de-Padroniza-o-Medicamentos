/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Diagnóstico das somas de Enoxaparina em Setembro/2026
  const disps = app.findRecordsByFilter('dispensacoes_spincare', 'id != ""', '', 0, 0)

  let candidates = {
    // Apenas setembro por expected_deliver_dt
    exp_sent_qt: 0,
    exp_qt: 0,
    exp_sent_plus_returned: 0,
    exp_qt_plus_returned: 0,
    exp_consumption: 0,
    exp_sent_plus_consumption: 0,
    exp_all_items_count: 0,

    // Apenas setembro por creation_dt (do payload)
    crt_sent_qt: 0,
    crt_qt: 0,
    crt_sent_plus_returned: 0,
    crt_qt_plus_returned: 0,
    crt_consumption: 0,

    // Setembro por initial_dt
    ini_sent_qt: 0,
    ini_qt: 0,

    // Setembro por expected OU creation
    exp_or_crt_sent_qt: 0,
    exp_or_crt_qt: 0,

    // Setembro por expected OU returned
    exp_or_ret_sent_qt: 0,
    exp_or_ret_qt: 0,

    // Itens brutos detalhados em Setembro (expected ou creation)
    raw_details: [],
  }

  const toYmd = (val) => {
    if (!val) return ''
    const s = String(val).trim().split(' ')[0]
    if (s.includes('/')) {
      const parts = s.split('/')
      if (parts.length === 3)
        return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
    }
    return s.slice(0, 10)
  }

  for (let i = 0; i < disps.length; i++) {
    const d = disps[i]
    let payload = {}
    try {
      payload = JSON.parse(d.getString('payload') || '{}')
    } catch (_) {}

    const expDt = toYmd(d.getString('expected_deliver_dt') || payload.expected_deliver_dt)
    const crtDt = toYmd(
      payload.creation_dt || payload.created_at || payload.create_dt || payload.dt_criacao,
    )
    const iniDt = toYmd(payload.initial_dt)
    const retDt = toYmd(d.getString('returned_dt') || payload.returned_dt)

    const isExpSept = expDt.startsWith('2026-09')
    const isCrtSept = crtDt.startsWith('2026-09')
    const isIniSept = iniDt.startsWith('2026-09')
    const isRetSept = retDt.startsWith('2026-09')

    let itens = []
    try {
      itens = JSON.parse(d.getString('itens') || '[]')
    } catch (_) {}
    if (!itens || itens.length === 0) {
      itens = payload.items || payload.itens || payload.products || []
    }

    for (let k = 0; k < itens.length; k++) {
      const it = itens[k]
      const pid = Number(it.product_id || 0)
      const pds = String(it.product_ds || it.description || '').toUpperCase()
      const isEnox = pid === 2916 || pds.includes('ENOXAPARINA 40')

      if (!isEnox) continue

      const sent = Number(it.sent_qt || 0)
      const qt = Number(it.qt || 0)
      const ret = Number(it.returned_qt || 0)
      const cons = Number(it.consumption_qt || 0)

      if (isExpSept) {
        candidates.exp_sent_qt += sent
        candidates.exp_qt += qt
        candidates.exp_sent_plus_returned += sent + ret
        candidates.exp_qt_plus_returned += qt + ret
        candidates.exp_consumption += cons
        candidates.exp_sent_plus_consumption += sent + cons
        candidates.exp_all_items_count++
      }

      if (isCrtSept) {
        candidates.crt_sent_qt += sent
        candidates.crt_qt += qt
        candidates.crt_sent_plus_returned += sent + ret
        candidates.crt_qt_plus_returned += qt + ret
        candidates.crt_consumption += cons
      }

      if (isIniSept) {
        candidates.ini_sent_qt += sent
        candidates.ini_qt += qt
      }

      if (isExpSept || isCrtSept) {
        candidates.exp_or_crt_sent_qt += sent
        candidates.exp_or_crt_qt += qt
      }

      if (isExpSept || isRetSept) {
        candidates.exp_or_ret_sent_qt += sent
        candidates.exp_or_ret_qt += qt
      }

      if (isExpSept || isCrtSept || isIniSept || isRetSept) {
        candidates.raw_details.push({
          disp_id: d.getInt('spincare_id'),
          expDt: expDt,
          crtDt: crtDt,
          iniDt: iniDt,
          retDt: retDt,
          sent: sent,
          qt: qt,
          ret: ret,
          cons: cons,
          status: String(it.status || d.getString('status') || ''),
        })
      }
    }
  }

  const auditCol = app.findCollectionByNameOrId('audit_logs')
  const r = new Record(auditCol)
  r.set('colecao', 'produtos_spincare')
  r.set('registro_id', 'diag_sept_enox_390')
  r.set('acao', 'RESULT_CANDIDATES')
  r.set('detalhes', JSON.stringify(candidates))
  app.save(r)
})
