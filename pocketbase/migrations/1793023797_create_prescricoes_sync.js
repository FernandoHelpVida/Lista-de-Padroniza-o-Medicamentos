migrate(
  (app) => {
    try {
      const existing = app.findCollectionByNameOrId('prescricoes_sync')
      if (existing) return
    } catch (_) {}

    const collection = new Collection({
      name: 'prescricoes_sync',
      type: 'base',
      // Leitura: apenas usuários autenticados que NÃO sejam medico_visitador (admins e corpo clínico / comum)
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
        { name: 'medico_prescritor', type: 'text' },
        { name: 'medico_id', type: 'text' },
        { name: 'data_prescricao', type: 'text' },
        { name: 'data_prescricao_iso', type: 'text' },
        { name: 'data_inicial', type: 'text' },
        { name: 'data_inicial_iso', type: 'text' },
        { name: 'data_final', type: 'text' },
        { name: 'data_final_iso', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'tipo', type: 'text' },
        { name: 'total_itens', type: 'number' },
        { name: 'itens', type: 'json' },
        { name: 'payload', type: 'json' },
        { name: 'synced_at', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_presc_sync_spincare_id ON prescricoes_sync (spincare_id)',
        'CREATE INDEX idx_presc_sync_numero ON prescricoes_sync (numero)',
        'CREATE INDEX idx_presc_sync_paciente ON prescricoes_sync (paciente_nome)',
        'CREATE INDEX idx_presc_sync_medico ON prescricoes_sync (medico_prescritor)',
        'CREATE INDEX idx_presc_sync_dt_ini_iso ON prescricoes_sync (data_inicial_iso DESC)',
        'CREATE INDEX idx_presc_sync_synced_at ON prescricoes_sync (synced_at DESC)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('prescricoes_sync')
      app.delete(collection)
    } catch (_) {}
  },
)
