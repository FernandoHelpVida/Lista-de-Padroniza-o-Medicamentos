migrate(
  (app) => {
    // Diagnóstico: gravar em audit_logs os valores persistidos dos produtos régua
    // (console.log não está aparecendo nos logs do pb_hooks nesta instância)
    const ids = [2578, 2916]
    const log = (msg, detalhes) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'verifica_regua')
        r.set('acao', msg)
        r.set('detalhes', String(detalhes).substring(0, 1500))
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (_) {}
    }
    for (let i = 0; i < ids.length; i++) {
      try {
        const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
          id: ids[i],
        })
        log(
          'VERIFICA_' + ids[i],
          'desc=' +
            rec.getString('description') +
            ' | ultima_compra_price=' +
            rec.getFloat('ultima_compra_price') +
            ' | custo_medio_price=' +
            rec.getFloat('custo_medio_price') +
            ' | synced_at=' +
            rec.getString('synced_at'),
        )
      } catch (eRead) {
        log('VERIFICA_ERRO_' + ids[i], String(eRead))
      }
    }
  },
  (app) => {},
)
