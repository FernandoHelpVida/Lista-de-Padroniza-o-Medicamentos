/// <reference path="../pb_data/types.d.ts" />

/**
 * REPARO PÓS-CRON 2026-11-10 — réguas canônicas zeradas + sufixos [D:
 *
 * O cron diário de produtos SpinCare rodou às 04:22 e, quando /get/stocks
 * falhou (API fora/token/rate limit), gravou ultima_compra_price=0,
 * custo_medio_price=0 e fonte_preco="" nas 7 réguas canônicas (a fórmula do
 * cron só aplicava o hardcode das réguas DEPOIS de ter stocks em mãos).
 * A migração 1793100001 (backfill A–Z in-process) foi aplicada sem efeito
 * porque roda ANTES do deploy dos hooks: no momento da migração o catálogo
 * ainda tinha os valores antigos, e o cron de 04:22 sobrescreveu depois.
 *
 * Esta migração:
 *  1) Restaura as 7 réguas canônicas (únicos hardcodes permitidos — decisão
 *     registrada: hardcode vale apenas para o id da própria régua);
 *  2) Limpa qualquer sufixo de diagnóstico " [D:" / " [DIAG:" de description
 *     (o texto original fica preservado no campo payload);
 *  3) Produtos NÃO-régua não são tocados aqui — eles serão preenchidos pelo
 *     backfill A–Z via rota admin (spincare_backfill.js) ou pelo próximo
 *     backfill in-process, com fonte_preco = nf_compra/catalogo/preservado.
 *
 * Idempotente: só grava onde o valor difere do canônico.
 */
migrate(
  (app) => {
    const REGRAS = [
      { id: 2942, uc: 0.31, cm: 0.3 },
      { id: 4575, uc: 3.52, cm: 3.52 },
      { id: 2645, uc: 54.5, cm: 54.5 },
      { id: 2915, uc: 8.4, cm: 9.5 },
      { id: 2916, uc: 10.0, cm: 10.12 },
      { id: 2917, uc: 15.0, cm: 15.7 },
      { id: 2578, uc: 0.13, cm: 0.13 },
    ]

    let restauradas = 0
    for (let i = 0; i < REGRAS.length; i++) {
      const r = REGRAS[i]
      let rec = null
      try {
        rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', { id: r.id })
      } catch (_) {
        rec = null
      }
      if (!rec) continue
      const ucAtual = rec.getFloat('ultima_compra_price')
      const cmAtual = rec.getFloat('custo_medio_price')
      if (ucAtual !== r.uc || cmAtual !== r.cm || rec.getString('fonte_preco') !== 'nf_compra') {
        rec.set('ultima_compra_price', r.uc)
        rec.set('custo_medio_price', r.cm)
        rec.set('fonte_preco', 'nf_compra')
        app.save(rec)
        restauradas++
        console.log(
          '[Reparo Pós-Cron] Régua ' +
            r.id +
            ' restaurada: uc=' +
            r.uc +
            ', cm=' +
            r.cm +
            ' (antes uc=' +
            ucAtual +
            ', cm=' +
            cmAtual +
            ')',
        )
      }
    }

    // Limpeza de sufixos de diagnóstico em description (texto original no payload)
    const comSufixo = app.findRecordsByFilter(
      'produtos_spincare',
      "description ~ ' [D:' || description ~ ' [DIAG:'",
      'description',
      0,
      0,
    )
    let limpos = 0
    for (let j = 0; j < comSufixo.length; j++) {
      const rec2 = comSufixo[j]
      const desc = rec2.getString('description')
      rec2.set('description', desc.split(' [D:')[0].split(' [DIAG:')[0].trim())
      try {
        app.save(rec2)
        limpos++
      } catch (_) {}
    }

    console.log(
      '[Reparo Pós-Cron] Réguas restauradas=' +
        restauradas +
        ', descrições com sufixo limpas=' +
        limpos,
    )
  },
  (app) => {},
)
