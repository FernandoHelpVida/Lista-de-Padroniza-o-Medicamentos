migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_null_exp_disps')
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
        'dispensacoes_spincare',
        'spincare_id = 58393 || spincare_id = 58484 || spincare_id = 58657',
        'id',
        10,
        0,
      )
      log('LOCAL_COUNT', 'Found ' + list.length + ' in dispensacoes_spincare')
      for (let i = 0; i < list.length; i++) {
        const rec = list[i]
        let py = {}
        try {
          py = JSON.parse(rec.getString('payload') || '{}')
        } catch (_) {}
        log(
          'REC_' + rec.get('spincare_id'),
          JSON.stringify({
            spincare_id: rec.get('spincare_id'),
            exp_field: rec.getString('expected_deliver_dt'),
            py_exp: py.expected_deliver_dt,
            py_crt: py.creation_dt,
            py_ret: py.returned_dt,
            st: rec.getString('status'),
          }),
        )
      }
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
