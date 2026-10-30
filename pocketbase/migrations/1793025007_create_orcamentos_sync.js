migrate(
  (app) => {
    try {
      const existing = app.findCollectionByNameOrId('orcamentos_sync')
      if (existing) return
    } catch (_) {}

    const collection = new Collection({
      name: 'orcamentos_sync',
      type: 'base',
      // Leitura: apenas usuários autenticados que NÃO sejam medico_visitador (admins e corpo clínico)
      listRule: "@request.auth.id != '' && @request.auth.role != 'medico_visitador'",
      viewRule: "@request.auth.id != '' && @request.auth.role != 'medico_visitador'",
      // Escrita: nula (apenas o sistema / hooks internos do servidor gravam ou atualizam)
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'spincare_id', type: 'text', required: true },
        { name: 'numero', type: 'text' },
        { name: 'paciente_id', type: 'text' },
        { name: 'paciente_nome', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'data_aprovacao', type: 'text' },
        { name: 'data_aprovacao_iso', type: 'text' },
        { name: 'data_inicial', type: 'text' },
        { name: 'data_inicial_iso', type: 'text' },
        { name: 'data_final', type: 'text' },
        { name: 'data_final_iso', type: 'text' },
        { name: 'ano_aprovacao', type: 'number' },
        { name: 'valor_total', type: 'number' },
        { name: 'convenio', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'total_itens', type: 'number' },
        { name: 'itens', type: 'json' },
        { name: 'payload', type: 'json' },
        { name: 'synced_at', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_orc_sync_spincare_id ON orcamentos_sync (spincare_id)',
        'CREATE INDEX idx_orc_sync_numero ON orcamentos_sync (numero)',
        'CREATE INDEX idx_orc_sync_paciente ON orcamentos_sync (paciente_nome)',
        'CREATE INDEX idx_orc_sync_status ON orcamentos_sync (status)',
        'CREATE INDEX idx_orc_sync_dt_aprov_iso ON orcamentos_sync (data_aprovacao_iso DESC)',
        'CREATE INDEX idx_orc_sync_synced_at ON orcamentos_sync (synced_at DESC)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('orcamentos_sync')
      app.delete(collection)
    } catch (_) {}
  },
)
