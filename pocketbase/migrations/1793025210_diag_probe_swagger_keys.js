/**
 * Imprime as chaves dos objetos example de DISP_EX e PROD_EX
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_5')
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
    if (!cfg) return

    const baseUrl = (
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')

    try {
      const res = $http.send({
        url: baseUrl + '/v3/api-docs',
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 15,
      })
      if (res.statusCode === 200 && res.raw) {
        const doc = JSON.parse(res.raw)
        const paths = doc.paths || {}
        const disp = paths['/integration-engine/get/dispensations']
        const dispEx = disp?.get?.responses?.['200']?.content?.['*/*']?.example
        log('DISP_KEYS', Object.keys(dispEx || {}).join(', '))
        log(
          'DISP_ITEMS_EX',
          JSON.stringify(dispEx?.items || dispEx?.itens || 'no items field in example'),
        )

        const prod = paths['/integration-engine/get/products']
        const prodEx = prod?.get?.responses?.['200']?.content?.['*/*']?.example
        log('PROD_KEYS', Object.keys(prodEx || {}).join(', '))
        log('PROD_EX_FULL_OBJ', JSON.stringify(prodEx || {}))
      }
    } catch (err) {
      log('SWAG_5_ERR', String(err))
    }
  },
  (app) => {},
)
