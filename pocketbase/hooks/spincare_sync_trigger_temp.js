/**
 * ============================================================================
 * CRON TEMPORÁRIO — GATILHO DO SYNC OFICIAL DE PRODUTOS (one-shot)
 * ============================================================================
 * A rota POST /backend/v1/spincare/products/sync (código 0.0.205+, já no ar)
 * consome last_buy_value/medium_cost com fonte_preco='oficial', mas é POST e
 * precisa ser disparada de dentro do app. Este cron temporário auto-chama a
 * rota REAL UMA ÚNICA VEZ (sem duplicar lógica), marca no audit_logs e se
 * auto-desativa quando o resultado (SPINCARE_PRODUCT_SYNC_MANUAL) aparece.
 *
 * REMOVER este arquivo após a prova do sync oficial.
 * ============================================================================
 */

cronAdd('spincare_products_sync_trigger_temp', '* * * * *', () => {
  try {
    const app = typeof $app !== 'undefined' ? $app : null
    if (!app) return

    const writeMarker = (acao, status, detalhes) => {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'produtos_spincare')
      rec.set('registro_id', 'sync_oficial_trigger')
      rec.set('acao', acao)
      rec.set('usuario_nome', 'Cron Sync Oficial Temp')
      rec.set('usuario_email', 'cron@helpvida.internal')
      rec.set('usuario_role', 'sistema')
      rec.set('status_novo', status)
      rec.set('detalhes', detalhes)
      app.save(rec)
    }

    // Marcador de disparo desta rodada
    let trigger = null
    try {
      trigger =
        app.findRecordsByFilter(
          'audit_logs',
          'colecao = "produtos_spincare" && acao = "SYNC_OFICIAL_TRIGGER"',
          '-created',
          1,
          0,
        )[0] || null
    } catch (_) {
      trigger = null
    }

    // Auto-desativa quando o sync de produtos (manual) concluiu DEPOIS do gatilho
    const manualDone = (() => {
      try {
        const done = app.findRecordsByFilter(
          'audit_logs',
          'colecao = "produtos_spincare" && acao = "SPINCARE_PRODUCT_SYNC_MANUAL"',
          '-created',
          1,
          0,
        )
        if (done && done.length > 0) {
          if (!trigger) return true // sync anterior → nada a fazer
          const tMs = new Date(trigger.getString('created')).getTime()
          const dMs = new Date(done[0].getString('created')).getTime()
          return dMs > tMs
        }
      } catch (_) {}
      return false
    })()
    if (manualDone) {
      console.log(
        '[Sync Oficial Temp] SPINCARE_PRODUCT_SYNC_MANUAL pós-gatilho presente — desativado.',
      )
      return
    }

    // Trava: já disparou há menos de 25 min → aguarda a conclusão do sync
    if (trigger) {
      const ageMs = new Date().getTime() - new Date(trigger.getString('created')).getTime()
      if (ageMs < 25 * 60 * 1000) {
        console.log(
          '[Sync Oficial Temp] Gatilho registrado há ' +
            Math.round(ageMs / 1000) +
            's — aguardando conclusão do sync.',
        )
        return
      }
      // Expirou sem conclusão → registra timeout e para (evita loop)
      writeMarker(
        'SYNC_OFICIAL_TRIGGER_TIMEOUT',
        'falha',
        'Sync não concluiu em 25 min após o gatilho.',
      )
      console.log(
        '[Sync Oficial Temp] TIMEOUT: sync não concluiu em 25 min. Marcador gravado; parando.',
      )
      return
    }

    writeMarker(
      'SYNC_OFICIAL_TRIGGER',
      'in_progress',
      'Disparando POST interno /spincare/products/sync.',
    )
    console.log('[Sync Oficial Temp] Disparando sync de produtos via POST interno...')

    try {
      const res = $http.send({
        url: 'http://127.0.0.1:8090/backend/v1/spincare/products/sync',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        timeout: 1500,
      })
      console.log('[Sync Oficial Temp] Resposta do sync: status=' + res.statusCode)
      writeMarker(
        'SYNC_OFICIAL_TRIGGER',
        'disparado',
        'POST interno respondeu status=' + res.statusCode,
      )
    } catch (httpErr) {
      // O tick pode ser morto aguardando a resposta, mas o handler do lado do
      // servidor continua rodando — o resultado é provado no audit_logs/banco.
      console.log(
        '[Sync Oficial Temp] POST interno não retornou (provável execução longa): ' +
          String(httpErr),
      )
    }
  } catch (err) {
    console.error('[Sync Oficial Temp] Erro:', err)
  }
})
