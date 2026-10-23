migrate(
  (app) => {
    try {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      const baseUrl = (
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfg.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      const targetNumbers = ['73024', '74579', '74620', '75147', '73188']
      const targetFound = []
      let pagesFetched = 0
      let lastStatus = 0

      for (let p = 1; p <= 35; p++) {
        pagesFetched++
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
        lastStatus = res.statusCode
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
          if (targetNumbers.includes(pNum)) {
            targetFound.push(it)
          }
        }
        if (targetFound.length >= targetNumbers.length) break
        if (items.length < 100) break
      }

      const diagDetails = {
        pagesFetched: pagesFetched,
        lastStatus: lastStatus,
        prescriptionsCount: targetFound.length,
        prescriptions: targetFound.map((t) => ({
          id: t.id,
          prescription_number: t.prescription_number,
          patient_id: t.patient_id,
          patient_name: t.patient_name || t.nm_paciente,
          professional_name: t.professional_name || t.nm_profissional,
          initial_dt: t.initial_dt,
          final_dt: t.final_dt,
          prescription_date: t.prescription_date || t.creation_dt,
          items: (t.items || t.itens || []).map((it) => ({
            id: it.id,
            description: it.description || it.ds_produto || it.itemDescription || it.name,
            obs: it.observation || it.observacao,
            dose: it.dose || it.dosage || it.dose_qt,
            route: it.admin_route || it.via || it.via_administracao,
            fp: it.supplied_type || it.funding_source || it.fp,
          })),
        })),
      }

      // Salva no audit_logs
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_73024_75147')
      rec.set('acao', 'SPINCARE_DIAG_PRESCRIPTIONS_V2')
      rec.set('usuario', 'system_diag')
      rec.set('usuario_nome', 'Diagnóstico Prescrições')
      rec.set('usuario_email', 'diag@helpvida.com.br')
      rec.set('usuario_role', 'admin')
      rec.set('status_anterior', '')
      rec.set('status_novo', targetFound.length > 0 ? 'encontrado' : 'status_' + lastStatus)
      rec.set('detalhes', JSON.stringify(diagDetails))
      app.save(rec)
    } catch (err) {
      console.log('Erro na migração 0025:', err)
    }
  },
  (app) => {},
)
