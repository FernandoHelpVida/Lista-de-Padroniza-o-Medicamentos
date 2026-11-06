migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_baclofeno7')
        r.set('acao', msg)
        r.set('detalhes', String(str).substring(0, 1800))
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

      const url =
        baseUrl +
        '/integration-engine/get/stocks?token=' +
        encodeURIComponent(token) +
        '&product_id=2578&page_number=1&page_size=500'
      const res = $http.send({ url: url, method: 'GET', timeout: 25 })
      const list = res.json || JSON.parse(res.raw || '[]')
      const sorted = Array.isArray(list)
        ? list.slice().sort((a, b) => (a.id || 0) - (b.id || 0))
        : []
      const nfs = sorted.filter(
        (x) =>
          x.operation_type === 'Entrada' &&
          (String(x.operation_ds || '').indexOf('Nota fiscal') >= 0 || x.invoice_number),
      )
      const last = nfs.slice(-15).map((x) => ({
        id: x.id,
        nf: x.invoice_number,
        qt: x.quantity,
        cu: x.cost_unit_price,
        dt: x.operation_dt !== undefined ? x.operation_dt : null,
        batch: x.batch_dt !== undefined ? x.batch_dt : null,
        exp: x.expiration_dt !== undefined ? x.expiration_dt : null,
      }))
      log('LAST15_FULL', JSON.stringify(last))
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
