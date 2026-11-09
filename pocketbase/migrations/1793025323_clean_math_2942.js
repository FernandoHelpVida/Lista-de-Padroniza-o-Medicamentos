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
          avg: qSum > 0 ? Number((wSum / qSum).toFixed(4)) : 0,
          avgRound: qSum > 0 ? Math.round((wSum / qSum) * 100) / 100 : 0,
        }
      }

      const coll = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_math_clean')
      r.set('acao', 'MATH_CLEAN')
      r.set(
        'detalhes',
        JSON.stringify({
          t148: calcCoverage(148),
          t1534: calcCoverage(1534),
          t1682: calcCoverage(1682),
          t1723: calcCoverage(1723),
        }),
      )
      app.save(r)
    } catch (_) {}
  },
  (app) => {},
)
