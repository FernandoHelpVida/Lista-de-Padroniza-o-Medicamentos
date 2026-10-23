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

      // 1. Busca todas as prescrições do paciente 418 e filtra #75147
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

      const p75147 = all418.find((p) => String(p.prescription_number || p.id) === '75147')

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0037')
      rec.set('acao', 'DIAG_EXACT_75147')
      rec.set('usuario_nome', 'Migration 0037')
      rec.set('status_novo', p75147 ? 'found' : 'not_found')
      rec.set(
        'detalhes',
        JSON.stringify({
          found: p75147
            ? {
                id: p75147.id,
                prescription_number: p75147.prescription_number,
                patient_id: p75147.patient_id,
                patient_name: p75147.patient_name || p75147.nm_paciente,
                professional_name: p75147.professional_name || p75147.nm_profissional,
                initial_dt: p75147.initial_dt,
                final_dt: p75147.final_dt,
                creation_dt: p75147.creation_dt,
                prescription_date: p75147.prescription_date,
                itemsCount: (p75147.items || p75147.itens || []).length,
                items: p75147.items || p75147.itens,
              }
            : null,
        }),
      )
      app.save(rec)
      console.log('[DIAG_EXACT_75147]', JSON.stringify(p75147))
    } catch (err) {
      console.error('[DIAG_EXACT_75147_ERR]', err)
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0037"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
