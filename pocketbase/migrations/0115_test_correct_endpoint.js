/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
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

    const isInstructionLine = (text) => {
      const n = norm(text)
      if (!n) return false
      return (
        n.startsWith('administrar') ||
        n.startsWith('aplicar ') ||
        n.startsWith('tomar ') ||
        n.startsWith('ingerir ') ||
        n.startsWith('uso ') ||
        n.startsWith('conforme ') ||
        n.startsWith('fazer uso') ||
        n.startsWith('seguir ') ||
        n.startsWith('vide ') ||
        n.startsWith('orientacoes') ||
        n.startsWith('instrucao') ||
        n.includes('conforme prescricao') ||
        n.includes('conforme orientacao') ||
        n.includes('conforme receita') ||
        n.includes('a criterio medico')
      )
    }

    const toIsoYmd = (s) => {
      if (!s) return ''
      const str = String(s).trim()
      const mIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (mIso) return mIso[1] + '-' + mIso[2] + '-' + mIso[3]
      const mBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
      if (mBr) return mBr[3] + '-' + mBr[2] + '-' + mBr[1]
      return ''
    }

    const queryInitParam = '2026-09-01 00:00:00'
    const queryFinalParam = '2026-09-30 23:59:59'
    const isoStart = '2026-09-01'
    const isoEnd = '2026-09-30'
    const medication = 'INSULINA'
    const patientName = 'Ademir Rostirolla'

    let allRawPrescriptions = []
    let pagesRead = 0

    for (let p = 1; p <= 50; p++) {
      pagesRead = p
      const url =
        baseUrl +
        '/integration-engine/get/prescriptions?page_number=' +
        p +
        '&page_size=100&initial_dt=' +
        encodeURIComponent(queryInitParam) +
        '&final_dt=' +
        encodeURIComponent(queryFinalParam) +
        '&token=' +
        encodeURIComponent(token)

      const res = $http.send({
        url: url,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
        },
        timeout: 25,
      })

      if (res.statusCode !== 200) break

      let items = []
      try {
        const data = res.json || JSON.parse(res.raw || '[]')
        items = Array.isArray(data) ? data : data && data.items ? data.items : []
      } catch (_) {
        break
      }

      if (!items || items.length === 0) break
      allRawPrescriptions = allRawPrescriptions.concat(items)
      if (items.length < 100) break
    }

    // Deduplicação
    const seenPrescIds = {}
    const dedupedPrescriptions = []
    for (let i = 0; i < allRawPrescriptions.length; i++) {
      const item = allRawPrescriptions[i]
      if (!item) continue
      const uid = String(item.id || item.prescription_id || item.prescription_number || i)
      if (!seenPrescIds[uid]) {
        seenPrescIds[uid] = true
        dedupedPrescriptions.push(item)
      }
    }

    const analyzedCount = dedupedPrescriptions.length

    const normMedTarget = norm(medication)
    const medWords = normMedTarget.split(' ').filter((w) => w.length > 1)
    const normPatTarget = norm(patientName)
    const patWords = normPatTarget.split(' ').filter(Boolean)

    const matchingOccurrences = []
    const seenOccurrenceKeys = {}

    for (let i = 0; i < dedupedPrescriptions.length; i++) {
      const raw = dedupedPrescriptions[i]
      const pid = String(raw.patient_id || raw.id_paciente || '')
      const pnome = String(raw.patient_name || raw.nm_paciente || raw.paciente || '')
      const normPnome = norm(pnome)

      if (patWords.length > 0) {
        const matchesAllTokens = patWords.every((w) => normPnome.includes(w))
        if (!matchesAllTokens) continue
      }

      const dtInitIso = toIsoYmd(raw.initial_dt)
      if (!dtInitIso || dtInitIso < isoStart || dtInitIso > isoEnd) {
        continue
      }

      let rawItems = raw.items || raw.itens || raw.prescription_items || []
      if (typeof rawItems === 'string') {
        try {
          rawItems = JSON.parse(rawItems)
        } catch (_) {
          rawItems = []
        }
      }
      if (!Array.isArray(rawItems)) rawItems = [rawItems].filter(Boolean)

      for (let j = 0; j < rawItems.length; j++) {
        const it = rawItems[j]
        if (!it) continue
        const desc = String(
          it.itemDescription || it.description || it.ds_produto || it.name || '',
        ).trim()
        const obs = String(it.observation || it.observacao || '').trim()
        const rawDose = it.dose_qt !== undefined && it.dose_qt !== null ? it.dose_qt : it.dose || ''
        const doseStr = rawDose !== '' ? String(rawDose).trim() : ''
        const rawRoute = String(it.admin_route || it.route || it.via || '').trim()

        if (isInstructionLine(desc)) continue
        if (!doseStr && !rawRoute && isInstructionLine(desc + ' ' + obs)) continue

        const normDesc = norm(desc)
        const normObs = norm(obs)

        let isMedMatch = false
        if (normDesc.includes(normMedTarget) || normMedTarget.includes(normDesc)) {
          isMedMatch = true
        } else if (
          medWords.length > 0 &&
          medWords.every((w) => normDesc.includes(w) || normObs.includes(w))
        ) {
          isMedMatch = true
        } else if (
          normMedTarget.includes('insulina') &&
          (normDesc.includes('lantus') || normDesc.includes('glargina'))
        ) {
          isMedMatch = true
        }

        if (isMedMatch) {
          const prescId = String(raw.id || raw.prescription_id || i)
          const rawFp = String(it.supplied_type || it.funding_source || '').trim()
          const fp =
            rawFp.toLowerCase() === 'e' || rawFp.toLowerCase() === 'empresa'
              ? 'Empresa'
              : rawFp.toLowerCase() === 'o'
                ? 'Operadora'
                : rawFp || 'Empresa'

          const dedupeKey = prescId + '__' + norm(desc) + '__' + pid
          if (seenOccurrenceKeys[dedupeKey]) continue
          seenOccurrenceKeys[dedupeKey] = true

          matchingOccurrences.push({
            prescricaoId: prescId,
            prescricaoNumero: String(raw.prescription_number || raw.numero || prescId),
            pacienteId: pid,
            pacienteNome: pnome,
            medicoPrescritor: String(raw.professional_name || raw.prescritor || ''),
            initial_dt: raw.initial_dt,
            final_dt: raw.final_dt,
            creation_dt: raw.creation_dt,
            item: {
              descricao: desc,
              dose: doseStr,
              via: rawRoute,
              fornecimento: fp,
            },
          })
        }
      }
    }

    throw new Error(
      'TEST_EXACT_CORRECT: ' +
        JSON.stringify({
          pagesRead,
          analyzedCount,
          matchingCount: matchingOccurrences.length,
          occurrences: matchingOccurrences,
        }),
    )
  },
  (app) => {},
)
