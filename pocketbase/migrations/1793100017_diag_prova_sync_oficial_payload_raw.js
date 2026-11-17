/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — PROVA DO SYNC OFICIAL — PAYLOAD BRUTO (PARTE 4)
 * ============================================================================
 * As provas 1–3 confirmaram os valores no banco, mas o campo `payload` do
 * audit_logs veio truncado. Esta migração grava em audit_logs o payload BRUTO
 * (JSON.stringify, limitado a 6000 chars para caber no campo) dos produtos de
 * referência — a evidência real do que a API devolveu para cada um:
 *   - SYNC_OFICIAL_PROVA_PAYLOAD_RAW_<id>: um registro por produto-alvo.
 * Idempotente; não altera produtos_spincare.
 * ============================================================================
 */

migrate(
  (app) => {
    const alvos = [2940, 2944, 4383, 2645, 2578, 4575, 2942, 2915, 2916, 2917]
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      for (let a = 0; a < alvos.length; a++) {
        const sid = alvos[a]
        let rec = null
        try {
          rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', { id: sid })
        } catch (_) {
          rec = null
        }
        if (!rec) continue
        const raw = rec.get('payload')
        let payloadStr = ''
        if (typeof raw === 'string') {
          payloadStr = raw
        } else if (raw) {
          payloadStr = JSON.stringify(raw)
        }
        if (payloadStr.length > 6000) payloadStr = payloadStr.substring(0, 6000)
        const recLog = new Record(auditCol)
        recLog.set('colecao', 'produtos_spincare')
        recLog.set('registro_id', 'diag_prova_payload_raw_' + sid)
        recLog.set('acao', 'SYNC_OFICIAL_PROVA_PAYLOAD_RAW')
        recLog.set('usuario_nome', 'Migracao Diag Prova Sync Oficial')
        recLog.set('usuario_email', 'diag@helpvida.internal')
        recLog.set('usuario_role', 'sistema')
        recLog.set('status_novo', 'sucesso')
        recLog.set('detalhes', payloadStr)
        app.save(recLog)
      }
      console.log('[Diag Prova Payload Raw] gravados=' + alvos.length)
    } catch (e) {
      console.error('[Diag Prova Payload Raw] Falha ao gravar: ' + String(e))
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
