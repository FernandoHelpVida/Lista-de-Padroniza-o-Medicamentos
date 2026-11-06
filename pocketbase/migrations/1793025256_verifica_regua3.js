migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(col)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'verifica_regua2')
      r.set('acao', 'VERIFICA_ERRO_COLECAO')
      r.set('detalhes', 'teste de escrita em audit_logs pela migração ' + new Date().toISOString())
      r.set('usuario_nome', 'Diag')
      r.set('usuario_email', 'diag@internal')
      r.set('usuario_role', 'sistema')
      r.set('status_novo', 'ok')
      app.save(r)
      console.log('[Verifica Regua2] OK, saved to audit_logs')
    } catch (eWrite) {
      console.log('[Verifica Regua2] ERRO: ' + String(eWrite))
    }
  },
  (app) => {},
)
