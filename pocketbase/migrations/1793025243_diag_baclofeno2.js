migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_baclofeno2')
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

      const dump = (prodId, order) => {
        const all = fetchStocks(prodId)
        const sorted = all.slice().sort((a, b) => (a.id || 0) - (b.id || 0))
        const chunk = []
        for (
          let i = Math.max(0, sorted.length - order.from);
          i < sorted.length && chunk.length < order.count;
          i++
        ) {
          const x = sorted[i]
          chunk.push({
            id: x.id,
            op:
              String(x.operation_type || '') +
              ' | ' +
              String(x.operation_ds || '').substring(0, 60),
            nf: x.invoice_number,
            qt: x.quantity,
            cu: x.cost_unit_price,
            bal: x.balance,
          })
        }
        log('DUMP_' + prodId + '_' + order.tag, JSON.stringify(chunk))
      }

      dump(2578, { tag: 'first25', from: 99999, count: 25 })
      dump(2578, { tag: 'last25', from: 25, count: 25 })
      dump(2916, { tag: 'last25', from: 25, count: 25 })
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
