/**
 * DIAGNÓSTICO v3 — PROVA DA FÓRMULA "CUSTO MÉDIO MÓVEL PERPETUO"
 *
 * Hipótese: SpinCare calcula o Custo Médio como ERP clássico de média ponderada
 * móvel: percorre TODAS as movimentações do produto em ordem cronológica (id asc)
 * — a cada ENTRADA: CM = (saldo*CM + qt*cost)/(saldo+qt), saldo += qt; a cada
 * SAÍDA: saldo -= qt (CM inalterado). O CM final é o "Custo médio" exibido.
 *
 * Prova: roda o replay para 2944 + as 7 réguas canônicas + BOBINA 4383 e grava
 * em audit_logs (acao=DIAG_CM_MOVEL) os valores: saldo final, CM final,
 * última compra e quantas réguas fecham exatamente.
 *
 * Idempotente: em banco vazio não encontra config e não faz nada.
 */
migrate(
  (app) => {
    const configs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!configs || configs.length === 0) {
      console.log('[DiagMov] Sem spincare_config — nada a fazer.')
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
      } catch (e) {}
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

    const PRODUTOS = [2944, 2942, 4575, 2645, 2915, 2916, 2917, 2578, 4383]
    const REGUAS = {
      2942: [0.31, 0.3],
      4575: [3.52, 3.52],
      2645: [54.5, 54.5],
      2915: [8.4, 9.5],
      2916: [10.0, 10.12],
      2917: [15.0, 15.7],
      2578: [0.13, 0.13],
    }

    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const writeDiag = (acao, detalhes) => {
      const rec = new Record(auditCol)
      rec.set('colecao', 'produtos_spincare')
      rec.set('registro_id', 'diag_cm_movel')
      rec.set('acao', acao)
      rec.set('usuario_nome', 'Diagnóstico CM Móvel')
      rec.set('usuario_email', 'diag@helpvida.internal')
      rec.set('usuario_role', 'sistema')
      rec.set('status_novo', 'concluido')
      rec.set('detalhes', String(detalhes).substring(0, 2400))
      app.save(rec)
    }

    const fetchAllStocks = (prodId) => {
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
        if (!list || list.length === 0) break
        all = all.concat(list)
        if (list.length < 500) break
      }
      return all
    }

    // Replay do CM móvel perpetuo sobre TODAS as movimentações (id asc = cronológico)
    const replay = (movs, prodId) => {
      const ps = movs.filter((x) => x && Number(x.product_id) === Number(prodId))
      const sorted = ps.slice().sort((a, b) => num(a.id) - num(b.id))
      let saldo = 0
      let cm = 0
      let temCm = false
      let ultimaCompra = null
      for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i]
        const opType = String(m.operation_type || '')
        const opDs = String(m.operation_ds || '')
        const qt = num(m.quantity !== undefined && m.quantity !== '' ? m.quantity : m.qt)
        const cost = parseMoney(m.cost_unit_price)
        const isEntrada = opType === 'Entrada' || opDs.indexOf('Entrada') >= 0
        if (isEntrada) {
          const isCompra = opDs.indexOf('Nota fiscal - Compra') >= 0 || opDs.indexOf('Compra') >= 0
          if (isCompra && cost > 0 && qt > 0) {
            // NF de compra com custo: afeta CM
            cm = saldo + qt > 0 ? (saldo * cm + qt * cost) / (saldo + qt) : cost
            temCm = true
            saldo += qt
            ultimaCompra = cost
          } else {
            // Entrada sem custo (ajuste/doação/transferência): entra ao CM corrente
            saldo += qt
            if (cost > 0 && qt > 0) {
              cm = saldo > 0 ? (saldo * cm + qt * cost) / saldo : cm
              temCm = temCm || saldo > 0
            }
          }
        } else {
          saldo -= qt
        }
      }
      return { saldo, cm: temCm ? cm : 0, ultimaCompra }
    }

    let fecham = 0
    const resumo = []
    for (let i = 0; i < PRODUTOS.length; i++) {
      const pid = PRODUTOS[i]
      const movs = fetchAllStocks(pid)
      const r = replay(movs, pid)
      const reg = REGUAS[pid]
      let ok = '-'
      if (reg) {
        const ucOk = Math.round(r.ultimaCompra * 100) / 100 === reg[0]
        const cmOk = Math.round(r.cm * 100) / 100 === reg[1]
        ok = ucOk && cmOk ? 'OK' : 'DIF(regua ' + reg[0] + '/' + reg[1] + ')'
        if (ucOk && cmOk) fecham++
      }
      resumo.push(
        pid +
          ': movs=' +
          movs.filter((x) => x && Number(x.product_id) === Number(pid)).length +
          ' saldo=' +
          Math.round(r.saldo * 100) / 100 +
          ' CM=' +
          Math.round(r.cm * 10000) / 10000 +
          ' UC=' +
          (r.ultimaCompra === null ? '-' : Math.round(r.ultimaCompra * 10000) / 10000) +
          ' ' +
          ok,
      )
    }
    console.log('[DiagMov] ' + resumo.join(' || '))
    writeDiag('DIAG_CM_MOVEL', resumo.join(' || '))
    writeDiag('DIAG_CM_MOVEL_RES', 'reguas_que_fecham=' + fecham + '/7')
  },
  (app) => {
    // no-op
  },
)
