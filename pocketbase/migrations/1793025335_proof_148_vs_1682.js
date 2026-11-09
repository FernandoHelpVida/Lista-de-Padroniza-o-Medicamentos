/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const coll = app.findCollectionByNameOrId('audit_logs')

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
          wSum: wSum,
          avg: qSum > 0 ? wSum / qSum : 0,
          avgRound: qSum > 0 ? Math.round((wSum / qSum) * 100) / 100 : 0,
        }
      }

      // Prova de 148 unidades (saldo disponível atual do 2942)
      const res148 = calcCoverage(148)

      // Prova de 1682 unidades (disponível + empenhado)
      const res1682 = calcCoverage(1682)

      const r148 = new Record(coll)
      r148.set('colecao', 'produtos_spincare')
      r148.set('registro_id', 'diag_proof_148')
      r148.set('acao', 'PROOF_148')
      r148.set('detalhes', JSON.stringify(res148))
      app.save(r148)

      const r1682 = new Record(coll)
      r1682.set('colecao', 'produtos_spincare')
      r1682.set('registro_id', 'diag_proof_1682')
      r1682.set('acao', 'PROOF_1682')
      r1682.set('detalhes', JSON.stringify(res1682))
      app.save(r1682)
    } catch (_) {}
  },
  (app) => {},
)
