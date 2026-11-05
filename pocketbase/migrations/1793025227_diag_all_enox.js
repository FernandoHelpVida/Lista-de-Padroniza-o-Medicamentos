migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_all_enox')
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
      const allEnox = []
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
            allEnox.push({
              id: d.get('spincare_id'),
              exp: d.getString('expected_deliver_dt'),
              ret: d.getString('returned_dt'),
              crt: py.creation_dt || '',
              sq: Number(it.sent_qt || 0),
              q: Number(it.qt || 0),
              rq: Number(it.returned_qt || 0),
              st: d.getString('status'),
            })
          }
        }
      }

      // Ordenar por expected_deliver_dt ou id
      allEnox.sort((a, b) => String(a.exp).localeCompare(String(b.exp)))
      log('COUNT', 'Total enox dispensations: ' + allEnox.length)

      // Salvar amostras de agosto, setembro e outubro
      const ago = allEnox.filter((x) => String(x.exp).indexOf('2026-08') === 0)
      const set = allEnox.filter((x) => String(x.exp).indexOf('2026-09') === 0)
      const out = allEnox.filter((x) => String(x.exp).indexOf('2026-10') === 0)
      const semExp = allEnox.filter((x) => !x.exp || x.exp === '—')

      log('AGO', JSON.stringify(ago))
      log('SET', JSON.stringify(set))
      log('OUT', JSON.stringify(out))
      log('SEM_EXP', JSON.stringify(semExp))
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
