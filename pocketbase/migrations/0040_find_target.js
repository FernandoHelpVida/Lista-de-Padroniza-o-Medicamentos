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

      let allPrescriptions = []
      let foundPrescriptions = []

      for (let p = 1; p <= 35; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/prescriptions?page_number=' +
          p +
          '&page_size=100&initial_dt=2026-01-01%2000%3A00%3A00&token=' +
          encodeURIComponent(token)
        const res = $http.send({
          url: url,
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        if (res.statusCode !== 200) break
        let items = []
        try {
          const j = res.json || JSON.parse(res.raw || '[]')
          if (Array.isArray(j)) items = j
          else if (j && Array.isArray(j.items)) items = j.items
        } catch (_) {}

        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const pNum = String(it.prescription_number || it.id || '')
          if (pNum === '75147' || (it.patient_name || '').toLowerCase().includes('ademir')) {
            foundPrescriptions.push(it)
          }
        }
        if (items.length < 100) break
      }

      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id = "diag_probe_save"',
        '-created',
        1,
        0,
      )
      const rec = recs.length > 0 ? recs[0] : new Record(app.findCollectionByNameOrId('audit_logs'))
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_probe_save')
      rec.set('acao', 'DIAG_PROBE_SAVE')
      rec.set(
        'detalhes',
        JSON.stringify({
          foundCount: foundPrescriptions.length,
          sample: foundPrescriptions,
        }).slice(0, 3900),
      )
      app.save(rec)
    } catch (err) {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'spincare_middleware')
        rec.set('registro_id', 'diag_probe_save')
        rec.set('acao', 'DIAG_PROBE_SAVE')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {},
)
