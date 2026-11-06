/**
 * Migração para fixação e reprocessamento com as réguas validadas de preços SpinCare:
 * - ENOXAPARINA 20MG (2915): última compra 8,40 / custo médio 9,50
 * - ENOXAPARINA 40MG (2916): última compra 10,00 / custo médio 10,12
 * - ENOXAPARINA 60MG (2917): última compra 15,00 / custo médio 15,70
 * - BACLOFENO 10MG CP (2578): última compra 0,13 / custo médio 0,13
 *
 * Também audita o reprocessamento para garantia e rastreabilidade.
 */
migrate(
  (app) => {
    const reguas = {
      2915: { uc: 8.4, cm: 9.5, desc: 'ENOXAPARINA 20MG SERINGA PREENCHIDA' },
      2916: { uc: 10.0, cm: 10.12, desc: 'ENOXAPARINA 40MG SERINGA PREENCHIDA' },
      2917: { uc: 15.0, cm: 15.7, desc: 'ENOXAPARINA 60MG SERINGA PREENCHIDA' },
      2578: { uc: 0.13, cm: 0.13, desc: 'BACLOFENO 10MG CP' },
    }

    const col = app.findCollectionByNameOrId('produtos_spincare')
    const updated = []

    for (const [idStr, vals] of Object.entries(reguas)) {
      const prodId = parseInt(idStr, 10)
      const recs = app.findRecordsByFilter(
        'produtos_spincare',
        'spincare_id = ' + prodId,
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) {
        const rec = recs[0]
        rec.set('ultima_compra_price', vals.uc)
        rec.set('custo_medio_price', vals.cm)
        rec.set('synced_at', new Date().toISOString())
        app.save(rec)
        updated.push({ id: prodId, uc: vals.uc, cm: vals.cm })
      }
    }

    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(auditCol)
      auditRec.set('colecao', 'produtos_spincare')
      auditRec.set('registro_id', 'regua_enox_baclofeno_v2')
      auditRec.set('acao', 'FIX_REGUA_ENOX_BACLOFENO')
      auditRec.set('usuario_nome', 'Migração Sistema')
      auditRec.set('usuario_email', 'sistema@helpvida.internal')
      auditRec.set('usuario_role', 'sistema')
      auditRec.set('status_novo', 'ok')
      auditRec.set('detalhes', JSON.stringify({ atualizados: updated }))
      app.save(auditRec)
    } catch (_) {}
  },
  (app) => {},
)
