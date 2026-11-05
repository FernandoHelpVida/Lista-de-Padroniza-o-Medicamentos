// Diagnóstico temporário do fluxo de e-mails transacionais (redefinição de senha).
// Rotas protegidas por chave (EMAIL_DIAG_KEY) para não ficarem abertas.
// Nota: JSVM do PocketBase executa cada callback em escopo próprio — lógica inline.

routerAdd('GET', '/backend/v1/admin/email-diagnostics', (e) => {
  const query = e.requestInfo().query || {}
  const key = query['key'] || ''
  const expected = $os.getenv('EMAIL_DIAG_KEY') || ''
  if (!expected || key !== expected) {
    return e.json(403, {
      error: 'Chave de diagnóstico inválida.',
      expectedEmpty: !expected,
    })
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
})

// GET /backend/v1/admin/email-diagnostics/send-reset?key=...&email=...
// Dispara o MESMO fluxo do app (request password reset) para o endereço informado.
// NÃO altera senha de ninguém — apenas gera o token e envia o e-mail oficial.
routerAdd('GET', '/backend/v1/admin/email-diagnostics/send-reset', (e) => {
  const query = e.requestInfo().query || {}
  const key = query['key'] || ''
  const expected = $os.getenv('EMAIL_DIAG_KEY') || ''
  if (!expected || key !== expected) {
    return e.json(403, { error: 'Chave de diagnóstico inválida.' })
  }
  const email = (query['email'] || '').trim().toLowerCase()
  if (!email) {
    return e.json(400, { error: 'Informe ?email= para enviar o teste.' })
  }
  let record
  try {
    record = e.app.findAuthRecordByEmail('_pb_users_auth_', email)
  } catch (_) {
    return e.json(404, { error: 'Nenhum usuário encontrado com este e-mail.' })
  }
  try {
    record.requestPasswordReset()
    e.json(200, { ok: true, message: 'Fluxo de redefinição disparado para ' + email + '.' })
  } catch (err) {
    console.error('[Email Diag] Falha no requestPasswordReset:', err)
    e.json(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
})
