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

      // Busca detalhada de prescription_number=75147
      const resA = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?prescription_number=75147&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dA = resA.json || JSON.parse(resA.raw || '[]')
      const listA = Array.isArray(dA) ? dA : dA && dA.items ? dA.items : []

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0033')
      rec.set('acao', 'DIAG_PRESC_75147_DETAIL')
      rec.set('usuario_nome', 'Migration 0033')
      rec.set('status_novo', 'ok')
      rec.set(
        'detalhes',
        JSON.stringify({
          listCount: listA.length,
          firstFive: listA.slice(0, 5).map((p) => ({
            id: p.id,
            prescription_number: p.prescription_number,
            patient_id: p.patient_id,
            patient_name: p.patient_name || p.nm_paciente,
            professional_name: p.professional_name || p.nm_profissional,
            initial_dt: p.initial_dt,
            final_dt: p.final_dt,
            creation_dt: p.creation_dt,
            itemsCount: (p.items || p.itens || []).length,
            items: p.items || p.itens || [],
          })),
        }).slice(0, 4000),
      )
      app.save(rec)
    } catch (err) {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_0033_err')
        rec.set('acao', 'DIAG_PRESC_75147_DETAIL')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0033"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
