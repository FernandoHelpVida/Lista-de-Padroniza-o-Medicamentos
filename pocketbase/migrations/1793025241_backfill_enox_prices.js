/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 2916')
      if (rec) {
        rec.set('ultima_compra_price', 10.0)
        rec.set('custo_medio_price', 10.12)
        app.save(rec)
      }
    } catch (e) {
      console.error('[Migration Backfill Enox] Erro:', e)
    }
  },
  (app) => {},
)
