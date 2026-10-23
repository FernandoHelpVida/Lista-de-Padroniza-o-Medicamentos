/**
 * ============================================================================
 * SPINCARE MIDDLEWARE — HELP VIDA ATENÇÃO DOMICILIAR
 * ============================================================================
 * PocketBase JSVM executes callbacks in isolated VM pools. All helper logic
 * is inlined directly inside each routerAdd callback to guarantee clean execution.
 *
 * ENDPOINTS REAIS DA SPICARE:
 * - Autenticação: GET /token/v1?login=...&password=...
 * - Pacientes: GET /integration-engine/get/patients?token=...&page_number=...&page_size=...
 * - Orçamentos: GET /integration-engine/get/budgets?token=...&initial_dt=...&page_number=...&page_size=...
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// ROTA 1: GET /backend/v1/spincare/config
// ----------------------------------------------------------------------------

routerAdd(
  'POST',
  '/backend/v1/spincare/check-medication',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar prescrições médicas.',
        )
      }
      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(200, {
          configured: false,
          is_active: false,
          base_url: 'https://integration.spincare.com.br/spincare_integration',
          auth_type: 'bearer',
          header_name: 'Authorization',
          token_prefix: 'Bearer ',
          endpoint_patients: '/integration-engine/get/patients',
          endpoint_budgets: '/integration-engine/get/budgets',
          has_login: false,
          login_masked: '',
          has_password: false,
          has_token: false,
          token_masked: '',
          last_tested_at: '',
          last_test_status: '',
          last_test_message: '',
        })
      }

      const rec = records[0]
      const rawToken = (rec.getString('api_token') || '').trim()
      const rawLogin = (rec.getString('api_login') || '').trim()
      const rawPassword = (rec.getString('api_password') || '').trim()

      let tokenMasked = ''
      if (rawToken) {
        if (rawToken.length <= 8) {
          tokenMasked = '••••••••'
        } else {
          tokenMasked = rawToken.slice(0, 4) + '••••••••' + rawToken.slice(rawToken.length - 4)
        }
      }

      let loginMasked = ''
      if (rawLogin) {
        const atIdx = rawLogin.indexOf('@')
        if (atIdx > 2) {
          loginMasked = rawLogin.slice(0, 3) + '••••' + rawLogin.slice(atIdx)
        } else {
          loginMasked = rawLogin.slice(0, 2) + '••••'
        }
      }

      const configured = Boolean(
        rec.getString('base_url') && (rawToken || (rawLogin && rawPassword)),
      )

      return e.json(200, {
        id: rec.id,
        configured: configured,
        is_active: rec.getBool('is_active'),
        base_url:
          rec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration',
        auth_type: rec.getString('auth_type') || 'bearer',
        header_name: rec.getString('header_name') || 'Authorization',
        token_prefix: rec.getString('token_prefix') || 'Bearer ',
        endpoint_patients: rec.getString('endpoint_patients') || '/integration-engine/get/patients',
        endpoint_budgets: rec.getString('endpoint_budgets') || '/integration-engine/get/budgets',
        has_login: Boolean(rawLogin),
        login_masked: loginMasked,
        has_password: Boolean(rawPassword),
        has_token: Boolean(rawToken),
        token_masked: tokenMasked,
        last_tested_at: rec.getString('last_tested_at') || '',
        last_test_status: rec.getString('last_test_status') || '',
        last_test_message: rec.getString('last_test_message') || '',
      })
    } catch (err) {
      console.error('Erro na rota GET /spincare/config:', err)
      return e.json(500, {
        message: 'Não foi possível carregar as informações da integração com o SpinCare.',
      })
    }
  },
  $apis.requireAuth(),
)

// ----------------------------------------------------------------------------
// ROTA 8: POST /backend/v1/spincare/prescriptions/check-medication
// Busca combinada exaustiva server-side de medicamento prescrito no período
// ----------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/spincare/prescriptions/check-medication',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar prescrições médicas.',
        )
      }

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      const login = (cfgRec.getString('api_login') || '').trim()
      const password = (cfgRec.getString('api_password') || '').trim()
      let apiToken = (cfgRec.getString('api_token') || '').trim()
      const endpointPrescriptions = '/integration-engine/get/prescriptions'

      // Helper para autenticação / renovação de token
      const getValidToken = () => {
        if (apiToken) return apiToken
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
            method: 'GET',
            headers: { Accept: '*/*' },
            timeout: 15,
          })
          if (resToken.statusCode === 200) {
            let t = ''
            if (typeof resToken.json === 'string') t = resToken.json
            else if (resToken.json && typeof resToken.json === 'object') {
              t = resToken.json.token || resToken.json.access_token || ''
            }
            if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
            if (t) {
              apiToken = t
              cfgRec.set('api_token', t)
              e.app.save(cfgRec)
              return t
            }
          }
        } catch (_) {}
        return ''
      }

      apiToken = getValidToken()

      const body = e.requestInfo().body || {}
      const medication = (body.medication || body.medicamento || '').trim()
      const patientName = (body.patient_name || body.paciente || '').trim()
      const patientIdParam = (body.patient_id || '').trim()
      const rawStartDate = (body.start_date || body.data_inicial || '').trim()
      const rawEndDate = (body.end_date || body.data_final || '').trim()

      if (!medication) {
        return e.badRequestError('O nome do medicamento é obrigatório para a consulta.')
      }
      // Normalizador tolerante: remove acentos, trim, lowercase
      const norm = (str) => {
        if (!str) return ''
        let s = String(str).trim()
        if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        return s.toLowerCase().replace(/\s+/g, ' ')
      }

      // Converte qualquer string de data para ISO YYYY-MM-DD
      const toIsoYmd = (val) => {
        if (!val || val === '—') return ''
        const s = String(val).trim().split(' ')[0]
        if (s.includes('/')) {
          const parts = s.split('/')
          if (parts.length === 3) {
            // DD/MM/YYYY
            const d = parts[0].padStart(2, '0')
            const m = parts[1].padStart(2, '0')
            const y = parts[2]
            return y + '-' + m + '-' + d
          }
        } else if (s.includes('-')) {
          const parts = s.split('-')
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              // YYYY-MM-DD
              return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
            } else if (parts[2].length === 4) {
              // DD-MM-YYYY
              return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
            }
          }
        }
        return ''
      }

      const isoStart = toIsoYmd(rawStartDate) || (rawStartDate ? '' : '2026-01-01')
      const isoEnd = toIsoYmd(rawEndDate) || (rawEndDate ? '' : '2026-12-31')

      // Se foi fornecido um nome de paciente, podemos tentar descobrir seu patient_id
      // consultando a lista de pacientes no SpinCare caso ajude ou para validação cruzada
      let resolvedPatientId = patientIdParam
      let resolvedPatientNameFromApi = ''
      if (!resolvedPatientId && patientName) {
        try {
          const patNormPath = (
            cfgRec.getString('endpoint_patients') || '/integration-engine/get/patients'
          ).trim()
          const pPath = patNormPath.startsWith('/') ? patNormPath : '/' + patNormPath
          const patSearchUrl =
            baseUrl +
            pPath +
            '?name=' +
            encodeURIComponent(patientName) +
            '&page_number=1&page_size=20' +
            (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')
          const patRes = $http.send({
            url: patSearchUrl,
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: 'Bearer ' + apiToken,
            },
            timeout: 15,
          })
          console.log('[check-medication] Busca paciente HTTP status:', patRes.statusCode)
          let patList = []
          if (patRes.statusCode === 200) {
            try {
              const pj = patRes.json || JSON.parse(patRes.raw || '[]')
              if (Array.isArray(pj)) patList = pj
              else if (pj && Array.isArray(pj.items)) patList = pj.items
            } catch (_) {}
          }

          // Se busca por '?name=' não retornou nada, tenta '?search='
          if (patList.length === 0) {
            const patSearchUrl2 =
              baseUrl +
              pPath +
              '?search=' +
              encodeURIComponent(patientName) +
              '&page_number=1&page_size=50' +
              (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')
            const patRes2 = $http.send({
              url: patSearchUrl2,
              method: 'GET',
              headers: { Accept: 'application/json', Authorization: 'Bearer ' + apiToken },
              timeout: 15,
            })
            if (patRes2.statusCode === 200) {
              try {
                const pj = patRes2.json || JSON.parse(patRes2.raw || '[]')
                if (Array.isArray(pj)) patList = pj
                else if (pj && Array.isArray(pj.items)) patList = pj.items
              } catch (_) {}
            }
          }

          const normTargetPat = norm(patientName)
          const targetWords = normTargetPat.split(' ').filter(Boolean)
          console.log('[check-medication] Pacientes retornados da API:', patList.length)
          if (patList.length > 0) {
            console.log(
              '[check-medication] Amostra paciente retornado:',
              JSON.stringify(patList[0]).slice(0, 300),
            )
          }
          const matchPat = patList.find((p) => {
            const pName = p.name || p.nome || p.nm_paciente || p.patient_name || ''
            const pNorm = norm(pName)
            return targetWords.length > 0 && targetWords.every((w) => pNorm.includes(w))
          })
          if (matchPat) {
            const resolvedId = matchPat.id || matchPat.patient_id || matchPat.id_paciente
            const resolvedName =
              matchPat.name || matchPat.nome || matchPat.nm_paciente || matchPat.patient_name || ''
            if (resolvedId) {
              resolvedPatientId = String(resolvedId)
              resolvedPatientNameFromApi = String(resolvedName)
              console.log(
                '[check-medication] Paciente resolvido com sucesso:',
                resolvedPatientNameFromApi,
                'ID:',
                resolvedPatientId,
              )
            }
          } else {
            console.log(
              '[check-medication] Paciente não correspondido na lista de pacientes:',
              patientName,
            )
          }
        } catch (patErr) {
          console.warn('Erro ao tentar pré-resolver paciente no check-medication:', patErr)
        }
      }

      // Função para buscar uma página de prescrições no SpinCare
      // Testamos tanto com os parâmetros de data estritos quanto sem final_dt se a API falhar
      const fetchPrescriptionsPage = (
        pageNumber,
        pageSize,
        withPatientFilter,
        overrideInitialDt,
        overrideFinalDt,
        explicitPatientId,
      ) => {
        let pUrl =
          baseUrl +
          endpointPrescriptions +
          '?page_number=' +
          pageNumber +
          '&page_size=' +
          pageSize +
          '&initial_dt=' +
          encodeURIComponent(overrideInitialDt || isoStart + ' 00:00:00') +
          (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')

        const finalParam = overrideFinalDt !== undefined ? overrideFinalDt : isoEnd + ' 23:59:59'
        if (finalParam) {
          pUrl += '&final_dt=' + encodeURIComponent(finalParam)
        }
        const pidToUse = explicitPatientId || (withPatientFilter ? resolvedPatientId : '')
        if (pidToUse) {
          pUrl += '&patient_id=' + encodeURIComponent(pidToUse)
        }

        const reqHeaders = {
          Accept: 'application/json',
          'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
        }
        if (apiToken) {
          reqHeaders['Authorization'] = 'Bearer ' + apiToken
        }

        let resp
        try {
          resp = $http.send({
            url: pUrl,
            method: 'GET',
            headers: reqHeaders,
            timeout: 25,
          })
        } catch (netErr) {
          console.error('Falha de rede em check-medication page ' + pageNumber + ':', netErr)
          return { error: 'net_err', statusCode: 0, items: [] }
        }

        if (resp.statusCode === 401 && login && password) {
          apiToken = getValidToken()
          if (apiToken) {
            try {
              let retryUrl =
                baseUrl +
                endpointPrescriptions +
                '?page_number=' +
                pageNumber +
                '&page_size=' +
                pageSize +
                '&initial_dt=' +
                encodeURIComponent(overrideInitialDt || isoStart + ' 00:00:00') +
                '&token=' +
                encodeURIComponent(apiToken)
              if (finalParam) retryUrl += '&final_dt=' + encodeURIComponent(finalParam)
              if (withPatientFilter && resolvedPatientId) {
                retryUrl += '&patient_id=' + encodeURIComponent(resolvedPatientId)
              }
              resp = $http.send({
                url: retryUrl,
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                  Authorization: 'Bearer ' + apiToken,
                  'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
                },
                timeout: 25,
              })
            } catch (_) {}
          }
        }

        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          return { error: 'bad_status', statusCode: resp.statusCode, items: [] }
        }

        let rawData = []
        try {
          rawData = resp.json || JSON.parse(resp.raw || '[]')
        } catch (_) {
          rawData = []
        }

        let list = []
        if (Array.isArray(rawData)) list = rawData
        else if (rawData && Array.isArray(rawData.items)) list = rawData.items
        else if (rawData && typeof rawData === 'object') list = [rawData]

        return { statusCode: resp.statusCode, items: list }
      }

      // ESTRATÉGIA EXAUSTIVA DE BUSCA:
      // 1. Tentar buscar primeiro direcionado ao paciente se resolvedPatientId existir
      // 2. Se não encontrar nada ou se não tiver patient_id, buscar TODAS as páginas de prescrições
      //    no período especificado (páginas de 100 até esgotar)
      // 3. Se a busca com data estrita não trouxer o paciente procurado, ampliar a busca de datas
      //    (ex: initial_dt desde 2026-01-01) para garantir que nenhuma prescrição ativa com período
      //    vigente fique de fora.

      // Helper robusto para extrair o nome do paciente de qualquer estrutura da API SpinCare
      const extractPatientName = (raw) => {
        if (!raw) return ''
        if (typeof raw.patient_name === 'string' && raw.patient_name.trim())
          return raw.patient_name.trim()
        if (typeof raw.nm_paciente === 'string' && raw.nm_paciente.trim())
          return raw.nm_paciente.trim()
        if (typeof raw.paciente === 'string' && raw.paciente.trim()) return raw.paciente.trim()
        if (raw.patient && typeof raw.patient === 'object') {
          if (typeof raw.patient.name === 'string' && raw.patient.name.trim())
            return raw.patient.name.trim()
          if (typeof raw.patient.nome === 'string' && raw.patient.nome.trim())
            return raw.patient.nome.trim()
        }
        if (raw.paciente && typeof raw.paciente === 'object') {
          if (typeof raw.paciente.nome === 'string' && raw.paciente.nome.trim())
            return raw.paciente.nome.trim()
          if (typeof raw.paciente.name === 'string' && raw.paciente.name.trim())
            return raw.paciente.name.trim()
        }
        if (typeof raw.name === 'string' && raw.name.trim() && !raw.medico && !raw.professional)
          return raw.name.trim()
        return ''
      }

      const extractPatientId = (raw) => {
        if (!raw) return ''
        if (
          raw.patient_id !== undefined &&
          raw.patient_id !== null &&
          String(raw.patient_id).trim()
        ) {
          return String(raw.patient_id).trim()
        }
        if (
          raw.id_paciente !== undefined &&
          raw.id_paciente !== null &&
          String(raw.id_paciente).trim()
        ) {
          return String(raw.id_paciente).trim()
        }
        if (raw.patient && typeof raw.patient === 'object' && raw.patient.id) {
          return String(raw.patient.id).trim()
        }
        return ''
      }

      let allRawPrescriptions = []
      let analyzedCount = 0

      const normTargetPat = patientName ? norm(patientName) : ''
      const targetWords = normTargetPat ? normTargetPat.split(' ').filter(Boolean) : []

      // ESTRATÉGIA DE VARREDURA EXAUSTIVA:
      // O objetivo é encontrar com 100% de precisão as prescrições médicas na SpinCare.
      // 1) Se conseguimos resolver o patient_id com certeza (todas as palavras do nome bateram),
      //    buscamos primeiramente as prescrições dele direto na API com patient_id
      if (resolvedPatientId) {
        console.log(
          '[check-medication] Fase 1: buscando prescrições para patient_id:',
          resolvedPatientId,
          'com janela ampla de vigência desde 2026-01-01',
        )
        for (let p = 1; p <= 15; p++) {
          const resP = fetchPrescriptionsPage(p, 100, true, '2026-01-01 00:00:00', '')
          if (resP.error || !resP.items || resP.items.length === 0) break
          allRawPrescriptions = allRawPrescriptions.concat(resP.items)
          if (resP.items.length < 100) break
        }
      }

      // Verificação de segurança: as prescrições obtidas de fato contêm o paciente procurado?
      if (patientName && allRawPrescriptions.length > 0) {
        const hasTarget = allRawPrescriptions.some((pr) => {
          const pnome = norm(extractPatientName(pr))
          return targetWords.every((w) => pnome.includes(w))
        })
        if (!hasTarget) {
          console.log(
            '[check-medication] As prescrições obtidas com patient_id ' +
              resolvedPatientId +
              ' não pertencem a "' +
              patientName +
              '". Descartando lote inválido e executando varredura.',
          )
          allRawPrescriptions = []
        }
      }

      // 2) Se não temos prescrições ainda (ex: /patients devolveu nome truncado ou homônimo):
      //    Varre as prescrições a partir de 2026-01-01.
      //    Ao encontrar a primeira prescrição do paciente procurado, descobre o patient_id real dele
      //    e busca o histórico completo de prescrições dele diretamente!
      if (allRawPrescriptions.length === 0) {
        const sweepInitialDt =
          patientName && isoStart > '2026-01-01'
            ? '2026-01-01 00:00:00'
            : isoStart
              ? isoStart + ' 00:00:00'
              : '2026-01-01 00:00:00'

        console.log(
          '[check-medication] Fase 2: varredura exaustiva de prescrições em lotes de 100 a partir de:',
          sweepInitialDt,
        )

        let discoveredPatientId = ''

        for (let p = 1; p <= 35; p++) {
          const resP = fetchPrescriptionsPage(p, 100, false, sweepInitialDt, '')
          if (resP.error || !resP.items || resP.items.length === 0) break

          if (targetWords.length > 0) {
            for (let i = 0; i < resP.items.length; i++) {
              const pr = resP.items[i]
              const pnome = norm(extractPatientName(pr))
              if (targetWords.every((w) => pnome.includes(w))) {
                allRawPrescriptions.push(pr)
                if (!discoveredPatientId && (pr.patient_id || pr.id_paciente)) {
                  discoveredPatientId = String(pr.patient_id || pr.id_paciente)
                }
              }
            }

            // Aceleração: se encontramos o ID real do paciente na primeira página em que ele apareceu,
            // consultamos diretamente as prescrições dele para garantir 100% de integridade
            if (discoveredPatientId) {
              console.log(
                '[check-medication] Patient_id real descoberto via prescrições:',
                discoveredPatientId,
                '. Carregando prescrições do paciente...',
              )
              const directPrescs = []
              for (let pp = 1; pp <= 10; pp++) {
                const rPP = fetchPrescriptionsPage(
                  pp,
                  100,
                  false,
                  '2026-01-01 00:00:00',
                  '',
                  discoveredPatientId,
                )
                if (rPP.error || !rPP.items || rPP.items.length === 0) break
                directPrescs.push(...rPP.items)
                if (rPP.items.length < 100) break
              }
              if (directPrescs.length > 0) {
                allRawPrescriptions = directPrescs
                break
              }
            }
          } else {
            allRawPrescriptions = allRawPrescriptions.concat(resP.items)
          }

          if (resP.items.length < 100) break
        }
      }
      // Deduplicação por id das prescrições coletadas na varredura
      const seenIds = {}
      const dedupedPrescriptions = []
      for (let i = 0; i < allRawPrescriptions.length; i++) {
        const item = allRawPrescriptions[i]
        if (!item) continue
        const uid = String(item.id || item.prescription_id || item.numero || i)
        if (!seenIds[uid]) {
          seenIds[uid] = true
          dedupedPrescriptions.push(item)
        }
      }

      analyzedCount = dedupedPrescriptions.length
      console.log('[check-medication] Total de prescrições varridas/analisadas:', analyzedCount)

      // CRITÉRIOS DE FILTRO ESTITOS: MEDICAMENTO + PACIENTE + PERÍODO
      const normMedTarget = norm(medication)
      const medWords = normMedTarget.split(' ').filter((w) => w.length > 1)

      const normPatTarget = norm(patientName)
      const patWords = normPatTarget.split(' ').filter(Boolean)

      const hasPeriodFilter = Boolean(rawStartDate || rawEndDate)

      const matchingOccurrences = []
      const matchingPrescriptionMap = {}

      let debugLogCount = 0

      for (let i = 0; i < dedupedPrescriptions.length; i++) {
        const raw = dedupedPrescriptions[i]
        const pid = extractPatientId(raw)
        const pnome = extractPatientName(raw) || 'Paciente'
        const normPnome = norm(pnome)

        // Processamento dos itens para verificar correspondência com o medicamento
        let rawItems = raw.items || raw.itens || raw.prescription_items || raw.products || []
        if (typeof rawItems === 'string') {
          try {
            rawItems = JSON.parse(rawItems)
          } catch (_) {
            rawItems = []
          }
        }
        if (!Array.isArray(rawItems)) rawItems = [rawItems].filter(Boolean)

        const matchedItems = []
        for (let j = 0; j < rawItems.length; j++) {
          const it = rawItems[j]
          if (!it) continue
          const desc = String(
            it.itemDescription ||
              it.description ||
              it.ds_produto ||
              it.ds_item ||
              it.descricao ||
              it.name ||
              it.product_name ||
              it.item ||
              '',
          ).trim()
          const obs = String(it.observation || it.observacao || it.orientacoes || '').trim()

          const normDesc = norm(desc)
          const normObs = norm(obs)

          // Casamento inteligente de medicamento:
          // Se o usuário procurou INSULINA, LANTUS (Insulina Glargina) é uma insulina e deve ser reconhecido!
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
            (normDesc.includes('lantus') ||
              normDesc.includes('glargina') ||
              normDesc.includes('tresiba') ||
              normDesc.includes('novorapid') ||
              normDesc.includes('humalog') ||
              normDesc.includes('nph') ||
              normDesc.includes('regular') ||
              normDesc.includes('degludeca') ||
              normDesc.includes('lispro') ||
              normDesc.includes('aspart'))
          ) {
            isMedMatch = true
          }

          if (isMedMatch) {
            matchedItems.push({ rawItem: it, desc: desc, obs: obs, index: j })
          }
        }

        // Se a prescrição não contém o medicamento buscado, descarte imediato
        if (matchedItems.length === 0) {
          continue
        }

        // 1. FILTRO DE PACIENTE (se informado):
        // REGRA DE OURO DE SAÚDE: O paciente da prescrição DEVE ser o paciente procurado.
        // Se o usuário digitou o nome do paciente (ex: "Ademir Rostirolla"), NUNCA podemos aceitar
        // outro paciente (ex: "Abhner Gabriel") mesmo que um ID tenha sido confundido.
        // O nome do paciente na prescrição DEVE conter TODAS as palavras do nome buscado.
        let patientMatches = true
        if (patWords.length > 0) {
          const matchesAllWords = patWords.every((w) => normPnome.includes(w))
          patientMatches = matchesAllWords
        }

        // 2. FILTRO DE PERÍODO:
        // Regra de vigência de saúde:
        // Uma prescrição cuja DATA DE CRIAÇÃO esteja fora do período mas cuja VIGÊNCIA intersecte o período DEVE aparecer.
        // Se ambos estiverem fora do período, a prescrição NÃO DEVE aparecer.
        let periodMatches = true
        const dtCreationIso = toIsoYmd(raw.creation_dt || raw.dt_criacao || raw.created_at)
        const dtPrescOnlyIso = toIsoYmd(raw.prescription_date || raw.dt_prescricao)
        const dtInitIso = toIsoYmd(raw.initial_dt)
        const dtFinalIso = toIsoYmd(raw.final_dt)

        // Data de emissão/criação direta
        const dtPrescIso = dtPrescOnlyIso || dtCreationIso

        if (hasPeriodFilter) {
          let inPeriod = false

          // Regra A: Se há vigência (initial_dt e/ou final_dt)
          // Sobreposição clássica de intervalos entre vigência [dtInitIso, dtFinalIso] e período [isoStart, isoEnd]
          if (dtInitIso && dtFinalIso) {
            // Interseção: max(dtInitIso, isoStart) <= min(dtFinalIso, isoEnd)
            // Equivalente a: dtInitIso <= isoEnd && dtFinalIso >= isoStart
            if (dtInitIso <= isoEnd && dtFinalIso >= isoStart) {
              inPeriod = true
            }
          } else if (dtInitIso) {
            if (dtInitIso <= isoEnd) {
              inPeriod = true
            }
          } else if (dtFinalIso) {
            if (dtFinalIso >= isoStart) {
              inPeriod = true
            }
          }

          // Regra B: Se a data de emissão/criação está dentro do período
          if (!inPeriod && dtPrescIso) {
            if (dtPrescIso >= isoStart && dtPrescIso <= isoEnd) {
              inPeriod = true
            }
          }

          periodMatches = inPeriod
        }

        // LOG DE DEPURAÇÃO NO SERVIDOR (mostra prescrições que deram match no medicamento)
        if (debugLogCount < 15) {
          debugLogCount++
          console.log(
            '[check-medication DIAG] Prescrição #' +
              (raw.prescription_number || raw.id || i) +
              ' | Paciente: "' +
              pnome +
              '" (ID: ' +
              pid +
              ') | DtPresc: ' +
              (dtPrescIso || '—') +
              ' | Vigência: ' +
              (dtInitIso || '—') +
              ' até ' +
              (dtFinalIso || '—') +
              ' | PatientMatch: ' +
              patientMatches +
              ' | PeriodMatch: ' +
              periodMatches +
              ' => ACEITA: ' +
              (patientMatches && periodMatches) +
              ' | MatchedItems: ' +
              matchedItems.map((m) => m.desc).join(' ; '),
          )
        }

        // Se NÃO passou no filtro de paciente ou no filtro de período, DESCARTA
        if (!patientMatches || !periodMatches) {
          continue
        }

        // Se passou em TODOS os critérios, adiciona as ocorrências
        const prescId = String(raw.id || raw.prescription_id || i)
        const prescNum = String(
          raw.prescription_number || raw.numero || raw.attendance_id || prescId,
        )
        const prescMed = String(
          raw.professional_name || raw.nm_profissional || raw.prescritor || 'Médico Prescritor',
        ).trim()

        const formatDtBr = (s) => {
          if (!s) return '—'
          const iso = toIsoYmd(s)
          if (iso && iso.length === 10) {
            const p = iso.split('-')
            return p[2] + '/' + p[1] + '/' + p[0]
          }
          return String(s).trim()
        }

        const dataPrescFormatada = formatDtBr(
          raw.prescription_date ||
            raw.creation_dt ||
            raw.dt_prescricao ||
            raw.dt_criacao ||
            raw.initial_dt,
        )
        const dataInitFormatada = formatDtBr(raw.initial_dt)
        const dataFinalFormatada = formatDtBr(raw.final_dt)

        for (let k = 0; k < matchedItems.length; k++) {
          const m = matchedItems[k]
          const it = m.rawItem
          const desc = m.desc
          const obs = m.obs
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
            it.admin_route ||
              it.route ||
              it.via ||
              it.via_administracao ||
              it.administration_route ||
              '',
          ).trim()
          const unit = String(it.unit || it.measure_unit || it.unidade || '').trim()
          const rawDose =
            it.dose_qt !== undefined && it.dose_qt !== null
              ? it.dose_qt
              : it.dose || it.dosage || ''
          const doseStr = rawDose !== '' ? String(rawDose).trim() : ''
          const qtd = Number(it.quantity || it.qtd || it.amount || (it.dose_qt ? it.dose_qt : 1))
          const fp = String(
            it.supplied_type ||
              it.funding_source ||
              it.fp ||
              it.f_p ||
              it.source ||
              it.tipo_fornecimento ||
              '',
          ).trim()

          const occurrence = {
            prescricaoId: prescId,
            prescricaoNumero: prescNum,
            pacienteId: pid,
            pacienteNome: pnome,
            medicoPrescritor: prescMed,
            dataPrescricao: dataPrescFormatada,
            dataInicial: dataInitFormatada,
            dataFinal: dataFinalFormatada,
            status: String(raw.status || 'Liberada'),
            item: {
              id: String(it.id || it.item_id || it.itemId || it.recordId || m.index),
              codigo: String(it.code || it.codigo || it.product_code || it.itemId || '').trim(),
              descricao: desc,
              posologia: poso,
              dose: doseStr,
              viaAdministracao: via,
              unidade: unit,
              quantidade: qtd,
              observacao: obs,
              fornecimento: fp,
            },
            _rawPrescription: raw,
          }
          matchingOccurrences.push(occurrence)
          matchingPrescriptionMap[prescId] = true
        }
      }

      // Trilha de auditoria LGPD (sem dados sensíveis no log)
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'spincare_middleware')
        auditRecord.set('registro_id', 'check_medication')
        auditRecord.set('acao', 'SPINCARE_CONSULTA_COMBINADA')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
        auditRecord.set('status_anterior', '')
        auditRecord.set(
          'status_novo',
          matchingOccurrences.length > 0 ? 'encontrado' : 'nao_encontrado',
        )
        auditRecord.set(
          'detalhes',
          'Consulta combinada realizada: ' +
            analyzedCount +
            ' prescrições analisadas no período ' +
            isoStart +
            ' a ' +
            isoEnd +
            ', ocorrências: ' +
            matchingOccurrences.length,
        )
        e.app.save(auditRecord)
      } catch (_) {}

      return e.json(200, {
        success: true,
        found: matchingOccurrences.length > 0,
        totalOccurrences: matchingOccurrences.length,
        prescriptionsCount: Object.keys(matchingPrescriptionMap).length,
        analyzedPrescriptionsCount: analyzedCount,
        searchedMedication: medication,
        searchedPatient: patientName,
        startDate: isoStart,
        endDate: isoEnd,
        occurrences: matchingOccurrences,
      })
    } catch (err) {
      console.error('Erro na rota POST /spincare/prescriptions/check-medication:', err)
      return e.json(500, {
        success: false,
        message:
          'Não foi possível realizar a verificação combinada no SpinCare agora. Tente novamente em instantes.',
      })
    }
  },
  $apis.requireAuth(),
)

