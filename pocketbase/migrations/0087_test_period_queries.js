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

      // Testa:
      // T1: get/prescriptions?initial_dt=2026-09-01 00:00:00&final_dt=2026-09-30 23:59:59 (período do usuário!)
      // T2: get/prescriptions?initial_dt=2026-07-01 00:00:00&final_dt=2026-07-31 23:59:59
      // Quantas páginas têm em cada um? 75147 aparece em qual?
      
      const scanPeriod = (initDt, finDt, maxP) => {
        let found = false
        let fPage = -1
        let total = 0
        for (let p = 1; p <= maxP; p++) {
          const res = $http.send({
            url:
              baseUrl +
              '/integration-engine/get/prescriptions?initial_dt=' + encodeURIComponent(initDt) +
              '&final_dt=' + encodeURIComponent(finDt) +
              '&page_number=' + p +
              '&page_size=100&token=' + encodeURIComponent(token),
            method: 'GET',
            headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
            timeout: 25,
          })
          const d = res.json || JSON.parse(res.raw || '[]')
          const items = Array.isArray(d) ? d : d && d.items ? d.items : []
          total += items.length
          const match = items.find((x) => String(x.prescription_number || x.id) === '75147')
          if (match) {
            found = true
            fPage = p
            break
          }
          if (items.length < 100) break
        }
        return { found, fPage, total }
      }

      // T1: O período que o usuário digitou: 2026-09-01 a 2026-09-30
      const t1 = scanPeriod('2026-09-01 00:00:00', '2026-09-30 23:59:59', 10)
      // T2: O mês de criação da 75147: 2026-07-01 a 2026-07-31
      const t2 = scanPeriod('2026-07-01 00:00:00', '2026-07-31 23:59:59', 15)

      cfg.set('last_test_message', 'M87_PERIODS: T1(sept)=' + JSON.stringify(t1) + ' | T2(july)=' + JSON.stringify(t2))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
