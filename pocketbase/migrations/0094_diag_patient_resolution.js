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
      // But in the wide scan: scanQueryInitParam = '2026-01-01 00:00:00' and scanQueryFinalParam = '2026-09-30 23:59:59'
      // Why didn't 35 pages (3500 items) reach 75147 on page 138?
      // Because 35 pages * 100 = 3500 items, and 75147 was on page 138 (item ~13800)!
      // OR does SpinCare accept patient_name or patient_id or search?
      // Let's test if /get/patients?search=ADEMIR returns patient_id 418, OR /get/patients?name=ADEMIR returns 418:

      const testPat = (queryParam) => {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/patients?' +
            queryParam +
            '&page_number=1&page_size=10&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        return items.map((p) => ({ id: p.id, name: p.name || p.nome }))
      }

      // Test searching patients
      const patBySearch = testPat('search=' + encodeURIComponent('ADEMIR ROSTIROLLA'))
      const patByName = testPat('name=' + encodeURIComponent('ADEMIR ROSTIROLLA'))
      const patByQ = testPat('q=' + encodeURIComponent('ADEMIR ROSTIROLLA'))

      // Test prescriptions by patient_id=418
      const resP418 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dP418 = resP418.json || JSON.parse(resP418.raw || '[]')
      const p418Items = Array.isArray(dP418) ? dP418 : dP418 && dP418.items ? dP418.items : []

      // Test prescriptions with query params: does /get/prescriptions accept patient_name or search?
      const testPresc = (param) => {
        const res = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?' +
            param +
            '&page_number=1&page_size=10&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        return {
          count: items.length,
          sample: items[0]
            ? { id: items[0].id, num: items[0].prescription_number, pat: items[0].patient_name }
            : null,
        }
      }

      const pSearch = testPresc('search=' + encodeURIComponent('ADEMIR'))
      const pPatName = testPresc('patient_name=' + encodeURIComponent('ADEMIR'))
      const pName = testPresc('name=' + encodeURIComponent('ADEMIR'))

      const out = {
        patBySearch,
        patByName,
        patByQ,
        p418Count: p418Items.length,
        pSearch,
        pPatName,
        pName,
      }

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'spincare_middleware')
      auditRecord.set('registro_id', 'diag_0094')
      auditRecord.set('acao', 'DIAG_STEP_DISCOVERY')
      auditRecord.set('usuario_nome', 'Migration 0094')
      auditRecord.set('status_novo', 'ok')
      auditRecord.set('detalhes', JSON.stringify(out).slice(0, 4000))
      app.save(auditRecord)

      cfg.set('last_test_message', 'M94_DIAG: ' + JSON.stringify(out).slice(0, 950))
      app.save(cfg)
    } catch (err) {
      console.error('M94_ERR:', err)
    }
  },
  (app) => {},
)
