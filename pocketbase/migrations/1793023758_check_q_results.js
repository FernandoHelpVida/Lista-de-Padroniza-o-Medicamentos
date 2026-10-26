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

    // Test period queries:
    // Q1: initial_dt='2026-09-01 00:00:00' (no final_dt)
    let countQ1 = 0
    let has75147_Q1 = false
    for (let p = 1; p <= 5; p++) {
      const res = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?page_number=' +
          p +
          '&page_size=100&initial_dt=' +
          encodeURIComponent('2026-09-01 00:00:00') +
          '&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      if (res.statusCode !== 200) break
      const d = res.json || JSON.parse(res.raw || '[]')
      const items = Array.isArray(d) ? d : d && d.items ? d.items : []
      countQ1 += items.length
      if (items.some((x) => String(x.prescription_number || x.id) === '75147')) {
        has75147_Q1 = true
        break
      }
      if (items.length < 100) break
    }

    // Q2: initial_dt='2026-09-01 00:00:00'&final_dt='2026-09-30 23:59:59'
    let countQ2 = 0
    let has75147_Q2 = false
    for (let p = 1; p <= 5; p++) {
      const res = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?page_number=' +
          p +
          '&page_size=100&initial_dt=' +
          encodeURIComponent('2026-09-01 00:00:00') +
          '&final_dt=' +
          encodeURIComponent('2026-09-30 23:59:59') +
          '&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      if (res.statusCode !== 200) break
      const d = res.json || JSON.parse(res.raw || '[]')
      const items = Array.isArray(d) ? d : d && d.items ? d.items : []
      countQ2 += items.length
      if (items.some((x) => String(x.prescription_number || x.id) === '75147')) {
        has75147_Q2 = true
        break
      }
      if (items.length < 100) break
    }

    // Q3: initial_dt='2026-09-01 00:00:00'&final_dt='2026-10-31 23:59:59'
    let countQ3 = 0
    let has75147_Q3 = false
    for (let p = 1; p <= 5; p++) {
      const res = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?page_number=' +
          p +
          '&page_size=100&initial_dt=' +
          encodeURIComponent('2026-09-01 00:00:00') +
          '&final_dt=' +
          encodeURIComponent('2026-10-31 23:59:59') +
          '&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      if (res.statusCode !== 200) break
      const d = res.json || JSON.parse(res.raw || '[]')
      const items = Array.isArray(d) ? d : d && d.items ? d.items : []
      countQ3 += items.length
      if (items.some((x) => String(x.prescription_number || x.id) === '75147')) {
        has75147_Q3 = true
        break
      }
      if (items.length < 100) break
    }

    const testOutput = {
      Q1_noFin: { count: countQ1, has75147: has75147_Q1 },
      Q2_septFin: { count: countQ2, has75147: has75147_Q2 },
      Q3_octFin: { count: countQ3, has75147: has75147_Q3 },
    }

    cfg.set('last_test_message', 'M58: ' + JSON.stringify(testOutput))
    app.save(cfg)
  },
  (app) => {},
)
