/**
 * pocketbase/hooks/spincare_stock_formula.js
 *
 * Fórmula oficial de última compra e custo médio dos produtos SpinCare no middleware Help Vida.
 *
 * COMPARTILHADA POR:
 *  - Cron diário das 03:00 (pocketbase/hooks/spincare_products.js)
 *  - Rota manual "Sincronizar agora" (pocketbase/hooks/spincare_products.js)
 *  - Rota de reprocessamento A-Z (pocketbase/hooks/spincare_backfill.js)
 *
 * REGRAS DE REFERÊNCIA (conferidas e validadas diretamente contra o SpinCare):
 *  1. Última compra (ultima_compra_price):
 *     - Endpoint: /integration-engine/get/stocks?product_id=X
 *     - Filtro: operation_type === 'Entrada' && operation_ds contém 'Nota fiscal - Compra'
 *     - Registro: última NF de compra mais recente (maior id numérico)
 *     - Valor: cost_unit_price convertido para número
 *
 *  2. Custo médio (custo_medio_price):
 *     - Média PONDERADA por quantidade dos lotes de NF de ENTRADA ("Nota fiscal - Compra")
 *       que cobrem o saldo em estoque, começando da NF mais recente para trás.
 *     - Réguas de validação estritas do SpinCare:
 *         * 4575 Dipirona 300mg Supositório: última compra 3,52 · custo médio 3,52
 *         * 2645 Buprenorfina 10mg: última compra 54,50 · custo médio 54,50
 *         * 2915 Enoxaparina 20mg: última compra 8,40 · custo médio 9,50
 *         * 2916 Enoxaparina 40mg: última compra 10,00 · custo médio 10,12
 *         * 2917 Enoxaparina 60mg: última compra 15,00 · custo médio 15,70
 *         * 2578 Baclofeno 10mg CP: última compra 0,13 · custo médio 0,13
 *
 *  3. Fallback:
 *     - Se o produto não possui NFs de compra em /get/stocks, hasCompras é falso.
 *     - Nesse caso o chamador DEVE preservar os valores já gravados anteriormente no banco.
 */

function parseMoney(v) {
  if (typeof v === 'number') return v
  let s = String(v || '')
    .trim()
    .replace(/[^\d.,-]/g, '')
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
    s = s.split('.').join('').replace(',', '.')
  } else if (s.indexOf(',') >= 0) {
    s = s.replace(',', '.')
  }
  return parseFloat(s) || 0
}

function num(v) {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

/**
 * Calcula { ultimaCompra, custoMedio, hasCompras } a partir da lista bruta de stocks da API SpinCare.
 * @param {number|string} prodId ID do produto no SpinCare
 * @param {Array} allStocks Array retornado por /integration-engine/get/stocks
 */
function computeStockValues(prodId, allStocks) {
  const pId = Number(prodId)

  if (!allStocks || allStocks.length === 0) {
    return { ultimaCompra: 0, custoMedio: 0, hasCompras: false }
  }

  // Filtra stocks estritamente pelo product_id para evitar contaminação
  const prodStocks = allStocks.filter((x) => {
    if (!x) return false
    const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
    return Number(pid) === pId
  })

  // Filtra NFs de compra
  const compras = prodStocks.filter(
    (x) =>
      x &&
      x.operation_type === 'Entrada' &&
      String(x.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
  )

  if (compras.length === 0) {
    return { ultimaCompra: 0, custoMedio: 0, hasCompras: false }
  }

  // 1. Última compra: NF de compra mais recente por maior id
  // Ordena decrescente por id (mais recente primeiro)
  const sortedCompras = compras.slice().sort((a, b) => num(b.id) - num(a.id))
  const lastNf = sortedCompras[0]
  const ultimaCompra = lastNf ? parseMoney(lastNf.cost_unit_price) : 0

  // 2. Custo médio:
  // Determina o saldo de referência a cobrir:
  // Se houver balance/stock_balance na movimentação mais recente de prodStocks, usamos ele.
  let currentBalance = 0
  if (prodStocks.length > 0) {
    const sortedAll = prodStocks.slice().sort((a, b) => num(b.id) - num(a.id))
    currentBalance = num(
      sortedAll[0].balance !== undefined ? sortedAll[0].balance : sortedAll[0].stock_balance,
    )
  }

  let custoMedio = 0
  if (currentBalance > 0) {
    let needed = currentBalance
    let weightedSum = 0
    let qtySum = 0
    for (let i = 0; i < sortedCompras.length; i++) {
      const c = sortedCompras[i]
      const q = num(c.quantity !== undefined ? c.quantity : c.qt)
      const cost = parseMoney(c.cost_unit_price)
      if (q > 0 && cost > 0) {
        const take = Math.min(needed, q)
        weightedSum += take * cost
        qtySum += take
        needed -= take
        if (needed <= 0) break
      }
    }
    if (qtySum > 0) {
      custoMedio = weightedSum / qtySum
    }
  }

  // Sem saldo válido apurado ou compras não cobriram o saldo -> custo médio = última compra
  if (!(custoMedio > 0)) {
    custoMedio = ultimaCompra
  }

  custoMedio = Number(custoMedio.toFixed(4))

  return {
    ultimaCompra: ultimaCompra > 0 ? Number(ultimaCompra.toFixed(4)) : 0,
    custoMedio: custoMedio > 0 ? custoMedio : 0,
    hasCompras: true,
  }
}

// Expõe globalmente caso o ambiente suporte
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.computeStockValues = computeStockValues
    globalThis.parseMoney = parseMoney
  }
} catch (_) {}

module.exports = {
  computeStockValues: computeStockValues,
  parseMoney: parseMoney,
}
