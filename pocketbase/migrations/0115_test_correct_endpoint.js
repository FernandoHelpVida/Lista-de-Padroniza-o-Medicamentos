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

    // Diagnóstico detalhado:
    // a) Chaves de nível superior de uma prescrição
    const samplePrescription = dedupedPrescriptions[0] || {}
    const topKeys = Object.keys(samplePrescription)

    // b) De 2 prescrições da página 1, campos de paciente e estrutura completa dos itens
    const page1Sample = dedupedPrescriptions.slice(0, 2).map((pr) => {
      const patientFields = {}
      for (const k of Object.keys(pr)) {
        if (/patient|paciente|name|nome/i.test(k)) {
          patientFields[k] = pr[k]
        }
      }
      const rawIt = pr.items || pr.itens || pr.prescription_items || []
      const itemsList = Array.isArray(rawIt) ? rawIt : []
      return {
        id: pr.id || pr.prescription_number,
        patientFields,
        itemKeys: itemsList[0] ? Object.keys(itemsList[0]) : [],
        firstItem: itemsList[0] || null,
      }
    })

    // c) Explicitamente se #75147 está presente nas prescrições obtidas
    const found75147 = dedupedPrescriptions.find(
      (pr) => String(pr.prescription_number || pr.id) === '75147',
    )
    let p75147Dump = null
    if (found75147) {
      const pFields = {}
      for (const k of Object.keys(found75147)) {
        if (/patient|paciente|name|nome/i.test(k)) {
          pFields[k] = found75147[k]
        }
      }
      p75147Dump = {
        id: found75147.id,
        prescription_number: found75147.prescription_number,
        patient_id: found75147.patient_id,
        patientFields: pFields,
        initial_dt: found75147.initial_dt,
        final_dt: found75147.final_dt,
        creation_dt: found75147.creation_dt,
        itemsCount: (found75147.items || found75147.itens || []).length,
        items: found75147.items || found75147.itens,
      }
    }

    const diagSummary = {
      pagesRead,
      analyzedCount,
      matchingCount: matchingOccurrences.length,
      topKeys,
      page1Sample,
      has75147: Boolean(found75147),
      p75147Dump,
      occurrences: matchingOccurrences,
    }

    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const rec = new Record(auditCol)
    rec.set('colecao', 'spincare_middleware')
    rec.set('registro_id', 'm115_detail')
    rec.set('acao', 'M115_DIAG_DUMP')
    rec.set('usuario_nome', 'Migration 0115')
    rec.set('status_novo', String(diagSummary.matchingCount))
    rec.set('detalhes', JSON.stringify(diagSummary))
    app.save(rec)

    // Vamos testar buscar pelo período com datas mais amplas ou formatos diferentes:
    // Por que nas 307 prescrições da query "initial_dt=2026-09-01 00:00:00&final_dt=2026-09-30 23:59:59" todas tinham initial_dt="2026-09-01 00:00:00"?
    // Repare: na query com initial_dt e final_dt, o SpinCare filtrou initial_dt == 2026-09-01 00:00:00?
    // Ou será que o SpinCare get/prescriptions initial_dt filtra por data de criação ou vigência?
    // Vejamos os formatos aceitos por get/prescriptions:
    let testQueries = []

    // Por que #75147 não apareceu nas 307 prescrições da consulta por período?
    // Vamos testar:
    // Chamada por período: get/prescriptions?page_number=1&page_size=100&initial_dt=2026-09-01 00:00:00&final_dt=2026-09-30 23:59:59
    // Nas 307 prescrições, quais eram as páginas e quais eram os IDs das prescrições?
    // #75147 tem id=75147, prescription_number=75147, initial_dt="2026-09-01T04:00:00Z".
    // No SQL do SpinCare, initial_dt >= '2026-09-01 00:00:00' AND final_dt <= '2026-09-30 23:59:59' ou initial_dt <= '...'?
    // Repare: final_dt de #75147 é "2026-10-01T03:59:00Z"!
    // 2026-10-01 > 2026-09-30!
    // Se o SpinCare filtra final_dt <= paramFinalDt, como final_dt de #75147 é em 01 de OUTUBRO, ele FOI EXCLUÍDO pelo final_dt!
    // Vamos testar essa hipótese:
    const resWithoutFinalDt = $http.send({
      url:
        baseUrl +
        '/integration-engine/get/prescriptions?page_number=1&page_size=100&initial_dt=2026-09-01%2000:00:00&patient_id=418&token=' +
        encodeURIComponent(token),
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      timeout: 20,
    })
    const dNoFin = resWithoutFinalDt.json || JSON.parse(resWithoutFinalDt.raw || '[]')
    const itemsNoFin = Array.isArray(dNoFin) ? dNoFin : dNoFin.items || []
    const has75147NoFin = itemsNoFin.some((p) => String(p.id || p.prescription_number) === '75147')

    // Teste 2: Se colocarmos final_dt=2026-10-05 23:59:59?
    const resWithOctFin = $http.send({
      url:
        baseUrl +
        '/integration-engine/get/prescriptions?page_number=1&page_size=100&initial_dt=2026-09-01%2000:00:00&final_dt=2026-10-05%2023:59:59&patient_id=418&token=' +
        encodeURIComponent(token),
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      timeout: 20,
    })
    const dOctFin = resWithOctFin.json || JSON.parse(resWithOctFin.raw || '[]')
    const itemsOctFin = Array.isArray(dOctFin) ? dOctFin : dOctFin.items || []
    const has75147OctFin = itemsOctFin.some(
      (p) => String(p.id || p.prescription_number) === '75147',
    )

    throw new Error(
      'TEST_HYPOTHESIS: noFin=' +
        has75147NoFin +
        '(' +
        itemsNoFin.length +
        ') octFin=' +
        has75147OctFin +
        '(' +
        itemsOctFin.length +
        ')',
    )
  },
  (app) => {},
)