// ----------------------------------------------------------------------------
// ROTA 7: GET /backend/v1/spincare/prescriptions (Admin + Corpo Clínico, >= 2026)
// Endpoint SpinCare: GET /integration-engine/get/prescriptions
// ----------------------------------------------------------------------------
routerAdd(
  'GET',
  '/backend/v1/spincare/prescriptions',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar prescrições médicas.',
        )
      }

      const info = e.requestInfo()
      const queryParams = info.query || {}

      console.log('GET PRESCRIPTIONS CALLED with query:', JSON.stringify(queryParams))

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      const login = (cfgRec.getString('api_login') || '').trim()
      const password = (cfgRec.getString('api_password') || '').trim()
      let apiToken = (cfgRec.getString('api_token') || '').trim()
      const endpointPrescriptions = '/integration-engine/get/prescriptions'

      if (!apiToken && login && password) {
        try {
          const tokenUrl =
            baseUrl +
            '/token/v1?login=' +
            encodeURIComponent(login) +
            '&password=' +
            encodeURIComponent(password)
          const resToken = $http.send({
            url: tokenUrl,
            method: 'GET',
            headers: { Accept: '*/*' },
            timeout: 15,
          })
          if (resToken.statusCode === 200) {
            let t = ''
            if (typeof resToken.json === 'string') t = resToken.json
            else if (resToken.json && typeof resToken.json === 'object') {
              t = resToken.json.token || resToken.json.access_token || ''
            }
            if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
            if (t) {
              apiToken = t
              cfgRec.set('api_token', t)
              e.app.save(cfgRec)
            }
          }
        } catch (_) {}
      }

      const startDate = (queryParams.start_date || '2026-01-01').trim()
      const endDate = (queryParams.end_date || '').trim()
      const search = (queryParams.search || '').trim()
      const patientId = (queryParams.patient_id || '').trim()
      const patientNameParam = (queryParams.patient_name || '').trim()
      const medicationParam = (queryParams.medication || '').trim()
      const statusId = queryParams.status_id ? parseInt(queryParams.status_id, 10) : null
      const fetchAllPages = queryParams.fetchAll !== 'false'
      const requestedLimit = Math.min(Math.max(parseInt(queryParams.limit, 10) || 100, 1), 200)
      const requestedPage = Math.max(parseInt(queryParams.page, 10) || 1, 1)

      const normalizedPath = endpointPrescriptions

      // Helper para converter qualquer string de data em YYYY-MM-DD
      const toIsoYmd = (dtStr) => {
        if (!dtStr) return ''
        const s = String(dtStr).trim().split(' ')[0]
        if (s.includes('/')) {
          const parts = s.split('/')
          if (parts.length === 3) {
            const d = parts[0].padStart(2, '0')
            const m = parts[1].padStart(2, '0')
            const y = parts[2]
            return y + '-' + m + '-' + d
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

      // Parâmetros de data para envio à API SpinCare
      // A SpinCare aceita initial_dt (formato YYYY-MM-DD ou YYYY-MM-DD HH:MM:SS)
      let initialDtParam = toIsoYmd(startDate) || startDate
      if (initialDtParam && initialDtParam.length === 10) {
        initialDtParam = initialDtParam + ' 00:00:00'
      }

      let finalDtParam = toIsoYmd(endDate) || endDate
      if (finalDtParam && finalDtParam.length === 10) {
        finalDtParam = finalDtParam + ' 23:59:59'
      }

      const fetchPrescriptionsPage = (pageNumber, pageSize) => {
        let fullUrl =
          baseUrl +
          normalizedPath +
          '?page_number=' +
          pageNumber +
          '&page_size=' +
          pageSize +
          '&initial_dt=' +
          encodeURIComponent(initialDtParam) +
          (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')

        if (finalDtParam) {
          fullUrl += '&final_dt=' + encodeURIComponent(finalDtParam)
        }
        if (patientId) {
          fullUrl += '&patient_id=' + encodeURIComponent(patientId)
        }
        if (statusId) {
          fullUrl += '&status_id=' + encodeURIComponent(statusId)
        }

        const reqHeaders = {
          Accept: 'application/json',
          'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
        }
        if (apiToken) {
          reqHeaders['Authorization'] = 'Bearer ' + apiToken
        }

        let resp
        try {
          resp = $http.send({
            url: fullUrl,
            method: 'GET',
            headers: reqHeaders,
            timeout: 25,
          })
        } catch (callErr) {
          console.error('Erro ao chamar SpinCare (prescriptions page ' + pageNumber + '):', callErr)
          return { error: 'call_failed', statusCode: 0, items: [] }
        }

        // Renovação se 401
        if (resp.statusCode === 401 && login && password) {
          try {
            const tokenUrl =
              baseUrl +
              '/token/v1?login=' +
              encodeURIComponent(login) +
              '&password=' +
              encodeURIComponent(password)
            const resToken = $http.send({
              url: tokenUrl,
              method: 'GET',
              headers: { Accept: '*/*' },
              timeout: 15,
            })
            if (resToken.statusCode === 200) {
              let t = ''
              if (typeof resToken.json === 'string') t = resToken.json
              else if (resToken.json && typeof resToken.json === 'object') {
                t = resToken.json.token || resToken.json.access_token || ''
              }
              if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
              if (t) {
                apiToken = t
                cfgRec.set('api_token', t)
                e.app.save(cfgRec)

                let retryUrl =
                  baseUrl +
                  normalizedPath +
                  '?page_number=' +
                  pageNumber +
                  '&page_size=' +
                  pageSize +
                  '&initial_dt=' +
                  encodeURIComponent(initialDtParam) +
                  '&token=' +
                  encodeURIComponent(apiToken)
                if (finalDtParam) retryUrl += '&final_dt=' + encodeURIComponent(finalDtParam)
                if (patientId) retryUrl += '&patient_id=' + encodeURIComponent(patientId)
                if (statusId) retryUrl += '&status_id=' + encodeURIComponent(statusId)

                resp = $http.send({
                  url: retryUrl,
                  method: 'GET',
                  headers: {
                    Accept: 'application/json',
                    Authorization: 'Bearer ' + apiToken,
                    'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
                  },
                  timeout: 25,
                })
              }
            }
          } catch (_) {}
        }

        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          console.error(
            'SpinCare retornou status ' + resp.statusCode + ' em prescriptions page ' + pageNumber,
          )
          return { error: 'bad_status', statusCode: resp.statusCode, items: [] }
        }

        let rawData = []
        try {
          rawData = resp.json || JSON.parse(resp.raw || '[]')
        } catch (_) {
          rawData = []
        }

        let list = []
        if (Array.isArray(rawData)) list = rawData
        else if (rawData && Array.isArray(rawData.items)) list = rawData.items
        else if (rawData && typeof rawData === 'object') list = [rawData]

        console.log('FETCH PRESCRIPTIONS PAGE ' + pageNumber + ' items count: ' + list.length)
        if (list.length > 0 && pageNumber === 1) {
          console.log('SAMPLE PRESC ROW KEYS:', Object.keys(list[0]).join(','))
          console.log('SAMPLE PRESC ROW:', JSON.stringify(list[0]).slice(0, 500))
        }
        return { statusCode: resp.statusCode, items: list }
      }

      let rawList = []
      if (fetchAllPages) {
        const pageSize = 100
        const maxPages = 30 // Seguro para até 3000 prescrições
        for (let p = 1; p <= maxPages; p++) {
          const pageRes = fetchPrescriptionsPage(p, pageSize)
          if (pageRes.error) {
            if (p === 1) {
              return e.json(502, {
                message:
                  'Não foi possível consultar as prescrições no SpinCare agora. Verifique a conexão com a API externa.',
              })
            }
            break
          }
          if (!pageRes.items || pageRes.items.length === 0) {
            break
          }
          rawList = rawList.concat(pageRes.items)
          if (pageRes.items.length < pageSize) {
            break
          }
        }
      } else {
        const singlePage = fetchPrescriptionsPage(requestedPage, requestedLimit)
        if (singlePage.error) {
          return e.json(502, {
            message:
              'Não foi possível consultar as prescrições no SpinCare agora. O sistema externo respondeu com status ' +
              singlePage.statusCode +
              '.',
          })
        }
        rawList = singlePage.items
      }

      // Normalização e extração detalhada dos itens de prescrição médica
      let normalizedList = rawList
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null
          const id = String(raw.id || raw.prescription_id || '')
          const numero = String(
            raw.prescription_number || raw.numero || raw.attendance_id || id || '—',
          ).trim()
          const pid = String(raw.patient_id || '')
          const pnome = String(raw.patient_name || raw.nm_paciente || 'Paciente Help Vida').trim()
          const medico = String(
            raw.professional_name || raw.nm_profissional || raw.prescritor || 'Médico Prescritor',
          ).trim()
          const mid = String(raw.professional_id || '')

          let status = 'Liberada'
          if (raw.status) status = String(raw.status)
          else if (raw.status_id === 1) status = 'Pendente Liberação'
          else if (raw.status_id === 2) status = 'Liberada'
          else if (raw.status_id === 3) status = 'Suspensa'

          // Helper robusto de extração ISO YYYY-MM-DD para datas
          const toIsoString = (val) => {
            if (!val || val === '—') return ''
            const s = String(val).trim().split(' ')[0]
            if (s.includes('-')) {
              const parts = s.split('-')
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  return (
                    parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
                  )
                } else if (parts[2].length === 4) {
                  return (
                    parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
                  )
                }
              }
            } else if (s.includes('/')) {
              const parts = s.split('/')
              if (parts.length === 3) {
                if (parts[2].length === 4) {
                  return (
                    parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
                  )
                } else if (parts[0].length === 4) {
                  return (
                    parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
                  )
                }
              }
            }
            return ''
          }

          const formatDtBr = (val) => {
            if (!val || val === '—') return '—'
            const iso = toIsoString(val)
            if (iso && iso.length === 10) {
              const parts = iso.split('-')
              return parts[2] + '/' + parts[1] + '/' + parts[0]
            }
            return String(val).trim()
          }

          // A API SpinCare pode vir com creation_dt, initial_dt, dt_prescricao, prescription_date, etc.
          const rawDataPresc = String(
            raw.prescription_date ||
              raw.creation_dt ||
              raw.initial_dt ||
              raw.dt_prescricao ||
              raw.dt_criacao ||
              '—',
          ).trim()
          const dataPrescricaoIso = toIsoString(rawDataPresc) || toIsoString(raw.initial_dt)
          const dataPrescricao = formatDtBr(rawDataPresc)
          const dataInicial = formatDtBr(raw.initial_dt)
          const dataFinal = formatDtBr(raw.final_dt)
          const dataInicialIso = toIsoString(raw.initial_dt)
          const dataFinalIso = toIsoString(raw.final_dt)

          // Processamento e parse de itens / medicamentos prescritos
          let rawItems = raw.items || raw.itens || raw.prescription_items || raw.products || []
          if (typeof rawItems === 'string') {
            try {
              rawItems = JSON.parse(rawItems)
            } catch (_) {
              rawItems = []
            }
          }

          let itens = []
          if (Array.isArray(rawItems)) {
            itens = rawItems.map((it) => {
              if (typeof it === 'string') {
                return {
                  descricao: it,
                  posologia: '',
                  frequencia: '',
                  viaAdministracao: '',
                  unidade: '',
                  quantidade: 1,
                  observacao: '',
                }
              }
              const desc = String(
                it.description ||
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
              const qtd = Number(it.quantity || it.qtd || it.amount || 1)
              const obs = String(it.observation || it.observacao || it.orientacoes || '').trim()

              return {
                id: String(it.id || it.item_id || ''),
                codigo: String(it.code || it.codigo || it.product_code || '').trim(),
                descricao: desc,
                posologia: poso,
                frequencia: String(it.frequency || it.frequencia || '').trim(),
                viaAdministracao: via,
                unidade: unit,
                quantidade: qtd,
                observacao: obs,
              }
            })
          }

          return {
            id: id || Math.random().toString(36).substring(2, 9),
            numero: numero,
            attendanceId: String(raw.attendance_id || raw.atendimento_id || ''),
            pacienteId: pid,
            pacienteNome: pnome,
            medicoPrescritor: medico,
            medicoId: mid,
            dataPrescricao: dataPrescricao,
            dataPrescricaoIso: dataPrescricaoIso,
            dataInicial: dataInicial,
            dataInicialIso: dataInicialIso,
            dataFinal: dataFinal,
            dataFinalIso: dataFinalIso,
            status: status,
            tipo: String(raw.type || raw.tipo || 'Médica'),
            itens: itens,
            _raw: raw,
          }
        })
        .filter(Boolean)

      // Deduplicação por id
      const seenPrescIds = {}
      normalizedList = normalizedList.filter((p) => {
        if (!p.id) return true
        if (seenPrescIds[p.id]) return false
        seenPrescIds[p.id] = true
        return true
      })

      // Filtro de busca local tolerante por paciente ou nº
      if (search) {
        let sNorm = search.trim()
        if (sNorm.normalize) sNorm = sNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        sNorm = sNorm.toUpperCase()

        normalizedList = normalizedList.filter((p) => {
          let pNome = p.pacienteNome || ''
          if (pNome.normalize) pNome = pNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          pNome = pNome.toUpperCase()

          let med = p.medicoPrescritor || ''
          if (med.normalize) med = med.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          med = med.toUpperCase()

          return (
            pNome.includes(sNorm) || p.numero.toUpperCase().includes(sNorm) || med.includes(sNorm)
          )
        })
      }

      // Trilha de auditoria LGPD (sem dados sensíveis no log)
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'spincare_middleware')
        auditRecord.set('registro_id', 'prescriptions_list')
        auditRecord.set('acao', 'SPINCARE_CONSULTA_PRESCRICOES')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
        auditRecord.set('status_anterior', '')
        auditRecord.set('status_novo', 'sucesso')
        auditRecord.set(
          'detalhes',
          'Consulta de prescrições médicas no SpinCare (retornadas: ' +
            normalizedList.length +
            ' prescrições)',
        )
        e.app.save(auditRecord)
      } catch (_) {}

      return e.json(200, {
        total: normalizedList.length,
        startDate: startDate,
        endDate: endDate,
        page: requestedPage,
        limit: requestedLimit,
        items: normalizedList,
      })
    } catch (err) {
      console.error('Erro na rota GET /spincare/prescriptions:', err)
      return e.json(500, {
        message:
          'Não foi possível consultar as prescrições no SpinCare agora. Tente novamente em instantes.',
      })
    }
  },
  $apis.requireAuth(),
)

