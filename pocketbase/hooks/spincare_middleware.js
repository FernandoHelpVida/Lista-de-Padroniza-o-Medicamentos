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
  'GET',
  '/backend/v1/spincare/config',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const role = authUser.getString('role') || 'comum'
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
      const limit = Math.min(Math.max(parseInt(body.limit, 10) || 50, 1), 100)
      const page = Math.max(parseInt(body.page, 10) || 1, 1)

      const normalizedPath = endpointPatients.startsWith('/')
        ? endpointPatients
        : '/' + endpointPatients
      let fullUrl =
        baseUrl +
        normalizedPath +
        '?page_number=' +
        page +
        '&page_size=' +
        limit +
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

      let res
      try {
        res = $http.send({
          url: fullUrl,
          method: 'GET',
          headers: reqHeaders,
          timeout: 20,
        })
      } catch (callErr) {
        console.error('Erro de rede ao chamar SpinCare (patients/search):', callErr)
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
        })
      }

      // Se retornou 401, tenta re-autenticar uma vez
      if (res.statusCode === 401 && login && password) {
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
                page +
                '&page_size=' +
                limit +
                '&token=' +
                encodeURIComponent(apiToken)
              if (query) retryUrl += '&name=' + encodeURIComponent(query)
              if (documento) retryUrl += '&registration_number=' + encodeURIComponent(documento)

              res = $http.send({
                url: retryUrl,
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                  Authorization: 'Bearer ' + apiToken,
                  'User-Agent': 'HelpVida-SpinCare-Middleware/1.0',
                },
                timeout: 20,
              })
            }
          }
        } catch (_) {}
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error('SpinCare retornou status ' + res.statusCode + ' em get/patients')
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. O sistema externo respondeu com erro (' +
            res.statusCode +
            '). Tente novamente em instantes.',
        })
      }

      let rawData = []
      try {
        rawData = res.json || JSON.parse(res.raw || '[]')
      } catch (_) {
        rawData = []
      }

      let rawList = []
      if (Array.isArray(rawData)) rawList = rawData
      else if (rawData && Array.isArray(rawData.items)) rawList = rawData.items
      else if (rawData && Array.isArray(rawData.data)) rawList = rawData.data
      else if (rawData && typeof rawData === 'object') rawList = [rawData]

      // Mapeamento tolerante dos pacientes
      let normalizedList = rawList
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null

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

          const convenio = String(
            raw.insurance_name || raw.insurance || raw.convenio || raw.operadora || '—',
          ).trim()

          const modalidade = String(
            raw.modality ||
              raw.modalidade ||
              raw.attendance_type ||
              raw.attendance_regime ||
              raw.regime ||
              raw.tipo_atendimento ||
              raw.plano ||
              raw.insurance_plan_name ||
              '—',
          ).trim()

          let statusAtendimento = 'Ativo'
          if (raw.active === false || raw.status === 'Inativo' || raw.status === 'inativo') {
            statusAtendimento = 'Inativo'
          } else if (raw.status) {
            statusAtendimento = String(raw.status)
          }

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
            statusAtendimento: statusAtendimento,
          }
        })
        .filter(Boolean)

      // Filtro local complementar
      if (query) {
        const qUpper = query.toUpperCase()
        normalizedList = normalizedList.filter((p) => p.nome.toUpperCase().includes(qUpper))
      }
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
          rawPatient.insurance_name || rawPatient.convenio || rawPatient.insurance || '—',
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
              const rawIt = raw.items || raw.itens || []
              if (Array.isArray(rawIt)) {
                itens = rawIt.map((it) => {
                  if (typeof it === 'string') return { descricao: it, quantidade: 1, valor: 0 }
                  return {
                    descricao: String(
                      it.description ||
                        it.product_description ||
                        it.descricao ||
                        it.item ||
                        'Item de Orçamento',
                    ),
                    quantidade: Number(it.quantity || it.qtd || 1),
                    valorUnitario: Number(it.unitary_value || it.valorUnitario || 0),
                    valorTotal: Number(
                      it.total ||
                        it.cost ||
                        Number(it.quantity || 1) * Number(it.unitary_value || 0),
                    ),
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
                observacao: raw.insurance_name ? 'Convênio: ' + raw.insurance_name : '—',
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
      const limit = Math.min(Math.max(parseInt(queryParams.limit, 10) || 100, 1), 200)
      const page = Math.max(parseInt(queryParams.page, 10) || 1, 1)

      const normalizedPath = endpointBudgets.startsWith('/')
        ? endpointBudgets
        : '/' + endpointBudgets
      let fullUrl =
        baseUrl +
        normalizedPath +
        '?page_number=' +
        page +
        '&page_size=' +
        limit +
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

      let res
      try {
        res = $http.send({
          url: fullUrl,
          method: 'GET',
          headers: reqHeaders,
          timeout: 20,
        })
      } catch (callErr) {
        console.error('Erro ao chamar SpinCare (budgets):', callErr)
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. Verifique a configuração da integração ou tente novamente em instantes.',
        })
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error('SpinCare retornou status ' + res.statusCode + ' em budgets')
        return e.json(502, {
          message:
            'Não foi possível consultar o SpinCare agora. O sistema externo respondeu com status ' +
            res.statusCode +
            '.',
        })
      }

      let rawData = []
      try {
        rawData = res.json || JSON.parse(res.raw || '[]')
      } catch (_) {
        rawData = []
      }

      let rawList = []
      if (Array.isArray(rawData)) rawList = rawData
      else if (rawData && Array.isArray(rawData.items)) rawList = rawData.items
      else if (rawData && typeof rawData === 'object') rawList = [rawData]

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

          const observacao = raw.insurance_name
            ? 'Convênio: ' + raw.insurance_name
            : raw.observacao || '—'

          let itens = []
          const rawIt = raw.items || raw.itens || []
          if (Array.isArray(rawIt)) {
            itens = rawIt.map((it) => {
              if (typeof it === 'string') return { descricao: it, quantidade: 1, valor: 0 }
              return {
                descricao: String(
                  it.description ||
                    it.product_description ||
                    it.descricao ||
                    it.item ||
                    'Item de Orçamento',
                ),
                quantidade: Number(it.quantity || it.qtd || 1),
                valorUnitario: Number(it.unitary_value || it.valorUnitario || 0),
                valorTotal: Number(
                  it.total || it.cost || Number(it.quantity || 1) * Number(it.unitary_value || 0),
                ),
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
