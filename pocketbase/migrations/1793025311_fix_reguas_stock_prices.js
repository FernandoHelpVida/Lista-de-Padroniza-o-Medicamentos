/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Ajuste das 6 réguas conhecidas do SpinCare Help Vida:
    // 4575 (DIPIRONA 300MG): ultima_compra=3.52, custo_medio=3.52
    // 2645 (BUPRENORFINA 10MG): ultima_compra=54.50, custo_medio=54.50
    // 2915 (ENOXAPARINA 20MG): ultima_compra=8.40, custo_medio=9.50
    // 2916 (ENOXAPARINA 40MG): ultima_compra=10.00, custo_medio=10.12
    // 2917 (ENOXAPARINA 60MG): ultima_compra=15.00, custo_medio=15.70
    // 2578 (BACLOFENO 10MG): ultima_compra=0.13, custo_medio=0.13

    const reguas = [
      { spincare_id: 4575, ultima: 3.52, custo: 3.52 },
      { spincare_id: 2645, ultima: 54.5, custo: 54.5 },
      { spincare_id: 2915, ultima: 8.4, custo: 9.5 },
      { spincare_id: 2916, ultima: 10.0, custo: 10.12 },
      { spincare_id: 2917, ultima: 15.0, custo: 15.7 },
      { spincare_id: 2578, ultima: 0.13, custo: 0.13 },
    ]

    let updatedCount = 0

    for (let i = 0; i < reguas.length; i++) {
      const item = reguas[i]
      try {
        const records = app.findRecordsByFilter(
          'produtos_spincare',
          'spincare_id = ' + item.spincare_id,
          '-created',
          1,
          0,
        )
        if (records && records.length > 0) {
          const record = records[0]
          record.set('ultima_compra_price', item.ultima)
          record.set('custo_medio_price', item.custo)
          app.save(record)
          updatedCount++
        }
      } catch (err) {
        console.warn(
          '[Migrate 1793025311] Aviso ao atualizar spincare_id ' + item.spincare_id + ':',
          err,
        )
      }
    }

    console.log(
      '[Migrate 1793025311] 6 réguas conhecidas atualizadas com sucesso (' +
        updatedCount +
        ' registros).',
    )
  },
  (app) => {
    // Revert não é necessário
  },
)
