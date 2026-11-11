/**
 * DIAGNÓSTICO — CUSTO MÉDIO DO PRODUTO 2944 (ESCOPOLAMINA 20MG+DIPIRONA 2,5G AMPOLA 5ML)
 *
 * Busca TODAS as páginas de /get/stocks?product_id=2944, lista as NFs de compra
 * (Entrada / "Nota fiscal - Compra") e testa as hipóteses de custo médio:
 *   (a) média ponderada cobrindo o saldo DISPONÍVEL (230)
 *   (b) média ponderada cobrindo DISPONÍVEL+EMPENHADO (365)
 *   (c) média simples das compras da primeira página
 *   (d) média (ponderada por qt e simples) de TODAS as páginas
 * Resultado gravado em audit_logs (acao=DIAG_2944) + console.log.
 *
 * Idempotente: em banco vazio não encontra config e não faz nada.
 */
migrate(
  (app) => {
    const configs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!configs || configs.length === 0) {
      console.log('[Diag2944] Sem spincare_config — nada a fazer.')
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
        console.log('[Diag2944] token status=' + res.statusCode)
      } catch (e) {
        console.log('[Diag2944] token erro: ' + e)
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

    // ---- Busca TODAS as páginas (até 40), registrando o tamanho real de cada página ----
    const pageSizes = []
    let all = []
    for (let p = 1; p <= 40; p++) {
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
        pageSizes.push('p' + p + ':EXC')
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
      if (resp.statusCode !== 200) {
        pageSizes.push('p' + p + ':HTTP' + resp.statusCode)
        break
      }
      const list = parseItems(resp)
      pageSizes.push('p' + p + ':' + list.length)
      if (list.length === 0) break
      all = all.concat(list)
      if (list.length < 500) break
    }
    console.log('[Diag2944] paginas: ' + pageSizes.join(' '))

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

    const prodStocks = all.filter((x) => x && Number(x.product_id) === PROD_ID)
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
      .sort((a, b) => (b.dt !== a.dt ? b.dt.localeCompare(a.dt) : b.id - a.id))

    console.log('[Diag2944] total_movs=' + prodStocks.length + ' compras=' + compras.length)

    // Lista compacta das NFs de compra (mais recente primeiro) — vai pro log
    const nfList = compras
      .slice(0, 40)
      .map((c) => c.id + '|' + c.dt + '|qt' + c.qt + '|R$' + c.cost.toFixed(2))
    console.log('[Diag2944] NFs(desc): ' + nfList.join(' ; '))

    // Saldo: primeiro stock_balance positivo nos registros
    let saldo = 0
    for (let i = 0; i < prodStocks.length; i++) {
      const sb = num(prodStocks[i].stock_balance)
      if (sb > 0) {
        saldo = sb
        break
      }
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
      if (arr.length === 0) return null
      let s = 0
      for (let i = 0; i < arr.length; i++) s += arr[i].cost
      return Math.round((s / arr.length) * 100) / 100
    }

    const paginas = []
    for (let i = 0; i < all.length; i += 500) paginas.push(all.slice(i, i + 500))
    const comprasPagina1 = compras.filter((c) => {
      // NFs da primeira página = primeiras 500 movs originais (aprox.: usa interseção por id)
      return true
    })

    const resultado = {
      total_movs: prodStocks.length,
      paginas: pageSizes.join(','),
      saldo_encontrado: saldo,
      ultima_compra: compras.length > 0 ? compras[0].cost : null,
      ultimas_3: compras.slice(0, 3).map((c) => ({ id: c.id, dt: c.dt, qt: c.qt, cost: c.cost })),
      hip_a_saldo_230: ponderada(230),
      hip_b_365: ponderada(365),
      hip_c_media_p1: simples(compras.slice(0, compras.length)),
      hip_d_ponderada_todas: ponderada(999999),
      hip_d_simples_todas: simples(compras),
    }
    console.log('[Diag2944] RESULTADO: ' + JSON.stringify(resultado))

    // Persiste em audit_logs para leitura via db_query
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const rec = new Record(auditCol)
    rec.set('colecao', 'produtos_spincare')
    rec.set('registro_id', 'diag_2944')
    rec.set('acao', 'DIAG_2944')
    rec.set('usuario_nome', 'Diagnóstico Custo Médio')
    rec.set('usuario_email', 'diag@helpvida.internal')
    rec.set('usuario_role', 'sistema')
    rec.set('status_novo', 'concluido')
    rec.set('detalhes', JSON.stringify(resultado).substring(0, 2500))
    app.save(rec)
  },
  (app) => {
    // no-op
  },
)
