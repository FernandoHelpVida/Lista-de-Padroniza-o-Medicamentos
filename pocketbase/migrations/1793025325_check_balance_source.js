/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_direct_2942"')
      if (!rec) return
      const raw = JSON.parse(rec.getString('detalhes'))
      const purchases = [
        { id: 910164, qt: 100, cost: 0.3058 },
        { id: 905288, qt: 100, cost: 0.29 },
        { id: 770957, qt: 100, cost: 0.29 },
        { id: 761374, qt: 40, cost: 0.2425 },
        { id: 668379, qt: 100, cost: 0.2995 },
        { id: 616072, qt: 120, cost: 0.2316 },
        { id: 562407, qt: 140, cost: 0.2298 },
        { id: 508670, qt: 250, cost: 0.38 },
        { id: 482985, qt: 120, cost: 0.24 },
        { id: 469767, qt: 100, cost: 1.0 },
        { id: 361292, qt: 180, cost: 0.41 },
        { id: 359088, qt: 180, cost: 0.41 },
        { id: 337176, qt: 80, cost: 0.26 },
        { id: 309731, qt: 120, cost: 0.26 },
        { id: 290955, qt: 100, cost: 0.94 },
        { id: 223438, qt: 20, cost: 0.96 },
      ]

      // Como o código de spincare_products.js calcula hoje:
      // prodStocks = allStocks
      // currentBalance = 0; for (sbIdx...) if (bVal > 0) { currentBalance = bVal; break; }
      // E qual é a ordem de prodStocks que o endpoint /get/stocks retorna?
      // No log cxnqwici3rbbc3n vimos:
      // sampleBalances: [{"id":112166,"balance":40}, {"id":114152}, ...]
      // Ou seja, a API retorna cronológico ASC (id 112166, depois 114152... até 910164)!
      // Se pegar prodStocks[0], pega a PRIMEIRA movimentação antiga ou a última?
      // Se iterar do início: pega bVal da movimentação antiga!
      // Se ordenar por id desc ou movement_dt desc, pega o saldo MAIS RECENTE!

      const coll = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_balance_order')
      r.set('acao', 'BALANCE_ORDER')
      r.set(
        'detalhes',
        JSON.stringify({
          firstBalance: raw.sampleBalances[0],
          lastPurchBalance: purchases[0],
        }),
      )
      app.save(r)
    } catch (_) {}
  },
  (app) => {},
)
