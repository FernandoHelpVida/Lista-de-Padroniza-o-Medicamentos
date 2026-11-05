/**
 * Verifica como os itens estão gravados no campo JSON 'itens' e 'payload' em dispensacoes_spincare
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_8')
        r.set('acao', tag)
        r.set('usuario_nome', 'sistema')
        r.set('status_novo', 'probe')
        r.set('detalhes', String(detalhes).slice(0, 1800))
        app.save(r)
      } catch (_) {}
    }

    try {
      const rec = app.findFirstRecordByFilter('dispensacoes_spincare', 'id != ""', {})
      if (rec) {
        log(
          'RAW_ITENS_COL',
          typeof rec.get('itens') + ': ' + JSON.stringify(rec.get('itens')).slice(0, 500),
        )
        const pyStr = rec.getString('payload') || '{}'
        const py = JSON.parse(pyStr)
        log('RAW_PAYLOAD_ITEMS', JSON.stringify(py.items || []).slice(0, 500))
      }
    } catch (err) {
      log('PROBE_8_ERR', String(err))
    }
  },
  (app) => {},
)
