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

      const calcCoverage = (targetQty) => {
        let needed = targetQty
        let wSum = 0
        let qSum = 0
        for (let i = 0; i < purchases.length; i++) {
          const p = purchases[i]
          const take = Math.min(needed, p.qt)
          wSum += take * p.cost
          qSum += take
          needed -= take
          if (needed <= 0) break
        }
        return {
          target: targetQty,
          qSum: qSum,
          avg: qSum > 0 ? wSum / qSum : 0,
          avgRound: qSum > 0 ? Math.round((wSum / qSum) * 100) / 100 : 0,
        }
      }

      // Testar várias quantidades:
      // 148 (disponível), 1534 (empenhado), 1682 (148+1534), 1723 (saldo na última compra),
      // 100 (último lote), 200, 300, 340, 440, 560, 700, 950
      const tests = [
        100, 148, 200, 300, 340, 440, 560, 700, 950, 1070, 1170, 1350, 1534, 1682, 1723,
      ].map(calcCoverage)

      // Também testar média aritmética simples de N NFs mais recentes:
      const simpleAvgs = []
      let sumCost = 0
      for (let i = 0; i < purchases.length; i++) {
        sumCost += purchases[i].cost
        simpleAvgs.push({
          n: i + 1,
          avg: sumCost / (i + 1),
          avgRound: Math.round((sumCost / (i + 1)) * 100) / 100,
        })
      }

      const coll = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_math_2942')
      r.set('acao', 'MATH_2942')
      r.set(
        'detalhes',
        JSON.stringify({
          tests: tests,
          simpleAvgs: simpleAvgs.slice(0, 10),
        }),
      )
      app.save(r)
    } catch (err) {
      const coll = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_math_2942')
      r.set('acao', 'MATH_2942_ERR')
      r.set('detalhes', String(err))
      app.save(r)
    }
  },
  (app) => {},
)
