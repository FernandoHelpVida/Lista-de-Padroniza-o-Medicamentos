/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!records || records.length === 0) return
    const cfg = records[0]
    const baseUrl = (
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    let token = (cfg.getString('api_token') || '').trim()
    if (token.startsWith('Bearer ')) token = token.substring(7).trim()

    // We want to test why 75147 did or didn't appear in the period search.
    // Query: initial_dt=2026-09-01 00:00:00
    // Does initial_dt accept final_dt?
    // Let's test calling with patient_id=418 & initial_dt=2026-09-01 00:00:00:
    // With final_dt=2026-09-30 23:59:59 vs without final_dt vs with final_dt=2026-10-05 23:59:59
    const test1 = $http.send({
      url:
        baseUrl +
        '/integration-engine/get/prescriptions?patient_id=418&page_number=1&page_size=100&initial_dt=' +
        encodeURIComponent('2026-09-01 00:00:00') +
        '&final_dt=' +
        encodeURIComponent('2026-09-30 23:59:59') +
        '&token=' +
        encodeURIComponent(token),
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      timeout: 20,
    })
    const d1 = test1.json || JSON.parse(test1.raw || '[]')
    const items1 = Array.isArray(d1) ? d1 : d1.items || []
    const has75147_t1 = items1.some((p) => String(p.id || p.prescription_number) === '75147')

    const test2 = $http.send({
      url:
        baseUrl +
        '/integration-engine/get/prescriptions?patient_id=418&page_number=1&page_size=100&initial_dt=' +
        encodeURIComponent('2026-09-01 00:00:00') +
        '&final_dt=' +
        encodeURIComponent('2026-10-05 23:59:59') +
        '&token=' +
        encodeURIComponent(token),
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      timeout: 20,
    })
    const d2 = test2.json || JSON.parse(test2.raw || '[]')
    const items2 = Array.isArray(d2) ? d2 : d2.items || []
    const has75147_t2 = items2.some((p) => String(p.id || p.prescription_number) === '75147')

    const test3 = $http.send({
      url:
        baseUrl +
        '/integration-engine/get/prescriptions?patient_id=418&page_number=1&page_size=100&initial_dt=' +
        encodeURIComponent('2026-09-01 00:00:00') +
        '&token=' +
        encodeURIComponent(token),
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      timeout: 20,
    })
    const d3 = test3.json || JSON.parse(test3.raw || '[]')
    const items3 = Array.isArray(d3) ? d3 : d3.items || []
    const has75147_t3 = items3.some((p) => String(p.id || p.prescription_number) === '75147')

    // If test1 is FALSE and test2/test3 is TRUE:
    // That PROVES that SpinCare get/prescriptions final_dt parameter filters final_dt <= queryFinalParam!
    // And since 75147 has final_dt = '2026-10-01T03:59:00Z', filtering by final_dt=2026-09-30 23:59:59 EXCLUDES 75147!
    // In that case, we MUST throw an error showing the exact bools so migration log shows it!
    const msg =
      'HYPOTHESIS_RESULT: t1_septFin=' +
      has75147_t1 +
      '(' +
      items1.length +
      ') t2_octFin=' +
      has75147_t2 +
      '(' +
      items2.length +
      ') t3_noFin=' +
      has75147_t3 +
      '(' +
      items3.length +
      ')'

    cfg.set('last_test_message', msg)
    app.save(cfg)
    console.log(msg)
  },
  (app) => {},
)
