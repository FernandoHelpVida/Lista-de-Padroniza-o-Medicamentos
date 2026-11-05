/**
 * Sonda Swagger UI e endpoints de dispensação da SpinCare para identificar
 * campos exatos de "enviado para casa" e "custo médio".
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc')
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
      log('PROBE_SWAGGER_ERR', 'sem config')
      return
    }

    const baseUrl = (
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    let token = (cfg.getString('api_token') || '').trim()
    if (token.startsWith('Bearer ')) token = token.substring(7).trim()

    // 1. Tentar ler swagger / openapi docs JSON
    const swaggerPaths = [
      '/v2/api-docs',
      '/v3/api-docs',
      '/swagger/v1/swagger.json',
      '/swagger-resources',
      '/api-docs',
    ]

    for (let i = 0; i < swaggerPaths.length; i++) {
      const sp = swaggerPaths[i]
      try {
        const res = $http.send({
          url: baseUrl + sp,
          method: 'GET',
          headers: { Accept: 'application/json' },
          timeout: 10,
        })
        log(
          'SWAGGER_DOC_' + i,
          'path=' + sp + ' status=' + res.statusCode + ' len=' + (res.raw ? res.raw.length : 0),
        )
        if (res.statusCode === 200 && res.raw) {
          // Procurar menções de dispensations / products / home_delivery / sent / delivered / custo
          const raw = res.raw
          const idxDisp = raw.indexOf('/get/dispensations')
          if (idxDisp >= 0) {
            log('SWAGGER_DISP_SNIP', raw.substring(idxDisp, idxDisp + 1500))
          }
        }
      } catch (err) {
        log('SWAGGER_ERR_' + i, sp + ' ' + String(err))
      }
    }

    // 2. Inspecionar uma dispensação real completa e seus itens (chaves de cada nível)
    try {
      const dispRec = app.findFirstRecordByFilter('dispensacoes_spincare', 'id != ""', {})
      if (dispRec) {
        const payloadStr = dispRec.getString('payload') || '{}'
        const py = JSON.parse(payloadStr)
        const keysRoot = Object.keys(py).join(', ')
        let keysItem = 'none'
        let itemSample = ''
        if (py.items && py.items.length > 0) {
          keysItem = Object.keys(py.items[0]).join(', ')
          itemSample = JSON.stringify(py.items[0])
        }
        log('LOCAL_DISP_KEYS', 'root: ' + keysRoot + ' | items[0]: ' + keysItem)
        log('LOCAL_DISP_SAMPLE', itemSample)
      }
    } catch (err) {
      log('LOCAL_DISP_ERR', String(err))
    }

    // 3. Inspecionar produtos para ver se a API tem campo de custo médio
    try {
      const prodRec = app.findFirstRecordByFilter('produtos_spincare', 'id != ""', {})
      if (prodRec) {
        const payloadStr = prodRec.getString('payload') || '{}'
        const py = JSON.parse(payloadStr)
        const keysRoot = Object.keys(py).join(', ')
        log('LOCAL_PROD_KEYS', 'prod root keys: ' + keysRoot)
        log(
          'LOCAL_PROD_SAMPLE',
          JSON.stringify({
            price: py.price,
            last_buy_value: py.last_buy_value,
            imported_prices: py.imported_prices,
            avg_cost: py.avg_cost,
            average_cost: py.average_cost,
            custo_medio: py.custo_medio,
            cost: py.cost,
          }),
        )
      }
    } catch (err) {
      log('LOCAL_PROD_ERR', String(err))
    }
  },
  (app) => {},
)
