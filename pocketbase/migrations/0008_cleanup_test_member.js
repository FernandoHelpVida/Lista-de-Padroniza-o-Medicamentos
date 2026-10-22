migrate(
  (app) => {
    // Remover usuário de teste ponta a ponta
    const testEmail = 'alinesouza_qa_teste@helpvida.com.br'
    try {
      const existing = app.findAuthRecordByEmail('_pb_users_auth_', testEmail)
      if (existing) {
        app.delete(existing)
      }
    } catch (_) {}
  },
  (app) => {},
)
