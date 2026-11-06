onRecordAfterUpdateSuccess((e) => {
  try {
    const rec = e.record
    if (!rec || rec.getString('code') !== '0000071987') return

    const app = e.app
    const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!records || records.length === 0) return
    const cfgRec = records[0]
    const baseUrl = (
      cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    let rawStoredToken = (cfgRec.getString('api_token') || '').trim()
    let apiToken = rawStoredToken.startsWith('Bearer ')
      ? rawStoredToken.substring(7).trim()
      : rawStoredToken

    const prodId = '2645'
    const url =
      baseUrl +
      '/integration-engine/get/stocks?token=' +
      encodeURIComponent(apiToken) +
      '&product_id=' +
      prodId +
      '&page_number=1&page_size=500'
    const res = $http.send({ url: url, method: 'GET', timeout: 25 })
    const list = res.json || JSON.parse(res.raw || '[]')
    const items = Array.isArray(list) ? list : list && list.items ? list.items : []

    const prodStocks = items.filter((x) => {
      if (!x) return false
      const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
      return Number(pid) === Number(prodId)
    })

    const entradas = prodStocks.filter((x) => x && x.operation_type === 'Entrada')
    const compras = entradas.filter(
      (x) => String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
    )
    compras.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))

    const lastItem = prodStocks[prodStocks.length - 1] || {}
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const auditRec = new Record(auditCol)
    auditRec.set('colecao', 'produtos_spincare')
    auditRec.set('registro_id', 'diag_buprenorfina_probe_clean')
    auditRec.set('acao', 'LAST_ITEM_AND_COMPRAS')
    auditRec.set('usuario_nome', 'Diag')
    auditRec.set('usuario_email', 'diag@internal')
    auditRec.set('usuario_role', 'sistema')
    auditRec.set('status_novo', 'ok')

    const info = {
      last_item: {
        id: lastItem.id,
        op_type: lastItem.operation_type,
        op_ds: lastItem.operation_ds,
        dt: lastItem.batch_fabrication_dt,
        qt: lastItem.quantity,
        cost_unit: lastItem.cost_unit_price,
        balance: lastItem.balance,
        current_balance: lastItem.current_balance,
        stock_location: lastItem.stock_location,
      },
      compras: compras.map((c) => ({
        id: c.id,
        ds: c.operation_ds,
        dt: c.batch_fabrication_dt,
        qt: c.quantity,
        cost_unit: c.cost_unit_price,
        balance: c.balance,
      })),
    }

    auditRec.set('detalhes', JSON.stringify(info).slice(0, 4800))
    app.save(auditRec)
  } catch (err) {
    console.error('[Probe Hook 5] Erro:', err)
  } finally {
    e.next()
  }
}, 'produtos_spincare')
