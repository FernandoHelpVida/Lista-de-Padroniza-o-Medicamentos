/**
 * DIAGNÓSTICO v5b — VALIDAÇÃO DA HIPÓTESE "CARIMBO" EM TODAS AS RÉGUAS
 *
 * DIAG5 provou no 2940 que o SpinCare carimba o custo médio corrente em cada
 * movimentação (Saída "Envio da dispensação" e "Ajuste de Inventário" com
 * cost_unit_price = 0,39 = CM exibido; última NF de compra = 0,24 = UC exibida).
 *
 * Hipótese geral a validar: custo_medio = cost_unit_price da movimentação mais
 * recente (maior id) com custo > 0. Teste em TODAS as régues canônicas + 4383 +
 * 2940, comparando com os valores exibidos pelo SpinCare:
 *   2942=0,31/0,30 · 4575=3,52/3,52 · 2645=54,50/54,50 · 2915=8,40/9,50 ·
 *   2916=10,00/10,12 · 2917=15,00/15,70 · 2578=0,13/0,13 · 2944=1,56/1,52 ·
 *   2940=0,24/0,39 (4383 = api_cost_zero, entradas com custo 0)
 *
 * Grava audit_logs acao=DIAG5R_<id>. Idempotente.
 */
migrate(
  (app) => {
    const write = (acao, detalhes) => {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'produtos_spincare')
        rec.set('registro_id', 'diag_cm_v5b')
        rec.set('acao', acao)
        rec.set('usuario_nome', 'Diagnóstico CM v5b')
        rec.set('usuario_email', 'diag@helpvida.internal')
        rec.set('usuario_role', 'sistema')
        rec.set('status_novo', 'concluido')
        rec.set('detalhes', String(detalhes || '').substring(0, 2000))
        app.save(rec)
      } catch (e) {
        console.log('[Diag5b] falha ao gravar log ' + acao + ': ' + e)
      }
    }

    const configs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!configs || configs.length === 0) return
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
        console.log('[Diag5b] token erro: ' + e)
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
    const fetchStocks = (pid) => {
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
              pid +
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
        if (resp && resp.statusCode === 401) {
          token = fetchToken()
          try {
            resp = $http.send({
              url:
                baseUrl +
                '/integration-engine/get/stocks?token=' +
                encodeURIComponent(token) +
                '&product_id=' +
                pid +
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
      return all.filter((x) => x && Number(x.product_id) === pid)
    }

    const r2 = (v) => Math.round(v * 100) / 100
    const IDS = [2940, 2944, 2942, 4575, 2645, 2915, 2916, 2917, 2578, 4383]

    for (let k = 0; k < IDS.length; k++) {
      const pid = IDS[k]
      try {
        const movs = fetchStocks(pid)
          .map((x) => ({
            id: num(x.id),
            ot: String(x.operation_type || ''),
            ds: String(x.operation_ds || ''),
            q: num(x.quantity !== undefined ? x.quantity : x.qt),
            cost: parseMoney(x.cost_unit_price),
          }))
          .sort((a, b) => a.id - b.id)
        if (movs.length === 0) {
          write('DIAG5R_' + pid, 'sem movimentações')
          continue
        }
        // hipótese carimbo: última movimentação com custo>0 (qualquer tipo)
        let lastStamp = null
        let lastSaidaStamp = null
        for (let i = movs.length - 1; i >= 0; i--) {
          const m = movs[i]
          if (m.cost > 0) {
            if (lastStamp === null) lastStamp = m
            if (m.ot === 'Saída' && lastSaidaStamp === null) lastSaidaStamp = m
          }
        }
        // UC e cobertura (fórmula antiga) para comparação
        const compras = movs.filter(
          (m) => m.ot === 'Entrada' && m.ds.indexOf('Nota fiscal - Compra') >= 0 && m.q > 0,
        )
        let uc = null
        let cobertura = null
        let saldo = 0
        for (let i = 0; i < movs.length; i++) {
          saldo += movs[i].ot === 'Entrada' ? Math.abs(movs[i].q) : -Math.abs(movs[i].q)
        }
        if (compras.length > 0) {
          uc = compras[compras.length - 1].cost
          let rem = saldo > 0 ? saldo : 0
          let sw = 0
          let sq = 0
          for (let i = compras.length - 1; i >= 0 && rem > 0; i--) {
            const m = compras[i]
            if (!(m.cost > 0)) continue
            const take = Math.min(rem, m.q)
            sw += take * m.cost
            sq += take
            rem -= take
          }
          if (sq > 0) cobertura = r2(sw / sq)
        }
        write(
          'DIAG5R_' + pid,
          'nMovs=' +
            movs.length +
            ' saldoReplay=' +
            saldo +
            ' | CARIMBO_ultima=' +
            (lastStamp
              ? lastStamp.cost + ' (' + lastStamp.ot + ' ' + lastStamp.ds.substring(0, 30) + ')'
              : '-') +
            ' | CARIMBO_ultima_saida=' +
            (lastSaidaStamp ? lastSaidaStamp.cost : '-') +
            ' | UC=' +
            (uc === null ? '-' : uc) +
            ' | cobertura_antiga=' +
            (cobertura === null ? '-' : cobertura),
        )
      } catch (ePid) {
        write('DIAG5R_' + pid, 'erro: ' + ePid)
      }
    }
    console.log('[Diag5b] concluído')
  },
  (app) => {
    // no-op
  },
)
