migrate(
  (app) => {
    const PUBLIC_APP_URL = 'https://consulta-de-medicamentos-help-vida-adbef.goskip.app'

    // 1. Atualizar meta.appURL nas configurações gerais do PocketBase
    // Para que {APP_URL} se resolva nativamente como o domínio público da SPA
    try {
      const settings = app.settings()
      if (settings && settings.meta) {
        settings.meta.appURL = PUBLIC_APP_URL
        settings.meta.appName = 'Consulta de Medicamentos Help Vida'
        app.save(settings)
      }
    } catch (err) {
      console.error('Aviso ao atualizar settings.meta.appURL:', err)
    }

    // 2. Atualizar templates específicos da coleção users com a URL pública explícita
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    usersCol.resetPasswordTemplate = {
      subject: 'Redefina sua senha — Consulta de Medicamentos Help Vida',
      body:
        '<p>Olá,</p>' +
        '<p>Recebemos uma solicitação para redefinir sua senha de acesso ao sistema de Padronização e Consulta de Medicamentos Help Vida.</p>' +
        '<p><a class="btn" href="' +
        PUBLIC_APP_URL +
        '/redefinir-senha?token={TOKEN}" target="_blank" rel="noopener">Redefinir minha senha</a></p>' +
        '<p>Se o botão acima não funcionar, copie e cole o seguinte endereço no seu navegador:<br/>' +
        PUBLIC_APP_URL +
        '/redefinir-senha?token={TOKEN}</p>' +
        '<p><i>Se você não solicitou a redefinição de senha, desconsidere esta mensagem com segurança.</i></p>' +
        '<p>Atenciosamente,<br/>Equipe Help Vida</p>',
    }

    usersCol.verificationTemplate = {
      subject: 'Verifique seu e-mail — Consulta de Medicamentos Help Vida',
      body:
        '<p>Olá,</p>' +
        '<p>Confirme seu endereço de e-mail institucional para ativação no sistema Help Vida clicando no link abaixo:</p>' +
        '<p><a class="btn" href="' +
        PUBLIC_APP_URL +
        '/verificar-email?token={TOKEN}" target="_blank" rel="noopener">Verificar meu e-mail</a></p>' +
        '<p>Ou acerte pelo endereço:<br/>' +
        PUBLIC_APP_URL +
        '/verificar-email?token={TOKEN}</p>' +
        '<p>Atenciosamente,<br/>Equipe Help Vida</p>',
    }

    usersCol.confirmEmailChangeTemplate = {
      subject: 'Confirme seu novo e-mail — Consulta de Medicamentos Help Vida',
      body:
        '<p>Olá,</p>' +
        '<p>Recebemos uma solicitação de alteração do seu e-mail institucional no sistema Help Vida.</p>' +
        '<p><a class="btn" href="' +
        PUBLIC_APP_URL +
        '/confirmar-email?token={TOKEN}" target="_blank" rel="noopener">Confirmar novo e-mail</a></p>' +
        '<p>Ou acerte pelo endereço:<br/>' +
        PUBLIC_APP_URL +
        '/confirmar-email?token={TOKEN}</p>' +
        '<p>Atenciosamente,<br/>Equipe Help Vida</p>',
    }

    app.save(usersCol)
  },
  (app) => {
    // Reversão opcional
  },
)
