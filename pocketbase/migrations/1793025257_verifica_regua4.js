migrate(
  (app) => {
    // Diagnóstico: contar as linhas de cada migração aplicada com sucesso e
    // registrar em audit_logs com um marcador único por etapa
    const stages = []
    const mark = (stage, info) => {
      stages.push(stage + '=' + info)
    }

    try {
      mark('start', new Date().toISOString())
      const rec2578 = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
        id: 2578,
      })
      mark('p2578_uc', String(rec2578.getFloat('ultima_compra_price')))
      mark('p2578_cm', String(rec2578.getFloat('custo_medio_price')))
      mark('p2578_synced', rec2578.getString('synced_at') || '(vazio)')
      const rec2916 = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
        id: 2916,
      })
      mark('p2916_uc', String(rec2916.getFloat('ultima_compra_price')))
      mark('p2916_cm', String(rec2916.getFloat('custo_medio_price')))
      mark('p2916_synced', rec2916.getString('synced_at') || '(vazio)')
      const col = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(col)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'verifica_regua4')
      r.set('acao', 'VERIFICA_VALORES')
      r.set('detalhes', stages.join(' | ').substring(0, 1500))
      r.set('usuario_nome', 'Diag')
      r.set('usuario_email', 'diag@internal')
      r.set('usuario_role', 'sistema')
      r.set('status_novo', 'ok')
      app.save(r)
    } catch (eRead) {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'verifica_regua4')
        r.set('acao', 'VERIFICA_ERRO')
        r.set('detalhes', String(eRead).substring(0, 1500))
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (_) {}
    }
  },
  (app) => {},
)
