migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_print_formulas')
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
        'registro_id = "diag_test_formulas" && acao = "FORMULAS"',
        '-created',
        1,
        0,
      )
      if (list && list.length > 0) {
        const form = JSON.parse(list[0].getString('detalhes') || '{}')
        const keys = Object.keys(form)
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]
          const val = form[k]
          log(k, typeof val === 'number' ? val.toFixed(4) : String(val))
        }
      }
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
