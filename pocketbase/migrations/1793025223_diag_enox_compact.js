migrate(
  (app) => {
    const log = (msg, data) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_enox_compact')
        r.set('acao', msg)
        r.set(
          'detalhes',
          typeof data === 'string' ? data.slice(0, 10000) : JSON.stringify(data).slice(0, 10000),
        )
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (e) {
        // ignore
      }
    }

    const allDisps = app.findRecordsByFilter(
      'dispensacoes_spincare',
      'id != ""',
      'spincare_id',
      5000,
      0,
    )
    const rows = []
    let s_exp_sent = 0
    let s_exp_qt = 0
    let s_crt_sent = 0
    let s_crt_qt = 0

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
          const expDt = (d.getString('expected_deliver_dt') || '').slice(0, 10)
          const crtDt = (py.creation_dt || '').slice(0, 10)
          const sq = Number(it.sent_qt || 0)
          const q = Number(it.qt || 0)
          const ret = Number(it.returned_qt || 0)

          if (expDt >= '2026-09-01' && expDt <= '2026-09-30') {
            s_exp_sent += sq
            s_exp_qt += q
          }
          if (crtDt >= '2026-09-01' && crtDt <= '2026-09-30') {
            s_crt_sent += sq
            s_crt_qt += q
          }

          rows.push({
            id: d.get('spincare_id'),
            exp: expDt,
            crt: crtDt,
            st: d.getString('status'),
            sq: sq,
            q: q,
            ret: ret,
            p: (d.getString('patient_name') || '').slice(0, 15),
          })
        }
      }
    }

    log('SOMA_STATS', {
      totalEnoxDisps: rows.length,
      exp_sent: s_exp_sent,
      exp_qt: s_exp_qt,
      crt_sent: s_crt_sent,
      crt_qt: s_crt_qt,
      rows: rows,
    })
  },
  (app) => {},
)
