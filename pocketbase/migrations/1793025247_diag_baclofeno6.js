migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_baclofeno6')
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

      const fetchStocks = (prodId) => {
        const all = []
        for (let p = 1; p <= 15; p++) {
          const url =
            baseUrl +
            '/integration-engine/get/stocks?token=' +
            encodeURIComponent(token) +
            '&product_id=' +
            prodId +
            '&page_number=' +
            p +
            '&page_size=500'
          const res = $http.send({ url: url, method: 'GET', timeout: 25 })
          const list = res.json || JSON.parse(res.raw || '[]')
          if (!Array.isArray(list) || list.length === 0) break
          all.push.apply(all, list)
        }
        return all
      }

      const all = fetchStocks(2578)
      const sorted = all.slice().sort((a, b) => (a.id || 0) - (b.id || 0))
      const nfs = sorted.filter(
        (x) =>
          x.operation_type === 'Entrada' &&
          (String(x.operation_ds || '').indexOf('Nota fiscal') >= 0 || x.invoice_number),
      )
      log('NFS2578_COUNT', String(nfs.length))
      // IDs de NF distintos nas últimas 30
      const last30 = nfs.slice(-30).map((x) => ({
        id: x.id,
        nf: x.invoice_number,
        qt: x.quantity,
        cu: x.cost_unit_price,
        rid: x.record_id !== undefined ? x.record_id : null,
        doc: x.document_number !== undefined ? x.document_number : null,
        op: String(x.operation_ds || '').substring(0, 40),
      }))
      log('NFS2578_LAST30', JSON.stringify(last30))
      // Todas as chaves de um item
      if (nfs.length) log('KEYS', JSON.stringify(Object.keys(nfs[nfs.length - 1])))
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
