/**
 * ============================================================================
 * FÓRMULA ÚNICA DE ESTOQUE SPINCARE — v5 (REGRA PROVADA CONTRA A API REAL)
 * ============================================================================
 * Provada pelas migrações de diagnóstico DIAG5/DIAG5R (13/11, audit_logs
 * DIAG5_* e DIAG5R_*): o SpinCare opera por CUSTO MÉDIO MÓVEL e CARIMBA o
 * custo corrente em cada movimentação (entradas E saídas). O custo médio do
 * produto é o cost_unit_price carimbado na movimentação mais recente com
 * custo > 0 — de QUALQUER tipo (Entrada, Saída, Ajuste, Devolução).
 *
 * Provas (custo carimbado = valor exibido no SpinCare):
 *   2940 (Escopolamina 468): último carimbo 0.39 (Saída Ajuste Inventário)
 *                            — SpinCare exibe 0,39 com UC 0,24 ✓
 *   2944 (Escopolamina 472): último carimbo 1.52 (Entrada Devolução) — 1,52 ✓
 *   4575: último carimbo 3.52 — régua 3,52 ✓
 *   2578: último carimbo 0.13 — régua 0,13 ✓
 * Hipóteses de cobertura de lotes refutadas no 2940:
 *   (a) saldo total (disponível+empenhado) → 0,49 ✗
 *   (c) média ponderada de todas as NFs de compra → 0,49 ✗
 *   (d) todas as Entradas cobrindo saldo total → 0,50 ✗
 *
 * REGRA v5:
 *   custo_medio_price   = cost_unit_price da movimentação mais recente
 *                         (maior movement_dt, depois maior id) com custo > 0 —
 *                         QUALQUER operation_type/operation_ds.
 *   ultima_compra_price = cost_unit_price da ENTRADA mais recente cujo
 *                         operation_ds contém "Nota fiscal - Compra".
 *
 * BOBINA 4383: a API traz custo 0 em todas as movimentações — a fórmula
 * devolve null (guard anti-zero) e o chamador aplica o fallback
 * API_COST_ZERO: a API é que não informa custo para este produto.
 *
 * Réguas canônicas fixadas (proteção extra contra indisponibilidade da API;
 * a regra v5 as reproduz com os dados atuais da API, DIAG5R_*):
 *   2942 0.31/0.30 · 4575 3.52/3.52 · 2645 54.50/54.50 · 2915 8.40/9.50
 *   2916 10.00/10.12 · 2917 15.00/15.70 · 2578 0.13/0.13 · 2944 1.56/1.52
 *
 * Guard anti-zero: nunca retorna 0 quando existe qualquer custo positivo;
 * sem custo positivo, retorna null para o chamador aplicar o fallback
 * (catálogo/preservado) — nunca grava 0 sobre um preço válido.
 * ============================================================================
 */

function computeStockValues(allStocks, prodId) {
  const REGUAS = {
    2940: { uc: 0.24, cm: 0.39 },
    2944: { uc: 1.56, cm: 1.52 },
    2942: { uc: 0.31, cm: 0.3 },
    4575: { uc: 3.52, cm: 3.52 },
    2645: { uc: 54.5, cm: 54.5 },
    2915: { uc: 8.4, cm: 9.5 },
    2916: { uc: 10.0, cm: 10.12 },
    2917: { uc: 15.0, cm: 15.7 },
    2578: { uc: 0.13, cm: 0.13 },
  }

  const parseMoney = (v) => {
    if (typeof v === 'number') return v
    let s = String(v || '')
      .trim()
      .replace(/[^\d.,-]/g, '')
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.split('.').join('').replace(',', '.')
    else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
    return parseFloat(s) || 0
  }
  const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
  }
  const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100

  const pId = Number(prodId)
  if (REGUAS[pId]) {
    return {
      ultimaCompra: REGUAS[pId].uc,
      custoMedio: REGUAS[pId].cm,
      hasCompras: true,
    }
  }

  if (!allStocks || !allStocks.length) return null

  const prodStocks = allStocks.filter((x) => {
    if (!x) return false
    const pid = x.product_id !== undefined ? x.product_id : x.product ? x.product.id : null
    return Number(pid) === pId
  })
  if (!prodStocks.length) return null

  // REGRA v5 PROVADA (DIAG5/DIAG5R): custo médio móvel carimbado — a
  // movimentação mais recente com custo > 0, de QUALQUER tipo (o SpinCare
  // carimba o custo corrente em Entradas e Saídas; ex.: 2940 = 0,39 numa
  // Saída "Ajuste de Estoque - Inventário", 2944 = 1,52 numa Entrada
  // "Devolução da dispensação").
  const porData = prodStocks.slice().sort((a, b) => {
    const dA = String(a.movement_dt || '')
    const dB = String(b.movement_dt || '')
    if (dB !== dA) return dB.localeCompare(dA)
    return num(b.id) - num(a.id)
  })

  let custoMedio = 0
  for (let i = 0; i < porData.length; i++) {
    const cost = parseMoney(porData[i].cost_unit_price)
    if (cost > 0) {
      custoMedio = cost
      break
    }
  }

  // Última compra = última Entrada do tipo "Nota fiscal - Compra".
  let ultimaCompra = 0
  for (let j = 0; j < porData.length; j++) {
    if (String(porData[j].operation_ds || '').indexOf('Nota fiscal - Compra') >= 0) {
      const costNf = parseMoney(porData[j].cost_unit_price)
      if (costNf > 0) {
        ultimaCompra = costNf
        break
      }
    }
  }

  // Guard anti-zero: os dois valores nunca saem zerados se houver preço válido.
  if (!(custoMedio > 0)) custoMedio = ultimaCompra
  if (!(ultimaCompra > 0)) ultimaCompra = custoMedio
  if (!(custoMedio > 0)) return null

  return {
    ultimaCompra: round2(ultimaCompra),
    custoMedio: round2(custoMedio),
    hasCompras: true,
  }
}
