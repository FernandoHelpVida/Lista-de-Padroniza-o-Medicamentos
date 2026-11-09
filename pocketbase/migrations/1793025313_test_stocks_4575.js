/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Teste direto de stocks para DIPIRONA 4575 no SpinCare
    try {
      const cfgs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!cfgs || cfgs.length === 0) {
        console.log('[Test stocks 4575] Sem config')
        return
      }
      const cfg = cfgs[0]
      let token = (cfg.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()
      const baseUrl = (
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')

      const url = baseUrl + '/integration-engine/get/stocks?product_id=4575'
      const res = $http.send({
        url: url,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json, text/plain, */*',
        },
        timeout: 15,
      })

      console.log(
        '[Test stocks 4575] Status:',
        res.statusCode,
        'Raw length:',
        (res.raw || '').length,
      )
      if (res.statusCode === 200) {
        const parsed = res.json || JSON.parse(res.raw)
        console.log(
          '[Test stocks 4575] Array length:',
          Array.isArray(parsed) ? parsed.length : 'not array',
        )
        if (Array.isArray(parsed)) {
          // Testa o cálculo
          const parseMoney = (v) => {
            if (typeof v === 'number') return v
            let s = String(v || '')
              .trim()
              .replace(/[^\d.,-]/g, '')
            if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0)
              s = s.split('.').join('').replace(',', '.')
            else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
            return parseFloat(s) || 0
          }
          const num = (v) => {
            const n = Number(v)
            return isNaN(n) ? 0 : n
          }

          const compras = parsed.filter(
            (x) =>
              x &&
              x.operation_type === 'Entrada' &&
              String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
          )
          const sortedCompras = compras.slice().sort((a, b) => num(b.id) - num(a.id))
          const sortedAll = parsed.slice().sort((a, b) => num(b.id) - num(a.id))
          const currentBalance = num(
            sortedAll[0].balance !== undefined ? sortedAll[0].balance : sortedAll[0].stock_balance,
          )

          let needed = currentBalance
          let weightedSum = 0
          let qtySum = 0
          for (let i = 0; i < sortedCompras.length; i++) {
            const c = sortedCompras[i]
            const q = num(c.quantity !== undefined ? c.quantity : c.qt)
            const cost = parseMoney(c.cost_unit_price)
            if (q > 0 && cost > 0) {
              const take = Math.min(needed, q)
              weightedSum += take * cost
              qtySum += take
              needed -= take
              if (needed <= 0) break
            }
          }
          const custoMedio = qtySum > 0 ? weightedSum / qtySum : 0
          const ultimaCompra = sortedCompras[0] ? parseMoney(sortedCompras[0].cost_unit_price) : 0

          console.log(
            '[Test stocks 4575] currentBalance:',
            currentBalance,
            'qtySum:',
            qtySum,
            'weightedSum:',
            weightedSum,
            'custoMedio:',
            custoMedio,
            'ultimaCompra:',
            ultimaCompra,
          )
        }
      }
    } catch (err) {
      console.error('[Test stocks 4575] Erro:', err)
    }
  },
  (app) => {},
)
