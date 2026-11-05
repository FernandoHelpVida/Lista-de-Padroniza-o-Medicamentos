migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_sept_matches')
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
        'registro_id = "diag_enoxaparina_390" && acao = "DIAG_SEPT_SUMMARY"',
        '-created',
        1,
        0,
      )
      if (list && list.length > 0) {
        const det = list[0].getString('detalhes')
        log('PART1', det.slice(0, 3000))
        if (det.length > 3000) log('PART2', det.slice(3000, 6000))
        if (det.length > 6000) log('PART3', det.slice(6000, 9000))
      }
    } catch (_) {}
  },
  (app) => {},
)
