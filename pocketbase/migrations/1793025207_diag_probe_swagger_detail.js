/**
 * Extrai a definição Swagger de /get/dispensations e /get/products do /v3/api-docs
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_2')
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
        // Procurar caminhos
        const paths = doc.paths || {}
        const dispPath =
          paths['/integration-engine/get/dispensations'] || paths['/get/dispensations']
        log('SWAG_DISP_PATH', JSON.stringify(dispPath || 'not found'))

        // Procurar schemas/components/definitions relacionados a dispensação e produtos
        const components = doc.components || doc.definitions || {}
        const schemas = components.schemas || components || {}
        const schemaNames = Object.keys(schemas)
        log(
          'SWAG_SCHEMAS_LIST',
          schemaNames
            .filter(
              (n) =>
                n.toLowerCase().includes('disp') ||
                n.toLowerCase().includes('prod') ||
                n.toLowerCase().includes('item'),
            )
            .join(', '),
        )

        for (let i = 0; i < schemaNames.length; i++) {
          const name = schemaNames[i]
          const low = name.toLowerCase()
          if (
            low.includes('dispens') ||
            low.includes('itemdisp') ||
            (low.includes('product') && !low.includes('category'))
          ) {
            log('SWAG_SCHEMA_' + name, JSON.stringify(schemas[name]))
          }
        }
      }
    } catch (err) {
      log('SWAG_ERR_PARSE', String(err))
    }
  },
  (app) => {},
)
