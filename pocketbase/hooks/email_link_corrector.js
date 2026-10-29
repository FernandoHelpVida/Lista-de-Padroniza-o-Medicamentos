// Interceptador e normalizador de URLs nos e-mails transacionais enviados pelo PocketBase

// Hook quando o e-mail de redefinição de senha é enviado
onMailerRecordPasswordResetSend((e) => {
  try {
    if (e && e.message) {
      const publicBase = (
        $os.getenv('SITE_URL') || 'https://consulta-de-medicamentos-help-vida-adbef.goskip.app'
      ).replace(/\/+$/, '')
      const fix = (str) => {
        if (!str || typeof str !== 'string') return str
        let s = str
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-password-reset\/([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/redefinir-senha?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-password-reset[?&]token=([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/redefinir-senha?token=$2',
        )
        s = s.replace(
          /https?:\/\/[a-zA-Z0-9.\-_]+(?::\d+)?(\/(?:redefinir-senha|verificar-email|confirmar-email)[^\s"'<>]*)/g,
          publicBase + '$1',
        )
        return s
      }
      if (e.message.html) e.message.html = fix(e.message.html)
      if (e.message.text) e.message.text = fix(e.message.text)
    }
  } catch (err) {
    console.error('Erro no hook onMailerRecordPasswordResetSend:', err)
  }
  e.next()
})

// Hook quando o e-mail de verificação é enviado
onMailerRecordVerificationSend((e) => {
  try {
    if (e && e.message) {
      const publicBase = (
        $os.getenv('SITE_URL') || 'https://consulta-de-medicamentos-help-vida-adbef.goskip.app'
      ).replace(/\/+$/, '')
      const fix = (str) => {
        if (!str || typeof str !== 'string') return str
        let s = str
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-verification\/([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/verificar-email?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-verification[?&]token=([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/verificar-email?token=$2',
        )
        s = s.replace(
          /https?:\/\/[a-zA-Z0-9.\-_]+(?::\d+)?(\/(?:redefinir-senha|verificar-email|confirmar-email)[^\s"'<>]*)/g,
          publicBase + '$1',
        )
        return s
      }
      if (e.message.html) e.message.html = fix(e.message.html)
      if (e.message.text) e.message.text = fix(e.message.text)
    }
  } catch (err) {
    console.error('Erro no hook onMailerRecordVerificationSend:', err)
  }
  e.next()
})

// Hook quando o e-mail de alteração de e-mail é enviado
onMailerRecordEmailChangeSend((e) => {
  try {
    if (e && e.message) {
      const publicBase = (
        $os.getenv('SITE_URL') || 'https://consulta-de-medicamentos-help-vida-adbef.goskip.app'
      ).replace(/\/+$/, '')
      const fix = (str) => {
        if (!str || typeof str !== 'string') return str
        let s = str
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-email-change\/([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/confirmar-email?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-email-change[?&]token=([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/confirmar-email?token=$2',
        )
        s = s.replace(
          /https?:\/\/[a-zA-Z0-9.\-_]+(?::\d+)?(\/(?:redefinir-senha|verificar-email|confirmar-email)[^\s"'<>]*)/g,
          publicBase + '$1',
        )
        return s
      }
      if (e.message.html) e.message.html = fix(e.message.html)
      if (e.message.text) e.message.text = fix(e.message.text)
    }
  } catch (err) {
    console.error('Erro no hook onMailerRecordEmailChangeSend:', err)
  }
  e.next()
})

// Hook genérico de fallback para qualquer envio
onMailerSend((e) => {
  try {
    if (e && e.message) {
      const publicBase = (
        $os.getenv('SITE_URL') || 'https://consulta-de-medicamentos-help-vida-adbef.goskip.app'
      ).replace(/\/+$/, '')
      const fix = (str) => {
        if (!str || typeof str !== 'string') return str
        let s = str
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-password-reset\/([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/redefinir-senha?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-password-reset[?&]token=([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/redefinir-senha?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-verification\/([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/verificar-email?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-verification[?&]token=([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/verificar-email?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-email-change\/([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/confirmar-email?token=$2',
        )
        s = s.replace(
          /(https?:\/\/[^\s"'<>]+)?\/_[\/#]+auth\/confirm-email-change[?&]token=([a-zA-Z0-9_\-.]+)/g,
          publicBase + '/confirmar-email?token=$2',
        )
        s = s.replace(
          /https?:\/\/[a-zA-Z0-9.\-_]+(?::\d+)?(\/(?:redefinir-senha|verificar-email|confirmar-email)[^\s"'<>]*)/g,
          publicBase + '$1',
        )
        return s
      }
      if (e.message.html) e.message.html = fix(e.message.html)
      if (e.message.text) e.message.text = fix(e.message.text)
    }
  } catch (err) {
    console.error('Erro no hook onMailerSend:', err)
  }
  e.next()
})
