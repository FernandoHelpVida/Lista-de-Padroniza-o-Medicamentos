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

      // Testa se get/prescriptions suporta parâmetros como:
      // - search=Ademir
      // - patient_name=Ademir
      // - search=75147
      // - prescription_number=75147
      // - numero=75147
      // - id=75147
      // - initial_date= / final_date=
      // - start_date= / end_date=

      const testPresc = (paramStr) => {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?token=' +
            encodeURIComponent(token) +
            '&page_number=1&page_size=5&' +
            paramStr,
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        const match = items.find((x) => String(x.prescription_number || x.id) === '75147')
        return {
          total: items.length,
          has75147: Boolean(match),
          sample: items[0]
            ? { id: items[0].id, num: items[0].prescription_number, pat: items[0].patient_name }
            : null,
        }
      }

      const t_num = testPresc('prescription_number=75147')
      const t_id = testPresc('id=75147')
      const t_search = testPresc('search=' + encodeURIComponent('75147'))
      const t_search_name = testPresc('search=' + encodeURIComponent('Ademir'))
      const t_pat_name = testPresc('patient_name=' + encodeURIComponent('Ademir'))

      cfg.set(
        'last_test_message',
        'M90: num=' +
          JSON.stringify(t_num) +
          ' | id=' +
          JSON.stringify(t_id) +
          ' | s_75147=' +
          JSON.stringify(t_search) +
          ' | s_name=' +
          JSON.stringify(t_search_name) +
          ' | pat_name=' +
          JSON.stringify(t_pat_name),
      )
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
