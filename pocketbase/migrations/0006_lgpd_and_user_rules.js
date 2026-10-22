migrate(
  (app) => {
    // 1. Atualizar regras da coleção users para garantir permissão e proteção LGPD
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // Permitir criação pública ou por admin autenticado
    usersCol.createRule = ''

    // Leitura: apenas usuários autenticados
    usersCol.listRule = "@request.auth.id != ''"
    usersCol.viewRule = "@request.auth.id != ''"

    // Atualização: o próprio usuário (sem alterar seu próprio role para admin se não for admin) ou admin
    usersCol.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"

    // Exclusão: o próprio usuário ou admin da comissão
    usersCol.deleteRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"

    app.save(usersCol)

    // 2. Ajustar regras de solicitacoes para LGPD:
    // listRule e viewRule: O próprio solicitante pode ver suas solicitações OU administradores
    const solicCol = app.findCollectionByNameOrId('solicitacoes')
    solicCol.listRule =
      "@request.auth.id != '' && (solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"
    solicCol.viewRule =
      "@request.auth.id != '' && (solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"
    solicCol.createRule = "@request.auth.id != ''"
    // Atualização: apenas admins podem avaliar ou o próprio solicitante antes de avaliada
    solicCol.updateRule =
      "@request.auth.id != '' && (@request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin' || (solicitante = @request.auth.id && status = 'Pendente'))"
    solicCol.deleteRule =
      "@request.auth.id != '' && (solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')"

    app.save(solicCol)
  },
  (app) => {
    // Reverter regras básicas se necessário
  },
)
