/**
 * Diagnóstico 4: paginação de dispensações (page_size alto) e janela mensal grande.
 * Descobrimos: dispensações paginam por data esperada de entrega; produtos 404
 * quando a página ultrapassa o fim (sinal de fim). Agora medimos volume.
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_produtos4')
        r.set('acao', tag)
        r.set('usuario_nome', 'sistema')
        r.set('status_novo', 'probe')
        r.set('detalhes', String(detalhes).slice(0, 1700))
        app.save(r)
      } catch (_) {}
    }

    let cfg = null
    try {
      const recs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (recs && recs.length > 0) cfg = recs[0]
    } catch (_) {}
    if (!cfg) {
      log('P4_CFG', 'sem config')
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
        let qtDisp = -1
        if (label.indexOf('DISP') === 0) {
          try {
            const json = JSON.parse(body)
            if (Array.isArray(json)) qtDisp = json.length
          } catch (_) {}
        }
        log(
          'P4_' + label,
          'status=' + res.statusCode + ' len=' + body.length + ' qt_dispensacoes=' + qtDisp,
        )
        return res
      } catch (err) {
        log('P4_' + label + '_EXC', String(err).slice(0, 200))
        return null
      }
    }

    const janela = (i, f) =>
      'initial_dt=' +
      encodeURIComponent(i + ' 00:00:00') +
      '&final_dt=' +
      encodeURIComponent(f + ' 23:59:59') +
      '&'

    // Volume: janeiro/2026 com page_size=200, páginas 1 e 2
    tryGet(
      'DISP_JAN_P1',
      '/integration-engine/get/dispensations',
      tq + '&' + janela('2026-01-01', '2026-01-31') + 'page_number=1&page_size=200',
    )
    tryGet(
      'DISP_JAN_P2',
      '/integration-engine/get/dispensations',
      tq + '&' + janela('2026-01-01', '2026-01-31') + 'page_number=2&page_size=200',
    )
    // Além do fim dentro da janela: confirma 404/[] como sinal de parada
    tryGet(
      'DISP_JAN_P99',
      '/integration-engine/get/dispensations',
      tq + '&' + janela('2026-01-01', '2026-01-31') + 'page_number=99&page_size=200',
    )
    // janela mensal com page_size=500
    tryGet(
      'DISP_JAN_P1_500',
      '/integration-engine/get/dispensations',
      tq + '&' + janela('2026-01-01', '2026-01-31') + 'page_number=1&page_size=500',
    )
    // período completo até hoje, página 1 page_size=500 (ver timeout/volume)
    tryGet(
      'DISP_TUDO_P1',
      '/integration-engine/get/dispensations',
      tq + '&' + janela('2026-01-01', '2026-11-05') + 'page_number=1&page_size=500',
    )
    // produtos: página 2 com 400 (deve ter conteúdo ou 404)
    tryGet(
      'PROD_P2_400',
      '/integration-engine/get/products',
      tq + '&ds=&page_number=2&page_size=400',
    )

    log('P4_FIM', 'sondagem 4 concluída ' + new Date().toISOString())
  },
  (app) => {},
)
