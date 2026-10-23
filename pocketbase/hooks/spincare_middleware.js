/**
 * ============================================================================
 * SPINCARE MIDDLEWARE — HELP VIDA ATENÇÃO DOMICILIAR
 * ============================================================================
 * PocketBase JSVM executes callbacks in isolated VM pools. All helper logic
 * is inlined directly inside each routerAdd callback to guarantee clean execution.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// ROTA 1: GET /backend/v1/spincare/config
// ----------------------------------------------------------------------------
routerAdd(
  'GET',
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

      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar dados de pacientes ou orçamentos.',
        )
      }

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(200, {
          configured: false,
          is_active: false,
          base_url: '',
          auth_type: 'bearer',
          header_name: 'Authorization',
          token_prefix: 'Bearer ',
          endpoint_patients: '/v1/patients',
          endpoint_budgets: '/v1/budgets',
          has_token: false,
          token_masked: '',
          last_tested_at: '',
          last_test_status: '',
          last_test_message: '',
        })
      }

      const rec = records[0]
      const rawToken = (rec.getString('api_token') || '').trim()
      let tokenMasked = ''
      if (rawToken) {
        if (rawToken.length <= 8) {
          tokenMasked = '••••••••'
        } else {
          tokenMasked = rawToken.slice(0, 4) + '••••••••' + rawToken.slice(rawToken.length - 4)
        }
      }

      return e.json(200, {
        id: rec.id,
        configured: Boolean(rec.getString('base_url') && rawToken),
        is_active: rec.getBool('is_active'),
        base_url: rec.getString('base_url') || '',
        auth_type: rec.getString('auth_type') || 'bearer',
        header_name: rec.getString('header_name') || 'Authorization',
        token_prefix: rec.getString('token_prefix') || 'Bearer ',
        endpoint_patients: rec.getString('endpoint_patients') || '/v1/patients',
        endpoint_budgets: rec.getString('endpoint_budgets') || '/v1/budgets',
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
      const baseUrl = (body.base_url || '').trim()
      const authType = body.auth_type || 'bearer'
      const headerName = (body.header_name || 'Authorization').trim()
      const tokenPrefix = body.token_prefix !== undefined ? body.token_prefix : 'Bearer '
      const endpointPatients = (body.endpoint_patients || '/v1/patients').trim()
      const endpointBudgets = (body.endpoint_budgets || '/v1/budgets').trim()
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true
      const newApiToken = (body.api_token || '').trim()

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

      if (newApiToken && !newApiToken.includes('••••••••')) {
        record.set('api_token', newApiToken)
      }

      e.app.save(record)

      // Gravar trilha de auditoria (LGPD: sem dados do token)
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
      let authType = body.auth_type || 'bearer'
      let headerName = (body.header_name || 'Authorization').trim()
      let tokenPrefix = body.token_prefix !== undefined ? body.token_prefix : 'Bearer '
      let apiToken = (body.api_token || '').trim()
      let endpointPatients = (body.endpoint_patients || '/v1/patients').trim()

      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (records && records.length > 0) {
        const savedRec = records[0]
        if (!baseUrl) baseUrl = (savedRec.getString('base_url') || '').trim()
        if (!authType) authType = savedRec.getString('auth_type') || 'bearer'
        if (!headerName) headerName = savedRec.getString('header_name') || 'Authorization'
        if (body.token_prefix === undefined)
          tokenPrefix = savedRec.getString('token_prefix') || 'Bearer '
        if (!endpointPatients)
          endpointPatients = savedRec.getString('endpoint_patients') || '/v1/patients'
        if (!apiToken || apiToken.includes('••••••••')) {
          apiToken = (savedRec.getString('api_token') || '').trim()
        }
      }

      baseUrl = baseUrl.replace(/\/+$/, '')

      if (!baseUrl) {
        return e.json(400, {
          success: false,
          message: 'URL base da API SpinCare não informada.',
        })
      }
      if (!apiToken) {
        return e.json(400, {
          success: false,
          message: 'Token/Chave de autenticação da API SpinCare não configurado.',
        })
      }

      const normalizedPath = endpointPatients.startsWith('/')
        ? endpointPatients
        : '/' + endpointPatients
      const fullUrl = baseUrl + normalizedPath + '?limit=1'

      const reqHeaders = {
        Accept: 'application/json',
        'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
      }

      if (authType === 'bearer') {
        reqHeaders[headerName || 'Authorization'] = (tokenPrefix || 'Bearer ') + apiToken
      } else if (authType === 'api_key_header') {
        reqHeaders[headerName || 'X-API-Key'] = (tokenPrefix || '') + apiToken
      } else if (authType === 'basic') {
        reqHeaders['Authorization'] = (tokenPrefix || 'Basic ') + apiToken
      }

      let res
      let statusOk = false
      let msgResultado = ''

      try {
        res = $http.send(fullUrl, {
          method: 'GET',
          headers: reqHeaders,
          timeout: 15,
        })

        if (res.statusCode >= 200 && res.statusCode < 300) {
          statusOk = true
          msgResultado =
            'Conexão bem-sucedida! A API do SpinCare respondeu com status ' +
            res.statusCode +
            ' (OK).'
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          statusOk = false
          msgResultado =
            'Acesso negado pela API SpinCare (código ' +
            res.statusCode +
            '). Verifique o token ou chave informada.'
        } else {
          statusOk = false
          msgResultado =
            'A API do SpinCare respondeu com código ' +
            res.statusCode +
            '. Verifique se o caminho do endpoint (' +
            endpointPatients +
            ') está correto.'
        }
      } catch (httpErr) {
        statusOk = false
        msgResultado =
          'Não foi possível estabelecer contato com o servidor do SpinCare. Verifique se a URL base é válida e acessível.'
      }

      // Atualiza registro com o status do teste
      if (records && records.length > 0) {
        try {
          const recToUpdate = records[0]
          recToUpdate.set('last_tested_at', new Date().toISOString())
          recToUpdate.set('last_test_status', statusOk ? 'ok' : 'error')
          recToUpdate.set('last_test_message', msgResultado)
          e.app.save(recToUpdate)
        } catch (_) {}
      }

      // Registrar auditoria do teste
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
        auditRecord.set('status_novo', statusOk ? 'sucesso' : 'falha')
        auditRecord.set(
          'detalhes',
          'Teste de conexão com a API SpinCare realizado. Resultado: ' +
            (statusOk ? 'Sucesso' : 'Falha') +
            ' — ' +
            msgResultado,
        )
        e.app.save(auditRecord)
      } catch (logErr) {}

      return e.json(statusOk ? 200 : 400, {
        success: statusOk,
        statusCode: res ? res.statusCode : 0,
        message: msgResultado,
        testedAt: new Date().toISOString(),
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
      const email = (authUser.getString('email') || '').toLowerCase()
      const isAdmin = role === 'admin' || email === 'fernandofernandes@helpvida.com.br'

      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para consultar dados de pacientes.',
        )
      }

      // Recuperar configurações salvas
      const records = e.app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const cfgRec = records[0]
      const baseUrl = (cfgRec.getString('base_url') || '').trim().replace(/\/+$/, '')
      const apiToken = (cfgRec.getString('api_token') || '').trim()
      const authType = cfgRec.getString('auth_type') || 'bearer'
      const headerName = cfgRec.getString('header_name') || 'Authorization'
      const tokenPrefix = cfgRec.getString('token_prefix') || 'Bearer '
      const endpointPatients = (cfgRec.getString('endpoint_patients') || '/v1/patients').trim()

      if (!baseUrl || !apiToken) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const body = e.requestInfo().body || {}
      const query = (body.query || '').trim()
      const documento = (body.documento || '').trim()
      const limit = Math.min(Math.max(parseInt(body.limit, 10) || 20, 1), 100)
      const page = Math.max(parseInt(body.page, 10) || 1, 1)

      const params = []
      if (query) params.push('q=' + encodeURIComponent(query))
      if (documento) params.push('documento=' + encodeURIComponent(documento))
      params.push('limit=' + limit)
      params.push('page=' + page)
      const queryString = params.length > 0 ? '?' + params.join('&') : ''

      const normalizedPath = endpointPatients.startsWith('/')
        ? endpointPatients
        : '/' + endpointPatients
      const fullUrl = baseUrl + normalizedPath + queryString

      const reqHeaders = {
        Accept: 'application/json',
        'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
      }
      if (authType === 'bearer') {
        reqHeaders[headerName || 'Authorization'] = (tokenPrefix || 'Bearer ') + apiToken
      } else if (authType === 'api_key_header') {
        reqHeaders[headerName || 'X-API-Key'] = (tokenPrefix || '') + apiToken
      } else if (authType === 'basic') {
        reqHeaders['Authorization'] = (tokenPrefix || 'Basic ') + apiToken
      }

      let res
      try {
        res = $http.send(fullUrl, {
          method: 'GET',
          headers: reqHeaders,
          timeout: 15,
        })
      } catch (callErr) {
        console.error('Erro de rede ao chamar SpinCare (patients/search):', callErr)
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
        })
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error('SpinCare retornou status', res.statusCode, 'em patients/search')
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. O sistema externo respondeu com erro (' +
            res.statusCode +
            '). Tente novamente em instantes.',
        })
      }

      let rawData = {}
      try {
        rawData = res.json || JSON.parse(res.raw || '{}')
      } catch (_) {
        rawData = {}
      }

      let rawList = []
      if (Array.isArray(rawData)) rawList = rawData
      else if (Array.isArray(rawData.items)) rawList = rawData.items
      else if (Array.isArray(rawData.data)) rawList = rawData.data
      else if (Array.isArray(rawData.patients)) rawList = rawData.patients
      else if (Array.isArray(rawData.pacientes)) rawList = rawData.pacientes

      // Normalização centralizada inline de paciente
      const normalizedList = rawList
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null
          const id = String(
            raw.id ||
              raw.patientId ||
              raw.patient_id ||
              raw.codigo ||
              raw.cd_paciente ||
              raw.id_paciente ||
              raw.prontuario ||
              '',
          )
          const nome = String(
            raw.nome ||
              raw.name ||
              raw.patientName ||
              raw.patient_name ||
              raw.nome_completo ||
              raw.nm_paciente ||
              '—',
          ).trim()
          const doc = String(
            raw.documento ||
              raw.cpf ||
              raw.document ||
              raw.rg ||
              raw.nr_documento ||
              raw.nr_cpf ||
              raw.prontuario ||
              '—',
          ).trim()
          const dtNasc = String(
            raw.dataNascimento ||
              raw.data_nascimento ||
              raw.birthDate ||
              raw.birth_date ||
              raw.dt_nascimento ||
              '—',
          ).trim()
          const tel = String(
            raw.telefone ||
              raw.phone ||
              raw.celular ||
              raw.mobile ||
              raw.nr_telefone ||
              raw.contato ||
              '—',
          ).trim()
          const emailP = String(raw.email || raw.mail || raw.ds_email || '—').trim()
          const endereco = String(
            raw.endereco || raw.address || raw.logradouro || raw.ds_endereco || raw.cidade || '—',
          ).trim()
          const convenio = String(
            raw.convenio || raw.operadora || raw.insurance || raw.plano || raw.ds_convenio || '—',
          ).trim()
          const status = String(
            raw.status ||
              raw.statusAtendimento ||
              raw.status_atendimento ||
              raw.situacao ||
              'Ativo',
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
            statusAtendimento: status,
          }
        })
        .filter(Boolean)

      // Gravação na trilha de auditoria (LGPD: sem dados do paciente, apenas quantitativo)
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
      } catch (logErr) {}

      return e.json(200, {
        total: rawData.total || rawData.totalItems || rawData.count || normalizedList.length,
        page: page,
        limit: limit,
        items: normalizedList,
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
      const email = (authUser.getString('email') || '').toLowerCase()
      const isAdmin = role === 'admin' || email === 'fernandofernandes@helpvida.com.br'

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
      const baseUrl = (cfgRec.getString('base_url') || '').trim().replace(/\/+$/, '')
      const apiToken = (cfgRec.getString('api_token') || '').trim()
      const authType = cfgRec.getString('auth_type') || 'bearer'
      const headerName = cfgRec.getString('header_name') || 'Authorization'
      const tokenPrefix = cfgRec.getString('token_prefix') || 'Bearer '
      const endpointPatients = (cfgRec.getString('endpoint_patients') || '/v1/patients').trim()
      const endpointBudgets = (cfgRec.getString('endpoint_budgets') || '/v1/budgets').trim()

      if (!baseUrl || !apiToken) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const reqHeaders = {
        Accept: 'application/json',
        'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
      }
      if (authType === 'bearer') {
        reqHeaders[headerName || 'Authorization'] = (tokenPrefix || 'Bearer ') + apiToken
      } else if (authType === 'api_key_header') {
        reqHeaders[headerName || 'X-API-Key'] = (tokenPrefix || '') + apiToken
      } else if (authType === 'basic') {
        reqHeaders['Authorization'] = (tokenPrefix || 'Basic ') + apiToken
      }

      // 1. Busca ficha do paciente
      const normalizedPathPatient = endpointPatients.startsWith('/')
        ? endpointPatients
        : '/' + endpointPatients
      const patientUrl = baseUrl + normalizedPathPatient + '/' + encodeURIComponent(patientId)

      let resPatient
      try {
        resPatient = $http.send(patientUrl, {
          method: 'GET',
          headers: reqHeaders,
          timeout: 15,
        })
      } catch (errCall) {
        console.error('Erro de conexão ao consultar paciente:', errCall)
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
        })
      }

      if (resPatient.statusCode === 404) {
        return e.json(404, { message: 'Paciente não localizado no sistema SpinCare.' })
      }

      if (resPatient.statusCode < 200 || resPatient.statusCode >= 300) {
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. O sistema externo respondeu com status ' +
            resPatient.statusCode +
            '.',
        })
      }

      let rawPatientData = {}
      try {
        rawPatientData = resPatient.json || JSON.parse(resPatient.raw || '{}')
      } catch (_) {
        rawPatientData = {}
      }
      if (rawPatientData.data && typeof rawPatientData.data === 'object') {
        rawPatientData = rawPatientData.data
      }

      const normalizedPatient = {
        id: String(
          rawPatientData.id ||
            rawPatientData.patientId ||
            rawPatientData.patient_id ||
            rawPatientData.codigo ||
            patientId,
        ),
        nome: String(
          rawPatientData.nome ||
            rawPatientData.name ||
            rawPatientData.patientName ||
            rawPatientData.nome_completo ||
            '—',
        ).trim(),
        documento: String(
          rawPatientData.documento ||
            rawPatientData.cpf ||
            rawPatientData.document ||
            rawPatientData.rg ||
            '—',
        ).trim(),
        dataNascimento: String(
          rawPatientData.dataNascimento ||
            rawPatientData.data_nascimento ||
            rawPatientData.birthDate ||
            '—',
        ).trim(),
        telefone: String(
          rawPatientData.telefone || rawPatientData.phone || rawPatientData.celular || '—',
        ).trim(),
        email: String(rawPatientData.email || rawPatientData.mail || '—').trim(),
        endereco: String(
          rawPatientData.endereco || rawPatientData.address || rawPatientData.logradouro || '—',
        ).trim(),
        convenio: String(
          rawPatientData.convenio || rawPatientData.operadora || rawPatientData.insurance || '—',
        ).trim(),
        statusAtendimento: String(
          rawPatientData.status || rawPatientData.statusAtendimento || 'Ativo',
        ).trim(),
      }

      // 2. Busca orçamentos deste paciente no SpinCare
      let orcamentos = []
      try {
        const normalizedPathBudgets = endpointBudgets.startsWith('/')
          ? endpointBudgets
          : '/' + endpointBudgets
        const budgetsUrl =
          baseUrl +
          normalizedPathBudgets +
          '?patient_id=' +
          encodeURIComponent(patientId) +
          '&paciente_id=' +
          encodeURIComponent(patientId) +
          '&status=Aprovado&limit=50'

        const resBudgets = $http.send(budgetsUrl, {
          method: 'GET',
          headers: reqHeaders,
          timeout: 15,
        })

        if (resBudgets.statusCode >= 200 && resBudgets.statusCode < 300) {
          let rawBudgets = {}
          try {
            rawBudgets = resBudgets.json || JSON.parse(resBudgets.raw || '{}')
          } catch (_) {
            rawBudgets = {}
          }
          let list = []
          if (Array.isArray(rawBudgets)) list = rawBudgets
          else if (Array.isArray(rawBudgets.items)) list = rawBudgets.items
          else if (Array.isArray(rawBudgets.data)) list = rawBudgets.data
          else if (Array.isArray(rawBudgets.budgets)) list = rawBudgets.budgets
          else if (Array.isArray(rawBudgets.orcamentos)) list = rawBudgets.orcamentos

          orcamentos = list
            .map((raw) => {
              if (!raw || typeof raw !== 'object') return null
              const bid = String(
                raw.id || raw.budgetId || raw.budget_id || raw.codigo || raw.numero || '',
              )
              const bnum = String(
                raw.numero || raw.number || raw.budgetNumber || raw.protocolo || bid || '—',
              ).trim()
              const bstatus = String(raw.status || raw.situacao || 'Aprovado').trim()
              const bdata = String(
                raw.dataAprovacao ||
                  raw.data_aprovacao ||
                  raw.approvedAt ||
                  raw.data ||
                  raw.created ||
                  '—',
              ).trim()

              let valor = 0
              const rawV =
                raw.valor || raw.valorTotal || raw.valor_total || raw.total || raw.amount || 0
              if (typeof rawV === 'number') valor = rawV
              else if (typeof rawV === 'string') {
                const cl = rawV.replace(/[^\d.,-]/g, '').replace(',', '.')
                valor = parseFloat(cl) || 0
              }

              let ano = null
              if (bdata && bdata !== '—') {
                const mIso = bdata.match(/^(\d{4})/)
                if (mIso) ano = parseInt(mIso[1], 10)
                else {
                  const mBr = bdata.match(/\/(\d{4})/)
                  if (mBr) ano = parseInt(mBr[1], 10)
                }
              }

              const obs = String(raw.observacao || raw.notes || raw.description || '—').trim()

              let itens = []
              const rawIt = raw.itens || raw.items || []
              if (Array.isArray(rawIt)) {
                itens = rawIt.map((it) => {
                  if (typeof it === 'string') return { descricao: it, quantidade: 1, valor: 0 }
                  return {
                    descricao: String(it.descricao || it.nome || it.item || 'Item sem descrição'),
                    quantidade: Number(it.quantidade || it.qtd || 1),
                    valorUnitario: Number(it.valorUnitario || it.preco || 0),
                    valorTotal: Number(it.valorTotal || it.total || 0),
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
                observacao: obs,
                itens: itens,
              }
            })
            .filter(Boolean)
        }
      } catch (errBudgets) {
        console.warn('Aviso: falha ao buscar orçamentos do paciente:', errBudgets)
      }

      // Trilha de auditoria LGPD: registra o ID do paciente (sem expor CPF ou dados clínicos)
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
      } catch (logErr) {}

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
      const email = (authUser.getString('email') || '').toLowerCase()
      const isAdmin = role === 'admin' || email === 'fernandofernandes@helpvida.com.br'

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
      const baseUrl = (cfgRec.getString('base_url') || '').trim().replace(/\/+$/, '')
      const apiToken = (cfgRec.getString('api_token') || '').trim()
      const authType = cfgRec.getString('auth_type') || 'bearer'
      const headerName = cfgRec.getString('header_name') || 'Authorization'
      const tokenPrefix = cfgRec.getString('token_prefix') || 'Bearer '
      const endpointBudgets = (cfgRec.getString('endpoint_budgets') || '/v1/budgets').trim()

      if (!baseUrl || !apiToken) {
        return e.json(503, {
          configured: false,
          message:
            'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.',
        })
      }

      const info = e.requestInfo()
      const queryParams = info.query || {}

      // Filtro padrão: data >= 2026-01-01 conforme requisito do usuário
      const startDate = (queryParams.start_date || '2026-01-01').trim()
      const endDate = (queryParams.end_date || '').trim()
      const statusFilter = (queryParams.status || 'Aprovado').trim()
      const search = (queryParams.search || '').trim()
      const patientId = (queryParams.patient_id || '').trim()
      const limit = Math.min(Math.max(parseInt(queryParams.limit, 10) || 50, 1), 100)
      const page = Math.max(parseInt(queryParams.page, 10) || 1, 1)

      const params = []
      if (startDate) params.push('start_date=' + encodeURIComponent(startDate))
      if (endDate) params.push('end_date=' + encodeURIComponent(endDate))
      if (statusFilter) params.push('status=' + encodeURIComponent(statusFilter))
      if (patientId) params.push('patient_id=' + encodeURIComponent(patientId))
      if (search) params.push('q=' + encodeURIComponent(search))
      params.push('limit=' + limit)
      params.push('page=' + page)

      const normalizedPath = endpointBudgets.startsWith('/')
        ? endpointBudgets
        : '/' + endpointBudgets
      const fullUrl = baseUrl + normalizedPath + '?' + params.join('&')

      const reqHeaders = {
        Accept: 'application/json',
        'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
      }
      if (authType === 'bearer') {
        reqHeaders[headerName || 'Authorization'] = (tokenPrefix || 'Bearer ') + apiToken
      } else if (authType === 'api_key_header') {
        reqHeaders[headerName || 'X-API-Key'] = (tokenPrefix || '') + apiToken
      } else if (authType === 'basic') {
        reqHeaders['Authorization'] = (tokenPrefix || 'Basic ') + apiToken
      }

      let res
      try {
        res = $http.send(fullUrl, {
          method: 'GET',
          headers: reqHeaders,
          timeout: 15,
        })
      } catch (callErr) {
        console.error('Erro ao chamar SpinCare (budgets):', callErr)
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
        })
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error('SpinCare retornou status', res.statusCode, 'em budgets')
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. O sistema externo respondeu com status ' +
            res.statusCode +
            '.',
        })
      }

      let rawData = {}
      try {
        rawData = res.json || JSON.parse(res.raw || '{}')
      } catch (_) {
        rawData = {}
      }

      let rawList = []
      if (Array.isArray(rawData)) rawList = rawData
      else if (Array.isArray(rawData.items)) rawList = rawData.items
      else if (Array.isArray(rawData.data)) rawList = rawData.data
      else if (Array.isArray(rawData.budgets)) rawList = rawData.budgets
      else if (Array.isArray(rawData.orcamentos)) rawList = rawData.orcamentos

      let normalizedList = rawList
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null
          const id = String(
            raw.id || raw.budgetId || raw.budget_id || raw.codigo || raw.numero || '',
          )
          const numero = String(
            raw.numero || raw.number || raw.budgetNumber || raw.protocolo || id || '—',
          ).trim()

          let pid = ''
          let pnome = '—'
          if (raw.paciente && typeof raw.paciente === 'object') {
            pid = String(raw.paciente.id || raw.paciente.codigo || '')
            pnome = String(raw.paciente.nome || raw.paciente.name || '—')
          } else {
            pid = String(raw.pacienteId || raw.paciente_id || raw.patientId || '')
            pnome = String(raw.pacienteNome || raw.paciente_nome || raw.patientName || '—')
          }

          const status = String(raw.status || raw.situacao || 'Aprovado').trim()
          const dataAprovacao = String(
            raw.dataAprovacao ||
              raw.data_aprovacao ||
              raw.approvedAt ||
              raw.data ||
              raw.created ||
              '—',
          ).trim()

          let valor = 0
          const rawV =
            raw.valor || raw.valorTotal || raw.valor_total || raw.total || raw.amount || 0
          if (typeof rawV === 'number') valor = rawV
          else if (typeof rawV === 'string') {
            const cl = rawV.replace(/[^\d.,-]/g, '').replace(',', '.')
            valor = parseFloat(cl) || 0
          }

          let ano = null
          if (dataAprovacao && dataAprovacao !== '—') {
            const mIso = dataAprovacao.match(/^(\d{4})/)
            if (mIso) ano = parseInt(mIso[1], 10)
            else {
              const mBr = dataAprovacao.match(/\/(\d{4})/)
              if (mBr) ano = parseInt(mBr[1], 10)
            }
          }

          const observacao = String(raw.observacao || raw.notes || raw.description || '—').trim()

          let itens = []
          const rawIt = raw.itens || raw.items || []
          if (Array.isArray(rawIt)) {
            itens = rawIt.map((it) => {
              if (typeof it === 'string') return { descricao: it, quantidade: 1, valor: 0 }
              return {
                descricao: String(it.descricao || it.nome || it.item || 'Item sem descrição'),
                quantidade: Number(it.quantidade || it.qtd || 1),
                valorUnitario: Number(it.valorUnitario || it.preco || 0),
                valorTotal: Number(it.valorTotal || it.total || 0),
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

      // Garantir filtro no middleware caso o SpinCare retorne itens anteriores a 2026
      if (startDate.startsWith('2026')) {
        normalizedList = normalizedList.filter((b) => {
          if (!b.anoAprovacao) return true
          return b.anoAprovacao >= 2026
        })
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
      } catch (logErr) {}

      return e.json(200, {
        total: rawData.total || rawData.totalItems || rawData.count || normalizedList.length,
        startDate: startDate,
        endDate: endDate,
        statusFilter: statusFilter,
        page: page,
        limit: limit,
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
