migrate(
  (app) => {
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

      const url =
        baseUrl +
        '/integration-engine/get/stocks?token=' +
        encodeURIComponent(token) +
        '&product_id=2645&page_number=1&page_size=500'
      const res = $http.send({ url: url, method: 'GET', timeout: 25 })
      const list = res.json || JSON.parse(res.raw || '[]')
      const items = Array.isArray(list) ? list : list && list.items ? list.items : []

      const prodStocks = items.filter((x) => {
        if (!x) return false
        const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
        return Number(pid) === 2645
      })

      const col = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(col)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_buprenorfina_probe')
      r.set('acao', 'DIAG_BUPRENORFINA_DATA')
      r.set(
        'detalhes',
        JSON.stringify({
          total_items: items.length,
          prod_stocks_count: prodStocks.length,
          stocks: prodStocks.map((x) => ({
            id: x.id,
            dt: x.batch_fabrication_dt || x.created_at || x.date,
            op_type: x.operation_type,
            op_ds: x.operation_ds,
            qt: x.quantity,
            cost_u: x.cost_unit_price,
            cost_t: x.cost_total_price,
            balance: x.balance,
            curr_balance: x.current_balance,
            available_balance: x.available_balance,
            stock_balance: x.stock_balance,
            batch_balance: x.batch_balance,
            available_stock: x.available_stock,
            location: x.stock_location || x.location,
            all_keys: Object.keys(x),
          })),
        }),
      )
      r.set('usuario_nome', 'Diag')
      r.set('usuario_email', 'diag@internal')
      r.set('usuario_role', 'sistema')
      r.set('status_novo', 'ok')
      app.save(r)
    } catch (err) {
      console.error('[Diag Buprenorfina] Erro:', err)
    }
  },
  (app) => {},
)
