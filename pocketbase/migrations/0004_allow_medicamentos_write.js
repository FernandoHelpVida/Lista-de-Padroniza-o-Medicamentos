migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('medicamentos')
    // Permitir create, update e delete para usuários autenticados
    // O controle fino de administrador é verificado pelo app e pode ser reforçado
    col.createRule = "@request.auth.id != ''"
    col.updateRule = "@request.auth.id != ''"
    col.deleteRule = "@request.auth.id != ''"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('medicamentos')
    col.createRule = null
    col.updateRule = null
    col.deleteRule = null
    app.save(col)
  },
)
