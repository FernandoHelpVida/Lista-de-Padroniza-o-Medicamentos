/**
 * Detalha SWAG_DISP_PATH: parâmetros e schemas de resposta do /get/dispensations
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_3')
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
        const dispPath = paths['/integration-engine/get/dispensations']
        if (dispPath && dispPath.get) {
          log('DISP_PARAMS', JSON.stringify(dispPath.get.parameters || []))
          log('DISP_RESPONSES', JSON.stringify(dispPath.get.responses || {}))
        }

        const prodPath = paths['/integration-engine/get/products']
        if (prodPath && prodPath.get) {
          log('PROD_PARAMS', JSON.stringify(prodPath.get.parameters || []))
          log('PROD_RESPONSES', JSON.stringify(prodPath.get.responses || {}))
        }
      }
    } catch (err) {
      log('SWAG_3_ERR', String(err))
    }
  },
  (app) => {},
)
