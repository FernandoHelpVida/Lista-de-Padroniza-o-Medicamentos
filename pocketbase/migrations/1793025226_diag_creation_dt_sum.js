migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_sept_creation')
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
      const crtSept = []
      let sumSentCrt = 0
      let sumQtCrt = 0

      for (let i = 0; i < allDisps.length; i++) {
        const d = allDisps[i]
        let py = {}
        try {
          py = JSON.parse(d.getString('payload') || '{}')
        } catch (_) {}
        const crt = String(py.creation_dt || '').slice(0, 10)
        const exp = (d.getString('expected_deliver_dt') || '').slice(0, 10)

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
            const sq = Number(it.sent_qt || 0)
            const q = Number(it.qt || 0)
            if (crt >= '2026-09-01' && crt <= '2026-09-30') {
              sumSentCrt += sq
              sumQtCrt += q
              crtSept.push({
                id: d.get('spincare_id'),
                crt: crt,
                exp: exp,
                sq: sq,
                q: q,
                st: d.getString('status'),
                p: (d.getString('patient_name') || '').slice(0, 15),
              })
            }
          }
        }
      }

      log(
        'SUM_CRT',
        JSON.stringify({
          sumSentCrt: sumSentCrt,
          sumQtCrt: sumQtCrt,
          count: crtSept.length,
          items: crtSept,
        }),
      )
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
