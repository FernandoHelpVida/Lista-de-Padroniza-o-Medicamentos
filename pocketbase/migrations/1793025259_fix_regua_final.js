migrate(
  (app) => {
    // Correção final: gravar diretamente em produtos_spincare os valores corretos
    // calculados (2578: 0,13/0,13 · 2916: 10,00/10,12) e confirmar em audit_logs
    const fix = (prodId, ultimaCompra, custoMedio, detalhes) => {
      try {
        const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
          id: prodId,
        })
        rec.set('ultima_compra_price', ultimaCompra)
        rec.set('custo_medio_price', custoMedio)
        rec.set('synced_at', new Date().toISOString())
        app.save(rec)
        // Confirmação
        const rec2 = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
          id: prodId,
        })
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'fix_regua_final')
        r.set('acao', 'FIX_' + prodId)
        r.set(
          'detalhes',
          detalhes +
            ' | gravado uc=' +
            rec2.getFloat('ultima_compra_price') +
            ' cm=' +
            rec2.getFloat('custo_medio_price'),
        )
        r.set('usuario_nome', 'Fix')
        r.set('usuario_email', 'fix@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (eUpd) {
        try {
          const col = app.findCollectionByNameOrId('audit_logs')
          const r = new Record(col)
          r.set('colecao', 'produtos_spincare')
          r.set('registro_id', 'fix_regua_final')
          r.set('acao', 'FIX_ERRO_' + prodId)
          r.set('detalhes', String(eUpd).substring(0, 1500))
          r.set('usuario_nome', 'Fix')
          r.set('usuario_email', 'fix@internal')
          r.set('usuario_role', 'sistema')
          r.set('status_novo', 'ok')
          app.save(r)
        } catch (_) {}
      }
    }
    fix(2578, 0.13, 0.13, 'BACLOFENO 10MG CP — última compra 0,13, custo médio 0,13 (SpinCare)')
    fix(2916, 10.0, 10.12, 'ENOXAPARINA 40MG — última compra 10,00, custo médio 10,12 (SpinCare)')
  },
  (app) => {},
)
