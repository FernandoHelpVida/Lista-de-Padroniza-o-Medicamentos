migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_all_stocks_calc')
        r.set('acao', msg)
        r.set('detalhes', String(str))
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (_) {}
    }

    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfgRec.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      // Buscar TODAS as páginas de /integration-engine/get/stocks para o produto 2916
      let allStocks = []
      for (let p = 1; p <= 10; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(token) +
          '&product_id=2916&page_number=' +
          p +
          '&page_size=500'
        const res = $http.send({ url: url, method: 'GET', timeout: 25 })
        const list = res.json || JSON.parse(res.raw || '[]')
        if (!Array.isArray(list) || list.length === 0) break
        allStocks = allStocks.concat(list)
      }

      log('TOTAL_STOCKS', 'Total stock items: ' + allStocks.length)

      // Filtrar entradas
      const entradas = allStocks.filter((x) => x.operation_type === 'Entrada')
      log('TOTAL_ENTRADAS', 'Total entradas: ' + entradas.length)

      // Coletar NFs de compra
      const nfs = entradas.filter(
        (x) => String(x.operation_ds || '').indexOf('Nota fiscal') >= 0 || x.invoice_number,
      )
      log('TOTAL_NFS', 'Total NFs: ' + nfs.length)

      // Amostra das últimas NFs
      const nfsSorted = nfs.slice().sort((a, b) => (a.id || 0) - (b.id || 0))
      log(
        'LAST_10_NFS',
        JSON.stringify(
          nfsSorted.slice(-10).map((x) => ({
            id: x.id,
            dt: x.batch_fabrication_dt,
            nf: x.invoice_number,
            ds: x.operation_ds,
            qt: x.quantity,
            cost_unit: x.cost_unit_price,
            cost_total: x.cost_total_price,
            balance: x.balance,
          })),
        ),
      )

      // Também testar outros endpoints no Swagger v3/api-docs
      const swRes = $http.send({ url: baseUrl + '/v3/api-docs', method: 'GET', timeout: 15 })
      let paths = []
      try {
        const sw = swRes.json || JSON.parse(swRes.raw || '{}')
        if (sw.paths) paths = Object.keys(sw.paths)
      } catch (_) {}
      log('SWAGGER_PATHS', JSON.stringify(paths))
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
