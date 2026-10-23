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

      console.log('=== MIGRAÇÃO 0024: INVESTIGAÇÃO DIAGNÓSTICA SPINCARE ===')

      // 1. Investigar as prescrições específicas #73024, #74579, #74620, #75147 e #73188
      const targetNumbers = ['73024', '74579', '74620', '75147', '73188']
      const targetFound = []

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
          if (targetNumbers.includes(pNum)) {
            targetFound.push(it)
          }
        }
        if (targetFound.length >= targetNumbers.length) break
        if (items.length < 100) break
      }

      console.log('Prescrições alvo encontradas:', targetFound.length)
      const diagDetails = targetFound.map((t) => {
        return {
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
        }
      })

      // Grava no audit_logs para consulta via db_query
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'diag_73024_75147')
      rec.set('acao', 'SPINCARE_DIAG_PRESCRIPTIONS')
      rec.set('usuario', 'system_diag')
      rec.set('usuario_nome', 'Diagnóstico Prescrições')
      rec.set('usuario_email', 'diag@helpvida.com.br')
      rec.set('usuario_role', 'admin')
      rec.set('status_anterior', '')
      rec.set('status_novo', 'concluido')
      rec.set('detalhes', JSON.stringify(diagDetails))
      app.save(rec)
      console.log('Audit log gravado com sucesso para SPINCARE_DIAG_PRESCRIPTIONS!')
    } catch (err) {
      console.log('Erro na migração diagnóstica 0024:', err)
    }
  },
  (app) => {},
)