// ----------------------------------------------------------------------------
// ROTA 2: POST /backend/v1/spincare/config (Apenas Admin)
// ----------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/spincare/config',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      const email = (authUser.getString('email') || '').toLowerCase()
      const isAdmin = role === 'admin' || email === 'fernandofernandes@helpvida.com.br'

      if (!isAdmin) {
        return e.forbiddenError(
          'Apenas administradores da Help Vida podem alterar a configuração do SpinCare.',
        )
      }

      const body = e.requestInfo().body || {}
      const baseUrl = (
        body.base_url || 'https://integration.spincare.com.br/spincare_integration'
      ).trim()
      const authType = body.auth_type || 'bearer'
      const headerName = (body.header_name || 'Authorization').trim()
      const tokenPrefix = body.token_prefix !== undefined ? body.token_prefix : 'Bearer '
      const endpointPatients = (body.endpoint_patients || '/integration-engine/get/patients').trim()
      const endpointBudgets = (body.endpoint_budgets || '/integration-engine/get/budgets').trim()
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true
      const newApiToken = (body.api_token || '').trim()
      const newApiLogin = (body.api_login || '').trim()
      const newApiPassword = (body.api_password || '').trim()

      const spincareCol = e.app.findCollectionByNameOrId('spincare_config')
      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)

      let record
      if (records && records.length > 0) {
        record = records[0]
      } else {
        record = new Record(spincareCol)
      }

      record.set('base_url', baseUrl)
      record.set('auth_type', authType)
      record.set('header_name', headerName)
      record.set('token_prefix', tokenPrefix)
      record.set('endpoint_patients', endpointPatients)
      record.set('endpoint_budgets', endpointBudgets)
      record.set('is_active', isActive)

      if (newApiLogin && !newApiLogin.includes('••••')) {
        record.set('api_login', newApiLogin)
      }
      if (newApiPassword && !newApiPassword.includes('••••')) {
        record.set('api_password', newApiPassword)
      }
      if (newApiToken && !newApiToken.includes('••••••••')) {
        record.set('api_token', newApiToken)
      }

      e.app.save(record)

      // Gravar trilha de auditoria (LGPD: sem dados de senha ou token)
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'spincare_middleware')
        auditRecord.set('registro_id', record.id)
        auditRecord.set('acao', 'SPINCARE_CONFIG_ATUALIZADA')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'admin')
        auditRecord.set('status_anterior', '')
        auditRecord.set('status_novo', 'sucesso')
        auditRecord.set(
          'detalhes',
          'Configurações da integração SpinCare atualizadas pelo administrador (URL: ' +
            baseUrl +
            ')',
        )
        e.app.save(auditRecord)
      } catch (logErr) {
        console.error('Erro ao gravar log da configuração SpinCare:', logErr)
      }

      return e.json(200, {
        success: true,
        message: 'Configurações da integração com o SpinCare salvas com sucesso.',
      })
    } catch (err) {
      console.error('Erro na rota POST /spincare/config:', err)
      return e.badRequestError(
        'Não foi possível salvar as configurações do SpinCare: ' +
          (err instanceof Error ? err.message : 'Erro interno'),
      )
    }
  },
  $apis.requireAuth(),
)

