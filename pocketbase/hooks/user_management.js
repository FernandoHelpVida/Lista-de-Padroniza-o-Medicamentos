routerAdd(
  'POST',
  '/backend/v1/admin/create-user',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const isUserAdmin =
        authUser.getString('role') === 'admin' ||
        authUser.getString('email').toLowerCase() === 'fernandofernandes@helpvida.com.br'

      if (!isUserAdmin) {
        return e.forbiddenError(
          'Apenas administradores da comissão Help Vida podem cadastrar colegas.',
        )
      }

      const body = e.requestInfo().body || {}
      const name = (body.name || '').trim()
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      let role = 'comum'
      if (body.role === 'admin') role = 'admin'
      else if (body.role === 'medico_visitador') role = 'medico_visitador'
      else if (body.role === 'financeiro') role = 'financeiro'

      if (!name) {
        return e.badRequestError('O nome completo do profissional é obrigatório.')
      }

      if (!email || !email.includes('@')) {
        return e.badRequestError('Informe um e-mail institucional válido.')
      }

      if (!password || password.length < 8) {
        return e.badRequestError('A senha inicial provisória deve conter no mínimo 8 caracteres.')
      }

      const usersCol = e.app.findCollectionByNameOrId('_pb_users_auth_')

      // Verificar se e-mail já existe
      try {
        const existing = e.app.findAuthRecordByEmail('_pb_users_auth_', email)
        if (existing) {
          return e.badRequestError(
            'Este e-mail institucional já se encontra cadastrado no sistema Help Vida.',
          )
        }
      } catch (_) {
        // Usuário não existe, tudo certo para criar
      }

      const record = new Record(usersCol)
      record.setEmail(email)
      record.setPassword(password)
      record.setVerified(true)
      record.set('name', name)
      record.set('role', role)
      record.set('approval_status', 'aprovado')

      e.app.save(record)

      // Registrar log de auditoria da criação direta pelo admin
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'users')
        auditRecord.set('registro_id', record.id)
        auditRecord.set('acao', 'USUARIO_CRIADO_ADMIN')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'admin')
        auditRecord.set('status_anterior', '')
        auditRecord.set('status_novo', 'aprovado')
        auditRecord.set(
          'detalhes',
          'Conta cadastrada diretamente pelo administrador para o colega: ' +
            name +
            ' (' +
            email +
            ')',
        )
        e.app.save(auditRecord)
      } catch (errLog) {
        console.error('Erro ao gravar log de auditoria na criação pelo admin:', errLog)
      }

      return e.json(200, {
        id: record.id,
        name: record.getString('name'),
        email: record.getString('email'),
        role: record.getString('role'),
        approval_status: record.getString('approval_status'),
        verified: record.getBool('verified'),
        created: record.getString('created'),
      })
    } catch (err) {
      console.error('Erro ao criar colega na rota administrativa:', err)
      return e.badRequestError(
        err instanceof Error ? err.message : 'Falha ao criar conta de colega.',
      )
    }
  },
  $apis.requireAuth(),
)

// Rota para exclusão da própria conta (Direito do Titular LGPD)
routerAdd(
  'POST',
  '/backend/v1/user/delete-account',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado.')
      }

      // Proteger admin principal contra exclusão acidental
      if (authUser.getString('email').toLowerCase() === 'fernandofernandes@helpvida.com.br') {
        return e.badRequestError(
          'A conta do administrador principal da Help Vida não pode ser excluída.',
        )
      }

      const userId = authUser.id

      // LGPD: anonimizar ou remover referências vinculadas antes de deletar o usuário
      // 1. Desvincular em historico_importacoes
      try {
        e.app
          .db()
          .newQuery('UPDATE historico_importacoes SET usuario = NULL WHERE usuario = {:userId}')
          .bind({ userId })
          .execute()
      } catch (err) {
        console.error('Aviso ao desvincular histórico:', err)
      }

      // 2. Deletar solicitações pendentes deste usuário ou mantê-las se necessário;
      // Para conformidade completa LGPD pelo titular, removemos ou mantemos com base na solicitação.
      // Aqui deletamos as solicitações do próprio usuário titular:
      try {
        e.app
          .db()
          .newQuery('DELETE FROM solicitacoes WHERE solicitante = {:userId}')
          .bind({ userId })
          .execute()
      } catch (err) {
        console.error('Aviso ao remover solicitações do usuário:', err)
      }

      // 3. Excluir o registro do usuário
      e.app.delete(authUser)

      return e.json(200, {
        success: true,
        message: 'Sua conta e dados pessoais foram excluídos conforme a LGPD.',
      })
    } catch (err) {
      console.error('Erro ao excluir conta do usuário:', err)
      return e.badRequestError(
        err instanceof Error ? err.message : 'Falha ao processar exclusão da conta.',
      )
    }
  },
  $apis.requireAuth(),
)

