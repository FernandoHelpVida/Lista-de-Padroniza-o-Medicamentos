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

      let foundPresc = null
      let foundPage = 0
      let totalScanned = 0

      // Varre páginas de setembro
      for (let p = 1; p <= 15; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/prescriptions?initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=' +
          p +
          '&page_size=100&token=' +
          encodeURIComponent(token)
        const res = $http.send({
          url: url,
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const data = res.json || JSON.parse(res.raw || '[]')
        const list = Array.isArray(data) ? data : data && data.items ? data.items : []
        totalScanned += list.length
        if (list.length === 0) break

        const match = list.find((it) => {
          const nm = (it.patient_name || it.nm_paciente || '').toLowerCase()
          const num = String(it.prescription_number || it.id || '')
          return nm.includes('ademir') || num === '75147'
        })

        if (match) {
          foundPresc = match
          foundPage = p
          break
        }

        if (list.length < 100) break
      }

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0029')
      rec.set('acao', 'DIAG_PAGES_SCAN')
      rec.set('usuario_nome', 'Migration 0029')
      rec.set('status_novo', foundPresc ? 'found' : 'not_found')
      rec.set(
        'detalhes',
        JSON.stringify({
          totalScanned: totalScanned,
          foundPage: foundPage,
          foundPresc: foundPresc
            ? {
                id: foundPresc.id,
                prescription_number: foundPresc.prescription_number,
                patient_id: foundPresc.patient_id,
                patient_name: foundPresc.patient_name || foundPresc.nm_paciente,
                professional_name: foundPresc.professional_name || foundPresc.nm_profissional,
                initial_dt: foundPresc.initial_dt,
                final_dt: foundPresc.final_dt,
                prescription_date: foundPresc.prescription_date || foundPresc.creation_dt,
                items: foundPresc.items || foundPresc.itens || [],
              }
            : null,
        }).slice(0, 4000),
      )
      app.save(rec)
    } catch (err) {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_0029_err')
        rec.set('acao', 'DIAG_PAGES_SCAN')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0029"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
