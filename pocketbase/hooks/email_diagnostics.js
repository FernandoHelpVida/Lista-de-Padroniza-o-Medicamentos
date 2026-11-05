// Diagnóstico do fluxo de e-mails transacionais (redefinição de senha).
// Autorização alinhada com as demais rotas admin do app: sessão autenticada
// ($apis.requireAuth) + verificação de perfil admin — sem chave via query.
// Nota: JSVM do PocketBase executa cada callback em escopo próprio — lógica inline.

routerAdd(
  'GET',
  '/backend/v1/admin/email-diagnostics',
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
          'Apenas administradores da comissão Help Vida podem acessar o diagnóstico de e-mails.',
        )
      }

      const s = e.app.settings()
      const meta = s.meta || {}
      const smtp = s.smtp || {}
      e.json(200, {
        meta: {
          appName: meta.appName || '',
          appURL: meta.appURL || '',
          senderAddress: meta.senderAddress || '',
          senderName: meta.senderName || '',
        },
        smtp: {
          enabled: Boolean(smtp.enabled),
          host: smtp.host || '',
          port: smtp.port,
          username: smtp.username || '',
          authMethod: smtp.authMethod || '',
          senderAddress: smtp.senderAddress || '',
          senderName: smtp.senderName || '',
          hasPassword: Boolean(smtp.password),
        },
      })
    } catch (err) {
      console.error('Erro no diagnóstico de e-mails:', err)
      return e.badRequestError(
        err instanceof Error ? err.message : 'Falha ao obter diagnóstico de e-mails.',
      )
    }
  },
  $apis.requireAuth(),
)

// GET /backend/v1/admin/email-diagnostics/send-reset?email=...
// Dispara o MESMO fluxo do app (request password reset) para o endereço informado.
// NÃO altera senha de ninguém — apenas gera o token e envia o e-mail oficial.
routerAdd(
  'GET',
  '/backend/v1/admin/email-diagnostics/send-reset',
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
          'Apenas administradores da comissão Help Vida podem disparar o teste de e-mail.',
        )
      }

      const query = e.requestInfo().query || {}
      const email = (query['email'] || '').trim().toLowerCase()
      if (!email) {
        return e.badRequestError('Informe ?email= para enviar o teste.')
      }
      let record
      try {
        record = e.app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {
        return e.notFoundError('Nenhum usuário encontrado com este e-mail.')
      }
      try {
        record.requestPasswordReset()
        e.json(200, { ok: true, message: 'Fluxo de redefinição disparado para ' + email + '.' })
      } catch (err) {
        console.error('[Email Diag] Falha no requestPasswordReset:', err)
        return e.badRequestError(
          'Falha ao disparar o fluxo de redefinição: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    } catch (err) {
      console.error('Erro no send-reset do diagnóstico de e-mails:', err)
      return e.badRequestError(
        err instanceof Error ? err.message : 'Falha no teste de envio de e-mail.',
      )
    }
  },
  $apis.requireAuth(),
)
