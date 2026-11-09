/// <reference path="../pb_data/types.d.ts" />
/**
 * pocketbase/migrations/1793025299_sync_reguas_stock_prices.js
 *
 * Atualiza no banco os valores de última compra e custo médio validados no SpinCare para as 5 réguas:
 *  - 2645 BUPRENORFINA 10MG ADESIVO TRANSDERMICO -> 54.50 / 54.50
 *  - 2915 ENOXAPARINA 20MG SERINGA PREENCHIDA -> 8.40 / 9.50
 *  - 2916 ENOXAPARINA 40MG SERINGA PREENCHIDA -> 10.00 / 10.12
 *  - 2917 ENOXAPARINA 60MG SERINGA PREENCHIDA -> 15.00 / 15.70
 *  - 2578 BACLOFENO 10MG CP -> 0.13 / 0.13
 */

migrate(
  (app) => {
    const reguas = [
      { id: 2645, uc: 54.5, cm: 54.5, desc: 'BUPRENORFINA 10MG ADESIVO TRANSDERMICO' },
      { id: 2915, uc: 8.4, cm: 9.5, desc: 'ENOXAPARINA 20MG SERINGA PREENCHIDA' },
      { id: 2916, uc: 10.0, cm: 10.12, desc: 'ENOXAPARINA 40MG SERINGA PREENCHIDA' },
      { id: 2917, uc: 15.0, cm: 15.7, desc: 'ENOXAPARINA 60MG SERINGA PREENCHIDA' },
      { id: 2578, uc: 0.13, cm: 0.13, desc: 'BACLOFENO 10MG CP' },
    ]

    for (let i = 0; i < reguas.length; i++) {
      const item = reguas[i]
      const recs = app.findRecordsByFilter(
        'produtos_spincare',
        'spincare_id = ' + item.id,
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) {
        const r = recs[0]
        r.set('ultima_compra_price', item.uc)
        r.set('custo_medio_price', item.cm)
        r.set('synced_at', new Date().toISOString())
        app.save(r)
      }
    }

    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const audit = new Record(auditCol)
      audit.set('colecao', 'produtos_spincare')
      audit.set('registro_id', 'sync_reguas_stock_prices')
      audit.set('acao', 'SYNC_REGUAS_STOCK_PRICES')
      audit.set('usuario_nome', 'Migration 1793025299')
      audit.set('status_novo', 'ok')
      audit.set(
        'detalhes',
        'Réguas fixadas e garantidas no banco: 2645 (54.50/54.50), 2915 (8.40/9.50), 2916 (10.00/10.12), 2917 (15.00/15.70), 2578 (0.13/0.13)',
      )
      app.save(audit)
    } catch (_) {}
  },
  (app) => {},
)
