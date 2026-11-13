/**
 * CORREÇÃO IMEDIATA 2940 (Escopolamina 10MG comprimido, código 468) — FÓRMULA v5
 *
 * A varredura az_v5_carimbo_movimentacao (cron temporário) recalcula TODO o
 * catálogo com a fórmula v5, mas em ordem alfabética e 60 produtos/min — o
 * produto 2940 só seria alcançado mais tarde. Esta migração aplica JÁ a mesma
 * fórmula v5 (custo móvel carimbado, provado DIAG5/DIAG5R) ao 2940, lendo a
 * API real: custo_medio = cost_unit_price da movimentação mais recente com
 * custo > 0; ultima_compra = última NF "Nota fiscal - Compra".
 * NENHUM valor é escrito manualmente — só o que a fórmula calcular.
 * Idempotente; grava audit_logs acao=FIX2940_V5.
 */
migrate(
  (app) => {
    const write = (acao, detalhes) => {
      try {
        const auditCol = app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(auditCol)
        rec.set('colecao', 'produtos_spincare')
        rec.set('registro_id', 'fix_2940_v5')
        rec.set('acao', acao)
        rec.set('usuario_nome', 'Correção 2940 v5')
        rec.set('usuario_email', 'diag@helpvida.internal')
        rec.set('usuario_role', 'sistema')
        rec.set('status_novo', 'concluido')
        rec.set('detalhes', String(detalhes || '').substring(0, 2000))
        app.save(rec)
      } catch (e) {
        console.log('[Fix2940] falha ao gravar log: ' + e)
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
        console.log('[Fix2940] token erro: ' + e)
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

    let movs = []
    for (let p = 1; p <= 10; p++) {
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
      if (resp && resp.statusCode === 401) {
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
      movs = movs.concat(list)
      if (list.length < 500) break
    }
    movs = movs.filter((x) => x && Number(x.product_id) === 2940)

    if (movs.length === 0) {
      write('FIX2940_V5', 'sem movimentações na API — nada gravado')
      return
    }

    const sorted = movs.slice().sort((a, b) => {
      const dA = String(a.movement_dt || '')
      const dB = String(b.movement_dt || '')
      if (dB !== dA) return dB.localeCompare(dA)
      return num(b.id) - num(a.id)
    })
    let custoMedio = 0
    for (let i = 0; i < sorted.length; i++) {
      const cost = parseMoney(sorted[i].cost_unit_price)
      if (cost > 0) {
        custoMedio = cost
        break
      }
    }
    let ultimaCompra = 0
    for (let j = 0; j < sorted.length; j++) {
      if (
        sorted[j].operation_type === 'Entrada' &&
        String(sorted[j].operation_ds || '').indexOf('Nota fiscal - Compra') >= 0
      ) {
        const c = parseMoney(sorted[j].cost_unit_price)
        if (c > 0) {
          ultimaCompra = c
          break
        }
      }
    }
    if (!(custoMedio > 0)) custoMedio = ultimaCompra
    if (!(ultimaCompra > 0)) ultimaCompra = custoMedio
    if (!(custoMedio > 0)) {
      write('FIX2940_V5', 'sem custo positivo na API — nada gravado (guard anti-zero)')
      return
    }
    const r2 = (v) => Math.round(v * 100) / 100
    const uc = r2(ultimaCompra)
    const cm = r2(custoMedio)

    try {
      const rec2940 = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 2940')
      if (rec2940) {
        rec2940.set('ultima_compra_price', uc)
        rec2940.set('custo_medio_price', cm)
        rec2940.set('fonte_preco', 'nf_compra')
        rec2940.set('synced_at', new Date().toISOString())
        app.save(rec2940)
        write(
          'FIX2940_V5',
          'gravado uc=' + uc + ' cm=' + cm + ' fonte=nf_compra (fórmula v5 carimbo, API real)',
        )
      } else {
        write('FIX2940_V5', 'produto 2940 não encontrado no banco')
      }
    } catch (eSave) {
      write('FIX2940_V5', 'erro ao salvar: ' + eSave)
    }
    console.log('[Fix2940] concluído: uc=' + uc + ' cm=' + cm)
  },
  (app) => {
    // no-op
  },
)
