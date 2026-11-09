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

      const fetchStocks = (pId) => {
        let all = []
        for (let p = 1; p <= 10; p++) {
          const url =
            baseUrl +
            '/integration-engine/get/stocks?token=' +
            encodeURIComponent(token) +
            '&product_id=' +
            pId +
            '&page_number=' +
            p +
            '&page_size=500'
          const res = $http.send({ url: url, method: 'GET', timeout: 25 })
          if (res.statusCode !== 200) break
          let raw = []
          try {
            raw = res.json || JSON.parse(res.raw || '[]')
          } catch (_) {}
          if (raw && raw.items) raw = raw.items
          if (!Array.isArray(raw) || raw.length === 0) break
          all = all.concat(raw)
          if (raw.length < 500) break
        }
        return all
      }

      const calcSimpleDistinct = (pId, all) => {
        const compras = all.filter(
          (x) =>
            x &&
            x.operation_type === 'Entrada' &&
            String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
        )
        const sorted = compras.slice().sort((a, b) => {
          const dtA = String(a.movement_dt || '')
          const dtB = String(b.movement_dt || '')
          if (dtB !== dtA) return dtB.localeCompare(dtA)
          return num(b.id) - num(a.id)
        })
        const uc = sorted[0] ? parseMoney(sorted[0].cost_unit_price) : 0
        const distinct = []
        for (let i = 0; i < sorted.length; i++) {
          const c = parseMoney(sorted[i].cost_unit_price)
          if (c > 0 && distinct.indexOf(c) === -1) distinct.push(c)
        }
        let cm = uc
        if (distinct.length > 0) {
          const sum = distinct.reduce((a, b) => a + b, 0)
          cm = Math.round((sum / distinct.length) * 100) / 100
        }
        return { pId, uc, cm, distinct }
      }

      const testIds = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
      for (let i = 0; i < testIds.length; i++) {
        const id = testIds[i]
        const st = fetchStocks(id)
        const res = calcSimpleDistinct(id, st)
        const r = new Record(coll)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_distinct_' + id)
        r.set('acao', 'DISTINCT_TEST')
        r.set('detalhes', JSON.stringify(res))
        app.save(r)
      }
    } catch (_) {}
  },
  (app) => {},
)
