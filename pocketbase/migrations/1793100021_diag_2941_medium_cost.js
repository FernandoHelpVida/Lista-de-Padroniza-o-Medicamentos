/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — BUG 2941 (ESCOPOLAMINA GTS): medium_cost OFICIAL
 * ============================================================================
 * O registro 2941 está com fonte_preco='oficial', ultima_compra_price=6.60 e
 * custo_medio_price=6.09 (valor antigo da fórmula v5), enquanto a tela do
 * SpinCare exibe custo médio R$6,54. Evidência decisiva: o campo `payload`
 * (resposta bruta da API do sync de 2026-11-17T11:24:57Z).
 *
 * Esta migração NÃO altera produtos. Grava em audit_logs:
 * 1. Para o 2941: fatias de 180 chars de um JSON compacto com
 *    payload.medium_cost, payload.last_buy_value, os valores gravados no banco
 *    e a LISTA DE CHAVES do payload (prova de presença/ausência de
 *    medium_cost) — acao = DIAG2941_MEDIUM_COST_EVID.
 * 2. Varredura de TODOS os produtos com fonte_preco='oficial': compara
 *    payload.medium_cost (decodificado do array de bytes) contra
 *    custo_medio_price gravado; lista até 60 ids divergentes —
 *    acao = DIAG2941_MEDIUM_COST_SCAN (fatias de 180 chars).
 * Idempotente: regravar as mesmas fatias com o mesmo registro_id apenas
 * recria logs de auditoria; nenhum dado de produto é tocado.
 * ============================================================================
 */

migrate(
  (app) => {
    const decodePayload = (rec) => {
      const raw = rec.get('payload')
      let payloadStr = ''
      try {
        if (raw instanceof Array || (raw && typeof raw === 'object' && raw.length !== undefined)) {
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
        return { erro: 'ERRO_DECODE: ' + String(decErr), json: null }
      }
      try {
        return { erro: '', json: JSON.parse(payloadStr) }
      } catch (_) {
        return { erro: 'ERRO_PARSE', json: null }
      }
    }

    const gravarFatias = (app, acao, registroId, texto) => {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const CHUNK = 180
      const numChunks = Math.max(1, Math.ceil(texto.length / CHUNK))
      for (let c = 0; c < numChunks; c++) {
        const recLog = new Record(auditCol)
        recLog.set('colecao', 'produtos_spincare')
        recLog.set('registro_id', registroId + '_' + c)
        recLog.set('acao', acao)
        recLog.set('usuario_nome', 'Migracao Diag 2941 Medium Cost')
        recLog.set('usuario_email', 'diag@helpvida.internal')
        recLog.set('usuario_role', 'sistema')
        recLog.set('status_novo', 'sucesso')
        recLog.set('detalhes', texto.substring(c * CHUNK, (c + 1) * CHUNK))
        app.save(recLog)
      }
    }

    // ---- Parte 1: evidência completa do 2941 ----
    try {
      let rec2941 = null
      try {
        rec2941 = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
          id: 2941,
        })
      } catch (_) {
        rec2941 = null
      }
      if (rec2941) {
        const dec = decodePayload(rec2941)
        let evid = null
        if (dec.json) {
          const keys = []
          for (const k in dec.json) keys.push(k)
          evid = {
            spincare_id: 2941,
            synced_at: rec2941.getString('synced_at'),
            fonte_preco: rec2941.getString('fonte_preco'),
            db_ultima_compra: rec2941.getFloat('ultima_compra_price'),
            db_custo_medio: rec2941.getFloat('custo_medio_price'),
            payload_medium_cost:
              dec.json.medium_cost !== undefined ? dec.json.medium_cost : 'AUSENTE_NO_PAYLOAD',
            payload_last_buy_value:
              dec.json.last_buy_value !== undefined
                ? dec.json.last_buy_value
                : 'AUSENTE_NO_PAYLOAD',
            payload_keys: keys.join(','),
          }
        } else {
          evid = { spincare_id: 2941, erro_decodificacao: dec.erro }
        }
        gravarFatias(
          app,
          'DIAG2941_MEDIUM_COST_EVID',
          'diag2941_medium_cost_evid',
          JSON.stringify(evid),
        )
      } else {
        gravarFatias(
          app,
          'DIAG2941_MEDIUM_COST_EVID',
          'diag2941_medium_cost_evid',
          JSON.stringify({ erro: 'REGISTRO_2941_NAO_ENCONTRADO' }),
        )
      }
    } catch (e1) {
      console.error('[Diag2941] Falha parte 1: ' + String(e1))
    }

    // ---- Parte 2: varredura de todos os fonte_preco='oficial' ----
    try {
      const todos = app.findRecordsByFilter(
        'produtos_spincare',
        "fonte_preco = 'oficial'",
        '',
        0,
        0,
      )
      const divergentes = []
      const semMediumCost = []
      let ok = 0
      let errosDecode = 0
      for (let i = 0; i < todos.length; i++) {
        const rec = todos[i]
        const dec = decodePayload(rec)
        if (!dec.json) {
          errosDecode++
          continue
        }
        const py = dec.json
        const mc =
          py.medium_cost !== undefined && py.medium_cost !== null ? Number(py.medium_cost) : null
        const dbCm = rec.getFloat('custo_medio_price')
        if (mc === null || isNaN(mc)) {
          semMediumCost.push(rec.getInt('spincare_id'))
          continue
        }
        const dbRound = Math.round(dbCm * 100) / 100
        const mcRound = Math.round(mc * 100) / 100
        if (dbRound !== mcRound) {
          divergentes.push(rec.getInt('spincare_id') + ':db=' + dbRound + ',api=' + mcRound)
        } else {
          ok++
        }
      }
      const resumo = {
        total_oficial: todos.length,
        custo_medio_bate_api: ok,
        divergentes_count: divergentes.length,
        divergentes: divergentes.slice(0, 60),
        sem_medium_cost_count: semMediumCost.length,
        sem_medium_cost_ids: semMediumCost.slice(0, 60),
        erros_decode: errosDecode,
      }
      gravarFatias(
        app,
        'DIAG2941_MEDIUM_COST_SCAN',
        'diag2941_medium_cost_scan',
        JSON.stringify(resumo),
      )
    } catch (e2) {
      console.error('[Diag2941] Falha parte 2: ' + String(e2))
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
