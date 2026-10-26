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

      // Diagnostic check:
      // 1. Where does 75147 live when querying get/prescriptions?
      // Does /get/prescriptions with initial_dt=2026-09-01 00:00:00 & final_dt=2026-09-30 23:59:59 return 75147?
      // Or does get/prescriptions query creation_dt, meaning initial_dt in the query is creation_dt >= 2026-09-01?
      // Remember 75147 creation_dt = 2026-07-24!

      // Let's test 75147 directly from patient_id=418 page 3:
      const resP418 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=3&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dP418 = resP418.json || JSON.parse(resP418.raw || '[]')
      const p418Items = Array.isArray(dP418) ? dP418 : dP418 && dP418.items ? dP418.items : []
      const p75147 = p418Items.find((x) => String(x.prescription_number || x.id) === '75147')

      // Now test the wide scan: why did check-medication log:
      // "Prescrições lidas na varredura: 3500"
      // "Pacientes distintos encontrados com o medicamento nas prescrições: 0"
      // Was 75147 among the 3500 items in wide scan (initial_dt=2026-01-01 00:00:00 & final_dt=2026-09-30 23:59:59, pages 1 to 35)?
      let foundInWide35 = false
      let foundInPage = -1
      for (let p = 1; p <= 35; p++) {
        const resW = $http.send({
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
        const dW = resW.json || JSON.parse(resW.raw || '[]')
        const wItems = Array.isArray(dW) ? dW : dW && dW.items ? dW.items : []
        const match = wItems.find((x) => String(x.prescription_number || x.id) === '75147')
        if (match) {
          foundInWide35 = true
          foundInPage = p
          break
        }
        if (wItems.length < 100) break
      }

      // Check how patient search works:
      // Does /get/patients?name=Ademir Rostirolla find Ademir?
      const resPatName = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/patients?name=' +
          encodeURIComponent('Ademir Rostirolla') +
          '&page_number=1&page_size=10&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      const dPN = resPatName.json || JSON.parse(resPatName.raw || '[]')
      const pnItems = Array.isArray(dPN) ? dPN : dPN && dPN.items ? dPN.items : []

      // Also test /get/prescriptions?initial_dt=2026-09-01 00:00:00&final_dt=2026-09-30 23:59:59
      // Does it contain 75147?
      let foundInSeptPages = false
      let septPage = -1
      for (let p = 1; p <= 30; p++) {
        const resS = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const dS = resS.json || JSON.parse(resS.raw || '[]')
        const sItems = Array.isArray(dS) ? dS : dS && dS.items ? dS.items : []
        const match = sItems.find((x) => String(x.prescription_number || x.id) === '75147')
        if (match) {
          foundInSeptPages = true
          septPage = p
          break
        }
        if (sItems.length < 100) break
      }

      const out = {
        has75147_in_p418: Boolean(p75147),
        p75147_dates: p75147
          ? {
              creation_dt: p75147.creation_dt,
              initial_dt: p75147.initial_dt,
              final_dt: p75147.final_dt,
              patient_id: p75147.patient_id,
              patient_name: p75147.patient_name || p75147.nm_paciente,
              professional_name: p75147.professional_name || p75147.nm_profissional,
              items: p75147.items,
            }
          : null,
        foundInWide35,
        foundInPage,
        foundInSeptPages,
        septPage,
        patByName: pnItems.map((p) => ({ id: p.id, name: p.name || p.nome })),
      }

      cfg.set('last_test_message', 'M99: ' + JSON.stringify(out).slice(0, 950))
      app.save(cfg)
      console.log('M99_RESULT:', JSON.stringify(out))
    } catch (err) {
      console.error('M99_ERR:', err)
    }
  },
  (app) => {},
)
