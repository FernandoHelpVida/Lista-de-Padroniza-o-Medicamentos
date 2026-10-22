/**
 * Server-side audit logging for solicitacoes collection.
 * Tracks creation, approval, rejection, completion and changes.
 * Complies with LGPD minimization: does NOT copy full sensitive health text into audit log.
 * Note: PocketBase JSVM executes callbacks in isolated VM pools; all helper logic is inlined.
 */

// 1. Hook onRecordAfterCreateSuccess for solicitacoes
onRecordAfterCreateSuccess((e) => {
  try {
    const record = e.record
    const authUser = e.auth

    let medNome = record.getString('nome_medicamento_novo') || ''
    if (!medNome && record.getString('medicamento')) {
      try {
        const med = e.app.findRecordById('medicamentos', record.getString('medicamento'))
        medNome = med.getString('nome')
      } catch (_) {}
    }

    const detalhes = medNome
      ? 'Solicitação de medicamento: ' + medNome
      : 'Solicitação de medicamento criada'

    const auditCol = e.app.findCollectionByNameOrId('audit_logs')
    const auditRecord = new Record(auditCol)
    auditRecord.set('colecao', 'solicitacoes')
    auditRecord.set('registro_id', record.id)
    auditRecord.set('acao', 'SOLICITACAO_CRIADA')

    if (authUser) {
      auditRecord.set('usuario', authUser.id)
      auditRecord.set('usuario_nome', authUser.getString('name') || '')
      auditRecord.set('usuario_email', authUser.getString('email') || '')
      auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
    } else {
      const solicitanteId = record.getString('solicitante')
      if (solicitanteId) {
        try {
          const solUser = e.app.findRecordById('_pb_users_auth_', solicitanteId)
          auditRecord.set('usuario', solUser.id)
          auditRecord.set('usuario_nome', solUser.getString('name') || '')
          auditRecord.set('usuario_email', solUser.getString('email') || '')
          auditRecord.set('usuario_role', solUser.getString('role') || 'comum')
        } catch (_) {}
      }
    }

    auditRecord.set('status_anterior', '')
    auditRecord.set('status_novo', record.getString('status') || 'Pendente')
    auditRecord.set('detalhes', detalhes)

    e.app.save(auditRecord)
  } catch (err) {
    console.error('Erro no hook onRecordAfterCreateSuccess de solicitacoes:', err)
  } finally {
    e.next()
  }
}, 'solicitacoes')

// 2. Hook onRecordAfterUpdateSuccess for solicitacoes
onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    const original = record.original()
    const authUser = e.auth

    const statusAnterior = original ? original.getString('status') : ''
    const statusNovo = record.getString('status')
    const respostaAnterior = original ? original.getString('resposta_comissao') : ''
    const respostaNova = record.getString('resposta_comissao')

    let acao = 'SOLICITACAO_ATUALIZADA'
    let detalhes = ''

    if (statusAnterior !== statusNovo) {
      if (statusNovo === 'Aprovada') {
        acao = 'SOLICITACAO_APROVADA'
        detalhes = 'Solicitação aprovada pela comissão técnica / farmácia clínica'
      } else if (statusNovo === 'Negada') {
        acao = 'SOLICITACAO_NEGADA'
        detalhes = 'Solicitação negada pela comissão técnica / farmácia clínica'
      } else if (statusNovo === 'Atendida') {
        acao = 'SOLICITACAO_ATENDIDA'
        detalhes = 'Solicitação atendida e dispensada pela farmácia clínica'
      } else {
        acao = 'STATUS_ALTERADO'
        detalhes = 'Status alterado de "' + statusAnterior + '" para "' + statusNovo + '"'
      }
    } else if (respostaAnterior !== respostaNova && respostaNova) {
      acao = 'PARECER_ADICIONADO'
      detalhes = 'Parecer técnico emitido/atualizado pela farmácia clínica'
    } else {
      detalhes = 'Dados da solicitação atualizados'
    }

    const auditCol = e.app.findCollectionByNameOrId('audit_logs')
    const auditRecord = new Record(auditCol)
    auditRecord.set('colecao', 'solicitacoes')
    auditRecord.set('registro_id', record.id)
    auditRecord.set('acao', acao)

    if (authUser) {
      auditRecord.set('usuario', authUser.id)
      auditRecord.set('usuario_nome', authUser.getString('name') || '')
      auditRecord.set('usuario_email', authUser.getString('email') || '')
      auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
    } else {
      const solicitanteId = record.getString('solicitante')
      if (solicitanteId) {
        try {
          const solUser = e.app.findRecordById('_pb_users_auth_', solicitanteId)
          auditRecord.set('usuario', solUser.id)
          auditRecord.set('usuario_nome', solUser.getString('name') || '')
          auditRecord.set('usuario_email', solUser.getString('email') || '')
          auditRecord.set('usuario_role', solUser.getString('role') || 'comum')
        } catch (_) {}
      }
    }

    auditRecord.set('status_anterior', statusAnterior)
    auditRecord.set('status_novo', statusNovo)
    auditRecord.set('detalhes', detalhes)

    e.app.save(auditRecord)
  } catch (err) {
    console.error('Erro no hook onRecordAfterUpdateSuccess de solicitacoes:', err)
  } finally {
    e.next()
  }
}, 'solicitacoes')

// 3. Hook onRecordAfterDeleteSuccess for solicitacoes
onRecordAfterDeleteSuccess((e) => {
  try {
    const record = e.record
    const authUser = e.auth

    const auditCol = e.app.findCollectionByNameOrId('audit_logs')
    const auditRecord = new Record(auditCol)
    auditRecord.set('colecao', 'solicitacoes')
    auditRecord.set('registro_id', record.id)
    auditRecord.set('acao', 'SOLICITACAO_EXCLUIDA')

    if (authUser) {
      auditRecord.set('usuario', authUser.id)
      auditRecord.set('usuario_nome', authUser.getString('name') || '')
      auditRecord.set('usuario_email', authUser.getString('email') || '')
      auditRecord.set('usuario_role', authUser.getString('role') || 'comum')
    }

    auditRecord.set('status_anterior', record.getString('status'))
    auditRecord.set('status_novo', '')
    auditRecord.set('detalhes', 'Registro de solicitação excluído')

    e.app.save(auditRecord)
  } catch (err) {
    console.error('Erro no hook onRecordAfterDeleteSuccess de solicitacoes:', err)
  } finally {
    e.next()
  }
}, 'solicitacoes')
