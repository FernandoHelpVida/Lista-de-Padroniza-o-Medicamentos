migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_baclofeno5')
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

      // Tenta variantes de ordenação do endpoint
      const tryUrl = (prodId, qs, tag) => {
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(token) +
          '&product_id=' +
          prodId +
          '&' +
          qs
        const res = $http.send({ url: url, method: 'GET', timeout: 25 })
        const list = res.json || JSON.parse(res.raw || '[]')
        if (!Array.isArray(list)) {
          log('TRY_' + tag, 'not array: ' + String(res.raw || '').substring(0, 200))
          return
        }
        const sorted = list.slice().sort((a, b) => (a.id || 0) - (b.id || 0))
        const nfs = sorted.filter(
          (x) =>
            x.operation_type === 'Entrada' &&
            (String(x.operation_ds || '').indexOf('Nota fiscal') >= 0 || x.invoice_number),
        )
        log(
          'TRY_' + tag,
          JSON.stringify({
            n: list.length,
            firstId: list.length ? list[0].id : null,
            lastId: list.length ? list[list.length - 1].id : null,
            lastNf: nfs.length
              ? {
                  id: nfs[nfs.length - 1].id,
                  nf: nfs[nfs.length - 1].invoice_number,
                  qt: nfs[nfs.length - 1].quantity,
                  cu: nfs[nfs.length - 1].cost_unit_price,
                }
              : null,
          }),
        )
      }

      tryUrl(2578, 'page_number=1&page_size=3', 'P1S3')
      tryUrl(2578, 'page=1&page_size=3', 'PAGE1S3')
      tryUrl(2578, 'page_number=1&page_size=3&sort=-id', 'SORTID')
      tryUrl(2578, 'page_number=1&page_size=3&sort=-operation_dt', 'SORTDT')
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
