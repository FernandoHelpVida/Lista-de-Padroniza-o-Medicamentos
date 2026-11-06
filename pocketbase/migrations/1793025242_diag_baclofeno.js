migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_baclofeno')
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

      // 1. Campos de preço/custo presentes no payload armazenado do produto 2578
      try {
        const prod = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 2578')
        const py = JSON.parse(prod.getString('payload') || '{}')
        const keys = Object.keys(py)
        log('PROD_KEYS', JSON.stringify(keys))
        const flat = {}
        for (const k of keys) {
          const v = py[k]
          if (typeof v !== 'object' || v === null) flat[k] = v
        }
        log('PROD_FLAT', JSON.stringify(flat))
      } catch (e1) {
        log('ERR_PROD', String(e1))
      }

      // 2. Stocks do produto 2578
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

      const analyze = (prodId) => {
        const all = fetchStocks(prodId)
        log('STOCKS_' + prodId + '_TOTAL', String(all.length))
        const entradas = all.filter((x) => x.operation_type === 'Entrada')
        const nfs = entradas.filter(
          (x) => String(x.operation_ds || '').indexOf('Nota fiscal') >= 0 || x.invoice_number,
        )
        log('STOCKS_' + prodId + '_NFS', String(nfs.length))
        const sorted = nfs.slice().sort((a, b) => (a.id || 0) - (b.id || 0))
        const sample = sorted.slice(-12).map((x) => ({
          id: x.id,
          nf: x.invoice_number,
          qt: x.quantity,
          cu: x.cost_unit_price,
          ct: x.cost_total_price,
          bal: x.balance,
          dt: x.batch_fabrication_dt || x.operation_dt || x.created_at,
        }))
        log('STOCKS_' + prodId + '_LAST', JSON.stringify(sample))
        // último balance disponível em qualquer item
        let lastBal = null
        for (let i = all.length - 1; i >= 0; i--) {
          const b = Number(all[i].balance || 0)
          if (b > 0) {
            lastBal = { idx: i, balance: b, id: all[i].id, op: all[i].operation_ds }
            break
          }
        }
        log('STOCKS_' + prodId + '_BAL', JSON.stringify(lastBal))
        // média ponderada cobrindo saldo
        const sb = lastBal ? lastBal.balance : 0
        let accQt = 0
        let accVal = 0
        for (let i = sorted.length - 1; i >= 0; i--) {
          const q = Number(sorted[i].quantity || 0)
          const u = Number(sorted[i].cost_unit_price || 0)
          const need = sb - accQt
          if (need <= 0) break
          const take = Math.min(q, need)
          accQt += take
          accVal += take * u
        }
        log(
          'STOCKS_' + prodId + '_CALC',
          JSON.stringify({
            saldo: sb,
            weighted: accQt > 0 ? accVal / accQt : 0,
            lastNf: sorted.length ? sorted[sorted.length - 1].cost_unit_price : 0,
          }),
        )
      }

      analyze(2578)
      analyze(2916)
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
