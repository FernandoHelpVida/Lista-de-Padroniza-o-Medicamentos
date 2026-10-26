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

      const norm = (s) =>
        String(s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()

      const toIsoYmd = (s) => {
        if (!s) return ''
        const str = String(s).trim()
        const mIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (mIso) return mIso[1] + '-' + mIso[2] + '-' + mIso[3]
        const mBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
        if (mBr) return mBr[3] + '-' + mBr[2] + '-' + mBr[1]
        return ''
      }

      // Test 1: get/prescriptions with initial_dt='2026-09-01 00:00:00' and NO final_dt
      let allNoFin = []
      let p75147FoundInNoFin = null
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
        allNoFin = allNoFin.concat(items)
        const found = items.find((x) => String(x.prescription_number || x.id) === '75147')
        if (found) {
          p75147FoundInNoFin = found
          break
        }
        if (items.length < 100) break
      }

      // Test 2: get/prescriptions with initial_dt='2026-09-01 00:00:00'&final_dt='2026-10-05 23:59:59'
      let allOct = []
      let p75147FoundInOct = null
      for (let p = 1; p <= 5; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?page_number=' +
            p +
            '&page_size=100&initial_dt=' +
            encodeURIComponent('2026-09-01 00:00:00') +
            '&final_dt=' +
            encodeURIComponent('2026-10-05 23:59:59') +
            '&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        if (res.statusCode !== 200) break
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        allOct = allOct.concat(items)
        const found = items.find((x) => String(x.prescription_number || x.id) === '75147')
        if (found) {
          p75147FoundInOct = found
          break
        }
        if (items.length < 100) break
      }

      // Test 3: What if we test in allPeriodPrescs (307 from 2026-09-01 to 2026-09-30) why #75147 wasn't there?
      // Remember in migration 0115:
      // has75147 was FALSE in dedupedPrescriptions of 2026-09-01 to 2026-09-30!
      // Why? Because 75147 has final_dt = "2026-10-01T03:59:00Z"!
      // If SpinCare SQL filter is: final_dt <= paramFinalDt, then 2026-10-01 > 2026-09-30, so 75147 was excluded!
      // But if final_dt is omitted, or final_dt is extended, does 75147 appear?
      const checkResult = {
        noFinCount: allNoFin.length,
        has75147InNoFin: Boolean(p75147FoundInNoFin),
        octCount: allOct.length,
        has75147InOct: Boolean(p75147FoundInOct),
        firstP75147Page: p75147FoundInNoFin ? p75147FoundInNoFin.initial_dt : null,
      }

      cfg.set('last_test_message', 'M54_QUERY_TEST: ' + JSON.stringify(checkResult))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
