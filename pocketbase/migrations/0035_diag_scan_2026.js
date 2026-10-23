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

      // Varre as prescrições de 2026 procurando qualquer uma com "Ademir" ou "75147"
      // Inicial: 2026-01-01
      let found = []
      let totalScanned = 0
      for (let p = 1; p <= 35; p++) {
        const resP = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?initial_dt=2026-01-01%2000%3A00%3A00&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const dP = resP.json || JSON.parse(resP.raw || '[]')
        const pItems = Array.isArray(dP) ? dP : dP && dP.items ? dP.items : []
        totalScanned += pItems.length
        if (pItems.length === 0) break

        for (let i = 0; i < pItems.length; i++) {
          const item = pItems[i]
          const str = JSON.stringify(item).toLowerCase()
          if (str.includes('ademir') || str.includes('75147') || str.includes('rostirolla')) {
            found.push({ page: p, item: item })
          }
        }
        if (found.length > 0) break
        if (pItems.length < 100) break
      }

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0035')
      rec.set('acao', 'DIAG_SCAN_2026')
      rec.set('usuario_nome', 'Migration 0035')
      rec.set('status_novo', found.length > 0 ? 'found' : 'not_found')
      rec.set(
        'detalhes',
        JSON.stringify({
          totalScanned: totalScanned,
          foundCount: found.length,
          found: found.map((f) => ({
            page: f.page,
            id: f.item.id,
            prescription_number: f.item.prescription_number,
            patient_id: f.item.patient_id,
            patient_name: f.item.patient_name || f.item.nm_paciente,
            professional_name: f.item.professional_name || f.item.nm_profissional,
            initial_dt: f.item.initial_dt,
            final_dt: f.item.final_dt,
            creation_dt: f.item.creation_dt,
            prescription_date: f.item.prescription_date,
            items: f.item.items || f.item.itens,
          })),
        }).slice(0, 4000),
      )
      app.save(rec)
    } catch (err) {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_0035_err')
        rec.set('acao', 'DIAG_SCAN_2026')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0035"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
