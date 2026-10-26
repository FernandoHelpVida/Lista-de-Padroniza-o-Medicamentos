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

      // Vamos examinar:
      // 1. Quantas páginas tem testA (initial_dt=2026-09-01 00:00:00 & final_dt=2026-09-30 23:59:59)?
      // Em qual página de testA está a 75147?
      // 2. O que tem em testB e testC para Ademir?

      let foundInTestAPage = -1
      let totalPagesTestA = 0
      let totalItemsTestA = 0
      for (let p = 1; p <= 35; p++) {
        const resA = $http.send({
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
        const dA = resA.json || JSON.parse(resA.raw || '[]')
        const itemsA = Array.isArray(dA) ? dA : dA && dA.items ? dA.items : []
        totalPagesTestA = p
        totalItemsTestA += itemsA.length
        const match = itemsA.find((x) => String(x.prescription_number || x.id) === '75147')
        if (match) {
          foundInTestAPage = p
          break
        }
        if (itemsA.length < 100) break
      }

      // Teste de busca de paciente com nome exato ou id:
      // Como a busca de pacientes retorna Ademir?
      // Se chamarmos /get/patients?page_number=1&page_size=100...
      // e filtrarmos localmente por "ademir rostirolla", quantos pacientes batem?
      // Vamos testar:
      const resPat = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/patients?page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dPat = resPat.json || JSON.parse(resPat.raw || '[]')
      const patItems = Array.isArray(dPat) ? dPat : dPat && dPat.items ? dPat.items : []

      const out = {
        foundInTestAPage,
        totalPagesTestA,
        totalItemsTestA,
        patSample: patItems.slice(0, 3).map((p) => ({ id: p.id, name: p.name || p.nome })),
      }

      cfg.set('last_test_message', 'M96_FOUND_P: ' + JSON.stringify(out))
      app.save(cfg)
    } catch (err) {
      console.error('M96_ERR:', err)
    }
  },
  (app) => {},
)
