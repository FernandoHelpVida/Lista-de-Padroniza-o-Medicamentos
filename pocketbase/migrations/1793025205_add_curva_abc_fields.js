// Adiciona campos usados pela Curva ABC:
// - produtos_spincare.ultima_compra_price: preço unitário da ÚLTIMA COMPRA do produto
//   (extraído de imported_prices do payload do SpinCare durante o sync).
// - dispensacoes_spincare.insurance_id / insurance_name: convênio da dispensação
//   (para o filtro por convênio da Curva ABC).
migrate(
  (app) => {
    const colProd = app.findCollectionByNameOrId('produtos_spincare')
    if (!colProd.fields.getByName('ultima_compra_price')) {
      colProd.fields.add(
        new Field({
          name: 'ultima_compra_price',
          type: 'number',
        }),
      )
      app.save(colProd)
    }

    const colDisp = app.findCollectionByNameOrId('dispensacoes_spincare')
    let changed = false
    if (!colDisp.fields.getByName('insurance_id')) {
      colDisp.fields.add(
        new Field({
          name: 'insurance_id',
          type: 'number',
        }),
      )
      changed = true
    }
    if (!colDisp.fields.getByName('insurance_name')) {
      colDisp.fields.add(
        new Field({
          name: 'insurance_name',
          type: 'text',
        }),
      )
      changed = true
    }
    if (changed) {
      app.save(colDisp)
    }
  },
  (app) => {
    try {
      const colProd = app.findCollectionByNameOrId('produtos_spincare')
      const f = colProd.fields.getByName('ultima_compra_price')
      if (f) {
        colProd.fields.removeByName('ultima_compra_price')
        app.save(colProd)
      }
    } catch (_) {}
    try {
      const colDisp = app.findCollectionByNameOrId('dispensacoes_spincare')
      let changed = false
      const f1 = colDisp.fields.getByName('insurance_id')
      if (f1) {
        colDisp.fields.removeByName('insurance_id')
        changed = true
      }
      const f2 = colDisp.fields.getByName('insurance_name')
      if (f2) {
        colDisp.fields.removeByName('insurance_name')
        changed = true
      }
      if (changed) app.save(colDisp)
    } catch (_) {}
  },
)
