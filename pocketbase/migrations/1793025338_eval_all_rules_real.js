/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const coll = app.findCollectionByNameOrId('audit_logs')
      const cfgs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!cfgs || cfgs.length === 0) return
      const cfg = cfgs[0]
      const baseUrl = (
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      const login = (cfg.getString('api_login') || '').trim()
      const password = (cfg.getString('api_password') || '').trim()

      let token = ''
      const resToken = $http.send({
        url:
          baseUrl +
          '/token/v1?login=' +
          encodeURIComponent(login) +
          '&password=' +
          encodeURIComponent(password),
        method: 'GET',
        headers: { Accept: '*/*' },
        timeout: 15,
      })
      if (resToken.statusCode === 200) {
        if (typeof resToken.json === 'string') token = resToken.json
        else if (resToken.json && typeof resToken.json === 'object')
          token = resToken.json.token || resToken.json.access_token || ''
        if (!token && resToken.raw) token = resToken.raw.replace(/^"|"$/g, '').trim()
        if (token.startsWith('Bearer ')) token = token.substring(7).trim()
      }

      const parseMoney = (v) => {
        if (typeof v === 'number') return v
        let s = String(v || '')
          .trim()
          .replace(/[^\d.,-]/g, '')
        if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.split('.').join('').replace(',', '.')
        else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
        return parseFloat(s) || 0
      }
      const num = (v) => {
        const n = Number(v)
        return isNaN(n) ? 0 : n
      }

      const testIds = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
      for (let i = 0; i < testIds.length; i++) {
        const pid = testIds[i]
        let allStocks = []
        for (let p = 1; p <= 10; p++) {
          const url =
            baseUrl +
            '/integration-engine/get/stocks?token=' +
            encodeURIComponent(token) +
            '&product_id=' +
            pid +
            '&page_number=' +
            p +
            '&page_size=500'
          const res = $http.send({
            url: url,
            method: 'GET',
            headers: { Accept: 'application/json' },
            timeout: 20,
          })
          let raw = []
          try {
            raw = res.json || JSON.parse(res.raw || '[]')
          } catch (_) {}
          if (raw && raw.items) raw = raw.items
          if (!Array.isArray(raw) || raw.length === 0) break
          allStocks = allStocks.concat(raw)
        }

        // Ordenar desc
        allStocks.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        const mostRecent = allStocks[0] || {}
        const latestBalance = num(mostRecent.balance)

        const compras = allStocks.filter(
          (x) =>
            x &&
            x.operation_type === 'Entrada' &&
            String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
        )
        const sortedCompras = compras.slice().sort((a, b) => {
          const dtA = String(a.movement_dt || '')
          const dtB = String(b.movement_dt || '')
          if (dtB !== dtA) return dtB.localeCompare(dtA)
          return num(b.id) - num(a.id)
        })

        const uc = sortedCompras[0] ? parseMoney(sortedCompras[0].cost_unit_price) : 0

        // Cobertura ponderada cobrindo latestBalance:
        let needed = latestBalance
        let wSum = 0
        let qSum = 0
        for (let cIdx = 0; cIdx < sortedCompras.length; cIdx++) {
          const c = sortedCompras[cIdx]
          const q = num(c.quantity !== undefined ? c.quantity : c.qt)
          const cost = parseMoney(c.cost_unit_price)
          if (cost > 0) {
            const loteQ = q > 0 ? q : needed
            const take = Math.min(needed, loteQ)
            if (take > 0) {
              wSum += take * cost
              qSum += take
              needed -= take
            }
            if (needed <= 0) break
          }
        }
        const cm = qSum > 0 ? Math.round((wSum / qSum) * 100) / 100 : uc

        const r = new Record(coll)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_eval_' + pid)
        r.set('acao', 'EVAL')
        r.set(
          'detalhes',
          JSON.stringify({
            pid: pid,
            totalMovements: allStocks.length,
            latestId: mostRecent.id,
            latestType: mostRecent.operation_type,
            latestBal: latestBalance,
            comprasCount: sortedCompras.length,
            uc: uc,
            cm: cm,
            neededLeft: needed,
          }),
        )
        app.save(r)
      }
    } catch (_) {}
  },
  (app) => {},
)
