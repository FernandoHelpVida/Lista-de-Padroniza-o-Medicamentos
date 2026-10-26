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

      const dateFields = {
        creation_dt: p75147.creation_dt,
        prescription_date: p75147.prescription_date,
        initial_dt: p75147.initial_dt,
        final_dt: p75147.final_dt,
        dt_prescricao: p75147.dt_prescricao,
        dt_criacao: p75147.dt_criacao,
        status: p75147.status,
        status_id: p75147.status_id,
        allKeys: Object.keys(p75147),
      }

      cfg.set('last_test_message', 'M84_DATES: ' + JSON.stringify(dateFields))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
