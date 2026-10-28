migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('medicamentos')

    if (!col.fields.getByName('classe_detalhada')) {
      col.fields.add(
        new TextField({
          name: 'classe_detalhada',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('medicamentos')
    const f = col.fields.getByName('classe_detalhada')
    if (f) {
      col.fields.removeById(f.id)
      app.save(col)
    }
  },
)
