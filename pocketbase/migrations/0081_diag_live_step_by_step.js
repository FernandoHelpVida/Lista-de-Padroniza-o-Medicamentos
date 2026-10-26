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

      // Diagnostic Step:
      // 1. Fetch 75147 directly from patient_id=418 page 3 to see its full fields
      const resP = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=3&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dP = resP.json || JSON.parse(resP.raw || '[]')
      const pItems = Array.isArray(dP) ? dP : dP && dP.items ? dP.items : []
      const p75147 = pItems.find((x) => String(x.prescription_number || x.id) === '75147')

      // 2. Test fetching prescriptions with different query params to see where 75147 appears
      // Check query: initial_dt=2026-01-01 00:00:00 & final_dt=2026-09-30 23:59:59 across 35 pages
      let foundInWideScan = false
      let wideScanPage = -1
      let wideScanTotal = 0
      for (let p = 1; p <= 35; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?initial_dt=2026-01-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        wideScanTotal += items.length
        const match = items.find((x) => String(x.prescription_number || x.id) === '75147')
        if (match) {
          foundInWideScan = true
          wideScanPage = p
          break
        }
        if (items.length < 100) break
      }

      // 3. Test patient name resolution: how is Ademir Rostirolla retrieved?
      // Does /get/patients?search=Ademir return patient 418?
      const resPat = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/patients?search=' +
          encodeURIComponent('Ademir Rostirolla') +
          '&page_number=1&page_size=10&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      const dPat = resPat.json || JSON.parse(resPat.raw || '[]')
      const patItems = Array.isArray(dPat) ? dPat : dPat && dPat.items ? dPat.items : []

      const diagOutput = {
        p75147_found_in_418: Boolean(p75147),
        p75147_keys: p75147 ? Object.keys(p75147) : [],
        p75147_patient_id: p75147 ? p75147.patient_id : null,
        p75147_patient_name: p75147 ? p75147.patient_name || p75147.nm_paciente : null,
        p75147_initial_dt: p75147 ? p75147.initial_dt : null,
        p75147_final_dt: p75147 ? p75147.final_dt : null,
        p75147_creation_dt: p75147 ? p75147.creation_dt : null,
        p75147_prescription_date: p75147 ? p75147.prescription_date : null,
        p75147_professional_name: p75147
          ? p75147.professional_name || p75147.nm_profissional
          : null,
        p75147_items_count: p75147 && p75147.items ? p75147.items.length : 0,
        p75147_first_item:
          p75147 && p75147.items && p75147.items[0]
            ? {
                description: p75147.items[0].description,
                dose_qt: p75147.items[0].dose_qt,
                admin_route: p75147.items[0].admin_route,
                supplied_type: p75147.items[0].supplied_type,
              }
            : null,
        wideScan_found: foundInWideScan,
        wideScan_page: wideScanPage,
        wideScan_total: wideScanTotal,
        patients_search_count: patItems.length,
        patients_search_first: patItems[0]
          ? { id: patItems[0].id, name: patItems[0].name || patItems[0].nome }
          : null,
      }

      cfg.set('last_test_message', 'M81_DIAG: ' + JSON.stringify(diagOutput))
      app.save(cfg)
    } catch (err) {
      console.error('M81_ERR', err)
      try {
        const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
        if (cfg) {
          cfg.set('last_test_message', 'M81_ERR: ' + String(err))
          app.save(cfg)
        }
      } catch (_) {}
    }
  },
  (app) => {},
)
