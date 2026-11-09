/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 2942')
      if (!rec) return
      const coll = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_db_2942_record')
      r.set('acao', 'DB_RECORD_2942')
      r.set(
        'detalhes',
        JSON.stringify({
          id: rec.id,
          spincare_id: rec.getInt('spincare_id'),
          ultima_compra_price: rec.getFloat('ultima_compra_price'),
          custo_medio_price: rec.getFloat('custo_medio_price'),
          synced_at: rec.getString('synced_at'),
          updated: rec.getString('updated'),
        }),
      )
      app.save(r)
    } catch (_) {}
  },
  (app) => {},
)
