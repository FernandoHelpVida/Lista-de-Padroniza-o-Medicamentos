migrate(
  (app) => {
    // Diagnóstico: ler do banco local os valores persistidos dos produtos régua
    const ids = [2578, 2916]
    for (let i = 0; i < ids.length; i++) {
      try {
        const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
          id: ids[i],
        })
        console.log(
          '[Verifica Regua] produto=' +
            ids[i] +
            ' desc=' +
            rec.getString('description') +
            ' ultima_compra_price=' +
            rec.getFloat('ultima_compra_price') +
            ' custo_medio_price=' +
            rec.getFloat('custo_medio_price') +
            ' synced_at=' +
            rec.getString('synced_at'),
        )
      } catch (eRead) {
        console.log('[Verifica Regua] produto=' + ids[i] + ' ERRO: ' + String(eRead))
      }
    }
  },
  (app) => {},
)
