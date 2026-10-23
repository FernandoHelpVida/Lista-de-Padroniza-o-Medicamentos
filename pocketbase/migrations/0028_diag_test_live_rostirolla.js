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

      // 1. Testa chamada a get/prescriptions com initial_dt=2026-09-01 00:00:00 e final_dt=2026-09-30 23:59:59
      const url1 =
        baseUrl +
        '/integration-engine/get/prescriptions?initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=1&page_size=100&token=' +
        encodeURIComponent(token)
      const res1 = $http.send({
        url: url1,
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })

      const data1 = res1.json || JSON.parse(res1.raw || '[]')
      const list1 = Array.isArray(data1) ? data1 : data1 && data1.items ? data1.items : []

      // Procura prescrição de Ademir
      const ademirInPage1 = list1.filter((p) => {
        const nm = (p.patient_name || p.nm_paciente || '').toLowerCase()
        const num = String(p.prescription_number || p.id || '')
        return nm.includes('ademir') || num === '75147'
      })

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0028')
      rec.set('acao', 'DIAG_SEPT_LIVE')
      rec.set('usuario_nome', 'Migration 0028')
      rec.set('status_novo', 'ok')
      rec.set(
        'detalhes',
        JSON.stringify({
          statusCode: res1.statusCode,
          totalPage1: list1.length,
          ademirFoundCount: ademirInPage1.length,
          sampleAdemir: ademirInPage1.map((p) => ({
            id: p.id,
            prescription_number: p.prescription_number,
            patient_id: p.patient_id,
            patient_name: p.patient_name || p.nm_paciente,
            professional_name: p.professional_name || p.nm_profissional,
            initial_dt: p.initial_dt,
            final_dt: p.final_dt,
            prescription_date: p.prescription_date || p.creation_dt,
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
        rec.set('registro_id', 'diag_0028_err')
        rec.set('acao', 'DIAG_SEPT_LIVE')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0028"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
