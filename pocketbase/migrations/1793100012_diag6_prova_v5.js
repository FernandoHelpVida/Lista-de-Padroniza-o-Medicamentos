/// <reference path="../pb_data/types.d.ts" />
// PROVA v5 (DIAG6): bloqueia 45 minutos para a varredura az_v5_carimbo_movimentacao
// terminar (60 produtos/min × 2316 ≈ 39 min) e então grava o RESULTADO em audit_logs.
// Idempotente: se a varredura já terminou, apenas registra a prova.
//
// IMPORTANTE: esta migração NÃO grava valores: apenas lê o banco e consolida
// as provas em audit_logs (DIAG6_*).

migrate(
  (app) => {
    const mk = (acao, detalhes) => {
      const col = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(col)
      rec.set('colecao', 'produtos_spincare')
      rec.set('registro_id', 'diag6_prova_v5')
      rec.set('acao', acao)
      rec.set('usuario_nome', 'Migracao DIAG6')
      rec.set('usuario_role', 'sistema')
      rec.set('status_novo', 'ok')
      rec.set('detalhes', detalhes)
      app.save(rec)
    }

    const SLEEP_MS = 45 * 60 * 1000
    const start = new Date().getTime()
    while (new Date().getTime() - start < SLEEP_MS) {}

    const exists = app.findRecordsByFilter(
      'audit_logs',
      'acao = "BACKFILL_AZ_DONE" && detalhes ~ "az_v5_carimbo_movimentacao"',
      '-created',
      1,
      0,
    )
    if (exists.length === 0) {
      mk('DIAG6_SEM_DONE', 'Varredura az_v5_carimbo_movimentacao nao concluiu em 45 min')
      return
    }

    // (b) Sete réguas + 2944 + 2940
    const reguaIds = [2940, 2942, 4575, 2645, 2915, 2916, 2917, 2578, 2944]
    const partes = []
    for (const pid of reguaIds) {
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
          pid + ':' +
            (Number(r.getFloat('ultima_compra_price')) || 0).toFixed(2) + '/' +
            (Number(r.getFloat('custo_medio_price')) || 0).toFixed(2) + '/' +
            r.getString('fonte_preco'),
        )
      } else {
        partes.push(pid + ':AUSENTE')
      }
    }
    mk('DIAG6_REGUAS', ' ' + partes.join(' | '))

    // (c) anti-zero: ativos com fonte nf_compra e custo 0
    const zeroNf = app.findRecordsByFilter(
      'produtos_spincare',
      'active = true && fonte_preco = "nf_compra" && custo_medio_price = 0',
      '-updated',
      200,
      0,
    )
    mk('DIAG6_ANTI_ZERO', 'ativos nf_compra com custo_medio=0: ' + zeroNf.length)

    // fontes
    for (const fonte of ['nf_compra', 'catalogo', 'api_cost_zero']) {
      const n = app
        .findRecordsByFilter('produtos_spincare', 'active = true && fonte_preco = "' + fonte + '"', '-updated', 1, 0)
      mk('DIAG6_FONTE_' + fonte, 'contagem=' + n.length)
    }

    // (d) 4383
    const r4383 = app.findRecordsByFilter('produtos_spincare', 'spincare_id = 4383', '-updated', 1, 0)
    if (r4383.length > 0) {
      mk(
        'DIAG6_4383',
        'fonte=' + r4383[0].getString('fonte_preco') +
        ' uc=' + (Number(r4383[0].getFloat('ultima_compra_price')) || 0).toFixed(2) +
        ' cm=' + (Number(r4383[0].getFloat('custo_medio_price')) || 0).toFixed(2),
      )
    }
  },
  (app) => {
    // rollback: nada estrutural
  },
)
