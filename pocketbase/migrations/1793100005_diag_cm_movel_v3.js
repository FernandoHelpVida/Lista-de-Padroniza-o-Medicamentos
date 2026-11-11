/**
 * DIAGNÓSTICO v3 — CUSTO MÉDIO: composição das operações e replays alternativos
 *
 * Para o 2944 e cada produto régua + BOBINA 4383:
 *  - conta movimentações por operation_type e por operation_ds
 *  - lista entradas com cost > 1.6 (2944)
 *  - testa replays: (F) média ponderada de TODAS as movs com cost>0;
 *                   (G) média ponderada só das ENTRADAS (qualquer tipo);
 *                   (H) CM móvel só com NFs de compra (saídas ignoram custo);
 *                   (I) CM móvel com TODAS as entradas (saídas custeiam ao CM).
 * Registros pequenos em audit_logs (acao=DIAGCM3_*, detalhes <= 250 chars).
 * Idempotente: em banco vazio não encontra config e não faz nada.
 */
migrate(
  (app) => {
    const configs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!configs || configs.length === 0) {
      console.log('[DiagCM3] Sem spincare_config — nada a fazer.')
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
        console.log('[DiagCM3] token erro: ' + e)
      }
      return ''
    }
    if (!token) token = fetchToken()

    const write = (acao, detalhes) => {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'produtos_spincare')
      rec.set('registro_id', 'diag_cm_movel')
      rec.set('acao', acao)
      rec.set('usuario_nome', 'Diagnóstico CM Móvel v3')
      rec.set('usuario_email', 'diag@helpvida.internal')
      rec.set('usuario_role', 'sistema')
      rec.set('status_novo', 'concluido')
      rec.set('detalhes', String(detalhes).substring(0, 250))
      app.save(rec)
    }

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
    const r2 = (v) => Math.round(v * 100) / 100

    const fetchAll = (prodId) => {
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
              prodId +
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
                prodId +
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
        if (!resp || resp.statusCode !== 200) break
        const list = parseItems(resp)
        if (!list.length) break
        all = all.concat(list)
        if (list.length < 500) break
      }
      return all
    }

    const PRODUTOS = [
      { id: 2944, regua: '— (caso novo)' },
      { id: 2942, regua: '0.31/0.30' },
      { id: 4575, regua: '3.52/3.52' },
      { id: 2645, regua: '54.50/54.50' },
      { id: 2915, regua: '8.40/9.50' },
      { id: 2916, regua: '10.00/10.12' },
      { id: 2917, regua: '15.00/15.70' },
      { id: 2578, regua: '0.13/0.13' },
      { id: 4383, regua: 'BOBINA (material)' },
    ]

    const resumo = []

    for (var pi = 0; pi < PRODUTOS.length; pi++) {
      const P = PRODUTOS[pi]
      const all = fetchAll(P.id)
      const movs = all
        .filter((x) => x && Number(x.product_id) === P.id)
        .map((x) => ({
          id: num(x.id),
          ot: String(x.operation_type || ''),
          ds: String(x.operation_ds || ''),
          qt: num(x.qt !== undefined ? x.qt : x.quantity),
          cost: parseMoney(x.cost_unit_price),
          sb: num(x.stock_balance),
        }))
        .sort((a, b) => a.id - b.id)

      // contagem por operation_type / operation_ds
      const byType = {}
      const byDs = {}
      for (let i = 0; i < movs.length; i++) {
        const m = movs[i]
        byType[m.ot] = (byType[m.ot] || 0) + 1
        const key = m.ot + ' :: ' + m.ds
        byDs[key] = (byDs[key] || 0) + 1
      }

      // (F) média ponderada de TODAS as movs com cost>0
      let fSw = 0,
        fSq = 0
      // (G) média ponderada só das entradas
      let gSw = 0,
        gSq = 0
      for (let i = 0; i < movs.length; i++) {
        const m = movs[i]
        if (m.cost > 0 && m.qt > 0) {
          fSw += m.qt * m.cost
          fSq += m.qt
          if (m.ot === 'Entrada') {
            gSw += m.qt * m.cost
            gSq += m.qt
          }
        }
      }

      // (H) CM móvel só com NFs de compra (entradas recompõem; saídas só deduzem qt)
      // (I) CM móvel com TODAS as entradas
      let hQt = 0,
        hVal = 0,
        hCm = 0
      let iQt = 0,
        iVal = 0,
        iCm = 0
      let lastCompraIdx = -1
      let hCmAtLastCompra = null
      let saldoFinal = 0
      for (let i = 0; i < movs.length; i++) {
        const m = movs[i]
        const isCompra = m.ot === 'Entrada' && m.ds.indexOf('Compra') >= 0
        if (m.ot === 'Entrada' && m.cost > 0) {
          iVal += m.qt * m.cost
          iQt += m.qt
          if (iQt > 0) iCm = iVal / iQt
        } else if (m.ot !== 'Entrada') {
          // saída: deduz ao CM corrente
          iVal -= m.qt * iCm
          iQt -= m.qt
          if (iQt <= 0) {
            iQt = 0
            iVal = 0
            iCm = 0
          }
        }
        if (isCompra && m.cost > 0) {
          hVal += m.qt * m.cost
          hQt += m.qt
          if (hQt > 0) hCm = hVal / hQt
          lastCompraIdx = i
          hCmAtLastCompra = hCm
        } else if (m.ot !== 'Entrada') {
          hVal -= m.qt * hCm
          hQt -= m.qt
          if (hQt <= 0) {
            hQt = 0
            hVal = 0
            hCm = 0
          }
        }
      }
      saldoFinal = iQt

      resumo.push(
        P.id +
          ':' +
          movs.length +
          'mv F=' +
          (fSq ? r2(fSw / fSq) : '-') +
          ' G=' +
          (gSq ? r2(gSw / gSq) : '-') +
          ' H=' +
          (hCm ? r2(hCm) : '-') +
          ' Hlast=' +
          (hCmAtLastCompra !== null ? r2(hCmAtLastCompra) : '-') +
          ' I=' +
          (iCm ? r2(iCm) : '-') +
          ' Ival=' +
          (iCm ? r2(iVal) : '-') +
          ' saldo=' +
          saldoFinal +
          ' [' +
          P.regua +
          ']',
      )

      // detalhes por produto: composição de tipos/ds
      write('DIAGCM3_P' + P.id, 'tipos: ' + JSON.stringify(byType))
      write('DIAGCM3_D' + P.id, 'ds: ' + JSON.stringify(byDs).substring(0, 250))
      if (P.id === 2944) {
        // entradas com cost alto
        const altos = movs.filter((m) => m.ot === 'Entrada' && m.cost > 1.6)
        for (let a = 0; a < Math.min(altos.length, 4); a++) {
          write(
            'DIAGCM3_A' + a,
            altos[a].id +
              '|' +
              altos[a].ot +
              '|' +
              altos[a].ds +
              '|q' +
              altos[a].qt +
              '|R$' +
              altos[a].cost,
          )
        }
        // primeiras e últimas 6 movs (ordem id asc)
        for (let a = 0; a < 6 && a < movs.length; a++) {
          write(
            'DIAGCM3_INI' + a,
            movs[a].id +
              '|' +
              movs[a].ot +
              '|' +
              movs[a].ds.substring(0, 28) +
              '|q' +
              movs[a].qt +
              '|R$' +
              movs[a].cost,
          )
        }
        for (let a = 0; a < 6 && movs.length - 6 + a >= 0; a++) {
          const m = movs[movs.length - 6 + a]
          write(
            'DIAGCM3_FIM' + a,
            m.id + '|' + m.ot + '|' + m.ds.substring(0, 28) + '|q' + m.qt + '|R$' + m.cost,
          )
        }
      }
    }

    // grava resumo em blocos de ~230 chars
    let buf = ''
    for (let i = 0; i < resumo.length; i++) {
      const line = resumo[i] + ' || '
      if (buf.length + line.length > 230) {
        write('DIAGCM3_RES', buf)
        buf = ''
      }
      buf += line
    }
    if (buf) write('DIAGCM3_RES2', buf)
    console.log('[DiagCM3] concluído para ' + PRODUTOS.length + ' produtos')
  },
  (app) => {
    // no-op
  },
)
