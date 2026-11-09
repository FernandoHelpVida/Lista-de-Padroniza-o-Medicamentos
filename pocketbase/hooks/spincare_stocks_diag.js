routerAdd('GET', '/backend/v1/admin/spincare/products/diag-stocks', (e) => {
  try {
    const app = e.app
    const query = e.requestInfo().query || {}
    const prodId = query.product_id || '4575'
    const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    const cfgRec = records[0]
    const baseUrl = (
      cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    const login = cfgRec.getString('api_login').trim()
    const password = cfgRec.getString('api_password').trim()

    const tokenUrl =
      baseUrl +
      '/token/v1?login=' +
      encodeURIComponent(login) +
      '&password=' +
      encodeURIComponent(password)
    const resToken = $http.send({ url: tokenUrl, method: 'GET', timeout: 15 })
    let token = ''
    if (resToken.statusCode === 200) {
      if (typeof resToken.json === 'string') token = resToken.json
      else if (resToken.json && typeof resToken.json === 'object')
        token = resToken.json.token || resToken.json.access_token || ''
      if (!token && resToken.raw) token = resToken.raw.replace(/^"|"$/g, '').trim()
    }

    const stocksUrl =
      baseUrl +
      '/integration-engine/get/stocks?token=' +
      encodeURIComponent(token) +
      '&product_id=' +
      prodId +
      '&page_number=1&page_size=100'
    const resStocks = $http.send({ url: stocksUrl, method: 'GET', timeout: 20 })
    let items = resStocks.json || JSON.parse(resStocks.raw || '[]')
    if (items.items) items = items.items

    const compras = items.filter(
      (x) =>
        x &&
        x.operation_type === 'Entrada' &&
        String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
    )

    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const audit = new Record(auditCol)
      audit.set('colecao', 'produtos_spincare')
      audit.set('registro_id', 'diag_stocks_' + prodId)
      audit.set('acao', 'DIAG_STOCKS_RESULT')
      audit.set('status_novo', 'ok')
      audit.set(
        'detalhes',
        JSON.stringify({
          total: items.length,
          comprasCount: compras.length,
          compras: compras.map((c) => ({
            id: c.id,
            dt: c.movement_dt,
            qt: c.qt,
            cost_unit_price: c.cost_unit_price,
            unit_price: c.unit_price,
            total_price: c.total_price,
            document: c.document_nr,
            lot: c.lot,
            stock_balance: c.stock_balance,
          })),
          nonComprasFirst3: items
            .filter(
              (x) =>
                !(
                  x &&
                  x.operation_type === 'Entrada' &&
                  String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0
                ),
            )
            .slice(0, 3),
        }),
      )
      app.save(audit)
    } catch (saveErr) {
      console.error('[DIAG] erro ao salvar audit:', saveErr)
    }

    return e.json(200, { success: true })
  } catch (err) {
    return e.json(500, { error: String(err) })
  }
})
