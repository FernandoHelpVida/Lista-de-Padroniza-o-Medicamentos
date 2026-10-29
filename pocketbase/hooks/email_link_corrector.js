// Interceptador e normalizador de URLs nos e-mails transacionais enviados pelo PocketBase

function fixEmailLinks(message) {
  if (!message) return

  // Obter URLs do ambiente ou padrões
  const siteUrl = ($os.getenv('SITE_URL') || '').replace(/\/+$/, '')

  const replaceLinks = (content) => {
    if (!content || typeof content !== 'string') return content
    let updated = content

    // 1. Redefinição de senha:
    // Padrão PocketBase: /_/#/auth/confirm-password-reset/{TOKEN} ou /_/#/auth/confirm-password-reset?token={TOKEN}
    updated = updated.replace(
      /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-password-reset\/([a-zA-Z0-9_\-.]+)/g,
      (match, host, token) => {
        const base = siteUrl || host || ''
        return (base ? base : '') + '/redefinir-senha?token=' + token
      },
    )

    // 2. Verificação de e-mail:
    // Padrão PocketBase: /_/#/auth/confirm-verification/{TOKEN}
    updated = updated.replace(
      /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-verification\/([a-zA-Z0-9_\-.]+)/g,
      (match, host, token) => {
        const base = siteUrl || host || ''
        return (base ? base : '') + '/verificar-email?token=' + token
      },
    )

    // 3. Alteração de e-mail:
    // Padrão PocketBase: /_/#/auth/confirm-email-change/{TOKEN}
    updated = updated.replace(
      /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-email-change\/([a-zA-Z0-9_\-.]+)/g,
      (match, host, token) => {
        const base = siteUrl || host || ''
        return (base ? base : '') + '/confirmar-email?token=' + token
      },
    )

    // 4. Se houver {APP_URL} que aponte para o backend (ex: *.shrd01.internal.goskip.dev)
    // e SITE_URL estiver definido, substituir o host para o frontend do app
    if (siteUrl) {
      updated = updated.replace(
        /https?:\/\/[a-zA-Z0-9.\-_]+(?::\d+)?(\/(?:redefinir-senha|verificar-email|confirmar-email)[^\s"'<>]*)/g,
        siteUrl + '$1',
      )
    }

    return updated
  }

  if (message.html) {
    message.html = replaceLinks(message.html)
  }
  if (message.text) {
    message.text = replaceLinks(message.text)
  }
}

// Hook quando o e-mail de redefinição de senha é enviado
onMailerRecordPasswordResetSend((e) => {
  try {
    fixEmailLinks(e.message)
  } catch (err) {
    console.error('Erro no hook onMailerRecordPasswordResetSend:', err)
  }
  e.next()
})

// Hook quando o e-mail de verificação é enviado
onMailerRecordVerificationSend((e) => {
  try {
    fixEmailLinks(e.message)
  } catch (err) {
    console.error('Erro no hook onMailerRecordVerificationSend:', err)
  }
  e.next()
})

// Hook quando o e-mail de alteração de e-mail é enviado
onMailerRecordEmailChangeSend((e) => {
  try {
    fixEmailLinks(e.message)
  } catch (err) {
    console.error('Erro no hook onMailerRecordEmailChangeSend:', err)
  }
  e.next()
})
