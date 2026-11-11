/**
 * DIAGNÓSTICO v2 — CUSTO MÉDIO DO PRODUTO 2944 (gravação compacta)
 *
 * Rebusca todas as páginas de /get/stocks?product_id=2944 e grava em audit_logs
 * registros PEQUENOS (o campo detalhes aparece truncado na leitura):
 *   - DIAG2944_H: valores de cada hipótese de custo médio
 *   - DIAG2944_K: chaves de um registro de movimentação + campos com "bal"
 *   - DIAG2944_N0/N1/...: lista completa de NFs de compra (id|qt|cost)
 *
 * Idempotente: em banco vazio não encontra config e não faz nada.
 */
migrate(
  (app) => {
    const configs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!configs || configs.length === 0) {
      console.log('[Diag2944v2] Sem spincare_config — nada a fazer.')
      return
    }
    const cfg = configs[0]
    const baseUrl = (
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    const login = (cfg.getString('api_login') || '').trim()
    const password = (cfg.getString('api_password') || '').trim()
    let token = (cfg.getString('api_token') || '').trim()
    if (token.startsWith('Bearer ')) token = token.substring(7).trim()

    const fetchToken = () => {
      try {
        const res = $http.send({
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
        if (res.statusCode === 200) {
          let t = ''
          if (typeof res.json === 'string') t = res.json
          else if (res.json && typeof res.json === 'object')
            t = res.json.token || res.json.access_token || ''
          if (!t && res.raw) t = res.raw.replace(/^"|"$/g, '').trim()
          if (t.startsWith('Bearer ')) t = t.substring(7).trim()
          return t
        }
      } catch (e) {
        console.log('[Diag2944v2] token erro: ' + e)
      }
      return ''
    }
    if (!token) token = fetchToken()

    const PROD_ID = 2944
    const parseItems = (resp) => {
      let raw = []
      try {
        raw = resp.json || JSON.parse(resp.raw || '[]')
      } catch (_) {
        raw = []
      }
      if (Array.isArray(raw)) return raw
      if (raw && Array.isArray(raw.items)) return raw.items
      if (raw && Array.isArray(raw.data)) return raw.data
      return []
    }

    let all = []
    for (let p = 1; p <= 10; p++) {
      let resp = null
      try {
        resp = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/stocks?token=' +
            encodeURIComponent(token) +
            '&product_id=' +
            PROD_ID +
            '&page_number=' +
            p +
            '&page_size=500',
          method: 'GET',
          headers: { Accept: 'application/json' },
          timeout: 20,
        })
      } catch (e) {
        break
      }
      if (resp.statusCode === 401) {
        token = fetchToken()
        try {
          resp = $http.send({
            url:
              baseUrl +
              '/integration-engine/get/stocks?token=' +
              encodeURIComponent(token) +
              '&product_id=' +
              PROD_ID +
              '&page_number=' +
              p +
              '&page_size=500',
            method: 'GET',
            headers: { Accept: 'application/json' },
            timeout: 20,
          })
        } catch (e2) {
          break
        }
      }
      if (resp.statusCode !== 200) break
      const list = parseItems(resp)
      if (!list || list.length === 0) break
      all = all.concat(list)
      if (list.length < 500) break
    }

    const num = (v) => {
      const n = Number(v)
      return isNaN(n) ? 0 : n
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

    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const write = (acao, detalhes) => {
      const rec = new Record(auditCol)
      rec.set('colecao', 'produtos_spincare')
      rec.set('registro_id', 'diag_2944')
      rec.set('acao', acao)
      rec.set('usuario_nome', 'Diagnóstico Custo Médio v2')
      rec.set('usuario_email', 'diag@helpvida.internal')
      rec.set('usuario_role', 'sistema')
      rec.set('status_novo', 'concluido')
      rec.set('detalhes', String(detalhes).substring(0, 240))
      app.save(rec)
    }

    const prodStocks = all.filter((x) => x && Number(x.product_id) === PROD_ID)

    // ---- Chaves de um registro e quais campos têm valor de saldo ----
    if (prodStocks.length > 0) {
      const k0 = Object.keys(prodStocks[0] || {}).join(',')
      write('DIAG2944_K', 'keys: ' + k0)
      const sample = prodStocks[0] || {}
      const parts = []
      for (const k in sample) {
        const v = sample[k]
        if (
          v !== null &&
          v !== undefined &&
          v !== '' &&
          !Array.isArray(v) &&
          typeof v !== 'object'
        ) {
          parts.push(k + '=' + String(v).substring(0, 18))
        }
      }
      write('DIAG2944_K2', parts.join(' | ').substring(0, 240))
      // valores distintos de stock_balance ao longo dos registros
      const bals = {}
      for (let i = 0; i < prodStocks.length; i++) {
        const b = num(prodStocks[i].stock_balance)
        bals[b] = (bals[b] || 0) + 1
      }
      write(
        'DIAG2944_B',
        'stock_balance distintos: ' +
          Object.keys(bals)
            .map((k) => k + 'x' + bals[k])
            .join(','),
      )
    }

    const compras = prodStocks
      .filter(
        (x) =>
          String(x.operation_type || '') === 'Entrada' &&
          String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
      )
      .map((x) => ({
        id: num(x.id),
        dt: String(x.movement_dt || ''),
        qt: num(x.qt !== undefined ? x.qt : x.quantity),
        cost: parseMoney(x.cost_unit_price),
      }))
      .sort((a, b) => b.id - a.id)

    write('DIAG2944_H0', 'movs=' + prodStocks.length + ' compras=' + compras.length)

    // Lista completa das NFs de compra, 3 por registro para caber em 240 chars
    for (let c = 0; c < compras.length; c += 3) {
      const chunk = compras
        .slice(c, c + 3)
        .map((x) => x.id + '|q' + x.qt + '|R$' + x.cost.toFixed(4) + '|' + (x.dt || 'sdt'))
        .join(' ; ')
      write('DIAG2944_N' + Math.floor(c / 3), chunk)
    }

    const ponderada = (cobertura) => {
      let rem = cobertura
      let sw = 0
      let sq = 0
      for (let i = 0; i < compras.length && rem > 0; i++) {
        const c = compras[i]
        if (c.cost <= 0) continue
        const take = Math.min(rem, c.qt > 0 ? c.qt : rem)
        sw += take * c.cost
        sq += take
        rem -= take
      }
      return sq > 0 ? Math.round((sw / sq) * 100) / 100 : null
    }
    const simples = (arr) => {
      if (!arr || arr.length === 0) return null
      let s = 0
      for (let i = 0; i < arr.length; i++) s += arr[i].cost
      return Math.round((s / arr.length) * 100) / 100
    }

    const r = {
      uc: compras.length > 0 ? compras[0].cost : null,
      A_230: ponderada(230),
      B_365: ponderada(365),
      C_simples_todas: simples(compras),
      D_pond_todas: ponderada(999999),
    }
    write('DIAG2944_H', JSON.stringify(r))
    console.log('[Diag2944v2] RESULTADO: ' + JSON.stringify(r))
  },
  (app) => {
    // no-op
  },
)
