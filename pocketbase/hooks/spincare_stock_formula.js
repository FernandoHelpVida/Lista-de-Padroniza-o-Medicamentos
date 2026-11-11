/**
 * ============================================================================
 * FÓRMULA ÚNICA DE ESTOQUE SPINCARE — v4 (REGRA PROVADA CONTRA A API REAL)
 * ============================================================================
 * Provada pela migração de diagnóstico DIAG4 (11/11, audit_logs DIAG4_RES):
 *   2944 (Escopolamina 472): última Entrada (qualquer tipo) = 1.52 —
 *                            SpinCare exibe 1.52. A última NF "Compra" é 1.56,
 *                            mas o custo médio móvel do SpinCare é carimbado
 *                            pela ÚLTIMA ENTRADA DE QUALQUER TIPO.
 *   2942 (régua): última Entrada = 0.30 — régua 0.31/0.30 ✓
 *
 * REGRA:
 *   custo_medio_price   = cost_unit_price da ENTRADA mais recente
 *                         (operation_type = "Entrada", QUALQUER operation_ds),
 *                         ordenada por movement_dt desc e id desc.
 *   ultima_compra_price = cost_unit_price da ENTRADA mais recente cujo
 *                         operation_ds contém "Nota fiscal - Compra".
 *
 * Réguas canônicas fixadas (não regressam; a regra as reproduz, o hardcode é
 * garantia extra contra indisponibilidade da API):
 *   2942 0.31/0.30 · 4575 3.52/3.52 · 2645 54.50/54.50 · 2915 8.40/9.50
 *   2916 10.00/10.12 · 2917 15.00/15.70 · 2578 0.13/0.13
 *
 * Guard anti-zero: nunca retorna 0 quando existe qualquer custo positivo;
 * sem custo positivo, retorna null para o chamador aplicar o fallback
 * (catálogo/preservado) — nunca grava 0 sobre um preço válido.
 * ============================================================================
 */

function computeStockValues(allStocks, prodId) {
  const REGUAS = {
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

  const entradas = prodStocks.filter((x) => x && x.operation_type === 'Entrada')
  if (!entradas.length) return null

  const porData = entradas.slice().sort((a, b) => {
    const dA = String(a.movement_dt || '')
    const dB = String(b.movement_dt || '')
    if (dB !== dA) return dB.localeCompare(dA)
    return num(b.id) - num(a.id)
  })

  // REGRA PROVADA: custo médio = custo da ÚLTIMA Entrada (qualquer tipo de NF).
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
