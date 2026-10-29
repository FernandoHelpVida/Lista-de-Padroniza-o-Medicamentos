/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
  if (!records || records.length === 0) return

  const cfgRec = records[0]
  const baseUrl = (
    cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
  )
    .trim()
    .replace(/\/+$/, '')
  const login = (cfgRec.getString('api_login') || '').trim()
  const password = (cfgRec.getString('api_password') || '').trim()

  const fetchFreshToken = () => {
    if (!login || !password) return ''
    try {
      const tokenUrl =
        baseUrl +
        '/token/v1?login=' +
        encodeURIComponent(login) +
        '&password=' +
        encodeURIComponent(password)
      const resToken = $http.send({
        url: tokenUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'HelpVida-SpinCare-Sync/1.0',
        },
        timeout: 15,
      })
      if (resToken.statusCode === 200) {
        let t = ''
        if (resToken.json && (resToken.json.token || resToken.json.access_token)) {
          t = resToken.json.token || resToken.json.access_token
        } else if (resToken.raw) {
          t = String(resToken.raw).trim()
        }
        if (t) {
          cfgRec.set('api_token', t)
          try {
            app.save(cfgRec)
          } catch (_) {}
          return t
        }
      }
    } catch (_) {}
    return ''
  }

  let apiToken = (cfgRec.getString('api_token') || '').trim()
  if (apiToken.startsWith('Bearer ')) apiToken = apiToken.substring(7).trim()
  if (!apiToken) apiToken = fetchFreshToken()

  const toIsoYmd = (val) => {
    if (!val || val === '—') return ''
    const s = String(val).trim().split(' ')[0]
    if (s.includes('/')) {
      const parts = s.split('/')
      if (parts.length === 3) {
        return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
      }
    } else if (s.includes('-')) {
      const parts = s.split('-')
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
        } else if (parts[2].length === 4) {
          return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
        }
      }
    }
    return ''
  }

  const formatDtBr = (val) => {
    if (!val || val === '—') return '—'
    const iso = toIsoYmd(val)
    if (iso && iso.length === 10) {
      const parts = iso.split('-')
      return parts[2] + '/' + parts[1] + '/' + parts[0]
    }
    return String(val).trim()
  }

  const syncCol = app.findCollectionByNameOrId('prescricoes_sync')
  const nowIso = new Date().toISOString()

  const upsertPrescription = (raw) => {
    if (!raw || typeof raw !== 'object') return false
    const spincareId = String(raw.id || raw.prescription_id || raw.numero || '').trim()
    if (!spincareId) return false

    const numero = String(
      raw.prescription_number || raw.numero || raw.attendance_id || spincareId || '—',
    ).trim()
    const pid = String(raw.patient_id || raw.id_paciente || '').trim()
    const pnome = String(
      raw.patient_name ||
        raw.nm_paciente ||
        (raw.patient && raw.patient.name) ||
        raw.paciente ||
        'Paciente Help Vida',
    ).trim()
    const medico = String(
      raw.professional_name ||
        raw.nm_profissional ||
        raw.prescritor ||
        raw.professional ||
        'Médico Prescritor',
    ).trim()
    const mid = String(raw.professional_id || raw.id_profissional || '').trim()

    let status = 'Liberada'
    if (raw.status) status = String(raw.status)
    else if (raw.status_id === 1) status = 'Pendente Liberação'
    else if (raw.status_id === 2) status = 'Liberada'
    else if (raw.status_id === 3) status = 'Suspensa'

    const rawDataPresc = String(
      raw.prescription_date ||
        raw.creation_dt ||
        raw.initial_dt ||
        raw.dt_prescricao ||
        raw.dt_criacao ||
        '—',
    ).trim()
    const dataPrescricaoIso = toIsoYmd(rawDataPresc) || toIsoYmd(raw.initial_dt)
    const dataPrescricao = formatDtBr(rawDataPresc)
    const dataInicialIso = toIsoYmd(raw.initial_dt)
    const dataInicial = formatDtBr(raw.initial_dt)
    const dataFinalIso = toIsoYmd(raw.final_dt)
    const dataFinal = formatDtBr(raw.final_dt)

    let rawItems = raw.items || raw.itens || raw.prescription_items || raw.products || []
    if (typeof rawItems === 'string') {
      try {
        rawItems = JSON.parse(rawItems)
      } catch (_) {
        rawItems = []
      }
    }

    let itensList = []
    if (Array.isArray(rawItems)) {
      itensList = rawItems.map((it) => {
        if (typeof it === 'string') {
          return {
            id: '',
            codigo: '',
            descricao: it,
            posologia: '',
            dose: '',
            frequencia: '',
            viaAdministracao: '',
            unidade: '',
            quantidade: 1,
            observacao: '',
            fornecimento: 'Empresa',
          }
        }
        const desc = String(
          it.description ||
            it.itemDescription ||
            it.ds_produto ||
            it.ds_item ||
            it.descricao ||
            it.name ||
            it.product_name ||
            it.item ||
            'Medicamento Prescrito',
        ).trim()
        const poso = String(
          it.posology ||
            it.posologia ||
            it.dosage ||
            it.dose ||
            it.ds_posologia ||
            it.frequency ||
            it.frequencia ||
            '',
        ).trim()
        const via = String(
          it.route || it.via || it.via_administracao || it.administration_route || '',
        ).trim()
        const unit = String(it.unit || it.measure_unit || it.unidade || '').trim()
        const rawDose =
          it.dose_qt !== undefined && it.dose_qt !== null ? it.dose_qt : it.dose || it.dosage || ''
        const doseStr = rawDose !== '' ? String(rawDose).trim() : ''
        const qtd = Number(it.quantity || it.qtd || it.amount || (it.dose_qt ? it.dose_qt : 1))
        const rawFp = String(
          it.supplied_type ||
            it.funding_source ||
            it.fp ||
            it.f_p ||
            it.source ||
            it.tipo_fornecimento ||
            it.tp_fornecimento ||
            '',
        ).trim()
        const fp =
          rawFp.toLowerCase() === 'e' || rawFp.toLowerCase() === 'empresa'
            ? 'Empresa'
            : rawFp.toLowerCase() === 'o' || rawFp.toLowerCase() === 'operadora'
              ? 'Operadora'
              : rawFp || 'Empresa'

        return {
          id: String(it.id || it.item_id || it.itemId || ''),
          codigo: String(it.code || it.codigo || it.product_code || '').trim(),
          descricao: desc,
          posologia: poso,
          dose: doseStr,
          frequencia: String(it.frequency || it.frequencia || '').trim(),
          viaAdministracao: via,
          unidade: unit,
          quantidade: qtd,
          observacao: String(it.observation || it.observacao || it.orientacoes || '').trim(),
          fornecimento: fp,
        }
      })
    }

    let syncRec = null
    try {
      syncRec = app.findFirstRecordByFilter('prescricoes_sync', 'spincare_id = {:id}', {
        id: spincareId,
      })
    } catch (_) {
      syncRec = null
    }

    const isNew = !syncRec
    if (isNew) {
      syncRec = new Record(syncCol)
      syncRec.set('spincare_id', spincareId)
    }

    syncRec.set('numero', numero)
    syncRec.set('paciente_id', pid)
    syncRec.set('paciente_nome', pnome)
    syncRec.set('medico_prescritor', medico)
    syncRec.set('medico_id', mid)
    syncRec.set('data_prescricao', dataPrescricao)
    syncRec.set('data_prescricao_iso', dataPrescricaoIso)
    syncRec.set('data_inicial', dataInicial)
    syncRec.set('data_inicial_iso', dataInicialIso)
    syncRec.set('data_final', dataFinal)
    syncRec.set('data_final_iso', dataFinalIso)
    syncRec.set('status', status)
    syncRec.set('tipo', String(raw.type || raw.tipo || 'Médica'))
    syncRec.set('total_itens', itensList.length)
    syncRec.set('itens', itensList)
    syncRec.set('payload', raw)
    syncRec.set('synced_at', nowIso)

    try {
      app.save(syncRec)
      return true
    } catch (_) {
      return false
    }
  }

  const endpointPrescriptions = '/integration-engine/get/prescriptions'
  const initialDtParam = '2026-01-01 00:00:00'
  let totalSaved = 0

  // 1. Sincroniza páginas do paciente 418 (onde reside a prescrição 75147)
  for (let p = 1; p <= 5; p++) {
    const pUrl =
      baseUrl +
      endpointPrescriptions +
      '?patient_id=418&page_number=' +
      p +
      '&page_size=100&initial_dt=' +
      encodeURIComponent(initialDtParam) +
      '&token=' +
      encodeURIComponent(apiToken)

    let resp = $http.send({
      url: pUrl,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + apiToken,
        'User-Agent': 'HelpVida-SpinCare-Sync/1.0',
      },
      timeout: 25,
    })

    if (resp.statusCode === 401) {
      apiToken = fetchFreshToken()
      if (apiToken) {
        resp = $http.send({
          url:
            baseUrl +
            endpointPrescriptions +
            '?patient_id=418&page_number=' +
            p +
            '&page_size=100&initial_dt=' +
            encodeURIComponent(initialDtParam) +
            '&token=' +
            encodeURIComponent(apiToken),
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + apiToken,
            'User-Agent': 'HelpVida-SpinCare-Sync/1.0',
          },
          timeout: 25,
        })
      }
    }

    if (resp.statusCode !== 200) break

    let rawData = []
    try {
      rawData = resp.json || JSON.parse(resp.raw || '[]')
    } catch (_) {
      rawData = []
    }

    let items = []
    if (Array.isArray(rawData)) items = rawData
    else if (rawData && Array.isArray(rawData.items)) items = rawData.items
    else if (rawData && typeof rawData === 'object') items = [rawData]

    if (!items || items.length === 0) break

    for (let i = 0; i < items.length; i++) {
      if (upsertPrescription(items[i])) {
        totalSaved++
      }
    }

    if (items.length < 100) break
  }

  // 2. Registra em audit_logs para confirmação
  const found75147 = app.findRecordsByFilter('prescricoes_sync', 'spincare_id = "75147"', '', 1, 0)
  const auditCol = app.findCollectionByNameOrId('audit_logs')
  const audit = new Record(auditCol)
  audit.set('colecao', 'prescricoes_sync')
  audit.set('registro_id', 'diag_migration_75147')
  audit.set('acao', 'SYNC_PATIENT_418_COMPLEMENT')
  audit.set('usuario_nome', 'Migration 1793025006')
  audit.set('status_novo', found75147 && found75147.length > 0 ? 'sucesso' : 'pendente')
  audit.set(
    'detalhes',
    'Total salvas na passagem do paciente 418: ' +
      totalSaved +
      '. 75147 presente: ' +
      (found75147.length > 0),
  )
  app.save(audit)
})
