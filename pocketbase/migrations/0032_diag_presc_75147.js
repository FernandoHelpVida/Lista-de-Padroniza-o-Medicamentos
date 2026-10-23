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

      // 1. Busca prescrições com initial_dt da prescrição 75147 (2026-07-24)
      // Na descrição do usuário:
      // "a prescrição #75147, prescritora Sandy (emitida em 24/07/2026, com vigência 01/09/2026 a 30/09/2026 — deve aparecer pela vigência)"
      // Vamos buscar prescrições onde initial_dt = 2026-07-24 ou buscar sem datas ou com initial_dt=2026-07-24 00:00:00
      const resA = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?initial_dt=2026-07-24%2000%3A00%3A00&final_dt=2026-07-24%2023%3A59%3A59&page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dA = resA.json || JSON.parse(resA.raw || '[]')
      const listA = Array.isArray(dA) ? dA : dA && dA.items ? dA.items : []
      const found75147InJuly24 = listA.filter(
        (p) =>
          String(p.prescription_number || p.id) === '75147' ||
          (p.patient_name || '').toLowerCase().includes('ademir'),
      )

      // 2. O que acontece se chamamos /get/prescriptions SEM initial_dt e SEM final_dt?
      // Qual é a ordenação padrão? Quais são as páginas mais recentes?
      const resB = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?page_number=1&page_size=10&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dB = resB.json || JSON.parse(resB.raw || '[]')
      const listB = Array.isArray(dB) ? dB : dB && dB.items ? dB.items : []

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0032')
      rec.set('acao', 'DIAG_PRESC_75147')
      rec.set('usuario_nome', 'Migration 0032')
      rec.set('status_novo', 'ok')
      rec.set(
        'detalhes',
        JSON.stringify({
          july24Count: listA.length,
          foundJuly24: found75147InJuly24,
          noDatesCount: listB.length,
          sampleNoDates: listB.slice(0, 3).map((p) => ({
            id: p.id,
            prescription_number: p.prescription_number,
            patient_name: p.patient_name,
            creation_dt: p.creation_dt,
            initial_dt: p.initial_dt,
            final_dt: p.final_dt,
          })),
        }).slice(0, 4000),
      )
      app.save(rec)
    } catch (err) {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_0032_err')
        rec.set('acao', 'DIAG_PRESC_75147')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0032"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
