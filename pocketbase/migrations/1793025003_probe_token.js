/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
  if (!records || records.length === 0) return

  const cfg = records[0]
  const baseUrl = (
    cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
  )
    .trim()
    .replace(/\/+$/, '')
  const login = (cfg.getString('api_login') || '').trim()
  const password = (cfg.getString('api_password') || '').trim()

  const tokenUrl =
    baseUrl +
    '/token/v1?login=' +
    encodeURIComponent(login) +
    '&password=' +
    encodeURIComponent(password)
  const resToken = $http.send({
    url: tokenUrl,
    method: 'GET',
    headers: { Accept: '*/*' },
    timeout: 15,
  })

  let t = ''
  if (resToken.statusCode === 200) {
    if (typeof resToken.json === 'string') t = resToken.json
    else if (resToken.json && typeof resToken.json === 'object') {
      t = resToken.json.token || resToken.json.access_token || ''
    }
    if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
    if (t.startsWith('Bearer ')) t = t.substring(7).trim()
    cfg.set('api_token', t)
    app.save(cfg)
  }

  const auditCol = app.findCollectionByNameOrId('audit_logs')
  const audit = new Record(auditCol)
  audit.set('colecao', 'spincare_config')
  audit.set('registro_id', 'diag_token_test')
  audit.set('acao', 'TOKEN_PROBE')
  audit.set('usuario_nome', 'Migration Runner')
  audit.set('status_novo', String(resToken.statusCode))
  audit.set(
    'detalhes',
    'Status: ' +
      resToken.statusCode +
      ' Body: ' +
      (resToken.raw ? String(resToken.raw).slice(0, 200) : '') +
      ' TokenObtained: ' +
      (t ? 'yes (' + t.slice(0, 10) + '...)' : 'no'),
  )
  app.save(audit)
})
