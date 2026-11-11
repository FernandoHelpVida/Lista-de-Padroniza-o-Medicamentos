/**
 * DIAGNÓSTICO v4 — TESTE DA HIPÓTESE (f) CM = cost_unit_price da ÚLTIMA ENTRADA
 *
 * Para cada produto-alvo: busca todas as páginas de /get/stocks e calcula:
 *   UC  = cost_unit_price da última Entrada "Nota fiscal - Compra" (régua atual)
 *   f   = cost_unit_price da última Entrada de QUALQUER tipo (id/dt mais recente)
 *   mob = CM móvel replay (id asc: entrada (saldo*cm+q*cost)/(saldo+q); saída mantém cm)
 *   p1  = média ponderada das NFs de compra cobrindo saldo final
 * Alvos: 2944 (esperado 1,52) + 8 réguas + BOBINA 4383 (com dump de operações).
 * Grava 1 linha audit_logs por produto (acao=DIAG4_<id>) + linha resumo DIAG4_RES.
 * Idempotente: em banco vazio não faz nada.
 */
migrate(
  (app) => {
    const configs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!configs || configs.length === 0) {
      console.log('[Diag4] Sem spincare_config — nada a fazer.')
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
        console.log('[Diag4] token erro: ' + e)
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
        if (resp.statusCode !== 200) break
        const list = parseItems(resp)
        if (!list || list.length === 0) break
        all = all.concat(list)
        if (list.length < 500) break
      }
      return all
    }

    const writeLog = (acao, detalhes) => {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'produtos_spincare')
        rec.set('registro_id', 'diag_cm_v4')
        rec.set('acao', acao)
        rec.set('usuario_nome', 'Diagnóstico CM v4')
        rec.set('usuario_email', 'diag@helpvida.internal')
        rec.set('usuario_role', 'sistema')
        rec.set('status_novo', 'concluido')
        rec.set('detalhes', String(detalhes || '').substring(0, 2500))
        app.save(rec)
      } catch (e) {
        console.log('[Diag4] falha ao gravar log ' + acao + ': ' + e)
      }
    }

    const ALVOS = [2944, 2942, 4575, 2645, 2915, 2916, 2917, 2578, 4383]
    const resumo = []

    for (let a = 0; a < ALVOS.length; a++) {
      const prodId = ALVOS[a]
      const all = fetchAll(prodId)
      const movs = all
        .filter((x) => x && Number(x.product_id) === prodId)
        .map((x) => ({
          id: num(x.id),
          tipo: String(x.operation_type || ''),
          ds: String(x.operation_ds || ''),
          q: num(x.quantity !== undefined ? x.quantity : x.qt),
          cost: parseMoney(x.cost_unit_price),
        }))
        .sort((x, y) => x.id - y.id) // cronológico (id asc)

      const comprasDesc = movs
        .filter(
          (m) => m.tipo === 'Entrada' && m.ds.indexOf('Nota fiscal - Compra') >= 0 && m.cost > 0,
        )
        .reverse()
      const entradasDesc = movs.filter((m) => m.tipo === 'Entrada' && m.cost > 0).reverse()

      const uc = comprasDesc.length > 0 ? comprasDesc[0].cost : 0

      // f: última Entrada de qualquer tipo
      const f = entradasDesc.length > 0 ? entradasDesc[0].cost : 0

      // mob: CM móvel replay
      let saldo = 0
      let cm = 0
      for (let i = 0; i < movs.length; i++) {
        const m = movs[i]
        if (m.tipo === 'Entrada') {
          if (m.q > 0) {
            cm =
              saldo + m.q > 0
                ? (saldo * cm + Math.abs(m.q) * m.cost) / (saldo + Math.abs(m.q))
                : m.cost
            saldo += Math.abs(m.q)
          }
        } else {
          saldo -= Math.abs(m.q)
        }
      }

      // p1: ponderada das compras cobrindo saldo final
      let p1 = null
      if (saldo > 0 && comprasDesc.length > 0) {
        let rem = saldo
        let sw = 0
        let sq = 0
        for (let i = 0; i < comprasDesc.length && rem > 0; i++) {
          const c = comprasDesc[i]
          const take = Math.min(rem, c.q > 0 ? c.q : rem)
          sw += take * c.cost
          sq += take
          rem -= take
        }
        if (sq > 0) p1 = Math.round((sw / sq) * 100) / 100
      }

      const r2 = (v) => Math.round(v * 100) / 100
      const linha =
        'uc=' +
        r2(uc) +
        ' f_ult_entrada=' +
        r2(f) +
        ' mob=' +
        r2(cm) +
        ' p1=' +
        (p1 === null ? 'null' : r2(p1)) +
        ' saldo_final=' +
        saldo +
        ' nEntradas=' +
        entradasDesc.length +
        ' nCompras=' +
        comprasDesc.length
      writeLog('DIAG4_' + prodId, linha)
      resumo.push(prodId + ': ' + linha)

      // BOBINA 4383: dump das operações para decidir o tratamento
      if (prodId === 4383) {
        const ops = {}
        for (let i = 0; i < movs.length; i++) {
          const k = movs[i].tipo + ' :: ' + movs[i].ds.substring(0, 60)
          ops[k] = (ops[k] || 0) + 1
        }
        writeLog('DIAG4_4383_OPS', JSON.stringify(ops))
        const ult = movs
          .slice(-12)
          .map(
            (m) => m.id + '|' + m.tipo + '|' + m.ds.substring(0, 40) + '|q' + m.q + '|R$' + m.cost,
          )
        writeLog('DIAG4_4383_ULT', ult.join(' ; '))
      }
    }

    writeLog('DIAG4_RES', resumo.join(' || '))
    console.log('[Diag4] RESUMO: ' + resumo.join(' || '))
  },
  (app) => {
    // no-op
  },
)
