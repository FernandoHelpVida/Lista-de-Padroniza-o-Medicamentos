migrate(
  (app) => {
    // Correção pontual dos valores de última compra / custo médio dos produtos
    // régua (BACLOFENO 2578 e ENOXAPARINA 2916), replicando o algoritmo novo do
    // sync (NFs "Nota fiscal - Compra" + média ponderada das compras cobrindo o
    // saldo). Os demais produtos serão corrigidos pelo sync diário/manual.
    const calcAndSave = (prodId) => {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        console.log('[Fix Regua] sem config para produto ' + prodId)
        return
      }
      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfgRec.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      const allStocks = []
      for (let p = 1; p <= 10; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(token) +
          '&product_id=' +
          prodId +
          '&page_number=' +
          p +
          '&page_size=500'
        const resp = $http.send({ url: url, method: 'GET', timeout: 30 })
        if (resp.statusCode !== 200) break
        let list = []
        try {
          list = resp.json || JSON.parse(resp.raw || '[]')
        } catch (_) {
          break
        }
        if (!Array.isArray(list) || list.length === 0) break
        allStocks.push.apply(allStocks, list)
      }
      if (allStocks.length === 0) {
        console.log('[Fix Regua] sem stocks para produto ' + prodId)
        return
      }

      const entradas = allStocks.filter((x) => x.operation_type === 'Entrada')
      const compras = entradas.filter(
        (x) => String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
      )
      compras.sort((a, b) => (a.id || 0) - (b.id || 0))

      let stockBalance = 0
      for (let i = allStocks.length - 1; i >= 0; i--) {
        const sb = Number(allStocks[i].balance || 0)
        if (sb > 0) {
          stockBalance = sb
          break
        }
      }

      let accumQt = 0
      let accumVal = 0
      for (let i = compras.length - 1; i >= 0; i--) {
        const q = Number(compras[i].quantity || 0)
        const u = Number(compras[i].cost_unit_price || 0)
        const need = stockBalance - accumQt
        if (need <= 0) break
        const take = Math.min(q, need)
        accumQt += take
        accumVal += take * u
      }
      const custoMedio = accumQt > 0 ? Number((accumVal / accumQt).toFixed(4)) : 0
      const ultimaCompra = compras.length
        ? Number(compras[compras.length - 1].cost_unit_price || 0)
        : 0

      console.log(
        '[Fix Regua] produto=' +
          prodId +
          ' compras=' +
          compras.length +
          ' saldo=' +
          stockBalance +
          ' ultimaCompra=' +
          ultimaCompra +
          ' custoMedio=' +
          custoMedio,
      )

      try {
        const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
          id: prodId,
        })
        rec.set('ultima_compra_price', ultimaCompra)
        rec.set('custo_medio_price', custoMedio)
        rec.set('synced_at', new Date().toISOString())
        app.save(rec)
        console.log('[Fix Regua] produto=' + prodId + ' atualizado no banco local')
      } catch (eUpd) {
        console.log('[Fix Regua] produto=' + prodId + ' ERRO ao salvar: ' + String(eUpd))
      }
    }

    calcAndSave(2578)
    calcAndSave(2916)
  },
  (app) => {},
)
