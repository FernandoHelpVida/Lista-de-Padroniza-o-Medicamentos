migrate(
  (app) => {
    // 1. Atualizar users para incluir campo role e permitir leitura aos admins / membros
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!usersCol.fields.getByName('role')) {
      usersCol.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['admin', 'comum'],
          maxSelect: 1,
        }),
      )
    }

    // Regras da coleção users:
    // Usuário autenticado pode ler perfil de outros (necessário para ver criador da solicitação/importador)
    // Criação/exclusão: autenticado (ou admin)
    usersCol.listRule = "@request.auth.id != ''"
    usersCol.viewRule = "@request.auth.id != ''"
    // Atualização: o próprio usuário (sem alterar seu próprio role se não for admin) ou admin
    usersCol.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"
    // Criação: admin pode criar contas da equipe ou via cadastro público
    usersCol.createRule = ''
    app.save(usersCol)

    // Garantir que fernandofernandes tenha role = 'admin'
    try {
      const adminUser = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'fernandofernandes@helpvida.com.br',
      )
      adminUser.set('role', 'admin')
      app.save(adminUser)
    } catch (_) {}

    // 2. Criar coleção historico_importacoes
    const historicoCol = new Collection({
      name: 'historico_importacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule:
        "@request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin'",
      deleteRule:
        "@request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin'",
      fields: [
        { name: 'nome_arquivo', type: 'text', required: true },
        { name: 'total_itens', type: 'number', required: false },
        { name: 'criados', type: 'number', required: false },
        { name: 'atualizados', type: 'number', required: false },
        { name: 'inalterados', type: 'number', required: false },
        { name: 'ignorados', type: 'number', required: false },
        {
          name: 'usuario',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_hist_imp_created ON historico_importacoes (created DESC)',
        'CREATE INDEX idx_hist_imp_usuario ON historico_importacoes (usuario)',
      ],
    })
    app.save(historicoCol)

    // 3. Criar coleção solicitacoes
    const medsCol = app.findCollectionByNameOrId('medicamentos')
    const solicitacoesCol = new Collection({
      name: 'solicitacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule:
        "@request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin'",
      fields: [
        {
          name: 'medicamento',
          type: 'relation',
          required: true,
          collectionId: medsCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'solicitante',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'justificativa', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Pendente', 'Aprovada', 'Atendida', 'Negada'],
          maxSelect: 1,
        },
        { name: 'resposta_comissao', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_solic_status ON solicitacoes (status)',
        'CREATE INDEX idx_solic_medicamento ON solicitacoes (medicamento)',
        'CREATE INDEX idx_solic_solicitante ON solicitacoes (solicitante)',
        'CREATE INDEX idx_solic_created ON solicitacoes (created DESC)',
      ],
    })
    app.save(solicitacoesCol)
  },
  (app) => {
    try {
      const s = app.findCollectionByNameOrId('solicitacoes')
      app.delete(s)
    } catch (_) {}
    try {
      const h = app.findCollectionByNameOrId('historico_importacoes')
      app.delete(h)
    } catch (_) {}
  },
)
