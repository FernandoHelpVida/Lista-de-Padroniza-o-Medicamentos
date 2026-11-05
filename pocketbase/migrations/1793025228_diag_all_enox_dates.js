migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_all_enox_dates')
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
      const allDisps = app.findRecordsByFilter(
        'dispensacoes_spincare',
        'id != ""',
        'spincare_id',
        5000,
        0,
      )
      const crt2026 = []
      for (let i = 0; i < allDisps.length; i++) {
        const d = allDisps[i]
        let itens = []
        try {
          itens = JSON.parse(d.getString('itens') || '[]')
        } catch (_) {}
        for (let j = 0; j < itens.length; j++) {
          const it = itens[j]
          if (
            Number(it.product_id) === 2916 ||
            String(it.product_ds || '').indexOf('ENOXAPARINA') >= 0
          ) {
            let py = {}
            try {
              py = JSON.parse(d.getString('payload') || '{}')
            } catch (_) {}
            crt2026.push({
              id: d.get('spincare_id'),
              exp_field: d.getString('expected_deliver_dt'),
              py_exp: py.expected_deliver_dt,
              py_crt: py.creation_dt,
              sq: Number(it.sent_qt || 0),
              q: Number(it.qt || 0),
              rq: Number(it.returned_qt || 0),
              st: d.getString('status'),
            })
          }
        }
      }

      log('SAMPLE_10', JSON.stringify(crt2026.slice(0, 10)))
      // Agrupar por mes do py_crt
      const byMonthCrt = {}
      const byMonthExp = {}
      for (let k = 0; k < crt2026.length; k++) {
        const mCrt = String(crt2026[k].py_crt || '').slice(0, 7) || 'sem_crt'
        const mExp =
          String(crt2026[k].py_exp || crt2026[k].exp_field || '').slice(0, 7) || 'sem_exp'
        byMonthCrt[mCrt] = (byMonthCrt[mCrt] || 0) + crt2026[k].sq
        byMonthExp[mExp] = (byMonthExp[mExp] || 0) + crt2026[k].sq
      }
      log('BY_MONTH_CRT', JSON.stringify(byMonthCrt))
      log('BY_MONTH_EXP', JSON.stringify(byMonthExp))
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