// ----------------------------------------------------------------------------
// ROTA 3: POST /backend/v1/spincare/test-connection (Apenas Admin)
// ----------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/spincare/test-connection',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      const email = (authUser.getString('email') || '').toLowerCase()
      const isAdmin = role === 'admin' || email === 'fernandofernandes@helpvida.com.br'

      if (!isAdmin) {
        return e.forbiddenError('Apenas administradores podem testar a conexão com o SpinCare.')
      }

      const body = e.requestInfo().body || {}
      let baseUrl = (body.base_url || '').trim()
      let login = (body.api_login || '').trim()
      let password = (body.api_password || '').trim()
      let endpointPatients = (body.endpoint_patients || '').trim()
      let endpointBudgets = (body.endpoint_budgets || '').trim()

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      let savedRec = null
      if (records && records.length > 0) {
        savedRec = records[0]
        if (!baseUrl)
          baseUrl = (
            savedRec.getString('base_url') ||
            'https://integration.spincare.com.br/spincare_integration'
          ).trim()
        if (!login || login.includes('••••')) login = (savedRec.getString('api_login') || '').trim()
        if (!password || password.includes('••••'))
          password = (savedRec.getString('api_password') || '').trim()
        if (!endpointPatients)
          endpointPatients = (
            savedRec.getString('endpoint_patients') || '/integration-engine/get/patients'
          ).trim()
        if (!endpointBudgets)
          endpointBudgets = (
            savedRec.getString('endpoint_budgets') || '/integration-engine/get/budgets'
          ).trim()
      }

      baseUrl = baseUrl.replace(/\/+$/, '')

      if (!baseUrl) {
        return e.json(400, {
          success: false,
          message: 'URL base da API SpinCare não informada.',
        })
      }

      if (!login || !password) {
        return e.json(400, {
          success: false,
          message: 'Login e/ou senha da API SpinCare não configurados.',
        })
      }

      // 1. Testa autenticação (/token/v1)
      const tokenUrl =
        baseUrl +
        '/token/v1?login=' +
        encodeURIComponent(login) +
        '&password=' +
        encodeURIComponent(password)

      let resToken
      try {
        resToken = $http.send({
          url: tokenUrl,
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': 'HelpVida-SpinCare-Client/1.0',
          },
          timeout: 15,
        })
      } catch (netErr) {
        return e.json(400, {
          success: false,
          message:
            'Não foi possível conectar ao servidor SpinCare. Verifique se a URL base é válida e acessível.',
        })
      }

      if (resToken.statusCode !== 200) {
        return e.json(400, {
          success: false,
          statusCode: resToken.statusCode,
          message:
            'Autenticação recusada pelo SpinCare (código ' +
            resToken.statusCode +
            '). Verifique as credenciais de login e senha informadas.',
        })
      }

      let generatedToken = ''
      try {
        if (typeof resToken.json === 'string') generatedToken = resToken.json
        else if (resToken.json && typeof resToken.json === 'object') {
          generatedToken =
            resToken.json.token || resToken.json.access_token || resToken.json.data || ''
        }
      } catch (_) {}
      if (!generatedToken && resToken.raw) {
        generatedToken = resToken.raw.replace(/^"|"$/g, '').trim()
      }

      if (!generatedToken) {
        return e.json(400, {
          success: false,
          message: 'O servidor SpinCare autenticou mas não retornou um token válido.',
        })
      }

      // 2. Testa endpoint de Pacientes
      const patNorm = endpointPatients.startsWith('/') ? endpointPatients : '/' + endpointPatients
      const patUrl =
        baseUrl +
        patNorm +
        '?token=' +
        encodeURIComponent(generatedToken) +
        '&page_number=1&page_size=1'

      let patOk = false
      try {
        const resPat = $http.send({
          url: patUrl,
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + generatedToken,
          },
          timeout: 15,
        })
        if (resPat.statusCode === 200) {
          patOk = true
        }
      } catch (_) {}

      // 3. Testa endpoint de Orçamentos
      const budNorm = endpointBudgets.startsWith('/') ? endpointBudgets : '/' + endpointBudgets
      const budUrl =
        baseUrl +
        budNorm +
        '?token=' +
        encodeURIComponent(generatedToken) +
        '&page_number=1&page_size=1'

      let budOk = false
      try {
        const resBud = $http.send({
          url: budUrl,
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + generatedToken,
          },
          timeout: 15,
        })
        if (resBud.statusCode === 200) {
          budOk = true
        }
      } catch (_) {}

      const allSuccess = patOk && budOk
      const msgResultado = allSuccess
        ? 'Conexão ao vivo bem-sucedida! Autenticação OK (token gerado), leitura de Pacientes OK (' +
          patNorm +
          ') e leitura de Orçamentos OK (' +
          budNorm +
          ').'
        : 'Autenticação SpinCare OK, porém houve inconsistência na leitura: Pacientes ' +
          (patOk ? 'OK' : 'Falha') +
          ' | Orçamentos ' +
          (budOk ? 'OK' : 'Falha') +
          '.'

      // Salva status do teste no banco
      if (savedRec) {
        try {
          savedRec.set('api_token', generatedToken)
          savedRec.set('last_tested_at', new Date().toISOString())
          savedRec.set('last_test_status', allSuccess ? 'ok' : 'partial')
          savedRec.set('last_test_message', msgResultado)
          e.app.save(savedRec)
        } catch (_) {}
      }

      // Trilha de auditoria
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'spincare_middleware')
        auditRecord.set('registro_id', 'test_connection')
        auditRecord.set('acao', 'SPINCARE_TESTE_CONEXAO')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'admin')
        auditRecord.set('status_anterior', '')
        auditRecord.set('status_novo', allSuccess ? 'sucesso' : 'parcial')
        auditRecord.set('detalhes', 'Teste ao vivo contra API SpinCare: ' + msgResultado)
        e.app.save(auditRecord)
      } catch (_) {}

      return e.json(allSuccess ? 200 : 207, {
        success: allSuccess,
        statusCode: 200,
        message: msgResultado,
        testedAt: new Date().toISOString(),
        details: {
          authentication: true,
          patientsEndpoint: patOk,
          budgetsEndpoint: budOk,
        },
      })
    } catch (err) {
      console.error('Erro na rota POST /spincare/test-connection:', err)
      return e.json(500, {
        success: false,
        message:
          'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
      })
    }
  },
  $apis.requireAuth(),
)

