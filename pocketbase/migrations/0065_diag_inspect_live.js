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

      // Testa como o SpinCare busca prescrições na tela médica OFICIAL:
      // No print do usuário:
      // Filtros:
      // Data inicial*: 01/09/2026
      // Data final*: 30/09/2026
      // Paciente: ademir rostirolla
      //
      // Vamos testar:
      // 1) /integration-engine/get/prescriptions com initial_dt=2026-09-01&final_dt=2026-09-30 e patient_id=418
      // 2) /integration-engine/get/prescriptions com patient_id=418 sem datas (todas) e buscar 75147
      // 3) /integration-engine/get/prescriptions com start_date / end_date / initial_date / final_date / validity_start / validity_end
      // 4) /integration-engine/get/prescriptions?initial_dt=2026-07-01&final_dt=2026-07-31 e ver se 75147 está lá (criada em 24/07/2026)

      const tests = {}

      // Teste 1: patient_id=418 e varredura de todas as páginas de 418
      let p418All = []
      for (let p = 1; p <= 10; p++) {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?patient_id=418&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        p418All = p418All.concat(items)
        if (items.length < 100) break
      }
      const p75147 = p418All.find((x) => String(x.prescription_number || x.id) === '75147')
      tests.p418Total = p418All.length
      tests.found75147In418 = Boolean(p75147)
      if (p75147) {
        tests.p75147_full = p75147
      }

      // Teste 2: Se não achou em 418, onde está 75147? Busca por 75147 diretamente
      if (!p75147) {
        // Varre get/prescriptions com datas amplas ou sem data
        // ou testa query param de busca
        const resSingle = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions/' +
            '75147?token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        tests.endpointByIdStatus = resSingle.statusCode
        tests.endpointByIdData = resSingle.json || resSingle.raw
      }

      // Teste 3: o que o endpoint get/prescriptions com initial_dt=2026-09-01 realmente filtra?
      // Filtra por creation_dt ou por initial_dt da prescrição?
      // Vamos inspecionar 3 itens retornados por get/prescriptions?initial_dt=2026-09-01 00:00:00&final_dt=2026-09-30 23:59:59
      const resSept = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=1&page_size=5&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dSept = resSept.json || JSON.parse(resSept.raw || '[]')
      const septItems = Array.isArray(dSept) ? dSept : dSept && dSept.items ? dSept.items : []
      tests.septSample = septItems.map((x) => ({
        num: x.prescription_number,
        creation_dt: x.creation_dt,
        initial_dt: x.initial_dt,
        final_dt: x.final_dt,
      }))

      // Salva no audit_logs
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0065_live')
      rec.set('acao', 'DIAG_75147_LIVE')
      rec.set('usuario_nome', 'Migration 0065')
      rec.set('status_novo', p75147 ? 'found' : 'check')
      rec.set('detalhes', JSON.stringify(tests).slice(0, 4000))
      app.save(rec)

      // Também grava no spincare_config.last_test_message para vermos fácil
      cfg.set('last_test_message', JSON.stringify(tests).slice(0, 1000))
      app.save(cfg)
    } catch (err) {
      console.error('Erro na migracao 0065:', err)
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_0065_err')
        rec.set('acao', 'DIAG_75147_LIVE')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {},
)
