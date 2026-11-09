/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_direct_2942"')
      if (!rec) return
      const raw = JSON.parse(rec.getString('detalhes'))
      const compras = raw.compras || []

      const coll = app.findCollectionByNameOrId('audit_logs')
      // Grava cada compra como um log individual
      compras.forEach((c, idx) => {
        const r = new Record(coll)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'c2942_' + (idx < 10 ? '0' : '') + idx)
        r.set('acao', 'COMPRA_' + idx)
        r.set(
          'detalhes',
          'id=' +
            c.id +
            ' dt=' +
            c.dt +
            ' qt=' +
            c.qt +
            ' cost=' +
            c.cost_unit_price +
            ' bal=' +
            c.balance,
        )
        app.save(r)
      })
    } catch (_) {}
  },
  (app) => {},
)
