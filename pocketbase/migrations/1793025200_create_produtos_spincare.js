migrate(
  (app) => {
    // remove a versão parcial criada pela tentativa anterior (se existir)
    try {
      const existing = app.findCollectionByNameOrId('produtos_spincare')
      app.delete(existing)
    } catch (_) {}

    const collection = new Collection({
      name: 'produtos_spincare',
      type: 'base',
      // Leitura: apenas usuários autenticados que NÃO sejam medico_visitador (admins e corpo clínico)
      listRule: "@request.auth.id != '' && @request.auth.role != 'medico_visitador'",
      viewRule: "@request.auth.id != '' && @request.auth.role != 'medico_visitador'",
      // Escrita: nula (apenas o sistema / hooks internos gravam)
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'spincare_id', type: 'number', required: true },
        { name: 'code', type: 'text' },
        { name: 'description', type: 'text', required: true },
        { name: 'group_description', type: 'text' },
        { name: 'type_description', type: 'text' },
        { name: 'active', type: 'bool' },
        { name: 'price', type: 'number' },
        { name: 'measure_unit', type: 'text' },
        { name: 'prescription_measure_unit', type: 'text' },
        { name: 'prescription_conversion_qt', type: 'number' },
        { name: 'barcode', type: 'text' },
        { name: 'company_id', type: 'number' },
        { name: 'payload', type: 'json', maxSize: 2000000 },
        { name: 'synced_at', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_prod_sync_spincare_id ON produtos_spincare (spincare_id)',
        'CREATE INDEX idx_prod_sync_code ON produtos_spincare (code)',
        'CREATE INDEX idx_prod_sync_description ON produtos_spincare (description)',
        'CREATE INDEX idx_prod_sync_group ON produtos_spincare (group_description)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('produtos_spincare')
      app.delete(collection)
    } catch (_) {}
  },
)
