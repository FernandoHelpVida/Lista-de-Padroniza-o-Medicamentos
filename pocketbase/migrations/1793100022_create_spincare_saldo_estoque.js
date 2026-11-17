// Cria a coleção spincare_saldo_estoque: espelho das linhas do relatório oficial
// "Saldo de Estoque Analítico" do SpinCare, importado manualmente pela tela
// /importar-relatorio. Fonte de conciliação do custo médio (reflete a tela
// SpinCare, que em alguns produtos diverge do medium_cost da API).
//
// Migração idempotente: se a coleção já existir, apenas garante os campos e
// índices. Roda de forma limpa em cópia vazia do projeto.

migrate(
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('spincare_saldo_estoque')
    } catch (_) {
      collection = null
    }

    if (!collection) {
      collection = new Collection({
        name: 'spincare_saldo_estoque',
        type: 'base',
        // Somente admin (ou o encarregado de dados) lê; escrita pela UI admin
        // autenticada — o app grava via API com a sessão do usuário logado.
        listRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.email = 'fernandofernandes@helpvida.com.br')",
        fields: [
          { name: 'spincare_id', type: 'number', required: true },
          { name: 'code', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'saldo', type: 'number' },
          { name: 'custo_medio_report', type: 'number' },
          { name: 'raw_json', type: 'json' },
          {
            name: 'imported_at',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_saldo_estoque_spincare_id ON spincare_saldo_estoque (spincare_id)',
          'CREATE INDEX idx_saldo_estoque_custo_medio ON spincare_saldo_estoque (custo_medio_report)',
          'CREATE INDEX idx_saldo_estoque_code ON spincare_saldo_estoque (code)',
        ],
      })
      app.save(collection)
    } else {
      // Idempotência: garante campos ausentes em coleções criadas antes.
      const fieldNames = collection.fields.map((f) => f.name)
      if (!fieldNames.includes('spincare_id')) {
        collection.fields.add(new NumberField({ name: 'spincare_id', required: true }))
      }
      if (!fieldNames.includes('code')) {
        collection.fields.add(new TextField({ name: 'code' }))
      }
      if (!fieldNames.includes('description')) {
        collection.fields.add(new TextField({ name: 'description' }))
      }
      if (!fieldNames.includes('saldo')) {
        collection.fields.add(new NumberField({ name: 'saldo' }))
      }
      if (!fieldNames.includes('custo_medio_report')) {
        collection.fields.add(new NumberField({ name: 'custo_medio_report' }))
      }
      if (!fieldNames.includes('raw_json')) {
        collection.fields.add(new JSONField({ name: 'raw_json' }))
      }
      if (!fieldNames.includes('imported_at')) {
        collection.fields.add(
          new AutodateField({ name: 'imported_at', onCreate: true, onUpdate: true }),
        )
      }
      app.save(collection)
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('spincare_saldo_estoque')
      app.delete(collection)
    } catch (_) {
      // coleção não existe — nada a reverter
    }
  },
)
