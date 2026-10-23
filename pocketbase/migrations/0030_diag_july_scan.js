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

      // 1. Testa busca de prescrição por prescription_number ou id=75147
      // ou busca sem filtros de data com page_number=1 ou busca em julho de 2026 (2026-07-24)
      const testJulyUrl =
        baseUrl +
        '/integration-engine/get/prescriptions?initial_dt=2026-07-20%2000%3A00%3A00&final_dt=2026-07-30%2023%3A59%3A59&page_number=1&page_size=100&token=' +
        encodeURIComponent(token)
      const resJuly = $http.send({
        url: testJulyUrl,
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dataJuly = resJuly.json || JSON.parse(resJuly.raw || '[]')
      const listJuly = Array.isArray(dataJuly)
        ? dataJuly
        : dataJuly && dataJuly.items
          ? dataJuly.items
          : []
      const matchJuly = listJuly.filter((it) => {
        const nm = (it.patient_name || it.nm_paciente || '').toLowerCase()
        const num = String(it.prescription_number || it.id || '')
        return nm.includes('ademir') || num === '75147'
      })

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0030')
      rec.set('acao', 'DIAG_JULY_SCAN')
      rec.set('usuario_nome', 'Migration 0030')
      rec.set('status_novo', matchJuly.length > 0 ? 'found' : 'not_found')
      rec.set(
        'detalhes',
        JSON.stringify({
          totalJulyPage1: listJuly.length,
          matchJuly: matchJuly.map((p) => ({
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
        rec.set('registro_id', 'diag_0030_err')
        rec.set('acao', 'DIAG_JULY_SCAN')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0030"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