// ----------------------------------------------------------------------------
// ROTA 4: POST /backend/v1/spincare/patients/search (Admin + Corpo Clínico)
// ----------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/spincare/patients/search',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar dados de pacientes.',
        )
      }

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      const login = (cfgRec.getString('api_login') || '').trim()
      const password = (cfgRec.getString('api_password') || '').trim()
      let apiToken = (cfgRec.getString('api_token') || '').trim()
      const endpointPatients = (
        cfgRec.getString('endpoint_patients') || '/integration-engine/get/patients'
      ).trim()

      // Obtenção/Renovação inline do token se necessário
      if (!apiToken && login && password) {
        try {
          const tokenUrl =
            baseUrl +
            '/token/v1?login=' +
            encodeURIComponent(login) +
            '&password=' +
            encodeURIComponent(password)
          const resToken = $http.send({
            url: tokenUrl,
            method: 'GET',
            headers: { Accept: '*/*' },
            timeout: 15,
          })
          if (resToken.statusCode === 200) {
            let t = ''
            if (typeof resToken.json === 'string') t = resToken.json
            else if (resToken.json && typeof resToken.json === 'object') {
              t = resToken.json.token || resToken.json.access_token || ''
            }
            if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
            if (t) {
              apiToken = t
              cfgRec.set('api_token', t)
              e.app.save(cfgRec)
            }
          }
        } catch (_) {}
      }

      if (!apiToken && !login) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const body = e.requestInfo().body || {}
      const query = (body.query || '').trim()
      const documento = (body.documento || '').trim()
      const convenioFilter = (body.convenio || '').trim()
      const fetchAllPages = body.fetchAll !== false // padrão: busca todas as páginas até esgotar o censo (~539 pacientes)
      const requestedLimit = parseInt(body.limit, 10) || 100
      const requestedPage = Math.max(parseInt(body.page, 10) || 1, 1)

      const normalizedPath = endpointPatients.startsWith('/')
        ? endpointPatients
        : '/' + endpointPatients

      const fetchPatientsPage = (pageNumber, pageSize) => {
        let fullUrl =
          baseUrl +
          normalizedPath +
          '?page_number=' +
          pageNumber +
          '&page_size=' +
          pageSize +
          (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')

        if (query) {
          fullUrl += '&name=' + encodeURIComponent(query)
        }
        if (documento) {
          const cleanDoc = documento.replace(/[^\d]/g, '')
          fullUrl += '&registration_number=' + encodeURIComponent(cleanDoc || documento)
        }

        const reqHeaders = {
          Accept: 'application/json',
          'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
        }
        if (apiToken) {
          reqHeaders['Authorization'] = 'Bearer ' + apiToken
        }

        let resp
        try {
          resp = $http.send({
            url: fullUrl,
            method: 'GET',
            headers: reqHeaders,
            timeout: 25,
          })
        } catch (callErr) {
          console.error(
            'Erro de rede ao chamar SpinCare (patients/search page ' + pageNumber + '):',
            callErr,
          )
          return { error: 'call_failed', statusCode: 0, items: [] }
        }

        // Se der 401 e tivermos credenciais, tenta renovar uma vez
        if (resp.statusCode === 401 && login && password) {
          try {
            const tokenUrl =
              baseUrl +
              '/token/v1?login=' +
              encodeURIComponent(login) +
              '&password=' +
              encodeURIComponent(password)
            const resToken = $http.send({
              url: tokenUrl,
              method: 'GET',
              headers: { Accept: '*/*' },
              timeout: 15,
            })
            if (resToken.statusCode === 200) {
              let t = ''
              if (typeof resToken.json === 'string') t = resToken.json
              else if (resToken.json && typeof resToken.json === 'object') {
                t = resToken.json.token || resToken.json.access_token || ''
              }
              if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
              if (t) {
                apiToken = t
                cfgRec.set('api_token', t)
                e.app.save(cfgRec)

                let retryUrl =
                  baseUrl +
                  normalizedPath +
                  '?page_number=' +
                  pageNumber +
                  '&page_size=' +
                  pageSize +
                  '&token=' +
                  encodeURIComponent(apiToken)
                if (query) retryUrl += '&name=' + encodeURIComponent(query)
                if (documento) retryUrl += '&registration_number=' + encodeURIComponent(documento)

                resp = $http.send({
                  url: retryUrl,
                  method: 'GET',
                  headers: {
                    Accept: 'application/json',
                    Authorization: 'Bearer ' + apiToken,
                    'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
                  },
                  timeout: 25,
                })
              }
            }
          } catch (_) {}
        }

        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          console.error(
            'SpinCare retornou status ' + resp.statusCode + ' em get/patients page ' + pageNumber,
          )
          return { error: 'bad_status', statusCode: resp.statusCode, items: [] }
        }

        let rawData = []
        try {
          rawData = resp.json || JSON.parse(resp.raw || '[]')
        } catch (_) {
          rawData = []
        }

        let list = []
        if (Array.isArray(rawData)) list = rawData
        else if (rawData && Array.isArray(rawData.items)) list = rawData.items
        else if (rawData && Array.isArray(rawData.data)) list = rawData.data
        else if (rawData && typeof rawData === 'object') list = [rawData]

        return { statusCode: resp.statusCode, items: list }
      }

      let allRawPatients = []
      if (fetchAllPages) {
        // Busca progressiva em loop no servidor até esgotar todas as páginas
        // Página padrão da API: 100 registros por chamada; limite seguro de 15 páginas (até 1500 pacientes)
        const pageSize = 100
        const maxPages = 15
        for (let p = 1; p <= maxPages; p++) {
          const pageRes = fetchPatientsPage(p, pageSize)
          if (pageRes.error) {
            // Se falhou na primeira página, retorna 502
            if (p === 1) {
              return e.json(502, {
                message:
                  'Não foi possível consultar o SpinCare agora. Verifique a conexão com a API externa.',
              })
            }
            // Se já obteve páginas anteriores, interrompe o loop e usa o acumulado
            break
          }
          if (!pageRes.items || pageRes.items.length === 0) {
            break
          }
          allRawPatients = allRawPatients.concat(pageRes.items)
          // Se a quantidade retornada for menor que pageSize, chegou na última página
          if (pageRes.items.length < pageSize) {
            break
          }
        }
      } else {
        const singlePage = fetchPatientsPage(requestedPage, requestedLimit)
        if (singlePage.error) {
          return e.json(502, {
            message:
              'Não foi possível consultar o SpinCare agora. O sistema externo respondeu com erro.',
          })
        }
        allRawPatients = singlePage.items
      }

      // Mapeamento tolerante dos pacientes E FILTRO DE SOMENTE ATIVOS (active === true)
      let normalizedList = allRawPatients
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null

          // REGRA 4: Somente pacientes ATIVOS no servidor
          // Campo `active` da SpinCare é booleano (true/false)
          const isActive = raw.active === true || raw.active === 1 || raw.active === 'true'
          if (!isActive) {
            return null
          }

          const id = String(raw.id || raw.patient_id || raw.patientId || '')
          const nome = String(raw.name || raw.nome || raw.patient_name || '—').trim()

          const doc = String(
            raw.registration_number ||
              raw.national_id ||
              raw.cpf ||
              raw.documento ||
              raw.document ||
              '—',
          ).trim()

          let dtNasc = String(
            raw.birth_date || raw.data_nascimento || raw.dataNascimento || '—',
          ).trim()
          if (dtNasc && dtNasc !== '—' && dtNasc.includes('-')) {
            const parts = dtNasc.split('-')
            if (parts.length === 3 && parts[0].length === 4) {
              dtNasc = parts[2] + '/' + parts[1] + '/' + parts[0]
            }
          }

          const tel = String(
            raw.phone_number || raw.cellphone || raw.telefone || raw.celular || raw.contato || '—',
          ).trim()

          const emailP = String(raw.email || raw.mail || '—').trim()

          let enderecoParts = []
          if (raw.address) enderecoParts.push(raw.address)
          if (raw.address_number) enderecoParts.push('nº ' + raw.address_number)
          if (raw.address_comp) enderecoParts.push(raw.address_comp)
          if (raw.district) enderecoParts.push(raw.district)
          if (raw.city) enderecoParts.push(raw.city)
          if (raw.state_provincy) enderecoParts.push(raw.state_provincy)

          const endereco = enderecoParts.length > 0 ? enderecoParts.join(', ') : '—'

          // Nome do convênio na resposta da API SpinCare: health_insurance_name
          const rawConvenio =
            raw.health_insurance_name ||
            raw.health_insurance ||
            raw.insurance_name ||
            raw.insurance ||
            raw.convenio ||
            raw.operadora ||
            raw.insurance_plan_name ||
            raw.plano_saude ||
            raw.healthInsuranceName ||
            '—'
          const convenio = String(rawConvenio || '—').trim()

          const modalidade = String(
            raw.modality ||
              raw.modalidade ||
              raw.attendance_type ||
              raw.attendance_regime ||
              raw.regime ||
              raw.tipo_atendimento ||
              raw.plano ||
              '—',
          ).trim()

          return {
            id: id || Math.random().toString(36).substring(2, 9),
            nome: nome,
            documento: doc,
            dataNascimento: dtNasc,
            telefone: tel,
            email: emailP,
            endereco: endereco,
            convenio: convenio,
            modalidade: modalidade,
            statusAtendimento: 'Ativo',
            active: true,
          }
        })
        .filter(Boolean)

      // Deduplicação tolerante por ID de paciente (para evitar duplicações de paginação)
      const seenIds = {}
      normalizedList = normalizedList.filter((p) => {
        if (!p.id) return true
        if (seenIds[p.id]) return false
        seenIds[p.id] = true
        return true
      })

      // Função auxiliar de normalização tolerante para strings (NFD, sem diacríticos, trim, uppercase)
      const normCompareServer = (str) => {
        if (!str) return ''
        let s = String(str).trim()
        if (s.normalize) {
          s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        }
        return s.toUpperCase()
      }

      // 1. Compilar dropdown de convênios a partir do censo completo de pacientes ativos
      // com contagem por convênio e formato canônico
      const conveniosCountsMap = {}
      normalizedList.forEach((p) => {
        const rawC = (p.convenio || '').trim()
        if (rawC && rawC !== '—') {
          const normKey = normCompareServer(rawC)
          if (!conveniosCountsMap[normKey]) {
            conveniosCountsMap[normKey] = {
              name: rawC,
              count: 0,
            }
          }
          conveniosCountsMap[normKey].count++
        }
      })

      const conveniosComContagem = Object.keys(conveniosCountsMap)
        .map((k) => conveniosCountsMap[k])
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

      const allDistinctConvenios = conveniosComContagem.map((c) => c.name)

      const allDistinctModalidades = Array.from(
        new Set(
          normalizedList
            .map((p) => (p.modalidade || '').trim())
            .filter((m) => Boolean(m) && m !== '—'),
        ),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

      // 2. APLICAÇÃO DOS FILTROS NO SERVIDOR SOBRE O CENSO COMPLETO ANTES DE PAGINAR

      // Filtro de convênio no servidor (NFD sem diacríticos, trim, uppercase, tolerante a correspondência mútua)
      if (convenioFilter && convenioFilter !== 'todos') {
        const convTarget = normCompareServer(convenioFilter)
        normalizedList = normalizedList.filter((p) => {
          const c = normCompareServer(p.convenio)
          return c === convTarget || c.includes(convTarget) || convTarget.includes(c)
        })
      }

      // Filtro local complementar tolerante (nome)
      if (query) {
        const qNorm = normCompareServer(query)
        normalizedList = normalizedList.filter((p) => normCompareServer(p.nome).includes(qNorm))
      }

      // Filtro local complementar tolerante (documento)
      if (documento) {
        const docClean = documento.replace(/[^\d]/g, '')
        normalizedList = normalizedList.filter((p) => {
          const pClean = p.documento.replace(/[^\d]/g, '')
          return (pClean && pClean.includes(docClean)) || p.documento.includes(documento)
        })
      }

      // Auditoria LGPD
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'spincare_middleware')
        auditRecord.set('registro_id', 'search')
        auditRecord.set('acao', 'SPINCARE_BUSCA_PACIENTES')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
        auditRecord.set('status_anterior', '')
        auditRecord.set('status_novo', 'sucesso')
        auditRecord.set(
          'detalhes',
          'Busca ao vivo de pacientes no SpinCare realizada (retornados: ' +
            normalizedList.length +
            ' registros)',
        )
        e.app.save(auditRecord)
      } catch (_) {}

      return e.json(200, {
        total: normalizedList.length,
        page: requestedPage,
        limit: requestedLimit,
        items: normalizedList,
        convenios: allDistinctConvenios,
        conveniosComContagem: conveniosComContagem,
        modalidades: allDistinctModalidades,
      })
    } catch (err) {
      console.error('Erro na rota POST /spincare/patients/search:', err)
      return e.json(500, {
        message:
          'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
      })
    }
  },
  $apis.requireAuth(),
)

