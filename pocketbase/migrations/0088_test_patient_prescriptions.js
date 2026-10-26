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

      // Vamos testar chamadas com patient_id=418 e diferentes parâmetros:
      // P1: /integration-engine/get/prescriptions?patient_id=418&initial_dt=2026-09-01 00:00:00
      // P2: /integration-engine/get/prescriptions?patient_id=418&initial_dt=2026-07-01 00:00:00
      // P3: /integration-engine/get/prescriptions?patient_id=418 (sem datas) - em qual página das 3 páginas de 418 está a 75147?
      // E quais as datas de todas as prescrições da página onde 75147 está?

      const testCall = (extra) => {
        const res = $http.send({
          url: baseUrl + '/integration-engine/get/prescriptions?token=' + encodeURIComponent(token) + extra,
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        const match = items.find((x) => String(x.prescription_number || x.id) === '75147')
        return { total: items.length, has75147: Boolean(match) }
      }

      const r1 = testCall('&patient_id=418&initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59')
      const r2 = testCall('&patient_id=418&initial_dt=2026-07-01%2000%3A00%3A00&final_dt=2026-07-31%2023%3A59%3A59')
      const r3 = testCall('&patient_id=418&page_number=3&page_size=100')

      // E como buscar Ademir Rostirolla na busca de pacientes?
      const resPat = $http.send({
        url: baseUrl + '/integration-engine/get/patients?search=' + encodeURIComponent('ADEMIR ROSTIROLLA') + '&page_number=1&page_size=10&token=' + encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      const dPat = resPat.json || JSON.parse(resPat.raw || '[]')
      const pList = Array.isArray(dPat) ? dPat : dPat && dPat.items ? dPat.items : []

      cfg.set('last_test_message', 'M88: r1(sept)=' + JSON.stringify(r1) + ' | r2(july)=' + JSON.stringify(r2) + ' | r3(p3)=' + JSON.stringify(r3) + ' | patSearch=' + JSON.stringify(pList.map(p => ({ id: p.id, name: p.name || p.nome }))))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
