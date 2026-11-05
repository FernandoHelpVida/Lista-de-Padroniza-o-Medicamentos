migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_live_12_items')
        r.set('acao', msg)
        r.set('detalhes', String(str))
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (_) {}
    }

    try {
      const list = app.findRecordsByFilter(
        'audit_logs',
        'registro_id = "diag_disp_p2_live" && acao = "LIVE_SEPT_SOMA"',
        '-created',
        1,
        0,
      )
      if (list && list.length > 0) {
        const det = JSON.parse(list[0].getString('detalhes') || '{}')
        const items = det.items || []
        for (let i = 0; i < items.length; i++) {
          log('ITEM_' + i, JSON.stringify(items[i]))
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