// ----------------------------------------------------------------------------
// ROTA 5: GET /backend/v1/spincare/patients/{id} (Admin + Corpo Clínico)
// ----------------------------------------------------------------------------
routerAdd(
  'GET',
  '/backend/v1/spincare/patients/{id}',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar dados de pacientes.',
        )
      }

      const patientId = e.request.pathValue('id')
      if (!patientId) {
        return e.badRequestError('ID do paciente não informado.')
      }

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      const login = (cfgRec.getString('api_login') || '').trim()
      const password = (cfgRec.getString('api_password') || '').trim()
      let apiToken = (cfgRec.getString('api_token') || '').trim()
      const endpointPatients = (
        cfgRec.getString('endpoint_patients') || '/integration-engine/get/patients'
      ).trim()
      const endpointBudgets = (
        cfgRec.getString('endpoint_budgets') || '/integration-engine/get/budgets'
      ).trim()

      if (!apiToken && login && password) {
        try {
          const tokenUrl =
            baseUrl +
            '/token/v1?login=' +
            encodeURIComponent(login) +
            '&password=' +
            encodeURIComponent(password)
          const resToken = $http.send({
            url: tokenUrl,
            method: 'GET',
            headers: { Accept: '*/*' },
            timeout: 15,
          })
          if (resToken.statusCode === 200) {
            let t = ''
            if (typeof resToken.json === 'string') t = resToken.json
            else if (resToken.json && typeof resToken.json === 'object') {
              t = resToken.json.token || resToken.json.access_token || ''
            }
            if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
            if (t) {
              apiToken = t
              cfgRec.set('api_token', t)
              e.app.save(cfgRec)
            }
          }
        } catch (_) {}
      }

      // 1. Busca ficha do paciente
      const patNorm = endpointPatients.startsWith('/') ? endpointPatients : '/' + endpointPatients
      const patientUrl =
        baseUrl +
        patNorm +
        '?patient_id=' +
        encodeURIComponent(patientId) +
        (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')

      const reqHeaders = {
        Accept: 'application/json',
        'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
      }
      if (apiToken) {
        reqHeaders['Authorization'] = 'Bearer ' + apiToken
      }

      let resPatient
      try {
        resPatient = $http.send({
          url: patientUrl,
          method: 'GET',
          headers: reqHeaders,
          timeout: 20,
        })
      } catch (errCall) {
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
        })
      }

      if (resPatient.statusCode === 404) {
        return e.json(404, { message: 'Paciente não localizado no sistema SpinCare.' })
      }

      let rawPatientList = []
      try {
        const j = resPatient.json || JSON.parse(resPatient.raw || '[]')
        if (Array.isArray(j)) rawPatientList = j
        else if (j && typeof j === 'object') rawPatientList = [j]
      } catch (_) {}

      let rawPatient = rawPatientList.find((p) => String(p.id) === String(patientId))
      if (!rawPatient && rawPatientList.length > 0) {
        rawPatient = rawPatientList[0]
      }

      if (!rawPatient) {
        return e.json(404, { message: 'Paciente não localizado no sistema SpinCare.' })
      }

      let dtNasc = String(rawPatient.birth_date || rawPatient.data_nascimento || '—').trim()
      if (dtNasc && dtNasc !== '—' && dtNasc.includes('-')) {
        const parts = dtNasc.split('-')
        if (parts.length === 3 && parts[0].length === 4) {
          dtNasc = parts[2] + '/' + parts[1] + '/' + parts[0]
        }
      }

      let enderecoParts = []
      if (rawPatient.address) enderecoParts.push(rawPatient.address)
      if (rawPatient.address_number) enderecoParts.push('nº ' + rawPatient.address_number)
      if (rawPatient.address_comp) enderecoParts.push(rawPatient.address_comp)
      if (rawPatient.district) enderecoParts.push(rawPatient.district)
      if (rawPatient.city) enderecoParts.push(rawPatient.city)
      if (rawPatient.state_provincy) enderecoParts.push(rawPatient.state_provincy)

      const normalizedPatient = {
        id: String(rawPatient.id || patientId),
        nome: String(rawPatient.name || rawPatient.nome || '—').trim(),
        documento: String(
          rawPatient.registration_number ||
            rawPatient.national_id ||
            rawPatient.cpf ||
            rawPatient.documento ||
            '—',
        ).trim(),
        dataNascimento: dtNasc,
        telefone: String(
          rawPatient.phone_number || rawPatient.cellphone || rawPatient.telefone || '—',
        ).trim(),
        email: String(rawPatient.email || rawPatient.mail || '—').trim(),
        endereco: enderecoParts.length > 0 ? enderecoParts.join(', ') : '—',
        convenio: String(
          rawPatient.health_insurance_name ||
            rawPatient.health_insurance ||
            rawPatient.insurance_name ||
            rawPatient.convenio ||
            rawPatient.insurance ||
            rawPatient.plano_saude ||
            rawPatient.healthInsuranceName ||
            '—',
        ).trim(),
        modalidade: String(
          rawPatient.modality ||
            rawPatient.modalidade ||
            rawPatient.attendance_type ||
            rawPatient.attendance_regime ||
            rawPatient.regime ||
            rawPatient.tipo_atendimento ||
            rawPatient.plano ||
            rawPatient.insurance_plan_name ||
            '—',
        ).trim(),
        statusAtendimento: rawPatient.active === false ? 'Inativo' : 'Ativo',
      }

      // 2. Busca orçamentos deste paciente no SpinCare
      let orcamentos = []
      try {
        const budNorm = endpointBudgets.startsWith('/') ? endpointBudgets : '/' + endpointBudgets
        const budgetsUrl =
          baseUrl +
          budNorm +
          '?patient_id=' +
          encodeURIComponent(patientId) +
          '&page_number=1&page_size=50' +
          (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')

        const resBudgets = $http.send({
          url: budgetsUrl,
          method: 'GET',
          headers: reqHeaders,
          timeout: 20,
        })

        if (resBudgets.statusCode >= 200 && resBudgets.statusCode < 300) {
          let rawBudgets = []
          try {
            rawBudgets = resBudgets.json || JSON.parse(resBudgets.raw || '[]')
          } catch (_) {
            rawBudgets = []
          }

          let list = []
          if (Array.isArray(rawBudgets)) list = rawBudgets
          else if (rawBudgets && Array.isArray(rawBudgets.items)) list = rawBudgets.items

          orcamentos = list
            .filter((raw) => String(raw.patient_id) === String(patientId))
            .map((raw) => {
              if (!raw || typeof raw !== 'object') return null
              const bid = String(raw.id || raw.budget_id || '')
              const bnum = String(
                raw.authorization_number || raw.budget_number || raw.numero || bid || '—',
              ).trim()

              let bstatus = 'Aprovado'
              if (raw.status) bstatus = String(raw.status)
              else if (raw.authorization_dt) bstatus = 'Aprovado'

              let bdata = String(
                raw.authorization_dt || raw.creation_dt || raw.initial_dt || '—',
              ).trim()
              let ano = null
              if (bdata && bdata !== '—') {
                const mIso = bdata.match(/^(\d{4})/)
                if (mIso) {
                  ano = parseInt(mIso[1], 10)
                  const parts = bdata.split(' ')[0].split('-')
                  if (parts.length === 3) {
                    bdata = parts[2] + '/' + parts[1] + '/' + parts[0]
                  }
                }
              }

              let valor = 0
              if (typeof raw.total === 'number') valor = raw.total
              else if (typeof raw.total === 'string') {
                const cl = raw.total.replace(/[^\d.,-]/g, '').replace(',', '.')
                valor = parseFloat(cl) || 0
              }

              let itens = []
              const rawIt = raw.items || raw.itens || raw.budget_items || raw.products || []
              if (Array.isArray(rawIt)) {
                itens = rawIt.map((it) => {
                  if (typeof it === 'string') {
                    return {
                      descricao: it,
                      quantidade: 1,
                      valorUnitario: 0,
                      valorTotal: 0,
                      unidade: '',
                      codigo: '',
                    }
                  }
                  const qtd = Number(it.quantity || it.qtd || it.amount || 1)
                  const valUnit = Number(
                    it.unitary_value ||
                      it.unit_value ||
                      it.valor_unitario ||
                      it.valorUnitario ||
                      it.price ||
                      0,
                  )
                  const valTot = Number(
                    it.total || it.total_value || it.valor_total || it.cost || qtd * valUnit,
                  )
                  return {
                    id: String(it.id || it.item_id || ''),
                    codigo: String(it.code || it.codigo || it.product_code || '').trim(),
                    descricao: String(
                      it.description ||
                        it.product_description ||
                        it.descricao ||
                        it.name ||
                        it.item ||
                        'Item de Orçamento',
                    ).trim(),
                    unidade: String(it.unit || it.unidade || it.measure_unit || '').trim(),
                    quantidade: qtd,
                    valorUnitario: valUnit,
                    valorTotal: valTot,
                  }
                })
              }
              return {
                id: bid || Math.random().toString(36).substring(2, 9),
                numero: bnum,
                pacienteId: patientId,
                pacienteNome: normalizedPatient.nome,
                status: bstatus,
                dataAprovacao: bdata,
                anoAprovacao: ano,
                valor: valor,
                observacao:
                  raw.health_insurance_name || raw.insurance_name
                    ? 'Convênio: ' + (raw.health_insurance_name || raw.insurance_name)
                    : '—',
                itens: itens,
              }
            })
            .filter(Boolean)
        }
      } catch (errBudgets) {
        console.warn('Falha ao buscar orçamentos do paciente:', errBudgets)
      }

      // Trilha de auditoria LGPD
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'spincare_middleware')
        auditRecord.set('registro_id', patientId)
        auditRecord.set('acao', 'SPINCARE_CONSULTA_PACIENTE')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
        auditRecord.set('status_anterior', '')
        auditRecord.set('status_novo', 'sucesso')
        auditRecord.set(
          'detalhes',
          'Ficha do paciente ID ' + patientId + ' consultada ao vivo no SpinCare OpenAPI',
        )
        e.app.save(auditRecord)
      } catch (_) {}

      return e.json(200, {
        patient: normalizedPatient,
        budgets: orcamentos,
      })
    } catch (err) {
      console.error('Erro na rota GET /spincare/patients/{id}:', err)
      return e.json(500, {
        message:
          'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
      })
    }
  },
  $apis.requireAuth(),
)

