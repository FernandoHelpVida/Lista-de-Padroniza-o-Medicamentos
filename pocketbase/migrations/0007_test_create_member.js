migrate(
  (app) => {
    // Migração de teste ponta a ponta
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const testEmail = 'alinesouza_qa_teste@helpvida.com.br'

    // Verificar se já existe
    try {
      const existing = app.findAuthRecordByEmail('_pb_users_auth_', testEmail)
      if (existing) {
        app.delete(existing)
      }
    } catch (_) {}

    const record = new Record(usersCol)
    record.setEmail(testEmail)
    record.setPassword('HelpVida@2025')
    record.setVerified(true)
    record.set('name', 'Aline Souza QA')
    record.set('role', 'admin')

    app.save(record)
  },
  (app) => {},
)
