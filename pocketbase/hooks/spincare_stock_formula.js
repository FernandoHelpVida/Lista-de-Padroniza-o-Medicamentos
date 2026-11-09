/**
 * ============================================================================
 * FÓRMULA ÚNICA DE "ÚLTIMA COMPRA" E "CUSTO MÉDIO" — SPINCARE (HELP VIDA)
 * ============================================================================
 * REGRA VALIDADA CONTRA AS 5 RÉGUAS DO SPINCARE (impressões do usuário):
 *  - BUPRENORFINA 2645 (ultima compra 54,50, custo médio 54,50, estoque 2)
 *  - ENOXAPARINA 2915  (ultima compra 8,40,  custo médio 9,50)
 *  - ENOXAPARINA 2916  (ultima compra 10,00, custo médio 10,12)
 *  - ENOXAPARINA 2917  (ultima compra 15,00, custo médio 15,70)
 *  - BACLOFENO 2578    (ultima compra 0,13,  custo médio 0,13)
 *
 * REGRAS:
 *   ultima_compra = cost_unit_price da NF de compra mais recente
 *                   (operation_type='Entrada', operation_ds contém
 *                   'Nota fiscal - Compra'; desempate pelo MAIOR id).
 *   custo_medio   = média aritmética simples dos preços DISTINCTOS das NFs
 *                   de compra quando TODAS as NFs têm o mesmo preço unitário
 *                   OU quando existem 2+ preços distintos (média simples, não
 *                   ponderada por saldo — média ponderada por saldo NÃO fecha
 *                   as réguas).
 *   Caso especial: quando há 2+ NFs de compra e TODAS com o MESMO preço
 *   unitário, custo_medio = esse preço (réguas 2645, 2578).
 * ============================================================================
 */

// Escopo global explícito: top-level `const` em um arquivo de hook NÃO é
// visível nos outros arquivos na JSVM do PocketBase (goja) — cada arquivo tem
// seu próprio escopo de script. Só propriedades do objeto global são
// compartilhadas entre hooks, cron e rotas.
globalThis.computeStockValues = (prodId, allStocks, parseMoney) => {
  const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
  }
  if (!allStocks || allStocks.length === 0) {
    return { ultimaCompra: 0, custoMedio: 0, hasCompras: false }
  }

  // Filtra ESTRITAMENTE por product_id para evitar contaminação entre produtos
  const prodStocks = allStocks.filter((x) => {
    if (!x) return false
    const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
    return Number(pid) === Number(prodId)
  })

  // NF de compra = operação "Entrada" cuja descrição contém "Nota fiscal - Compra"
  const compras = prodStocks.filter(
    (x) =>
      x &&
      x.operation_type === 'Entrada' &&
      String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
  )
  if (compras.length === 0) {
    return { ultimaCompra: 0, custoMedio: 0, hasCompras: false }
  }

  // Última compra = NF de compra mais recente (maior id de movimentação)
  let lastNf = compras[0]
  for (let i = 1; i < compras.length; i++) {
    if (num(compras[i].id) > num(lastNf.id)) lastNf = compras[i]
  }
  const ultimaCompra = lastNf ? parseMoney(lastNf.cost_unit_price) : 0

  // Preços distintos das NFs de compra
  const precosDistintos = []
  for (let i = 0; i < compras.length; i++) {
    const u = parseMoney(compras[i].cost_unit_price)
    if (u > 0 && precosDistintos.indexOf(u) < 0) precosDistintos.push(u)
  }

  // Custo médio = média aritmética simples dos preços distintos
  let soma = 0
  for (let i = 0; i < precosDistintos.length; i++) soma += precosDistintos[i]
  let custoMedio = precosDistintos.length > 0 ? soma / precosDistintos.length : 0
  custoMedio = Number(custoMedio.toFixed(4))

  return {
    ultimaCompra: ultimaCompra > 0 ? Number(ultimaCompra.toFixed(4)) : 0,
    custoMedio: custoMedio > 0 ? Number(custoMedio.toFixed(4)) : 0,
    hasCompras: true,
  }
}
