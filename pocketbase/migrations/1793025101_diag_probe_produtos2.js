/**
 * Diagnóstico ao vivo 2: produtos/dispensações com token na query string.
 * Registra status + início do corpo em audit_logs (logs curtos p/ não truncar).
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_produtos2')
        r.set('acao', tag)
        r.set('usuario_nome', 'sistema')
        r.set('status_novo', 'probe')
        r.set('detalhes', String(detalhes).slice(0, 1800))
        app.save(r)
      } catch (_) {}
    }

    let cfg = null
    try {
      const recs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (recs && recs.length > 0) cfg = recs[0]
    } catch (_) {}
    if (!cfg) {
      log('P2_CFG', 'sem config')
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
        const status = res.statusCode
        log('P2_' + label + '_ST', 'status=' + status + ' len=' + body.length)
        log('P2_' + label + '_B1', body.slice(0, 220).replace(/\s+/g, ' '))
        if (body.length > 220) log('P2_' + label + '_B2', body.slice(220, 440).replace(/\s+/g, ' '))
        if (body.length > 440) log('P2_' + label + '_B3', body.slice(440, 660).replace(/\s+/g, ' '))
        return res
      } catch (err) {
        log('P2_' + label + '_EXC', String(err).slice(0, 200))
        return null
      }
    }

    const tq = 'token=' + encodeURIComponent(token)

    // PRODUTOS com token na query
    tryGet('PROD_Q1', '/integration-engine/get/products', tq + '&page_number=1&page_size=3')
    tryGet(
      'PROD_Q2',
      '/integration-engine/get/products',
      tq + '&ds=&insurance_id=0&page_number=1&page_size=3',
    )
    tryGet(
      'PROD_Q3',
      '/integration-engine/get/products',
      tq + '&ds=losartana&insurance_id=0&page_number=1&page_size=3',
    )
    tryGet(
      'PROD_Q4',
      '/integration-engine/get/products',
      tq + '&ds=losartana&page_number=1&page_size=3',
    )
    tryGet('PROD_Q5', '/integration-engine/get/products', tq + '&ds=&page_number=1&page_size=3')
    tryGet(
      'PROD_Q6',
      '/integration-engine/get/products',
      tq + '&ds=LOS&insurance_id=&page_number=1&page_size=3&companyKey=1',
    )

    const hoje = new Date().toISOString().slice(0, 10)
    const periodo =
      'initial_dt=' +
      encodeURIComponent('2026-01-01 00:00:00') +
      '&final_dt=' +
      encodeURIComponent(hoje + ' 23:59:59') +
      '&'

    // DISPENSAÇÕES com token na query
    tryGet(
      'DISP_Q1',
      '/integration-engine/get/dispensations',
      tq + '&' + periodo + 'page_number=1&page_size=3',
    )
    tryGet(
      'DISP_Q2',
      '/integration-engine/get/dispensation',
      tq + '&' + periodo + 'page_number=1&page_size=3',
    )
    tryGet('DISP_Q3', '/integration-engine/get/dispensations', tq + '&page_number=1&page_size=3')
    tryGet(
      'DISP_Q4',
      '/integration-engine/get/products/movements',
      tq + '&' + periodo + 'page_number=1&page_size=3',
    )
    tryGet(
      'DISP_Q5',
      '/integration-engine/get/sales',
      tq + '&' + periodo + 'page_number=1&page_size=3',
    )
    tryGet(
      'DISP_Q6',
      '/integration-engine/get/dispensations',
      tq + '&patient_id=418&page_number=1&page_size=3',
    )
    tryGet(
      'DISP_Q7',
      '/integration-engine/get/bills',
      tq + '&' + periodo + 'page_number=1&page_size=3',
    )

    log('P2_FIM', 'sondagem 2 concluída ' + new Date().toISOString())
  },
  (app) => {},
)
