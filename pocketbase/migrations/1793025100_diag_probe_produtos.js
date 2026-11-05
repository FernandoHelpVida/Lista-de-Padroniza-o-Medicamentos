/**
 * Diagnóstico ao vivo: endpoints de PRODUTOS e DISPENSAÇÕES da SpinCare.
 * Testa variantes de parâmetros e registra os resultados em audit_logs
 * para leitura posterior via painel.
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_produtos')
        r.set('acao', tag)
        r.set('usuario_nome', 'sistema')
        r.set('status_novo', 'probe')
        r.set('detalhes', String(detalhes).slice(0, 1900))
        app.save(r)
      } catch (_) {}
    }

    let cfg = null
    try {
      const recs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (recs && recs.length > 0) cfg = recs[0]
    } catch (_) {}
    if (!cfg) {
      log('PRODUTO_PROBE_CFG', 'sem config')
      return
    }

    const baseUrl = (
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    const login = (cfg.getString('api_login') || '').trim()
    const password = (cfg.getString('api_password') || '').trim()
    let token = (cfg.getString('api_token') || '').trim()
    if (token.startsWith('Bearer ')) token = token.substring(7).trim()

    const fetchFreshToken = () => {
      if (!login || !password) return ''
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
      } catch (_) {}
      return ''
    }

    const tryGet = (label, path, qs) => {
      const url = baseUrl + path + '?' + qs
      try {
        const res = $http.send({
          url: url,
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'HelpVida-SpinCare-Produtos/1.0',
            Authorization: token ? 'Bearer ' + token : undefined,
          },
          timeout: 20,
        })
        let body = ''
        try {
          body = res.raw ? String(res.raw) : ''
        } catch (_) {}
        log(
          'PRODUTO_PROBE_' + label,
          'url=' +
            url.replace(token, '***') +
            ' | status=' +
            res.statusCode +
            ' | body=' +
            body.slice(0, 700),
        )
        return res
      } catch (err) {
        log('PRODUTO_PROBE_' + label, 'url=' + url.replace(token, '***') + ' | EXC=' + String(err))
        return null
      }
    }

    // garante token válido
    let probe = tryGet(
      'TOKEN_CHECK_P',
      '/integration-engine/get/products',
      'page_number=1&page_size=1',
    )
    if (!probe || probe.statusCode === 401 || probe.statusCode === 400) {
      const fresh = fetchFreshToken()
      if (fresh) {
        token = fresh
        try {
          cfg.set('api_token', fresh)
          app.save(cfg)
        } catch (_) {}
        log('PRODUTO_PROBE_TOKEN', 'token renovado com sucesso')
        probe = tryGet(
          'TOKEN_RETRY_P',
          '/integration-engine/get/products',
          'page_number=1&page_size=1',
        )
      }
    }

    // ---- PRODUTOS: variantes de query ----
    tryGet('PROD_A', '/integration-engine/get/products', 'page_number=1&page_size=3')
    tryGet(
      'PROD_B',
      '/integration-engine/get/products',
      'ds=&insurance_id=&page_number=1&page_size=3',
    )
    tryGet(
      'PROD_C',
      '/integration-engine/get/products',
      'ds=a&insurance_id=0&page_number=1&page_size=3',
    )
    tryGet(
      'PROD_D',
      '/integration-engine/get/products',
      'ds=&insurance_id=0&page_number=1&page_size=3',
    )
    tryGet(
      'PROD_E',
      '/integration-engine/get/products',
      'ds=LOSARTANA&insurance_id=0&page_number=1&page_size=3',
    )

    const hoje = new Date().toISOString().slice(0, 10)
    const periodo =
      'initial_dt=' +
      encodeURIComponent('2026-01-01 00:00:00') +
      '&final_dt=' +
      encodeURIComponent(hoje + ' 23:59:59')

    // ---- DISPENSAÇÕES: candidatos de endpoint ----
    tryGet(
      'DISP_1',
      '/integration-engine/get/dispensations',
      periodo + '&page_number=1&page_size=3',
    )
    tryGet('DISP_2', '/integration-engine/get/dispensation', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_3', '/integration-engine/get/dispensacoes', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_4', '/integration-engine/get/movements', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_5', '/integration-engine/get/movimentos', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_6', '/integration-engine/get/sales', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_7', '/integration-engine/get/consumption', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_8', '/integration-engine/get/bills', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_9', '/integration-engine/get/invoices', periodo + '&page_number=1&page_size=3')
    tryGet('DISP_10', '/integration-engine/get/billings', periodo + '&page_number=1&page_size=3')
    tryGet(
      'DISP_11',
      '/integration-engine/get/stock-movements',
      periodo + '&page_number=1&page_size=3',
    )
    tryGet(
      'DISP_12',
      '/integration-engine/get/products/movements',
      periodo + '&page_number=1&page_size=3',
    )

    log('PRODUTO_PROBE_FIM', 'sondagem concluída ' + new Date().toISOString())
  },
  (app) => {},
)
