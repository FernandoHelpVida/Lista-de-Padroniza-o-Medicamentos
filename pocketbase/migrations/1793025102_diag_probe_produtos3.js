/**
 * Diagnóstico 3: estrutura completa de 1 dispensação + paginação de produtos.
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_produtos3')
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
      log('P3_CFG', 'sem config')
      return
    }

    const baseUrl = (
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    let token = (cfg.getString('api_token') || '').trim()
    if (token.startsWith('Bearer ')) token = token.substring(7).trim()
    const tq = 'token=' + encodeURIComponent(token)

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
          timeout: 60,
        })
        let body = ''
        try {
          body = res.raw ? String(res.raw) : ''
        } catch (_) {}
        log('P3_' + label + '_ST', 'status=' + res.statusCode + ' len=' + body.length)
        const compact = body.replace(/\s+/g, ' ')
        for (let i = 0; i < Math.min(compact.length, 1440); i += 360) {
          log('P3_' + label + '_B' + i, compact.slice(i, i + 360))
        }
        return res
      } catch (err) {
        log('P3_' + label + '_EXC', String(err).slice(0, 200))
        return null
      }
    }

    // 1 dispensação completa (page_size=1) para mapear os campos dos itens
    tryGet(
      'DISP1',
      '/integration-engine/get/dispensations',
      tq +
        '&initial_dt=' +
        encodeURIComponent('2026-01-01 00:00:00') +
        '&final_dt=' +
        encodeURIComponent('2026-01-31 23:59:59') +
        '&page_number=1&page_size=1',
    )
    // página 2 para confirmar paginação por data
    tryGet(
      'DISP2',
      '/integration-engine/get/dispensations',
      tq +
        '&initial_dt=' +
        encodeURIComponent('2026-01-01 00:00:00') +
        '&final_dt=' +
        encodeURIComponent('2026-01-31 23:59:59') +
        '&page_number=2&page_size=1',
    )
    // produtos: página grande para ver se aceita page_size alto
    tryGet('PRODBIG', '/integration-engine/get/products', tq + '&ds=&page_number=1&page_size=400')
    // produtos: página além do fim
    tryGet('PRODEND', '/integration-engine/get/products', tq + '&ds=&page_number=400&page_size=400')

    log('P3_FIM', 'sondagem 3 concluída ' + new Date().toISOString())
  },
  (app) => {},
)
