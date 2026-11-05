/**
 * Análise de estatísticas dos itens de dispensação: sent_qt, qt, returned_qt, consumption_qt
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_7')
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
      let returnedGreaterThanZero = 0
      let consumptionGreaterThanZero = 0
      let itemStatuses = {}

      for (let i = 0; i < allDisp.length; i++) {
        const itens = allDisp[i].get('itens') || []
        if (!Array.isArray(itens)) continue
        for (let j = 0; j < itens.length; j++) {
          totalItens++
          const it = itens[j]
          const sq = Number(it.sent_qt || 0)
          const rq = Number(it.returned_qt || 0)
          const cq = Number(it.consumption_qt || 0)
          const st = String(it.status || 'sem_status')
          itemStatuses[st] = (itemStatuses[st] || 0) + 1
          if (sq > 0) sentGreaterThanZero++
          if (rq > 0) returnedGreaterThanZero++
          if (cq > 0) consumptionGreaterThanZero++
        }
      }

      log(
        'DISP_STATS',
        'totalItens=' +
          totalItens +
          ' sent>0=' +
          sentGreaterThanZero +
          ' ret>0=' +
          returnedGreaterThanZero +
          ' cons>0=' +
          consumptionGreaterThanZero +
          ' statuses=' +
          JSON.stringify(itemStatuses),
      )
    } catch (err) {
      log('PROBE_7_ERR', String(err))
    }
  },
  (app) => {},
)
