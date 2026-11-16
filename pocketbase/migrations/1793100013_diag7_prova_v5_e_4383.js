/// <reference path="../pb_data/types.d.ts" />
// PROVA v5 — PARTE 2 (DIAG7): prova os critérios da varredura az_v5_carimbo_movimentacao
// e reclassifica a BOBINA PICOTADA 4383 como 'api_cost_zero' (idempotente).
//
// Diferença da DIAG6 (1793100012): NÃO trava 45 min — esta migração roda já com a
// varredura concluída (ou registra o offset atual, sem declarar pronto). Idempotente:
// roda em banco vazio (no-op) e reclassifica apenas o registro exato do 4383.
//
// Grava em audit_logs: DIAG7_REGUAS, DIAG7_4383, DIAG7_ANTI_ZERO, DIAG7_DONE_V5.

migrate(
  (app) => {
    const mk = (acao, detalhes) => {
      const col = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(col)
      rec.set('colecao', 'produtos_spincare')
      rec.set('registro_id', 'diag7_prova_v5')
      rec.set('acao', acao)
      rec.set('usuario_nome', 'Migracao DIAG7')
      rec.set('usuario_role', 'sistema')
      rec.set('status_novo', 'ok')
      rec.set('detalhes', detalhes)
      app.save(rec)
    }

    // ---- (1) Reclassificação idempotente do 4383 ----
    try {
      const r4383 = app.findRecordsByFilter('produtos_spincare', 'spincare_id = 4383', '', 1, 0)
      if (r4383.length > 0) {
        const rec = r4383[0]
        const uc = Number(rec.getFloat('ultima_compra_price')) || 0
        const cm = Number(rec.getFloat('custo_medio_price')) || 0
        const fonte = rec.getString('fonte_preco')
        if (uc === 0 && cm === 0 && fonte !== 'api_cost_zero') {
          rec.set('fonte_preco', 'api_cost_zero')
          app.save(rec)
          mk('DIAG7_4383_RECLASS', '4383 reclassificado para api_cost_zero (era ' + fonte + ')')
        }
      }
    } catch (e4383) {
      console.log('[diag7] erro no 4383: ' + e4383)
    }

    // ---- (2) Réguas + 2940/2944 + 4383 ----
    const reguaIds = [2940, 2942, 4575, 2645, 2915, 2916, 2917, 2578, 2944, 4383]
    const partes = []
    for (const pid of reguaIds) {
      try {
        const rs = app.findRecordsByFilter(
          'produtos_spincare',
          'spincare_id = ' + pid,
          '-updated',
          1,
          0,
        )
        if (rs.length > 0) {
          const r = rs[0]
          partes.push(
            pid +
              ':' +
              (Number(r.getFloat('ultima_compra_price')) || 0).toFixed(2) +
              '/' +
              (Number(r.getFloat('custo_medio_price')) || 0).toFixed(2) +
              '/' +
              r.getString('fonte_preco'),
          )
        } else {
          partes.push(pid + ':AUSENTE')
        }
      } catch (_) {
        partes.push(pid + ':ERRO')
      }
    }
    mk('DIAG7_REGUAS', ' ' + partes.join(' | '))

    // ---- (3) Anti-zero: ativos com custo zerado e fonte != api_cost_zero ----
    let zeroAtivosForaApiCostZero = -1
    try {
      zeroAtivosForaApiCostZero = app.countRecords(
        'produtos_spincare',
        'active = true && custo_medio_price = 0 && fonte_preco != "api_cost_zero"',
      )
    } catch (eAz) {
      console.log('[diag7] erro na contagem anti-zero: ' + eAz)
    }
    mk('DIAG7_ANTI_ZERO', 'ativos custo 0 fora api_cost_zero: ' + zeroAtivosForaApiCostZero)

    // ---- (4) Estado da varredura az_v5 ----
    try {
      const doneV5 = app.findRecordsByFilter(
        'audit_logs',
        'acao = "BACKFILL_AZ_DONE" && detalhes ~ "az_v5_carimbo_movimentacao"',
        '-created',
        1,
        0,
      )
      const loteV5 = app.findRecordsByFilter(
        'audit_logs',
        'acao = "BACKFILL_AZ_LOTE" && detalhes ~ "az_v5_carimbo_movimentacao"',
        '-created',
        1,
        0,
      )
      if (doneV5.length > 0) {
        mk('DIAG7_DONE_V5', ' ' + doneV5[0].getString('detalhes'))
      } else {
        const off = loteV5.length > 0 ? loteV5[0].getString('detalhes') : 'sem marcador'
        mk('DIAG7_DONE_V5', 'PENDENTE — ' + off)
      }
    } catch (eSweep) {
      console.log('[diag7] erro no marcador da varredura: ' + eSweep)
    }
  },
  (app) => {
    // rollback: nada estrutural (sem schema, sem valores de produto)
  },
)
