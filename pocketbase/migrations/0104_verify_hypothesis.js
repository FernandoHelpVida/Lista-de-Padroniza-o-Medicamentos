/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
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

      // Fetch wide scan page 1, 2, 3... does 75147 exist in wide scan?
      // Where did 75147 go in get/prescriptions?
      // Let's test if get/prescriptions with creation_dt or initial_dt works.
      // Wait, 75147 creation_dt is 2026-07-24 08:56:25!
      // In wide scan: initial_dt=2026-01-01 00:00:00 & final_dt=2026-09-30 23:59:59.
      // Why was widePage -1 in 0100?
      // In 0100: for (let p = 1; p <= 35; p++) { ... } did 0100 actually scan 35 pages or did it timeout or break early?
      // Let's check how many pages wide scan returned:
      const resW1 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?initial_dt=2026-01-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 20,
      })
      const dW1 = resW1.json || JSON.parse(resW1.raw || '[]')
      const itemsW1 = Array.isArray(dW1) ? dW1 : dW1 && dW1.items ? dW1.items : []
      const sampleItem = itemsW1[0]
      // Also check patient 418 in wide scan:
      // In migration 0035:
      // {"totalScanned":300,"foundCount":2,"found":[{"page":3,"id":60818,"prescription_number":"60818","patient_id":418,"patient_name":"ADEMIR ROSTIROLLA"...
      // Wait! In page 3 of wide scan, presc 60818 was found for Ademir Rostirolla!
      // What was the date of 60818?
      // In diag_probe_save: "creation_dt":"2025-11-25 16:07:18.272565","prescription_number":"60818"...
      // WAIT! The wide scan returns prescriptions sorted by CREATION_DT ASCENDING!
      // In page 1: 2023/2024. In page 3: Nov/2025.
      // In page 35: only up to March/April 2026!
      // And prescription 75147 was created in JULY 2026 (2026-07-24)!
      // That's why 35 pages of initial_dt=2026-01-01 never reached July 2026!
      // Because initial_dt in /get/prescriptions DOES NOT FILTER BY INITIAL_DT, IT FILTERS BY CREATION_DT!
      // OR initial_dt=2026-07-01 reaches July 2026!

      // Let's test this hypothesis:
      // If we query get/prescriptions?initial_dt=2026-07-24 00:00:00&final_dt=2026-07-24 23:59:59:
      // Does 75147 show up on page 1?!
      const resJul24 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?initial_dt=2026-07-24%2000%3A00%3A00&final_dt=2026-07-24%2023%3A59%3A59&page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 20,
      })
      const dJul24 = resJul24.json || JSON.parse(resJul24.raw || '[]')
      const itemsJul24 = Array.isArray(dJul24) ? dJul24 : dJul24 && dJul24.items ? dJul24.items : []
      const found75147InJul24 = itemsJul24.find(
        (x) => String(x.prescription_number || x.id) === '75147',
      )

      cfg.set(
        'last_test_message',
        'HYPOTHESIS: ' +
          JSON.stringify({
            w1_count: itemsW1.length,
            w1_first_creation: sampleItem ? sampleItem.creation_dt : null,
            w1_first_initial: sampleItem ? sampleItem.initial_dt : null,
            jul24_count: itemsJul24.length,
            has75147_in_jul24: Boolean(found75147InJul24),
            jul24_75147_pnum: found75147InJul24 ? found75147InJul24.prescription_number : null,
          }),
      )
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
