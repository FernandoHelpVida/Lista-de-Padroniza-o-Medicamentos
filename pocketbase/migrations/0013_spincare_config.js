migrate(
  (app) => {
    // Coleção para armazenar as credenciais e parâmetros de integração com a API SpinCare
    // Protegida: Somente administradores da Help Vida podem ler e alterar
    const adminRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')"

    const spincareCol = new Collection({
      name: 'spincare_config',
      type: 'base',
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        { name: 'base_url', type: 'text', required: false },
        {
          name: 'auth_type',
          type: 'select',
          required: false,
          values: ['bearer', 'api_key_header', 'basic'],
          maxSelect: 1,
        },
        { name: 'header_name', type: 'text', required: false }, // Ex: 'Authorization' ou 'X-API-Key'
        { name: 'token_prefix', type: 'text', required: false }, // Ex: 'Bearer ' ou vazio
        { name: 'api_token', type: 'text', required: false }, // Token/Chave de acesso à API SpinCare
        { name: 'endpoint_patients', type: 'text', required: false }, // Ex: '/v1/patients' ou '/api/pacientes'
        { name: 'endpoint_budgets', type: 'text', required: false }, // Ex: '/v1/budgets' ou '/api/orcamentos'
        { name: 'is_active', type: 'bool', required: false },
        { name: 'last_tested_at', type: 'text', required: false },
        { name: 'last_test_status', type: 'text', required: false }, // 'ok' | 'error'
        { name: 'last_test_message', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [],
    })

    app.save(spincareCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('spincare_config')
      app.delete(col)
    } catch (_) {}
  },
)
