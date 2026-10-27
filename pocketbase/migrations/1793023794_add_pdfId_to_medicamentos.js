migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('medicamentos')

    if (!col.fields.getByName('pdfId')) {
      col.fields.add(
        new NumberField({
          name: 'pdfId',
          onlyInt: true,
          min: 1,
          max: 482,
        }),
      )
      app.save(col)
    }

    // Adicionar índice para busca rápida por pdfId
    col.addIndex('idx_medicamentos_pdfId', false, 'pdfId', '')
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('medicamentos')
    col.removeIndex('idx_medicamentos_pdfId')
    const f = col.fields.getByName('pdfId')
    if (f) {
      col.fields.removeById(f.id)
    }
    app.save(col)
  },
)
