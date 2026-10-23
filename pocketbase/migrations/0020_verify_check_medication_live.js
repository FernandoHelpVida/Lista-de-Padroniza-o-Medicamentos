migrate(
  (app) => {
    // 0020_verify_check_medication_live.js
    // Validação ao vivo do caso de teste:
    // Medicamento: "insulina"
    // Paciente: "Ademir Rostirolla"
    // Período: 01/09/2026 a 30/09/2026 (2026-09-01 a 2026-09-30)
    try {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      const baseUrl =
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      let token = (cfg.getString('api_token') || '').trim()

      console.log('=== TESTE AO VIVO: CHECK-MEDICATION ADEMIR ROSTIROLLA ===')

      // Busca prescrições com corte inicial 2026-01-01 em lotes de 100 até achar Ademir Rostirolla
      let foundAdemirPrescriptions = []
      let totalVarridas = 0

      for (let p = 1; p <= 30; p++) {
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
        if (res.statusCode !== 200) {
          console.log('Erro na página ' + p + ' status: ' + res.statusCode)
          break
        }
        let items = []
        try {
          const j = res.json || JSON.parse(res.raw || '[]')
          if (Array.isArray(j)) items = j
          else if (j && Array.isArray(j.items)) items = j.items
        } catch (_) {}

        totalVarridas += items.length
        if (items.length === 0) break

        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const pName = (it.patient_name || it.nm_paciente || '').toUpperCase()
          if (pName.includes('ADEMIR') && pName.includes('ROSTIROLLA')) {
            foundAdemirPrescriptions.push(it)
          }
        }

        if (items.length < 100) break
      }

      console.log('Total de prescrições varridas no teste:', totalVarridas)
      console.log(
        'Total de prescrições encontradas para Ademir Rostirolla:',
        foundAdemirPrescriptions.length,
      )

      for (let k = 0; k < foundAdemirPrescriptions.length; k++) {
        const pr = foundAdemirPrescriptions[k]
        console.log('--- PRESCRIÇÃO ADEMIR #' + (pr.prescription_number || pr.id) + ' ---')
        console.log(
          '  Data criação/prescrição:',
          pr.prescription_date || pr.creation_dt || pr.dt_prescricao,
        )
        console.log('  Vigência initial_dt:', pr.initial_dt)
        console.log('  Vigência final_dt:', pr.final_dt)
        console.log('  Itens raw:', JSON.stringify(pr.items || pr.itens || []))
      }

      // Agora simula o filtro do check-medication:
      // Medicamento: "insulina"
      // Paciente: "Ademir Rostirolla"
      // Período: 2026-09-01 a 2026-09-30
      const isoStart = '2026-09-01'
      const isoEnd = '2026-09-30'
      const normMed = 'insulina'

      const matchedResults = []

      for (let k = 0; k < foundAdemirPrescriptions.length; k++) {
        const pr = foundAdemirPrescriptions[k]
        const dtInit = String(pr.initial_dt || '')
          .trim()
          .split(' ')[0]
        const dtFinal = String(pr.final_dt || '')
          .trim()
          .split(' ')[0]
        const dtPresc = String(pr.prescription_date || pr.creation_dt || pr.dt_prescricao || '')
          .trim()
          .split(' ')[0]

        // Regra de período / vigência
        let inPeriod = false
        if (dtInit && dtFinal) {
          if (dtInit <= isoEnd && dtFinal >= isoStart) inPeriod = true
        } else if (dtInit) {
          if (dtInit <= isoEnd) inPeriod = true
        } else if (dtFinal) {
          if (dtFinal >= isoStart) inPeriod = true
        }
        if (!inPeriod && dtPresc) {
          if (dtPresc >= isoStart && dtPresc <= isoEnd) inPeriod = true
        }

        // Itens
        let items = pr.items || pr.itens || []
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items)
          } catch (_) {
            items = []
          }
        }
        if (!Array.isArray(items)) items = [items]

        const medItems = items.filter((it) => {
          const desc = String(it.description || it.ds_produto || it.name || '').toLowerCase()
          return desc.includes(normMed)
        })

        if (inPeriod && medItems.length > 0) {
          matchedResults.push({
            prescNumber: pr.prescription_number || pr.id,
            patient: pr.patient_name || pr.nm_paciente,
            dtPresc: dtPresc,
            vigencia: dtInit + ' a ' + dtFinal,
            items: medItems.map((m) => m.description || m.ds_produto || m.name),
          })
        }
      }

      console.log('=== RESULTADO FINAL DO FILTRO COMBINADO ===')
      console.log('Ocorrências aceitas:', matchedResults.length)
      console.log(JSON.stringify(matchedResults, null, 2))

      // Grava log detalhado na tabela audit_logs para verificação de assertividade
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'spincare_middleware')
      rec.set('registro_id', 'test_verification')
      rec.set('acao', 'SPINCARE_VERIFY_ROSTIROLLA')
      rec.set('usuario', 'system_qa')
      rec.set('usuario_nome', 'Sistema QA')
      rec.set('usuario_email', 'qa@helpvida.com.br')
      rec.set('usuario_role', 'admin')
      rec.set('status_anterior', '')
      rec.set('status_novo', matchedResults.length > 0 ? 'aprovado' : 'reprovado')
      rec.set(
        'detalhes',
        JSON.stringify({
          totalVarridas: totalVarridas,
          totalAdemir: foundAdemirPrescriptions.length,
          matched: matchedResults,
        }),
      )
      app.save(rec)
    } catch (err) {
      console.log('Erro na validação do teste:', err)
    }
  },
  (app) => {},
)
