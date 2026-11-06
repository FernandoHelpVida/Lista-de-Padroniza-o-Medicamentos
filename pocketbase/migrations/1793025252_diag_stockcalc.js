migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_stockcalc')
        r.set('acao', msg)
        r.set('detalhes', String(str).substring(0, 1800))
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (_) {}
    }

    const calc = (prodId) => {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) {
        log('ERR_' + prodId, 'sem config')
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
        log('ERR_' + prodId, 'sem stocks')
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
      log(
        'CALC_' + prodId,
        JSON.stringify({
          compras: compras.length,
          saldo: stockBalance,
          ultimaCompra: compras.length
            ? Number(compras[compras.length - 1].cost_unit_price || 0)
            : 0,
          custoMedio: custoMedio,
        }),
      )
    }

    calc(2578)
    calc(2916)
  },
  (app) => {},
)
