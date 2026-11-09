/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 2942')
      if (!rec) return
      const coll = app.findCollectionByNameOrId('audit_logs')

      const rTop = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_top_desc_2942"')
      if (rTop) {
        const topDesc = JSON.parse(rTop.getString('detalhes') || '[]')
        for (let i = 0; i < topDesc.length; i++) {
          const item = topDesc[i]
          const r = new Record(coll)
          r.set('colecao', 'produtos_spincare')
          r.set('registro_id', 'diag_top_' + i)
          r.set('acao', 'TOP_ITEM')
          r.set('detalhes', JSON.stringify(item))
          app.save(r)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