// -------------------------------------------------------------
// ROTA ADMINISTRATIVA: APROVAR OU NEGAR CADASTRO DE USUÁRIO
// -------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/admin/review-user',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      const isUserAdmin =
        authUser.getString('role') === 'admin' ||
        authUser.getString('email').toLowerCase() === 'fernandofernandes@helpvida.com.br'

      if (!isUserAdmin) {
        return e.forbiddenError(
          'Apenas administradores da comissão Help Vida podem avaliar cadastros.',
        )
      }

      const body = e.requestInfo().body || {}
      const targetUserId = (body.userId || '').trim()
      const decision = (body.decision || '').trim().toLowerCase() // 'aprovar' | 'negar'
      const requestedRole = (body.role || '').trim().toLowerCase()

      if (!targetUserId) {
        return e.badRequestError('ID do usuário a ser avaliado é obrigatório.')
      }

      if (decision !== 'aprovar' && decision !== 'negar') {
        return e.badRequestError("Decisão inválida. Utilize 'aprovar' ou 'negar'.")
      }

      // Se a decisão for 'aprovar', o perfil de acesso é obrigatório e deve ser válido
      let assignedRole = null
      if (decision === 'aprovar') {
        if (!requestedRole) {
          return e.badRequestError(
            'É obrigatório definir o nível de acesso (perfil) do usuário antes da aprovação.',
          )
        }
        if (
          requestedRole !== 'comum' &&
          requestedRole !== 'medico_visitador' &&
          requestedRole !== 'financeiro' &&
          requestedRole !== 'admin'
        ) {
          return e.badRequestError(
            'Perfil de acesso inválido. Escolha entre Corpo Clínico, Médico Visitador, Financeiro ou Administrador.',
          )
        }
        assignedRole = requestedRole
      }

      let targetUser
      try {
        targetUser = e.app.findRecordById('_pb_users_auth_', targetUserId)
      } catch (_) {
        return e.notFoundError('Usuário não localizado no sistema Help Vida.')
      }

      // Proteger admin principal
      if (targetUser.getString('email').toLowerCase() === 'fernandofernandes@helpvida.com.br') {
        return e.badRequestError(
          'A conta do administrador principal não pode ter seu status alterado.',
        )
      }

      const statusAnterior = targetUser.getString('approval_status') || 'pendente'
      const roleAnterior = targetUser.getString('role') || 'comum'
      const novoStatus = decision === 'aprovar' ? 'aprovado' : 'negado'

      targetUser.set('approval_status', novoStatus)
      if (decision === 'aprovar') {
        // Atribuir efetivamente o papel escolhido pelo administrador
        targetUser.set('role', assignedRole)
        // Ao aprovar, marcar também como verified para garantir acesso sem bloqueios
        targetUser.setVerified(true)
      }

      e.app.save(targetUser)

      // Nome amigável do perfil para os detalhes de auditoria
      const roleLabels = {
        admin: 'Administrador (Gestão / Farmácia)',
        medico_visitador: 'Médico Visitador (Apenas Padronizados)',
        financeiro: 'Financeiro (Relatórios de Orçamentos)',
        comum: 'Corpo Clínico (Médico / Farmacêutico)',
      }
      const roleLabel = assignedRole ? roleLabels[assignedRole] || assignedRole : roleAnterior

      // Registrar log de auditoria institucional com o perfil atribuído
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRecord = new Record(auditCol)
        auditRecord.set('colecao', 'users')
        auditRecord.set('registro_id', targetUser.id)
        auditRecord.set('acao', decision === 'aprovar' ? 'CADASTRO_APROVADO' : 'CADASTRO_NEGADO')
        auditRecord.set('usuario', authUser.id)
        auditRecord.set('usuario_nome', authUser.getString('name') || '')
        auditRecord.set('usuario_email', authUser.getString('email') || '')
        auditRecord.set('usuario_role', authUser.getString('role') || 'admin')
        auditRecord.set('status_anterior', statusAnterior + ' (perfil: ' + roleAnterior + ')')
        auditRecord.set(
          'status_novo',
          novoStatus + (decision === 'aprovar' ? ' (perfil: ' + assignedRole + ')' : ''),
        )
        auditRecord.set(
          'detalhes',
          (decision === 'aprovar'
            ? 'Cadastro aprovado com perfil [' + roleLabel + '] pelo administrador para: '
            : 'Cadastro negado pelo administrador para: ') +
            targetUser.getString('name') +
            ' (' +
            targetUser.getString('email') +
            ')',
        )
        e.app.save(auditRecord)
      } catch (errLog) {
        console.error('Erro ao registrar log de auditoria da avaliação:', errLog)
      }

      return e.json(200, {
        success: true,
        userId: targetUser.id,
        approval_status: novoStatus,
        role: targetUser.getString('role'),
        message:
          decision === 'aprovar'
            ? 'Acesso liberado com sucesso com perfil ' + roleLabel + '.'
            : 'Cadastro negado e acesso bloqueado.',
      })
    } catch (err) {
      console.error('Erro ao avaliar cadastro de usuário:', err)
      return e.badRequestError(
        err instanceof Error ? err.message : 'Falha ao processar avaliação do cadastro.',
      )
    }
  },
  $apis.requireAuth(),
)

