/**
 * Corrige a origem do preço da BOBINA PICOTADA 4,5X8 (spincare_id 4383).
 * A API SpinCare não informa custo para este produto (imported_prices vazio
 * e price=0 no payload), então a fonte correta é 'api_cost_zero' e não
 * 'nf_compra' (que sugeriria uma NF de compra zerada).
 * Idempotente: só atualiza se os custos estiverem zerados; no-op em banco vazio.
 */
migrate(
  (app) => {
    let rec
    try {
      rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 4383')
    } catch (_) {
      console.log('[fix-4383] Registro spincare_id=4383 não encontrado (banco vazio) — no-op.')
      return
    }
    if (!rec) {
      console.log('[fix-4383] Registro spincare_id=4383 não encontrado (banco vazio) — no-op.')
      return
    }
    const cm = rec.getFloat('custo_medio_price')
    const uc = rec.getFloat('ultima_compra_price')
    const fonte = rec.getString('fonte_preco')
    if (cm === 0 && uc === 0 && fonte !== 'api_cost_zero') {
      rec.set('fonte_preco', 'api_cost_zero')
      app.save(rec)
      console.log('[fix-4383] fonte_preco atualizado para api_cost_zero.')
    } else {
      console.log('[fix-4383] Sem alteração (custos não zerados ou fonte já correta).')
    }
  },
  (app) => {
    // down: restaura a fonte anterior apenas se o registro ainda estiver zerado
    let rec
    try {
      rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 4383')
    } catch (_) {
      return
    }
    if (
      rec &&
      rec.getFloat('custo_medio_price') === 0 &&
      rec.getFloat('ultima_compra_price') === 0 &&
      rec.getString('fonte_preco') === 'api_cost_zero'
    ) {
      rec.set('fonte_preco', 'nf_compra')
      app.save(rec)
    }
  },
)
