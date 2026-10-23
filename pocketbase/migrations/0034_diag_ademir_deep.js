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

      // 1. Busca todos os pacientes com nome ademir
      // 2. Busca prescrições em setembro/2026 e lista os pacientes distintos e suas prescrições
      const resPat = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/patients?search=Ademir&page_number=1&page_size=50&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      const dPat = resPat.json || JSON.parse(resPat.raw || '[]')
      const patList = Array.isArray(dPat) ? dPat : dPat && dPat.items ? dPat.items : []

      // Varre as prescrições de setembro/2026 coletando todas as prescrições
      let allSeptPresc = []
      for (let p = 1; p <= 5; p++) {
        const resP = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        const dP = resP.json || JSON.parse(resP.raw || '[]')
        const pItems = Array.isArray(dP) ? dP : dP && dP.items ? dP.items : []
        allSeptPresc = allSeptPresc.concat(pItems)
        if (pItems.length < 100) break
      }

      // Procura qualquer menção a "Ademir", "Rostirolla", "Sandy", "75147" em allSeptPresc
      const matchesSept = allSeptPresc.filter((p) => {
        const text = JSON.stringify(p).toLowerCase()
        return (
          text.includes('ademir') ||
          text.includes('rostirolla') ||
          text.includes('sandy') ||
          text.includes('75147') ||
          text.includes('lantus')
        )
      })

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_0034')
      rec.set('acao', 'DIAG_ADEMIR_DEEP')
      rec.set('usuario_nome', 'Migration 0034')
      rec.set('status_novo', 'ok')
      rec.set(
        'detalhes',
        JSON.stringify({
          patListAdemir: patList.map((p) => ({
            id: p.id,
            name: p.name || p.nome,
            active: p.active,
          })),
          allSeptCount: allSeptPresc.length,
          matchesSept: matchesSept.map((p) => ({
            id: p.id,
            prescription_number: p.prescription_number,
            patient_id: p.patient_id,
            patient_name: p.patient_name || p.nm_paciente,
            professional_name: p.professional_name || p.nm_profissional,
            initial_dt: p.initial_dt,
            final_dt: p.final_dt,
            creation_dt: p.creation_dt,
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
        rec.set('registro_id', 'diag_0034_err')
        rec.set('acao', 'DIAG_ADEMIR_DEEP')
        rec.set('detalhes', String(err).slice(0, 1000))
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_0034"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) app.delete(recs[i])
    } catch (_) {}
  },
)