// -------------------------------------------------------------
// HOOK ON RECORD BEFORE CREATE: Garantir status default 'pendente'
// em auto-cadastros públicos, preservando criação por admin
// -------------------------------------------------------------
onRecordCreateRequest((e) => {
  try {
    const record = e.record
    const authUser = e.auth
    const email = record.getString('email').toLowerCase()

    // O admin principal da Help Vida nunca fica pendente
    if (email === 'fernandofernandes@helpvida.com.br') {
      record.set('approval_status', 'aprovado')
      record.set('role', 'admin')
      return e.next()
    }

    // Se a criação for feita por um administrador autenticado, permitir 'aprovado'
    const isAdminCreator =
      authUser &&
      (authUser.getString('role') === 'admin' ||
        authUser.getString('email').toLowerCase() === 'fernandofernandes@helpvida.com.br')

    if (isAdminCreator) {
      const explicitStatus = record.getString('approval_status')
      if (!explicitStatus) {
        record.set('approval_status', 'aprovado')
      }
      return e.next()
    }

    // Para qualquer auto-cadastro público (/cadastro), forçar 'pendente' e role 'comum'
    record.set('approval_status', 'pendente')
    record.set('role', 'comum')
  } catch (err) {
    console.error('Erro no hook onRecordCreateRequest users:', err)
  }
  return e.next()
}, 'users')

// -------------------------------------------------------------
// HOOK ON RECORD AFTER CREATE: Registrar log de auditoria
// quando uma conta é criada aguardando aprovação
// -------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  try {
    const record = e.record
    const status = record.getString('approval_status') || 'pendente'

    const auditCol = e.app.findCollectionByNameOrId('audit_logs')
    const auditRecord = new Record(auditCol)
    auditRecord.set('colecao', 'users')
    auditRecord.set('registro_id', record.id)
    auditRecord.set('acao', status === 'pendente' ? 'CADASTRO_SOLICITADO' : 'USUARIO_CRIADO')
    auditRecord.set('usuario', record.id)
    auditRecord.set('usuario_nome', record.getString('name') || '')
    auditRecord.set('usuario_email', record.getString('email') || '')
    auditRecord.set('usuario_role', record.getString('role') || 'comum')
    auditRecord.set('status_anterior', '')
    auditRecord.set('status_novo', status)
    auditRecord.set(
      'detalhes',
      status === 'pendente'
        ? 'Nova conta criada via auto-cadastro aguardando aprovação da comissão'
        : 'Nova conta criada com acesso direto liberado',
    )

    e.app.save(auditRecord)
  } catch (err) {
    console.error('Erro no hook onRecordAfterCreateSuccess users:', err)
  } finally {
    e.next()
  }
}, 'users')

// -------------------------------------------------------------
// HOOK ON RECORD AUTH REQUEST: Bloquear login de contas
// pendentes ou negadas com mensagens institucionais claras
// -------------------------------------------------------------
onRecordAuthRequest((e) => {
  try {
    const record = e.record
    if (!record) {
      return e.next()
    }

    const email = record.getString('email').toLowerCase()
    // O admin principal da Help Vida sempre tem acesso liberado
    if (email === 'fernandofernandes@helpvida.com.br') {
      return e.next()
    }

    const status = record.getString('approval_status') || 'pendente'

    if (status === 'pendente') {
      return e.forbiddenError(
        'Sua conta foi criada e está aguardando aprovação do administrador da Help Vida. Você será avisado por e-mail quando o acesso for liberado.',
      )
    }

    if (status === 'negado') {
      return e.forbiddenError(
        'Seu cadastro não foi autorizado. Contate o administrador da Help Vida.',
      )
    }
  } catch (err) {
    // Se foi lançado forbiddenError ou outro erro proposital, propagar
    if (err && typeof err === 'object' && 'status' in err) {
      throw err
    }
    console.error('Erro no hook onRecordAuthRequest users:', err)
  }
  return e.next()
}, 'users')
