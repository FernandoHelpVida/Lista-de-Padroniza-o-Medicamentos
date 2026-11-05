/**
 * Inspeciona 10 itens de dispensações com status diferentes para verificar os campos numéricos de quantidade
 */
migrate(
  (app) => {
    const auditCol = app.findCollectionByNameOrId('audit_logs')
    const log = (tag, detalhes) => {
      try {
        const r = new Record(auditCol)
        r.set('colecao', 'spincare_config')
        r.set('registro_id', 'probe_swagger_curva_abc_6')
        r.set('acao', tag)
        r.set('usuario_nome', 'sistema')
        r.set('status_novo', 'probe')
        r.set('detalhes', String(detalhes).slice(0, 1800))
        app.save(r)
      } catch (_) {}
    }

    try {
      const recs = app.findRecordsByFilter(
        'dispensacoes_spincare',
        'status = "Finalizado"',
        '-created',
        5,
        0,
      )
      for (let i = 0; i < recs.length; i++) {
        const payloadStr = recs[i].getString('payload') || '{}'
        const py = JSON.parse(payloadStr)
        log(
          'DISP_FIN_' + i,
          'status=' + py.status + ' items=' + JSON.stringify(py.items || []).slice(0, 500),
        )
      }

      // E amostra de produtos com imported_prices
      const prods = app.findRecordsByFilter(
        'produtos_spincare',
        'ultima_compra_price > 0',
        '-created',
        3,
        0,
      )
      for (let i = 0; i < prods.length; i++) {
        const payloadStr = prods[i].getString('payload') || '{}'
        const py = JSON.parse(payloadStr)
        log(
          'PROD_PRICES_' + i,
          'desc=' +
            py.description +
            ' price=' +
            py.price +
            ' imp=' +
            JSON.stringify(py.imported_prices || []),
        )
      }
    } catch (err) {
      log('PROBE_6_ERR', String(err))
    }
  },
  (app) => {},
)
