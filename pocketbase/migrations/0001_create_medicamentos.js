migrate(
  (app) => {
    const collection = new Collection({
      name: 'medicamentos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'classe', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Padronizado', 'Não Padronizado', 'Inativo'],
          maxSelect: 1,
        },
        { name: 'descricao', type: 'editor', required: false },
        { name: 'observacao', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_med_status ON medicamentos (status)',
        'CREATE INDEX idx_med_classe ON medicamentos (classe)',
        'CREATE INDEX idx_med_status_classe ON medicamentos (status, classe)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('medicamentos')
    app.delete(collection)
  },
)
