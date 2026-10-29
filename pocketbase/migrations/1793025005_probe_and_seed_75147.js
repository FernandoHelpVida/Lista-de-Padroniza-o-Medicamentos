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
  let apiToken = (cfgRec.getString('api_token') || '').trim()
  if (apiToken.startsWith('Bearer ')) apiToken = apiToken.substring(7).trim()

  const toIsoYmd = (val) => {
    if (!val || val === '—') return ''
    const s = String(val).trim().split(' ')[0]
    if (s.includes('/')) {
      const parts = s.split('/')
      if (parts.length === 3)
        return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
    } else if (s.includes('-')) {
      const parts = s.split('-')
      if (parts.length === 3) {
        if (parts[0].length === 4)
          return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
        else if (parts[2].length === 4)
          return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
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

  const endpointPrescriptions = '/integration-engine/get/prescriptions'
  const initialDtParam = '2026-01-01 00:00:00'
  const syncCol = app.findCollectionByNameOrId('prescricoes_sync')
  const nowIso = new Date().toISOString()
  let targetFound = false
  let targetRaw = null

  // Faz no máximo 6 páginas de 100 itens para localizar a 75147 rapidamente
  for (let p = 1; p <= 6; p++) {
    const pUrl =
      baseUrl +
      endpointPrescriptions +
      '?page_number=' +
      p +
      '&page_size=100&initial_dt=' +
      encodeURIComponent(initialDtParam) +
      '&token=' +
      encodeURIComponent(apiToken)
    const resp = $http.send({
      url: pUrl,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + apiToken,
        'User-Agent': 'HelpVida-SpinCare-Sync/1.0',
      },
      timeout: 20,
    })

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

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (String(it.id || it.prescription_id || it.numero || '') === '75147') {
        targetFound = true
        targetRaw = it
        break
      }
    }

    // Salva todos os itens dessa página também
    for (let i = 0; i < items.length; i++) {
      const raw = items[i]
      if (!raw || typeof raw !== 'object') continue
      const spincareId = String(raw.id || raw.prescription_id || raw.numero || '').trim()
      if (!spincareId) continue

      let syncRec = null
      try {
        syncRec = app.findFirstRecordByFilter('prescricoes_sync', 'spincare_id = {:id}', {
          id: spincareId,
        })
      } catch (_) {}

      const isNew = !syncRec
      if (isNew) {
        syncRec = new Record(syncCol)
        syncRec.set('spincare_id', spincareId)
      }

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
      const rawDataPresc = String(
        raw.prescription_date ||
          raw.creation_dt ||
          raw.initial_dt ||
          raw.dt_prescricao ||
          raw.dt_criacao ||
          '—',
      ).trim()

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
          return {
            id: String(it.id || it.item_id || it.itemId || ''),
            codigo: String(it.code || it.codigo || it.product_code || '').trim(),
            descricao: String(
              it.description ||
                it.itemDescription ||
                it.ds_produto ||
                it.ds_item ||
                it.descricao ||
                it.name ||
                it.product_name ||
                it.item ||
                'Medicamento Prescrito',
            ).trim(),
            posologia: String(
              it.posology ||
                it.posologia ||
                it.dosage ||
                it.dose ||
                it.ds_posologia ||
                it.frequency ||
                it.frequencia ||
                '',
            ).trim(),
            dose: String(
              it.dose_qt !== undefined && it.dose_qt !== null
                ? it.dose_qt
                : it.dose || it.dosage || '',
            ).trim(),
            frequencia: String(it.frequency || it.frequencia || '').trim(),
            viaAdministracao: String(
              it.route || it.via || it.via_administracao || it.administration_route || '',
            ).trim(),
            unidade: String(it.unit || it.measure_unit || it.unidade || '').trim(),
            quantidade: Number(it.quantity || it.qtd || it.amount || (it.dose_qt ? it.dose_qt : 1)),
            observacao: String(it.observation || it.observacao || it.orientacoes || '').trim(),
            fornecimento: 'Empresa',
          }
        })
      }

      syncRec.set(
        'numero',
        String(
          raw.prescription_number || raw.numero || raw.attendance_id || spincareId || '—',
        ).trim(),
      )
      syncRec.set('paciente_id', String(raw.patient_id || raw.id_paciente || '').trim())
      syncRec.set('paciente_nome', pnome)
      syncRec.set('medico_prescritor', medico)
      syncRec.set('medico_id', String(raw.professional_id || raw.id_profissional || '').trim())
      syncRec.set('data_prescricao', formatDtBr(rawDataPresc))
      syncRec.set('data_prescricao_iso', toIsoYmd(rawDataPresc) || toIsoYmd(raw.initial_dt))
      syncRec.set('data_inicial', formatDtBr(raw.initial_dt))
      syncRec.set('data_inicial_iso', toIsoYmd(raw.initial_dt))
      syncRec.set('data_final', formatDtBr(raw.final_dt))
      syncRec.set('data_final_iso', toIsoYmd(raw.final_dt))
      syncRec.set(
        'status',
        raw.status ? String(raw.status) : raw.status_id === 1 ? 'Pendente Liberação' : 'Liberada',
      )
      syncRec.set('tipo', String(raw.type || raw.tipo || 'Médica'))
      syncRec.set('total_itens', itensList.length)
      syncRec.set('itens', itensList)
      syncRec.set('payload', raw)
      syncRec.set('synced_at', nowIso)
      try {
        app.save(syncRec)
      } catch (_) {}
    }

    if (targetFound || items.length < 100) break
  }

  const auditCol = app.findCollectionByNameOrId('audit_logs')
  const audit = new Record(auditCol)
  audit.set('colecao', 'prescricoes_sync')
  audit.set('registro_id', 'diag_probe_75147')
  audit.set('acao', 'PROBE_75147')
  audit.set('usuario_nome', 'Migration Runner')
  audit.set('status_novo', targetFound ? 'encontrada' : 'nao_encontrada')
  audit.set(
    'detalhes',
    'targetFound: ' + targetFound + ', paciente: ' + (targetRaw ? targetRaw.patient_name : 'n/a'),
  )
  app.save(audit)
})
