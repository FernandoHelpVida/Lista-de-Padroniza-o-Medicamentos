/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — PROVA DO SYNC OFICIAL — PAYLOAD BRUTO (PARTE 5)
 * ============================================================================
 * A parte 4 gravou o payload como array de BYTES (o JSVM devolve o campo JSON
 * como []byte). Esta migração CORRETIVA decodifica os bytes → string UTF-8 →
 * JSON.parse e grava o payload BRUTO (limitado a 6000 chars) dos produtos de
 * referência em audit_logs (SYNC_OFICIAL_PROVA_PAYLOAD_RAW2):
 *   - um registro por produto-alvo: registro_id = diag_prova_payload_raw2_<id>.
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
        try {
          if (
            raw instanceof Array ||
            (raw && typeof raw === 'object' && raw.length !== undefined)
          ) {
            // Array de bytes (ou array JSON real): decodifica byte a byte.
            const bytes = []
            for (let i = 0; i < raw.length; i++) {
              const v = raw[i]
              if (typeof v === 'number') bytes.push(v)
              else bytes.push(String(v).charCodeAt(0))
            }
            payloadStr = decodeURIComponent(
              bytes
                .map(function (b) {
                  return '%' + ('00' + b.toString(16)).slice(-2)
                })
                .join(''),
            )
          } else if (typeof raw === 'string') {
            payloadStr = raw
          } else if (raw) {
            payloadStr = JSON.stringify(raw)
          }
        } catch (decErr) {
          payloadStr = 'ERRO_DECODE: ' + String(decErr)
        }
        let parsedOk = false
        try {
          const parsed = JSON.parse(payloadStr)
          parsedOk = !!parsed
          payloadStr = JSON.stringify(parsed)
        } catch (_) {
          parsedOk = false
        }
        if (payloadStr.length > 6000) payloadStr = payloadStr.substring(0, 6000)
        const recLog = new Record(auditCol)
        recLog.set('colecao', 'produtos_spincare')
        recLog.set('registro_id', 'diag_prova_payload_raw2_' + sid)
        recLog.set('acao', 'SYNC_OFICIAL_PROVA_PAYLOAD_RAW2')
        recLog.set('usuario_nome', 'Migracao Diag Prova Sync Oficial')
        recLog.set('usuario_email', 'diag@helpvida.internal')
        recLog.set('usuario_role', 'sistema')
        recLog.set('status_novo', parsedOk ? 'sucesso' : 'falha_decode')
        recLog.set('detalhes', payloadStr)
        app.save(recLog)
      }
      console.log('[Diag Prova Payload Raw2] gravados=' + alvos.length)
    } catch (e) {
      console.error('[Diag Prova Payload Raw2] Falha ao gravar: ' + String(e))
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
