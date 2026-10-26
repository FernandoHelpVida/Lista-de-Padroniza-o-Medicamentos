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

      // In the combined search:
      // Case: medication = "INSULINA", patient = "Ademir Rostirolla", period = 2026-09-01 to 2026-09-30
      // 1. If patient is provided: resolve patient from /get/patients census (only 6 pages, 539 patients total, takes 1-2 seconds!)
      // Let's test resolving patient "Ademir Rostirolla":
      let matchedPatient = null
      for (let p = 1; p <= 8; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/patients?page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        const found = items.find((x) => {
          const n = (x.name || x.nome || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
          return n.includes('ADEMIR') && n.includes('ROSTIROLLA')
        })
        if (found) {
          matchedPatient = found
          break
        }
        if (items.length < 100) break
      }

      // 2. Fetch prescriptions for patient_id=418
      let allP418 = []
      for (let p = 1; p <= 5; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?patient_id=' +
            matchedPatient.id +
            '&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 20,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        allP418 = allP418.concat(items)
        if (items.length < 100) break
      }

      // 3. Now apply the exact rules:
      // Filter by period vigência: initial_dt >= 2026-09-01 && initial_dt <= 2026-09-30
      // Match medication "INSULINA"
      const results = []
      const norm = (s) =>
        (s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      const toIsoYmd = (val) => {
        if (!val || val === '—') return ''
        const s = String(val).trim().split(' ')[0]
        if (s.includes('/')) {
          const parts = s.split('/')
          if (parts.length === 3)
            return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
        } else if (s.includes('-')) {
          const parts = s.split('-')
          if (parts.length === 3) {
            if (parts[0].length === 4)
              return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
            if (parts[2].length === 4)
              return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
          }
        }
        return ''
      }

      for (let i = 0; i < allP418.length; i++) {
        const pr = allP418[i]
        const dtInit = toIsoYmd(pr.initial_dt)
        if (!dtInit || dtInit < '2026-09-01' || dtInit > '2026-09-30') continue

        const items = pr.items || []
        for (let j = 0; j < items.length; j++) {
          const it = items[j]
          const desc = String(
            it.itemDescription || it.description || it.ds_produto || it.name || '',
          ).trim()
          const normDesc = norm(desc)
          // Match insulina:
          if (
            normDesc.includes('insulina') ||
            normDesc.includes('lantus') ||
            normDesc.includes('glargina')
          ) {
            results.push({
              prescription_number: pr.prescription_number,
              professional_name: pr.professional_name,
              itemDescription: it.itemDescription || it.description,
              dose: it.dose_qt,
              via: it.admin_route,
              fp:
                it.supplied_type === 'e'
                  ? 'Empresa'
                  : it.supplied_type === 'o'
                    ? 'Operadora'
                    : it.supplied_type,
            })
          }
        }
      }

      cfg.set('last_test_message', 'ADEMIR_TEST: ' + JSON.stringify(results))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
