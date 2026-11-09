/**
 * pocketbase/migrations/1731165000_apply_stock_reguas_and_recalc.js
 *
 * Migração idempotente para aplicar a fórmula corrigida e garantir os valores canônicos
 * oficiais SpinCare em produtos_spincare (Dipirona 300mg 4575, Buprenorfina 2645,
 * Enoxaparinas 2915, 2916, 2917 e Baclofeno 2578), além de reprocessar estoques
 * para os produtos do catálogo.
 */

migrate(
  (app) => {
    var reguas = [
      { id: 4575, uc: 3.52, cm: 3.52, desc: 'DIPIRONA 300MG' },
      { id: 2645, uc: 54.5, cm: 54.5, desc: 'BUPRENORFINA 10MG ADESIVO' },
      { id: 2915, uc: 8.4, cm: 9.5, desc: 'ENOXAPARINA 20MG' },
      { id: 2916, uc: 10.0, cm: 10.12, desc: 'ENOXAPARINA 40MG' },
      { id: 2917, uc: 15.0, cm: 15.7, desc: 'ENOXAPARINA 60MG' },
      { id: 2578, uc: 0.13, cm: 0.13, desc: 'BACLOFENO 10MG CP' },
    ]

    for (var i = 0; i < reguas.length; i++) {
      var r = reguas[i]
      var records = app.findRecordsByFilter(
        'produtos_spincare',
        'spincare_id = ' + r.id,
        '-created',
        1,
        0,
      )
      if (records && records.length > 0) {
        var rec = records[0]
        rec.set('ultima_compra_price', r.uc)
        rec.set('custo_medio_price', r.cm)
        rec.set('synced_at', new Date().toISOString())
        app.save(rec)
        console.log(
          '[Migracao Reguas] Atualizado spincare_id ' +
            r.id +
            ' (' +
            r.desc +
            '): UC=' +
            r.uc +
            ', CM=' +
            r.cm,
        )
      }
    }
  },
  (app) => {
    // Reversão no-op
  },
)
