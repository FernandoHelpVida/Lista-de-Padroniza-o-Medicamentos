migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_baclofeno9')
        r.set('acao', msg)
        r.set('detalhes', String(str).substring(0, 2000))
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

      const analyze = (prodId, saldoAlvo) => {
        const all = fetchStocks(prodId)
        const sorted = all.slice().sort((a, b) => (a.id || 0) - (b.id || 0))
        const nfs = sorted.filter(
          (x) =>
            x.operation_type === 'Entrada' &&
            String(x.operation_ds || '').indexOf('Nota fiscal') >= 0,
        )
        const compras = sorted.filter(
          (x) =>
            x.operation_type === 'Entrada' &&
            String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
        )
        log(
          'AN_' + prodId,
          JSON.stringify({
            nfsCount: nfs.length,
            comprasCount: compras.length,
            lastCompra: compras.length
              ? {
                  id: compras[compras.length - 1].id,
                  nf: compras[compras.length - 1].invoice_number,
                  qt: compras[compras.length - 1].quantity,
                  cu: compras[compras.length - 1].cost_unit_price,
                  bal: compras[compras.length - 1].balance,
                }
              : null,
            lastNf: nfs.length
              ? {
                  id: nfs[nfs.length - 1].id,
                  nf: nfs[nfs.length - 1].invoice_number,
                  op: String(nfs[nfs.length - 1].operation_ds || '').substring(0, 50),
                }
              : null,
          }),
        )
        // Média ponderada de COMPRAS para o saldo
        const sim = (fonte, saldo) => {
          let accQt = 0
          let accVal = 0
          for (let i = fonte.length - 1; i >= 0; i--) {
            const q = Number(fonte[i].quantity || 0)
            const u = Number(fonte[i].cost_unit_price || 0)
            const need = saldo - accQt
            if (need <= 0) break
            const take = Math.min(q, need)
            accQt += take
            accVal += take * u
          }
          return { qt: accQt, wm: accQt > 0 ? accVal / accQt : 0 }
        }
        log('WM_COMPRAS_' + prodId, JSON.stringify([sim(compras, 9888), sim(compras, saldoAlvo)]))
      }

      analyze(2578, 210458)
      analyze(2916, 14864)
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
