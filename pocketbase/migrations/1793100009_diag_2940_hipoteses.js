/**
 * DIAGNÓSTICO v5 — PRODUTO 2940 (ESCOPOLAMINA 10MG COMPRIMIDO, código 468)
 *
 * Sintoma: SpinCare exibe UC R$0,24 e CM R$0,39, com Estoque disponível 0,00 e
 * Estoque empenhado 2.225,00. Nossa fórmula cobre o SALDO DISPONÍVEL e, com
 * saldo 0, degenera para o último lote (0,24 = UC) — mas grava 0,24.
 *
 * Hipóteses a testar contra a API real (mesmo método do DIAG4 que provou 2944):
 *   (a) cobertura de lotes = disponível + empenhado (saldo total)
 *   (b) cobertura = saldo total via replay das movimentações (entradas-saídas)
 *   (c) média ponderada de TODAS as NFs de compra do histórico (sem cobertura)
 *   (d) média ponderada de TODAS as Entradas (qualquer tipo) cobrindo saldo total
 *
 * Grava em audit_logs (acao=DIAG5_*). Idempotente: sem config, não faz nada.
 */
migrate(
  (app) => {
    const write = (acao, detalhes) => {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'produtos_spincare')
        rec.set('registro_id', 'diag_cm_v5')
        rec.set('acao', acao)
        rec.set('usuario_nome', 'Diagnóstico CM v5')
        rec.set('usuario_email', 'diag@helpvida.internal')
        rec.set('usuario_role', 'sistema')
        rec.set('status_novo', 'concluido')
        rec.set('detalhes', String(detalhes || '').substring(0, 2400))
        app.save(rec)
      } catch (e) {
        console.log('[Diag5] falha ao gravar log ' + acao + ': ' + e)
      }
    }

    // ---- Parte 1: campos de estoque no payload do produto 2940 ----
    try {
      const recs = app.findRecordsByFilter('produtos_spincare', 'spincare_id = 2940', '', 1, 0)
      if (recs && recs.length > 0) {
        let payload = {}
        try {
          payload = JSON.parse(recs[0].getString('payload') || '{}')
        } catch (_) {
          payload = {}
        }
        const keys = Object.keys(payload || {})
        const stockKeys = keys.filter((k) =>
          /stock|balanc|empenh|avail|commit|qt|quantity/i.test(k),
        )
        const vals = stockKeys.map((k) => k + '=' + JSON.stringify(payload[k]).substring(0, 60))
        write('DIAG5_PAYLOAD_KEYS', 'nKeys=' + keys.length + ' :: ' + keys.join(','))
        write('DIAG5_PAYLOAD_VALS', vals.join(' ; '))
      } else {
        write('DIAG5_PAYLOAD_KEYS', 'registro 2940 não encontrado')
      }
    } catch (ePay) {
      write('DIAG5_PAYLOAD_ERR', String(ePay))
    }

    // ---- Parte 2: movimentações reais do 2940 ----
    const configs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!configs || configs.length === 0) {
      console.log('[Diag5] Sem spincare_config — nada a fazer.')
      return
    }
    const cfg = configs[0]
    const baseUrl = String(
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration',
    )
      .trim()
      .replace(/\/+$/, '')
    const login = (cfg.getString('api_login') || '').trim()
    const password = (cfg.getString('api_password') || '').trim()
    let token = (cfg.getString('api_token') || '').trim()
    if (token.indexOf('Bearer ') === 0) token = token.substring(7).trim()

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
          if (t.indexOf('Bearer ') === 0) t = t.substring(7).trim()
          return t
        }
      } catch (e) {
        console.log('[Diag5] token erro: ' + e)
      }
      return ''
    }
    if (!token) token = fetchToken()

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
    for (let p = 1; p <= 40; p++) {
      let resp = null
      try {
        resp = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/stocks?token=' +
            encodeURIComponent(token) +
            '&product_id=2940&page_number=' +
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
              '&product_id=2940&page_number=' +
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
      if (!list || list.length === 0) break
      all = all.concat(list)
      if (list.length < 500) break
    }

    const movs = all
      .filter((x) => x && Number(x.product_id) === 2940)
      .map((x) => ({
        id: num(x.id),
        ot: String(x.operation_type || ''),
        ds: String(x.operation_ds || ''),
        dt: String(x.movement_dt || ''),
        q: num(x.quantity !== undefined ? x.quantity : x.qt),
        cost: parseMoney(x.cost_unit_price),
        sb: num(x.stock_balance),
        rawKeys: Object.keys(x).join(','),
      }))
      .sort((a, b) => a.id - b.id)

    write('DIAG5_MOV_KEYS', movs.length > 0 ? movs[0].rawKeys : 'sem movimentações')
    write('DIAG5_TOTAL', 'movs=' + movs.length + ' paginas_brutas=' + all.length)

    const byDs = {}
    for (let i = 0; i < movs.length; i++) {
      const k = movs[i].ot + ' :: ' + movs[i].ds.substring(0, 50)
      byDs[k] = (byDs[k] || 0) + 1
    }
    write('DIAG5_BYDS', JSON.stringify(byDs).substring(0, 2400))

    // saldo via replay (entradas somam, saídas subtraem)
    let saldoReplay = 0
    let maxSb = 0
    let lastSb = 0
    for (let i = 0; i < movs.length; i++) {
      if (movs[i].ot === 'Entrada') saldoReplay += Math.abs(movs[i].q)
      else saldoReplay -= Math.abs(movs[i].q)
      if (movs[i].sb > maxSb) maxSb = movs[i].sb
      lastSb = movs[i].sb
    }
    write(
      'DIAG5_SALDO',
      'replay=' + saldoReplay + ' max_stock_balance=' + maxSb + ' last_stock_balance=' + lastSb,
    )

    // últimas 14 movimentações (ordem id desc)
    const ult = []
    for (let i = movs.length - 1; i >= 0 && ult.length < 14; i--) {
      const m = movs[i]
      ult.push(
        m.id +
          '|' +
          m.ot.substring(0, 3) +
          '|' +
          m.ds.substring(0, 34) +
          '|q' +
          m.q +
          '|R$' +
          m.cost +
          '|sb' +
          m.sb +
          '|' +
          m.dt.substring(0, 10),
      )
    }
    write('DIAG5_ULT', ult.join(' ; '))

    // TODAS as NFs de compra com custo>0 (mais recentes primeiro) até 16
    const comprasDesc = movs
      .filter(
        (m) =>
          m.ot === 'Entrada' && m.ds.indexOf('Nota fiscal - Compra') >= 0 && m.cost > 0 && m.q > 0,
      )
      .reverse()
    const cd = comprasDesc
      .slice(0, 16)
      .map((m) => m.id + '|q' + m.q + '|R$' + m.cost + '|' + m.dt.substring(0, 10))
    write(
      'DIAG5_COMPRAS',
      'nComprasCusto=' + comprasDesc.length + ' :: ' + cd.join(' ; ').substring(0, 2200),
    )

    const r2 = (v) => Math.round(v * 100) / 100

    // (a) cobertura = saldo REPLAY (total: disponível + empenhado) com NFs de compra
    const cobertura = (saldo, lista) => {
      let rem = saldo
      let sw = 0
      let sq = 0
      for (let i = 0; i < lista.length && rem > 0; i++) {
        const take = Math.min(rem, lista[i].q)
        sw += take * lista[i].cost
        sq += take
        rem -= take
      }
      return sq > 0 ? r2(sw / sq) : null
    }
    // (c) média ponderada de TODAS as compras (histórico completo, sem cobertura)
    let cSw = 0
    let cSq = 0
    for (let i = 0; i < comprasDesc.length; i++) {
      cSw += comprasDesc[i].q * comprasDesc[i].cost
      cSq += comprasDesc[i].q
    }
    // (d) cobertura de saldo total com TODAS as Entradas (qualquer tipo, custo>0)
    const entradasDesc = movs.filter((m) => m.ot === 'Entrada' && m.cost > 0 && m.q > 0).reverse()

    write(
      'DIAG5_HIPOTESES',
      '(a) cobertura_compras_saldo_replay=' +
        cobertura(saldoReplay, comprasDesc) +
        ' | (c) media_ponderada_todas_compras=' +
        (cSq > 0 ? r2(cSw / cSq) : '-') +
        ' | (d) cobertura_entradas_saldo_replay=' +
        cobertura(saldoReplay, entradasDesc),
    )
    console.log('[Diag5] concluído para 2940')
  },
  (app) => {
    // no-op
  },
)
