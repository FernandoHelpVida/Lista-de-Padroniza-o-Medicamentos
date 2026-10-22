migrate(
  (app) => {
    // 1. Atualizar a coleção solicitacoes para tornar medicamento opcional e adicionar campos do medicamento livre
    const solicCol = app.findCollectionByNameOrId('solicitacoes')

    // Tornar medicamento não obrigatório (required = false) para solicitações de itens ainda não catalogados
    const medField = solicCol.fields.getByName('medicamento')
    if (medField) {
      medField.required = false
    }

    // Adicionar nome_medicamento_novo se não existir
    if (!solicCol.fields.getByName('nome_medicamento_novo')) {
      solicCol.fields.add(
        new TextField({
          name: 'nome_medicamento_novo',
          required: false,
        }),
      )
    }

    // Adicionar classe_terapeutica se não existir
    if (!solicCol.fields.getByName('classe_terapeutica')) {
      solicCol.fields.add(
        new TextField({
          name: 'classe_terapeutica',
          required: false,
        }),
      )
    }

    // Adicionar apresentacao se não existir
    if (!solicCol.fields.getByName('apresentacao')) {
      solicCol.fields.add(
        new TextField({
          name: 'apresentacao',
          required: false,
        }),
      )
    }

    // Adicionar dados_paciente (dados minimizados LGPD: iniciais, idade, leito/quarto)
    if (!solicCol.fields.getByName('dados_paciente')) {
      solicCol.fields.add(
        new TextField({
          name: 'dados_paciente',
          required: false,
        }),
      )
    }

    // Adicionar avaliador relation -> users (quem aprovou/negou/atendeu)
    if (!solicCol.fields.getByName('avaliador')) {
      solicCol.fields.add(
        new RelationField({
          name: 'avaliador',
          collectionId: '_pb_users_auth_',
          required: false,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    // Atualizar regras da coleção solicitacoes para garantir permissões de médico e farmacêutico/admin
    solicCol.listRule =
      "@request.auth.id != '' && (solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"
    solicCol.viewRule =
      "@request.auth.id != '' && (solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"
    solicCol.createRule = "@request.auth.id != ''"
    solicCol.updateRule =
      "@request.auth.id != '' && (@request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin' || (solicitante = @request.auth.id && status = 'Pendente'))"
    solicCol.deleteRule =
      "@request.auth.id != '' && (solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"

    app.save(solicCol)

    // 2. Criar coleção audit_logs
    // Somente administradores podem ler (listRule/viewRule);
    // Escrita via API direta é bloqueada (null) para garantir que seja gerado pelo servidor (pb_hooks)
    const auditCol = new Collection({
      name: 'audit_logs',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'colecao', type: 'text', required: true },
        { name: 'registro_id', type: 'text', required: true },
        { name: 'acao', type: 'text', required: true },
        {
          name: 'usuario',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          required: false,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'usuario_nome', type: 'text', required: false },
        { name: 'usuario_email', type: 'text', required: false },
        { name: 'usuario_role', type: 'text', required: false },
        { name: 'status_anterior', type: 'text', required: false },
        { name: 'status_novo', type: 'text', required: false },
        { name: 'detalhes', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_audit_registro ON audit_logs (registro_id)',
        'CREATE INDEX idx_audit_usuario ON audit_logs (usuario)',
        'CREATE INDEX idx_audit_acao ON audit_logs (acao)',
        'CREATE INDEX idx_audit_created ON audit_logs (created DESC)',
      ],
    })
    app.save(auditCol)
  },
  (app) => {
    try {
      const a = app.findCollectionByNameOrId('audit_logs')
      app.delete(a)
    } catch (_) {}
  },
)
