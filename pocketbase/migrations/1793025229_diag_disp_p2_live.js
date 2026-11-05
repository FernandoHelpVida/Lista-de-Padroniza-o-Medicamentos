migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_disp_p2_live')
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
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfgRec.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      // Buscar páginas 1 a 5 de dispensações para setembro/2026: initial_dt=2026-09-01&final_dt=2026-09-30
      let totalEnoxDisps = 0
      let sumSent = 0
      let sumQt = 0
      let sumRet = 0
      const enoxList = []

      for (let p = 1; p <= 5; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/dispensations?token=' +
          encodeURIComponent(token) +
          '&initial_dt=2026-09-01&final_dt=2026-09-30&page_number=' +
          p +
          '&page_size=500'
        const res = $http.send({ url: url, method: 'GET', timeout: 25 })
        const list = res.json || JSON.parse(res.raw || '[]')
        if (!Array.isArray(list) || list.length === 0) break
        for (let i = 0; i < list.length; i++) {
          const d = list[i]
          const items = d.items || []
          for (let j = 0; j < items.length; j++) {
            const it = items[j]
            if (
              Number(it.product_id) === 2916 ||
              String(it.product_ds || '').indexOf('ENOXAPARINA 40MG') >= 0
            ) {
              totalEnoxDisps++
              sumSent += Number(it.sent_qt || 0)
              sumQt += Number(it.qt || 0)
              sumRet += Number(it.returned_qt || 0)
              enoxList.push({
                page: p,
                id: d.id,
                exp: d.expected_deliver_dt,
                crt: d.creation_dt,
                st: d.status,
                it_st: it.status,
                sq: it.sent_qt,
                q: it.qt,
                rq: it.returned_qt,
                p: (d.patient_name || '').slice(0, 15),
              })
            }
          }
        }
      }

      log(
        'LIVE_SEPT_SOMA',
        JSON.stringify({
          totalEnoxDisps: totalEnoxDisps,
          sumSent: sumSent,
          sumQt: sumQt,
          sumRet: sumRet,
          items: enoxList,
        }),
      )
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
