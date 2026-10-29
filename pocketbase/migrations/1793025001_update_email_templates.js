migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // Atualizar template de Redefinição de Senha
    usersCol.resetPasswordTemplate = {
      subject: 'Redefina sua senha — Consulta de Medicamentos Help Vida',
      body:
        '<p>Olá,</p>' +
        '<p>Recebemos uma solicitação para redefinir sua senha de acesso ao sistema de Padronização e Consulta de Medicamentos Help Vida.</p>' +
        '<p><a class="btn" href="{APP_URL}/redefinir-senha?token={TOKEN}" target="_blank" rel="noopener">Redefinir minha senha</a></p>' +
        '<p>Se o botão acima não funcionar, copie e cole o seguinte endereço no seu navegador:<br/>{APP_URL}/redefinir-senha?token={TOKEN}</p>' +
        '<p><i>Se você não solicitou a redefinição de senha, desconsidere esta mensagem com segurança.</i></p>' +
        '<p>Atenciosamente,<br/>Equipe Help Vida</p>',
    }

    // Atualizar template de Verificação de E-mail
    usersCol.verificationTemplate = {
      subject: 'Verifique seu e-mail — Consulta de Medicamentos Help Vida',
      body:
        '<p>Olá,</p>' +
        '<p>Confirme seu endereço de e-mail institucional para ativação no sistema Help Vida clicando no link abaixo:</p>' +
        '<p><a class="btn" href="{APP_URL}/verificar-email?token={TOKEN}" target="_blank" rel="noopener">Verificar meu e-mail</a></p>' +
        '<p>Ou acerte pelo endereço:<br/>{APP_URL}/verificar-email?token={TOKEN}</p>' +
        '<p>Atenciosamente,<br/>Equipe Help Vida</p>',
    }

    // Atualizar template de Alteração de E-mail
    usersCol.confirmEmailChangeTemplate = {
      subject: 'Confirme seu novo e-mail — Consulta de Medicamentos Help Vida',
      body:
        '<p>Olá,</p>' +
        '<p>Recebemos uma solicitação de alteração do seu e-mail institucional no sistema Help Vida.</p>' +
        '<p><a class="btn" href="{APP_URL}/confirmar-email?token={TOKEN}" target="_blank" rel="noopener">Confirmar novo e-mail</a></p>' +
        '<p>Ou acerte pelo endereço:<br/>{APP_URL}/confirmar-email?token={TOKEN}</p>' +
        '<p>Atenciosamente,<br/>Equipe Help Vida</p>',
    }

    app.save(usersCol)
  },
  (app) => {
    // Reverter para o padrão se necessário
  },
)