// ----------------------------------------------------------------------------
// ROTA 6: GET /backend/v1/spincare/budgets (Admin + Corpo Clínico, >= 2026)
// ----------------------------------------------------------------------------
routerAdd(
  'GET',
  '/backend/v1/spincare/budgets',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar dados de orçamentos.',
        )
      }

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      const login = (cfgRec.getString('api_login') || '').trim()
      const password = (cfgRec.getString('api_password') || '').trim()
      let apiToken = (cfgRec.getString('api_token') || '').trim()
      const endpointBudgets = (
        cfgRec.getString('endpoint_budgets') || '/integration-engine/get/budgets'
      ).trim()

      if (!apiToken && login && password) {
        try {
          const tokenUrl =
            baseUrl +
            '/token/v1?login=' +
            encodeURIComponent(login) +
            '&password=' +
            encodeURIComponent(password)
          const resToken = $http.send({
            url: tokenUrl,
            method: 'GET',
            headers: { Accept: '*/*' },
            timeout: 15,
          })
          if (resToken.statusCode === 200) {
            let t = ''
            if (typeof resToken.json === 'string') t = resToken.json
            else if (resToken.json && typeof resToken.json === 'object') {
              t = resToken.json.token || resToken.json.access_token || ''
            }
            if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
            if (t) {
              apiToken = t
              cfgRec.set('api_token', t)
              e.app.save(cfgRec)
            }
          }
        } catch (_) {}
      }

      const info = e.requestInfo()
      const queryParams = info.query || {}

      const startDate = (queryParams.start_date || '2026-01-01').trim()
      const endDate = (queryParams.end_date || '').trim()
      const statusFilter = (queryParams.status || 'Aprovado').trim()
      const search = (queryParams.search || '').trim()
      const patientId = (queryParams.patient_id || '').trim()
      const fetchAllPages = queryParams.fetchAll !== 'false'
      const requestedLimit = Math.min(Math.max(parseInt(queryParams.limit, 10) || 100, 1), 200)
      const requestedPage = Math.max(parseInt(queryParams.page, 10) || 1, 1)

      const normalizedPath = endpointBudgets.startsWith('/')
        ? endpointBudgets
        : '/' + endpointBudgets

      const fetchBudgetsPage = (pageNumber, pageSize) => {
        let fullUrl =
          baseUrl +
          normalizedPath +
          '?page_number=' +
          pageNumber +
          '&page_size=' +
          pageSize +
          '&initial_dt=' +
          encodeURIComponent(startDate) +
          (apiToken ? '&token=' + encodeURIComponent(apiToken) : '')

        if (endDate) {
          fullUrl += '&final_dt=' + encodeURIComponent(endDate)
        }
        if (patientId) {
          fullUrl += '&patient_id=' + encodeURIComponent(patientId)
        }

        const reqHeaders = {
          Accept: 'application/json',
          'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
        }
        if (apiToken) {
          reqHeaders['Authorization'] = 'Bearer ' + apiToken
        }

        let resp
        try {
          resp = $http.send({
            url: fullUrl,
            method: 'GET',
            headers: reqHeaders,
            timeout: 25,
          })
        } catch (callErr) {
          console.error('Erro ao chamar SpinCare (budgets page ' + pageNumber + '):', callErr)
          return { error: 'call_failed', statusCode: 0, items: [] }
        }

        if (resp.statusCode === 401 && login && password) {
          try {
            const tokenUrl =
              baseUrl +
              '/token/v1?login=' +
              encodeURIComponent(login) +
              '&password=' +
              encodeURIComponent(password)
            const resToken = $http.send({
              url: tokenUrl,
              method: 'GET',
              headers: { Accept: '*/*' },
              timeout: 15,
            })
            if (resToken.statusCode === 200) {
              let t = ''
              if (typeof resToken.json === 'string') t = resToken.json
              else if (resToken.json && typeof resToken.json === 'object') {
                t = resToken.json.token || resToken.json.access_token || ''
              }
              if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
              if (t) {
                apiToken = t
                cfgRec.set('api_token', t)
                e.app.save(cfgRec)

                let retryUrl =
                  baseUrl +
                  normalizedPath +
                  '?page_number=' +
                  pageNumber +
                  '&page_size=' +
                  pageSize +
                  '&initial_dt=' +
                  encodeURIComponent(startDate) +
                  '&token=' +
                  encodeURIComponent(apiToken)
                if (endDate) retryUrl += '&final_dt=' + encodeURIComponent(endDate)
                if (patientId) retryUrl += '&patient_id=' + encodeURIComponent(patientId)

                resp = $http.send({
                  url: retryUrl,
                  method: 'GET',
                  headers: {
                    Accept: 'application/json',
                    Authorization: 'Bearer ' + apiToken,
                    'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
                  },
                  timeout: 25,
                })
              }
            }
          } catch (_) {}
        }

        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          console.error(
            'SpinCare retornou status ' + resp.statusCode + ' em budgets page ' + pageNumber,
          )
          return { error: 'bad_status', statusCode: resp.statusCode, items: [] }
        }

        let rawData = []
        try {
          rawData = resp.json || JSON.parse(resp.raw || '[]')
        } catch (_) {
          rawData = []
        }

        let list = []
        if (Array.isArray(rawData)) list = rawData
        else if (rawData && Array.isArray(rawData.items)) list = rawData.items
        else if (rawData && typeof rawData === 'object') list = [rawData]

        return { statusCode: resp.statusCode, items: list }
      }

      let rawList = []
      if (fetchAllPages) {
        const pageSize = 100
        const maxPages = 15
        for (let p = 1; p <= maxPages; p++) {
          const pageRes = fetchBudgetsPage(p, pageSize)
          if (pageRes.error) {
            if (p === 1) {
              return e.json(502, {
                message:
                  'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
              })
            }
            break
          }
          if (!pageRes.items || pageRes.items.length === 0) {
            break
          }
          rawList = rawList.concat(pageRes.items)
          if (pageRes.items.length < pageSize) {
            break
          }
        }
      } else {
        const singlePage = fetchBudgetsPage(requestedPage, requestedLimit)
        if (singlePage.error) {
          return e.json(502, {
            message:
              'Não foi possível consultar o SpinCare agora. O sistema externo respondeu com status ' +
              singlePage.statusCode +
              '.',
          })
        }
        rawList = singlePage.items
      }
      let normalizedList = rawList
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null
          const id = String(raw.id || raw.budget_id || '')
          const numero = String(
            raw.authorization_number || raw.budget_number || raw.numero || id || '—',
          ).trim()

          const pid = String(raw.patient_id || '')
          const pnome = String(raw.patient_name || raw.nm_paciente || 'Paciente Help Vida').trim()

          let status = 'Aprovado'
          if (raw.status) status = String(raw.status)
          else if (raw.authorization_dt) status = 'Aprovado'

          const rawDataAprov = String(
            raw.authorization_dt || raw.creation_dt || raw.initial_dt || '—',
          ).trim()
          let dataAprovacao = rawDataAprov
          let ano = null

          if (rawDataAprov && rawDataAprov !== '—') {
            const mIso = rawDataAprov.match(/^(\d{4})/)
            if (mIso) {
              ano = parseInt(mIso[1], 10)
              const parts = rawDataAprov.split(' ')[0].split('-')
              if (parts.length === 3) {
                dataAprovacao = parts[2] + '/' + parts[1] + '/' + parts[0]
              }
            } else {
              const mBr = rawDataAprov.match(/\/(\d{4})/)
              if (mBr) ano = parseInt(mBr[1], 10)
            }
          }

          let valor = 0
          if (typeof raw.total === 'number') valor = raw.total
          else if (typeof raw.total === 'string') {
            const cl = raw.total.replace(/[^\d.,-]/g, '').replace(',', '.')
            valor = parseFloat(cl) || 0
          }

          const rawConvBudget =
            raw.health_insurance_name ||
            raw.insurance_name ||
            raw.insurance ||
            raw.convenio ||
            raw.observacao ||
            '—'
          const observacao = rawConvBudget !== '—' ? 'Convênio: ' + rawConvBudget : '—'

          let itens = []
          const rawIt = raw.items || raw.itens || raw.budget_items || raw.products || []
          if (Array.isArray(rawIt)) {
            itens = rawIt.map((it) => {
              if (typeof it === 'string') {
                return {
                  descricao: it,
                  quantidade: 1,
                  valorUnitario: 0,
                  valorTotal: 0,
                  unidade: '',
                  codigo: '',
                }
              }
              const qtd = Number(it.quantity || it.qtd || it.amount || 1)
              const valUnit = Number(
                it.unitary_value ||
                  it.unit_value ||
                  it.valor_unitario ||
                  it.valorUnitario ||
                  it.price ||
                  0,
              )
              const valTot = Number(
                it.total || it.total_value || it.valor_total || it.cost || qtd * valUnit,
              )
              return {
                id: String(it.id || it.item_id || ''),
                codigo: String(it.code || it.codigo || it.product_code || '').trim(),
                descricao: String(
                  it.description ||
                    it.product_description ||
                    it.descricao ||
                    it.name ||
                    it.item ||
                    'Item de Orçamento',
                ).trim(),
                unidade: String(it.unit || it.unidade || it.measure_unit || '').trim(),
                quantidade: qtd,
                valorUnitario: valUnit,
                valorTotal: valTot,
              }
            })
          }
          return {
            id: id || Math.random().toString(36).substring(2, 9),
            numero: numero,
            pacienteId: pid,
            pacienteNome: pnome,
            status: status,
            dataAprovacao: dataAprovacao,
            anoAprovacao: ano,
            valor: valor,
            observacao: observacao,
            itens: itens,
          }
        })
        .filter(Boolean)

      if (startDate.startsWith('2026')) {
        normalizedList = normalizedList.filter((b) => {
          if (!b.anoAprovacao) return true
          return b.anoAprovacao >= 2026
        })
      }

      if (search) {
        const sUpper = search.toUpperCase()
        normalizedList = normalizedList.filter(
          (b) =>
            b.pacienteNome.toUpperCase().includes(sUpper) ||
            b.numero.toUpperCase().includes(sUpper),
        )
      }

      // Trilha de auditoria LGPD
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'spincare_middleware')
        auditRecord.set('registro_id', 'budgets_list')
        auditRecord.set('acao', 'SPINCARE_CONSULTA_ORCAMENTOS')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
        auditRecord.set('status_anterior', '')
        auditRecord.set('status_novo', 'sucesso')
        auditRecord.set(
          'detalhes',
          'Consulta de orçamentos aprovados realizada via SpinCare (período >= ' +
            startDate +
            ', retornados: ' +
            normalizedList.length +
            ')',
        )
        e.app.save(auditRecord)
      } catch (_) {}

      return e.json(200, {
        total: normalizedList.length,
        startDate: startDate,
        endDate: endDate,
        statusFilter: statusFilter,
        page: requestedPage,
        limit: requestedLimit,
        items: normalizedList,
      })
    } catch (err) {
      console.error('Erro na rota GET /spincare/budgets:', err)
      return e.json(500, {
        message:
          'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
      })
    }
  },
  $apis.requireAuth(),
)
