migrate(
  (app) => {
    const log = (msg, data) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_enox_390')
        r.set('acao', msg)
        r.set('detalhes', typeof data === 'string' ? data : JSON.stringify(data))
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (_) {}
    }

    // 1. Inspecionar todas as dispensações locais que contenham product_id 2916 ou ENOXAPARINA
    const allDisps = app.findRecordsByFilter(
      'dispensacoes_spincare',
      'id != ""',
      'spincare_id',
      5000,
      0,
    )
    const enoxDisps = []
    for (let i = 0; i < allDisps.length; i++) {
      const d = allDisps[i]
      let itens = []
      try {
        itens = JSON.parse(d.getString('itens') || '[]')
      } catch (_) {}
      let enoxItem = null
      for (let j = 0; j < itens.length; j++) {
        if (
          Number(itens[j].product_id) === 2916 ||
          String(itens[j].product_ds || '').indexOf('ENOXAPARINA') >= 0
        ) {
          enoxItem = itens[j]
          break
        }
      }
      if (enoxItem) {
        let py = {}
        try {
          py = JSON.parse(d.getString('payload') || '{}')
        } catch (_) {}
        enoxDisps.push({
          spincare_id: d.get('spincare_id'),
          status: d.getString('status'),
          expected_deliver_dt: d.getString('expected_deliver_dt'),
          returned_dt: d.getString('returned_dt'),
          creation_dt: py.creation_dt || '',
          sent_qt: Number(enoxItem.sent_qt || 0),
          qt: Number(enoxItem.qt || 0),
          returned_qt: Number(enoxItem.returned_qt || 0),
          it_status: enoxItem.status || '',
          patient_name: d.getString('patient_name'),
        })
      }
    }

    // Hipóteses de soma para setembro/2026 (01/09/2026 a 30/09/2026)
    // H1: expected_deliver_dt entre 2026-09-01 e 2026-09-30 (atual)
    let sumH1_sent = 0
    let sumH1_qt = 0
    let sumH1_sent_minus_ret = 0

    // H2: creation_dt entre 2026-09-01 e 2026-09-30
    let sumH2_sent = 0
    let sumH2_qt = 0

    // H3: expected_deliver_dt ou creation_dt
    // H4: todas em que expected_deliver_dt começa com 2026-09
    // H5: status != "Cancelado"
    for (let k = 0; k < enoxDisps.length; k++) {
      const row = enoxDisps[k]
      const expDt = (row.expected_deliver_dt || '').slice(0, 10)
      const crtDt = (row.creation_dt || '').slice(0, 10)

      if (expDt >= '2026-09-01' && expDt <= '2026-09-30') {
        sumH1_sent += row.sent_qt
        sumH1_qt += row.qt
        sumH1_sent_minus_ret += row.sent_qt - row.returned_qt
      }
      if (crtDt >= '2026-09-01' && crtDt <= '2026-09-30') {
        sumH2_sent += row.sent_qt
        sumH2_qt += row.qt
      }
    }

    log('RESULT_HYPOTHESIS_SOMA', {
      totalEnoxLocalDisps: enoxDisps.length,
      H1_expDt_sent_qt: sumH1_sent,
      H1_expDt_qt: sumH1_qt,
      H1_expDt_sent_minus_returned: sumH1_sent_minus_ret,
      H2_crtDt_sent_qt: sumH2_sent,
      H2_crtDt_qt: sumH2_qt,
      sampleRows: enoxDisps,
    })

    // 2. Inspecionar Swagger v3/api-docs e endpoints de compras/estoque
    const cfgRecs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (cfgRecs.length > 0) {
      const cfg = cfgRecs[0]
      const baseUrl = (
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfg.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      // Consultar stocks do produto 2916
      let stockRes = null
      try {
        stockRes = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/stocks?token=' +
            encodeURIComponent(token) +
            '&product_id=2916&page_size=500',
          method: 'GET',
          timeout: 15,
        })
      } catch (_) {}
      let stockData = []
      try {
        stockData = stockRes.json || JSON.parse(stockRes.raw || '[]')
      } catch (_) {}

      // Filtrar entradas com cost_unit_price
      const entradas = []
      for (let s = 0; s < stockData.length; s++) {
        const it = stockData[s]
        if (it.operation_type === 'Entrada' || Number(it.cost_unit_price || 0) > 0) {
          entradas.push({
            id: it.id,
            operation_type: it.operation_type,
            operation_ds: it.operation_ds,
            batch: it.batch,
            cost_unit_price: it.cost_unit_price,
            cost_total_price: it.cost_total_price,
            quantity: it.quantity,
            balance: it.balance,
            batch_fabrication_dt: it.batch_fabrication_dt,
          })
        }
      }

      log('RESULT_STOCK_ENTRADAS', {
        totalStockRows: stockData.length,
        totalEntradas: entradas.length,
        sampleLast5: entradas.slice(-10),
      })
    }
  },
  (app) => {},
)
