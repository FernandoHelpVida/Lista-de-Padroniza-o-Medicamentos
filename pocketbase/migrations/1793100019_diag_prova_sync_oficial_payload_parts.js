/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — PROVA DO SYNC OFICIAL — PAYLOAD EM PARTES (PARTE 6)
 * ============================================================================
 * A parte 5 decodificou o payload (array de bytes → string → JSON), mas o
 * campo detalhes do audit_logs corta em ~200 chars na exibição da PocketBase
 * (o campo é text e o corte REAL é no cliente). Esta migração grava o payload
 * decodificado em FATIAS de 180 chars cada, no registro:
 *   - registro_id = diag_prova_payload_parts_<id>_<n> (n = índice da fatia)
 *   - acao = SYNC_OFICIAL_PROVA_PAYLOAD_PARTS
 * As fatias de 2940, 2944 e 4383 são as evidências-chave (campo oficial
 * last_buy_value/medium_cost da API). Idempotente; não altera produtos.
 * ============================================================================
 */

migrate(
  (app) => {
    const alvos = [2940, 2944, 4383, 2645, 2917]
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
        try {
          payloadStr = JSON.stringify(JSON.parse(payloadStr))
        } catch (_) {}
        // Fatias de 180 chars
        const CHUNK = 180
        const numChunks = Math.ceil(payloadStr.length / CHUNK)
        for (let c = 0; c < numChunks; c++) {
          const recLog = new Record(auditCol)
          recLog.set('colecao', 'produtos_spincare')
          recLog.set('registro_id', 'diag_prova_payload_parts_' + sid + '_' + c)
          recLog.set('acao', 'SYNC_OFICIAL_PROVA_PAYLOAD_PARTS')
          recLog.set('usuario_nome', 'Migracao Diag Prova Sync Oficial')
          recLog.set('usuario_email', 'diag@helpvida.internal')
          recLog.set('usuario_role', 'sistema')
          recLog.set('status_novo', 'sucesso')
          recLog.set('detalhes', payloadStr.substring(c * CHUNK, (c + 1) * CHUNK))
          app.save(recLog)
        }
      }
      console.log('[Diag Prova Payload Parts] gravados=' + alvos.length)
    } catch (e) {
      console.error('[Diag Prova Payload Parts] Falha ao gravar: ' + String(e))
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
