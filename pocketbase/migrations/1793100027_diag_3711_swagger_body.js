/**
 * ============================================================================
 * 1793100027_diag_3711_swagger_body.js
 * ============================================================================
 * Complemento do DIAG3711_PROVA: o JSON do Swagger respondeu 200 nas duas
 * primeiras URLs mas não parseou como um objeto com `paths` — gravar o CORPO
 * bruto (primeiros 900 chars) para identificar o formato real (Swagger UI com
 * ?schemaKey, versão antiga, ou página HTML) e decidir se a lista de endpoints
 * pode ser extraída de outra forma.
 * NÃO altera produtos — só grava evidência em audit_logs (DIAG3711_PROVA).
 * ============================================================================
 */

migrate(
  (app) => {
    const CHUNK = 180

    const gravarFatias = (app, acao, registroId, texto) => {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const numChunks = Math.max(1, Math.ceil(texto.length / CHUNK))
      for (let c = 0; c < numChunks; c++) {
        const recLog = new Record(auditCol)
        recLog.set('colecao', 'produtos_spincare')
        recLog.set('registro_id', registroId + '_' + c)
        recLog.set('acao', acao)
        recLog.set('usuario_nome', 'Migracao Diag 3711 PROVA')
        recLog.set('usuario_email', 'diag@helpvida.internal')
        recLog.set('usuario_role', 'sistema')
        recLog.set('status_novo', 'sucesso')
        recLog.set('detalhes', texto.substring(c * CHUNK, (c + 1) * CHUNK))
        app.save(recLog)
      }
    }

    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (records && records.length > 0) {
        const cfgRec = records[0]
        const baseUrl = (
          cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
        )
          .trim()
          .replace(/\/+$/, '')

        const urls = [
          baseUrl + '/swagger/v1/swagger.json',
          baseUrl + '/swagger/index.html',
          baseUrl + '/swagger',
        ]
        for (let i = 0; i < urls.length; i++) {
          let out = { url: urls[i], status: 0, corpo: '' }
          try {
            const r = $http.send({
              url: urls[i],
              method: 'GET',
              headers: { Accept: '*/*' },
              timeout: 20,
            })
            out.status = r.statusCode
            out.corpo = String(r.raw || '').slice(0, 900)
          } catch (swE) {
            out.corpo = 'ERRO: ' + String(swE).slice(0, 200)
          }
          gravarFatias(app, 'DIAG3711_PROVA', 'diag3711_swagger_body' + i, JSON.stringify(out))
        }
      } else {
        gravarFatias(
          app,
          'DIAG3711_PROVA',
          'diag3711_swagger_body_erro',
          JSON.stringify({ erro: 'SEM_SPINCARE_CONFIG' }),
        )
      }
    } catch (e) {
      gravarFatias(
        app,
        'DIAG3711_PROVA',
        'diag3711_swagger_body_erro',
        JSON.stringify({ erro: String(e) }),
      )
    }
  },
  (app) => {
    // down: nada a desfazer
  },
)
