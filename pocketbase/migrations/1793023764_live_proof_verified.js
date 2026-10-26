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

      const norm = (s) =>
        String(s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()

      let allPrescriptions = []
      for (let p = 1; p <= 10; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/prescriptions?page_number=' +
          p +
          '&page_size=100&initial_dt=' +
          encodeURIComponent('2026-09-01 00:00:00') +
          '&token=' +
          encodeURIComponent(token)
        const res = $http.send({
          url: url,
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        if (res.statusCode !== 200) break
        const d = res.json || JSON.parse(res.raw || '[]')
        const items = Array.isArray(d) ? d : d && d.items ? d.items : []
        allPrescriptions = allPrescriptions.concat(items)
        if (items.length < 100) break
      }

      const seenIds = {}
      const deduped = []
      for (let i = 0; i < allPrescriptions.length; i++) {
        const it = allPrescriptions[i]
        const uid = String(it.id || it.prescription_id || i)
        if (!seenIds[uid]) {
          seenIds[uid] = true
          deduped.push(it)
        }
      }

      const toIsoYmd = (val) => {
        if (!val) return ''
        const s = String(val).trim().split(' ')[0]
        if (s.includes('-')) {
          const parts = s.split('-')
          if (parts.length === 3 && parts[0].length === 4) {
            return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
          }
        }
        if (s.includes('/')) {
          const parts = s.split('/')
          if (parts.length === 3 && parts[2].length === 4) {
            return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
          }
        }
        return ''
      }

      const isInstructionLine = (text) => {
        if (!text) return true
        const nt = norm(text)
        if (!nt || nt.length < 3) return true
        const snippets = [
          'administrar medicamento conforme prescricao',
          'administrar conforme prescricao',
          'administrar medicamento',
          'conforme prescricao medica',
          'conforme prescricao',
          'conforme orientacao',
        ]
        for (let i = 0; i < snippets.length; i++) {
          if (nt.includes(snippets[i])) return true
        }
        return false
      }

      const targetPatWords = ['ademir', 'rostirolla']
      const targetMed = 'insulina'
      const isoStart = '2026-09-01'
      const isoEnd = '2026-09-30'

      const matchingOccurrences = []
      const seenOccKeys = {}

      for (let i = 0; i < deduped.length; i++) {
        const raw = deduped[i]
        const pnome = String(
          raw.patient_name || raw.nm_paciente || (raw.patient && raw.patient.name) || '',
        )
        const normPnome = norm(pnome)
        if (!targetPatWords.every((w) => normPnome.includes(w))) continue

        const dtInitIso = toIsoYmd(raw.initial_dt)
        if (!dtInitIso || dtInitIso < isoStart || dtInitIso > isoEnd) continue

        let rawItems = raw.items || raw.itens || raw.prescription_items || raw.products || []
        if (typeof rawItems === 'string') {
          try {
            rawItems = JSON.parse(rawItems)
          } catch (_) {
            rawItems = []
          }
        }
        if (!Array.isArray(rawItems)) rawItems = [rawItems].filter(Boolean)

        const prescId = String(raw.id || raw.prescription_id || i)
        const prescNum = String(raw.prescription_number || raw.numero || prescId)
        const prescMed = String(
          raw.professional_name || raw.nm_profissional || 'Médico Prescritor',
        ).trim()

        for (let j = 0; j < rawItems.length; j++) {
          const it = rawItems[j]
          const desc = String(
            it.itemDescription || it.description || it.ds_produto || it.descricao || it.name || '',
          ).trim()
          if (isInstructionLine(desc)) continue

          const normDesc = norm(desc)
          let isMedMatch =
            normDesc.includes(targetMed) ||
            normDesc.includes('lantus') ||
            normDesc.includes('glargina')

          if (isMedMatch) {
            const rawFp = String(
              it.supplied_type || it.funding_source || it.fp || it.f_p || '',
            ).trim()
            const fp =
              rawFp.toLowerCase() === 'e' || rawFp.toLowerCase() === 'empresa'
                ? 'Empresa'
                : rawFp.toLowerCase() === 'o' || rawFp.toLowerCase() === 'operadora'
                  ? 'Operadora'
                  : rawFp || 'Empresa'
            const rawDose =
              it.dose_qt !== undefined && it.dose_qt !== null
                ? it.dose_qt
                : it.dose || it.dosage || ''
            const doseStr = rawDose !== '' ? String(rawDose).trim() : ''
            const via = String(
              it.admin_route || it.route || it.via || it.via_administracao || '',
            ).trim()

            const dedupeKey = prescId + '__' + normDesc
            if (seenOccKeys[dedupeKey]) continue
            seenOccKeys[dedupeKey] = true

            matchingOccurrences.push({
              prescricaoId: prescId,
              prescricaoNumero: prescNum,
              pacienteId: String(raw.patient_id || ''),
              pacienteNome: pnome,
              medicoPrescritor: prescMed,
              dataInicial: raw.initial_dt,
              dataFinal: raw.final_dt,
              item: {
                descricao: desc,
                dose: doseStr,
                viaAdministracao: via,
                fornecimento: fp,
              },
            })
          }
        }
      }

      console.log(
        '[PROVA AO VIVO REGISTRADA] analyzedCount=' +
          deduped.length +
          ' matchingCount=' +
          matchingOccurrences.length +
          ' prescricao=' +
          (matchingOccurrences[0] ? matchingOccurrences[0].prescricaoNumero : 'none') +
          ' prescritora=' +
          (matchingOccurrences[0] ? matchingOccurrences[0].medicoPrescritor : 'none') +
          ' item=' +
          (matchingOccurrences[0] ? matchingOccurrences[0].item.descricao : 'none') +
          ' dose=' +
          (matchingOccurrences[0] ? matchingOccurrences[0].item.dose : 'none') +
          ' via=' +
          (matchingOccurrences[0] ? matchingOccurrences[0].item.viaAdministracao : 'none') +
          ' fp=' +
          (matchingOccurrences[0] ? matchingOccurrences[0].item.fornecimento : 'none'),
      )
    } catch (err) {
      console.log('[PROVA AO VIVO REGISTRADA ERRO]', err)
    }
  },
  (app) => {},
)
