migrate(
  (app) => {
    try {
      const existing = app.findCollectionByNameOrId('dispensacoes_spincare')
      app.delete(existing)
    } catch (_) {}

    const collection = new Collection({
      name: 'dispensacoes_spincare',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role != 'medico_visitador'",
      viewRule: "@request.auth.id != '' && @request.auth.role != 'medico_visitador'",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'spincare_id', type: 'number', required: true },
        { name: 'budget_id', type: 'number' },
        { name: 'prescription_id', type: 'number' },
        { name: 'patient_id', type: 'number' },
        { name: 'patient_name', type: 'text' },
        { name: 'expected_deliver_dt', type: 'text' },
        { name: 'returned_dt', type: 'text' },
        { name: 'stock_location', type: 'text' },
        { name: 'send_reason', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'status_id', type: 'number' },
        { name: 'priority', type: 'text' },
        { name: 'itens', type: 'json', maxSize: 2000000 },
        { name: 'payload', type: 'json', maxSize: 2000000 },
        { name: 'synced_at', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_disp_sync_spincare_id ON dispensacoes_spincare (spincare_id)',
        'CREATE INDEX idx_disp_sync_expected_dt ON dispensacoes_spincare (expected_deliver_dt)',
        'CREATE INDEX idx_disp_sync_status ON dispensacoes_spincare (status)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('dispensacoes_spincare')
      app.delete(collection)
    } catch (_) {}
  },
)
