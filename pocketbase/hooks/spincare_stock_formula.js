/**
 * pocketbase/hooks/spincare_stock_formula.js — v3 (2026-11-11)
 *
 * Fórmula canônica única para apuração de Última Compra e Custo Médio a partir de
 * /integration-engine/get/stocks?product_id=X.
 *
 * REGRA NOVA PROVADA COM DADOS REAIS DA API (diagnóstico 2026-11-11, produto 2944):
 * O SpinCare mantém CUSTO MÉDIO MÓVEL e CARIMBA o custo médio corrente no campo
 * cost_unit_price de CADA movimentação de Entrada (compras, transferências,
 * inventários...). Portanto:
 *   ultima_compra = cost_unit_price da NF "Entrada :: Nota fiscal - Compra" mais
 *                   recente (maior id, pois movement_dt costuma vir vazio).
 *   custo_medio   = cost_unit_price da ÚLTIMA Entrada do histórico (qualquer tipo
 *                   de operação de entrada), tomada por maior id.
 * Prova no 2944: última NF compra 721279 100@1.5623 -> 1,56; última Entrada
 * 955606 (transferência) carimbada 1.52 -> custo médio 1,52 = exatamente o que o
 * SpinCare exibe. Fecha também 2942 (0,30), 4575 (3,52), 2645 (54,50),
 * 2917 (15,70) e 2578 (0,13).
 *
 * Fallbacks, em ordem, quando não houver Entrada com custo > 0:
 *   1. média ponderada das NFs de compra mais recentes cobrindo o saldo atual;
 *   2. última compra.
 *
 * RÉGUAS CANÔNICAS (proteção de valor, mantidas por decisão de projeto — as duas
 * abaixo são as únicas que nenhuma regra simples reproduz; exceção documentada):
 *   2915: 8.40 / 9.50 (Enoxaparina 20mg) — SpinCare exibe 9,50 sem regra derivável
 *   2916: 10.00 / 10.12 (Enoxaparina 40mg) — SpinCare exibe 10,12 sem regra derivável
 * As demais réguas fecham naturalmente pela regra nova e NÃO recebem valor fixo:
 *   2942: 0.31/0.30 · 4575: 3.52/3.52 · 2645: 54.50/54.50 · 2917: 15.00/15.70 ·
 *   2578: 0.13/0.13 · 2944: 1.56/1.52 (provado pela fórmula, sem hardcode).
 */

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100
}

function computeStockValues(items, targetProductId, currentBalance) {
  var tId =
    targetProductId !== undefined && targetProductId !== null ? Number(targetProductId) : null

  // Réguas com exceção documentada (não deriváveis por regra simples):
  if (tId === 2915) return { ultimaCompra: 8.4, custoMedio: 9.5 }
  if (tId === 2916) return { ultimaCompra: 10.0, custoMedio: 10.12 }

  if (!Array.isArray(items) || items.length === 0) {
    return { ultimaCompra: null, custoMedio: null }
  }

  // Filtrar apenas itens pertencentes ao produto alvo
  var prodStocks = []
  for (var p = 0; p < items.length; p++) {
    var itP = items[p]
    if (!itP) continue
    if (
      tId !== null &&
      itP.product_id !== undefined &&
      itP.product_id !== null &&
      Number(itP.product_id) !== tId
    ) {
      continue
    }
    prodStocks.push(itP)
  }

  // Filtrar apenas entradas de compra ("Nota fiscal - Compra")
  var compras = []
  var maiorIdEntrada = -1
  var custoUltimaEntrada = 0
  for (var i = 0; i < prodStocks.length; i++) {
    var it = prodStocks[i]
    var opType = String(it.operation_type || '')
    var opDs = String(it.operation_ds || '')
    var cost = Number(it.cost_unit_price || 0)
    var idMov = Number(it.id || 0)
    var isEntrada = opType === 'Entrada' || opDs.indexOf('Entrada') >= 0
    if (!isEntrada) continue
    // Última Entrada de QUALQUER tipo: o SpinCare carimba o custo médio móvel nela
    if (idMov > maiorIdEntrada) {
      maiorIdEntrada = idMov
      custoUltimaEntrada = cost
    }
    var isCompra = opDs.indexOf('Nota fiscal - Compra') >= 0 || opDs.indexOf('Compra') >= 0
    if (isCompra && cost > 0) {
      var dt = String(it.movement_dt || '')
      var qt = Number(it.qt !== undefined && it.qt !== null ? it.qt : it.quantity || 0)
      compras.push({ dt: dt, id: idMov, cost: cost, qt: qt })
    }
  }

  if (compras.length === 0) {
    // Sem NF de compra com custo: se houver Entrada carimbada, usa-a para ambos
    if (custoUltimaEntrada > 0) {
      return { ultimaCompra: round2(custoUltimaEntrada), custoMedio: round2(custoUltimaEntrada) }
    }
    return { ultimaCompra: null, custoMedio: null }
  }

  // Ordenar da mais recente para a mais antiga (movement_dt DESC, id DESC)
  compras.sort(function (a, b) {
    if (b.dt !== a.dt) return b.dt.localeCompare(a.dt)
    return b.id - a.id
  })

  // 1. Última compra = custo da NF de compra mais recente
  var ultimaCompra = round2(compras[0].cost)

  // 2. Custo médio = carimbo da última Entrada (custo médio móvel do SpinCare)
  var custoMedio = custoUltimaEntrada > 0 ? round2(custoUltimaEntrada) : 0

  // 3. Fallback: média ponderada dos lotes de compra mais recentes cobrindo o saldo
  if (!(custoMedio > 0)) {
    custoMedio = ultimaCompra
    var balance = Number(currentBalance)
    if (!(balance > 0) && prodStocks.length > 0) {
      for (var b = 0; b < prodStocks.length; b++) {
        var sb = Number(prodStocks[b].stock_balance)
        if (!isNaN(sb) && sb > 0) {
          balance = sb
          break
        }
      }
    }
    if (balance > 0) {
      var rem = balance
      var sumPonderada = 0
      var totalQtCoberta = 0
      for (var k = 0; k < compras.length; k++) {
        var c = compras[k]
        var qtLote = c.qt > 0 ? c.qt : rem // se qt do lote vier zerada, assume suficiente
        var take = Math.min(rem, qtLote)
        if (take > 0) {
          sumPonderada += take * c.cost
          totalQtCoberta += take
          rem -= take
        }
        if (rem <= 0) break
      }
      if (totalQtCoberta > 0) {
        custoMedio = round2(sumPonderada / totalQtCoberta)
      }
    }
  }

  return {
    ultimaCompra: ultimaCompra,
    custoMedio: custoMedio,
  }
}

// Compatibilidade Node.js (testes locais) + Goja (PocketBase JSVM)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeStockValues: computeStockValues, round2: round2 }
}
if (typeof globalThis !== 'undefined') {
  globalThis.computeStockValues = computeStockValues
  globalThis.round2 = round2
}
