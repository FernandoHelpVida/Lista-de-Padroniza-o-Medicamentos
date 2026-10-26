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

      // Testa como filtrar pacientes pelo nome no SpinCare
      // Opções conhecidas de APIs REST:
      // 1. name=Ademir
      // 2. name=Ademir Rostirolla
      // 3. search= (retornou lista alfabética ignorando search?)
      // 4. filter=
      // 5. q=

      const testPatParam = (paramStr) => {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/patients?token=' +
            encodeURIComponent(token) +
            '&page_number=1&page_size=5&' +
            paramStr,
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        return items.map((p) => ({ id: p.id, name: p.name || p.nome }))
      }

      const p_name = testPatParam('name=' + encodeURIComponent('Ademir'))
      const p_name_full = testPatParam('name=' + encodeURIComponent('Ademir Rostirolla'))
      const p_search = testPatParam('search=' + encodeURIComponent('Rostirolla'))
      const p_filter = testPatParam('filter=' + encodeURIComponent('Rostirolla'))
      const p_q = testPatParam('q=' + encodeURIComponent('Rostirolla'))

      cfg.set(
        'last_test_message',
        'M89_PAT_PARAMS: name=' +
          JSON.stringify(p_name) +
          ' | name_full=' +
          JSON.stringify(p_name_full) +
          ' | search_rost=' +
          JSON.stringify(p_search) +
          ' | q_rost=' +
          JSON.stringify(p_q),
      )
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
