migrate(
  (app) => {
    // Diagnóstico: verificar quais campos existem no registro régua e os valores
    // de todos os campos de preço, para descobrir por que getFloat retorna 0
    const stages = []
    const mark = (k, v) => stages.push(k + '=' + v)
    try {
      const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
        id: 2578,
      })
      const schema = rec.collection().fields
      const allFields = []
      for (let i = 0; i < schema.length(); i++) {
        const f = schema.at(i)
        allFields.push(f.name + '(' + f.type + ')')
      }
      mark('campos', allFields.join(','))
      const py = JSON.parse(rec.getString('payload') || '{}')
      mark('py_keys', Object.keys(py).join(','))
      mark('py_ultima', JSON.stringify(py.last_buy_value))
      mark('py_ultima2', JSON.stringify(py.last_buy || py.last_buy_info))
      mark('py_imported', JSON.stringify(py.imported_prices || []).substring(0, 900))
      mark('py_price', String(py.price))
      const col = app.findCollectionByNameOrId('audit_logs')
      const r = new Record(col)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'verifica_regua5')
      r.set('acao', 'VERIFICA_CAMPOS')
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
        r.set('registro_id', 'verifica_regua5')
        r.set('acao', 'VERIFICA_ERRO5')
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
