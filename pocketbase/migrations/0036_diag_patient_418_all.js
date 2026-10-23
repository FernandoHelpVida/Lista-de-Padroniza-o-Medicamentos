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

      // 1. Busca todas as prescrições do paciente 418
      let all418 = []
      for (let p = 1; p <= 10; p++) {
        const resP = $http.send({
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
        const dP = resP.json || JSON.parse(resP.raw || '[]')
        const pItems = Array.isArray(dP) ? dP : dP && dP.items ? dP.items : []
        all418 = all418.concat(pItems)
        if (pItems.length < 100) break
      }

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0036')
      rec.set('acao', 'DIAG_PATIENT_418_ALL')
      rec.set('usuario_nome', 'Migration 0036')
      rec.set('status_novo', 'ok')
      rec.set(
        'detalhes',
        JSON.stringify({
          count418: all418.length,
          prescriptions: all418.map((p) => ({
            id: p.id,
            prescription_number: p.prescription_number,
            patient_id: p.patient_id,
            patient_name: p.patient_name || p.nm_paciente,
            professional_name: p.professional_name || p.nm_profissional,
            initial_dt: p.initial_dt,
            final_dt: p.final_dt,
            creation_dt: p.creation_dt,
            prescription_date: p.prescription_date,
            items: p.items || p.itens,
          })),
        }).slice(0, 4000),
      )
      app.save(rec)
    } catch (err) {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_0036_err')
        rec.set('acao', 'DIAG_PATIENT_418_ALL')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0036"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
