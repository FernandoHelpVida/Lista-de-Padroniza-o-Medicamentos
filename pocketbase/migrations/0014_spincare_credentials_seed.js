migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('spincare_config')

    // Adiciona campos para login e password caso não existam
    if (!col.fields.getByName('api_login')) {
      col.fields.add(new TextField({ name: 'api_login', required: false }))
    }
    if (!col.fields.getByName('api_password')) {
      col.fields.add(new TextField({ name: 'api_password', required: false }))
    }
    app.save(col)

    // Seed idempotente das credenciais reais da SpinCare fornecidas pelo usuário
    const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    let rec
    if (records && records.length > 0) {
      rec = records[0]
    } else {
      rec = new Record(col)
    }

    rec.set('base_url', 'https://integration.spincare.com.br/spincare_integration')
    rec.set('auth_type', 'bearer')
    rec.set('header_name', 'Authorization')
    rec.set('token_prefix', 'Bearer ')
    rec.set('endpoint_patients', '/integration-engine/get/patients')
    rec.set('endpoint_budgets', '/integration-engine/get/budgets')
    rec.set('is_active', true)
    rec.set('api_login', 'fernandofernandes@helpvida.com.br')
    rec.set('api_password', '@Helpvida2023')

    app.save(rec)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('spincare_config')
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (records && records.length > 0) {
        app.delete(records[0])
      }
    } catch (_) {}
  },
)
