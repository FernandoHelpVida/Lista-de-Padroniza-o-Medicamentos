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

      // 1. Testa busca com query params comuns na API SpinCare:
      // a) ?prescription_number=75147
      // b) ?id=75147
      // c) ?search=75147
      // d) ?patient_id=418
      // e) /get/prescriptions/75147
      // f) get/prescriptions com initial_dt=2026-01-01 00:00:00 até 2026-12-31 23:59:59 e varrendo
      const tests = {}

      // Test a: prescription_number
      try {
        const resA = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?prescription_number=75147&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const dA = resA.json || JSON.parse(resA.raw || '[]')
        tests.prescription_number = {
          status: resA.statusCode,
          count: Array.isArray(dA) ? dA.length : dA && dA.items ? dA.items.length : 0,
          sample: Array.isArray(dA) ? dA.slice(0, 1) : dA,
        }
      } catch (eA) {
        tests.prescription_number = String(eA)
      }

      // Test b: ?id=75147
      try {
        const resB = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?id=75147&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const dB = resB.json || JSON.parse(resB.raw || '[]')
        tests.byId = {
          status: resB.statusCode,
          count: Array.isArray(dB) ? dB.length : dB && dB.items ? dB.items.length : 0,
          sample: Array.isArray(dB) ? dB.slice(0, 1) : dB,
        }
      } catch (eB) {
        tests.byId = String(eB)
      }

      // Test c: ?patient_id=418
      try {
        const resC = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?patient_id=418&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const dC = resC.json || JSON.parse(resC.raw || '[]')
        tests.byPatient418 = {
          status: resC.statusCode,
          count: Array.isArray(dC) ? dC.length : dC && dC.items ? dC.items.length : 0,
          sample: Array.isArray(dC) ? dC.slice(0, 1) : dC,
        }
      } catch (eC) {
        tests.byPatient418 = String(eC)
      }

      // Test d: /get/patients?search=Ademir
      try {
        const resD = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/patients?search=Ademir&page_number=1&page_size=50&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const dD = resD.json || JSON.parse(resD.raw || '[]')
        const pArr = Array.isArray(dD) ? dD : dD && dD.items ? dD.items : []
        tests.patientsSearchAdemir = {
          status: resD.statusCode,
          count: pArr.length,
          items: pArr.map((p) => ({
            id: p.id,
            name: p.name || p.nome,
            active: p.active,
            document: p.document || p.cpf,
          })),
        }
      } catch (eD) {
        tests.patientsSearchAdemir = String(eD)
      }

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0031')
      rec.set('acao', 'DIAG_PRESC_PARAMS')
      rec.set('usuario_nome', 'Migration 0031')
      rec.set('status_novo', 'ok')
      rec.set('detalhes', JSON.stringify(tests).slice(0, 4000))
      app.save(rec)
    } catch (err) {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_0031_err')
        rec.set('acao', 'DIAG_PRESC_PARAMS')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0031"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
