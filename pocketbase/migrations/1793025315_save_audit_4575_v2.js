/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  try {
    const cfgs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!cfgs || cfgs.length === 0) return
    const cfg = cfgs[0]
    let token = (cfg.getString('api_token') || '').trim()
    if (token.startsWith('Bearer ')) token = token.substring(7).trim()
    const baseUrl = (cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration').trim().replace(/\/+$/, '')

    const url = baseUrl + '/integration-engine/get/stocks?product_id=4575'
    const res = $http.send({
      url: url,
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json, text/plain, */*',
      },
      timeout: 15,
    })

    const coll = app.findCollectionByNameOrId('audit_logs')
    const auditRec = new Record(coll)
    auditRec.set('colecao', 'produtos_spincare')
    auditRec.set('registro_id', '4575')
    auditRec.set('acao', 'TEST_STOCKS_4575')
    auditRec.set('detalhes', JSON.stringify({
      statusCode: res.statusCode,
      rawSnippet: (res.raw || '').substring(0, 500),
    }))
    app.save(auditRec)
  } catch (err) {
    try {
      const coll = app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(coll)
      auditRec.set('colecao', 'produtos_spincare')
      auditRec.set('registro_id', '4575')
      auditRec.set('acao', 'TEST_STOCKS_4575_ERR')
      auditRec.set('detalhes', String(err))
      app.save(auditRec)
    } catch (e2) {}
  }
}, (app) => {})
