/**
 * Inspeciona 10 itens de dispensação para ver se existe outro campo (ex: home, delivery, casa)
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_10')
        r.set('acao', tag)
        r.set('usuario_nome', 'sistema')
        r.set('status_novo', 'probe')
        r.set('detalhes', String(detalhes).slice(0, 1800))
        app.save(r)
      } catch (_) {}
    }

    try {
      const rec = app.findFirstRecordByFilter('dispensacoes_spincare', 'status = "Finalizado"', {})
      if (rec) {
        const pyStr = rec.getString('payload') || '{}'
        const py = JSON.parse(pyStr)
        log(
          'DISP_ROOT_OBJ',
          JSON.stringify({
            send_reason: py.send_reason,
            stock_location: py.stock_location,
            status: py.status,
            status_id: py.status_id,
            priority: py.priority,
            expected_deliver_dt: py.expected_deliver_dt,
            returned_dt: py.returned_dt,
          }),
        )
        if (py.items && py.items.length > 0) {
          log('DISP_ITEM_OBJ', JSON.stringify(py.items[0]))
        }
      }
    } catch (err) {
      log('PROBE_10_ERR', String(err))
    }
  },
  (app) => {},
)
