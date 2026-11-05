/**
 * Análise de estatísticas dos itens de dispensação via JSON.parse
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_9')
        r.set('acao', tag)
        r.set('usuario_nome', 'sistema')
        r.set('status_novo', 'probe')
        r.set('detalhes', String(detalhes).slice(0, 1800))
        app.save(r)
      } catch (_) {}
    }

    try {
      const allDisp = app.findRecordsByFilter(
        'dispensacoes_spincare',
        'id != ""',
        '-created',
        100,
        0,
      )
      let totalItens = 0
      let sentGreaterThanZero = 0
      let sentEqualsZero = 0
      let sentTotalSum = 0
      let qtTotalSum = 0
      let itemStatuses = {}

      for (let i = 0; i < allDisp.length; i++) {
        let itens = []
        const raw = allDisp[i].get('itens')
        if (typeof raw === 'string') {
          try {
            itens = JSON.parse(raw)
          } catch (_) {}
        } else if (Array.isArray(raw)) {
          if (typeof raw[0] === 'number') {
            // byte array!
            try {
              const str = String.fromCharCode.apply(null, raw)
              itens = JSON.parse(str)
            } catch (_) {}
          } else {
            itens = raw
          }
        }

        for (let j = 0; j < itens.length; j++) {
          totalItens++
          const it = itens[j]
          const sq = Number(it.sent_qt || 0)
          const q = Number(it.qt || 0)
          const st = String(it.status || 'sem_status')
          itemStatuses[st] = (itemStatuses[st] || 0) + 1
          if (sq > 0) sentGreaterThanZero++
          else sentEqualsZero++
          sentTotalSum += sq
          qtTotalSum += q
        }
      }

      log(
        'DISP_STATS_CORRECT',
        'totalItens=' +
          totalItens +
          ' sent>0=' +
          sentGreaterThanZero +
          ' sent=0=' +
          sentEqualsZero +
          ' sentSum=' +
          sentTotalSum +
          ' qtSum=' +
          qtTotalSum +
          ' statuses=' +
          JSON.stringify(itemStatuses),
      )
    } catch (err) {
      log('PROBE_9_ERR', String(err))
    }
  },
  (app) => {},
)
