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
      const role = body.role === 'admin' ? 'admin' : 'comum'

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

      e.app.save(record)

      return e.json(200, {
        id: record.id,
        name: record.getString('name'),
        email: record.getString('email'),
        role: record.getString('role'),
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
