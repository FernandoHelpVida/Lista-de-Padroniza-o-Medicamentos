migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Adicionar campo approval_status caso ainda não exista
    if (!usersCol.fields.getByName('approval_status')) {
      usersCol.fields.add(
        new SelectField({
          name: 'approval_status',
          required: false,
          values: ['pendente', 'aprovado', 'negado'],
          maxSelect: 1,
        }),
      )
    }

    // 2. Atualizar regras de permissão
    // Regra de criação: aberta (auto-cadastro público ou admin)
    usersCol.createRule = ''

    // Leitura: apenas usuários autenticados
    usersCol.listRule = "@request.auth.id != ''"
    usersCol.viewRule = "@request.auth.id != ''"

    // Regra de atualização:
    // Apenas admins podem alterar qualquer campo inclusive approval_status.
    // O próprio usuário só pode atualizar se approval_status e role não tiverem sido alterados.
    usersCol.updateRule =
      "@request.auth.id != '' && (" +
      "@request.auth.email = 'fernandofernandes@helpvida.com.br' || " +
      "@request.auth.role = 'admin' || " +
      '(id = @request.auth.id && @request.body.role:changed = false && @request.body.approval_status:changed = false)' +
      ')'

    // Regra de exclusão: o próprio usuário ou admins
    usersCol.deleteRule =
      "@request.auth.id != '' && (" +
      'id = @request.auth.id || ' +
      "@request.auth.email = 'fernandofernandes@helpvida.com.br' || " +
      "@request.auth.role = 'admin'" +
      ')'

    app.save(usersCol)

    // 3. Backfill: garantir que usuários existentes antes desta migração estejam como 'aprovado'
    app
      .db()
      .newQuery(
        "UPDATE users SET approval_status = 'aprovado' WHERE approval_status IS NULL OR approval_status = ''",
      )
      .execute()
  },
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const field = usersCol.fields.getByName('approval_status')
    if (field) {
      usersCol.fields.remove(field)
      app.save(usersCol)
    }
  },
)
