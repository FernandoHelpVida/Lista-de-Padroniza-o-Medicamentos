migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const roleField = usersCol.fields.getByName('role')
    if (roleField) {
      roleField.values = ['admin', 'comum', 'medico_visitador', 'financeiro']
    }
    app.save(usersCol)
  },
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const roleField = usersCol.fields.getByName('role')
    if (roleField) {
      roleField.values = ['admin', 'comum', 'medico_visitador']
    }
    app.save(usersCol)
  },
)
