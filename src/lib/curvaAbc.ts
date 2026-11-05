/**
 * Agregação da Curva ABC por quantidade dispensada × preço da ÚLTIMA COMPRA.
 * Fonte: coleções locais produtos_spincare e dispensacoes_spincare.
 * - Quantidade: soma de qt dispensada por produto nas dispensações do período.
 * - Preço unitário: ultima_compra_price (última compra no SpinCare);
 *   fallback para o price de catálogo quando o produto não tem compra registrada.
 * - Filtro por convênio: classes A/B/C, % e % acumulado recalculados dentro
 *   do recorte de convênio selecionado.
 */

import type { SpincareDispensacaoRecord, SpincareProdutoRecord } from '@/services/spincare'

export interface CurvaAbcItem {
  productId: number
  codigo: string
  descricao: string
  grupo: string
  unidade: string
  convenio: string
  precoUnitario: number // Custo médio (ou fallback se custo médio não existir)
  custoMedio: number // Custo médio calculado/registrado
  ultimaCompra: number // Valor da última compra
  precoCatalogo: number // Preço de tabela/catálogo
  precoBase: 'custo_medio' | 'ultima_compra' | 'catalogo_fallback'
  quantidade: number // Total enviado para casa (sent_qt)
  quantidadeEnviadaCasa: number // Alias explícito para quantidade
  dispensacoesCount: number
  valorTotal: number // quantidadeEnviadaCasa × precoUnitario (custo médio)
  percentual: number
  percentualAcumulado: number
  classe: 'A' | 'B' | 'C'
  posicao: number
}

export interface CurvaAbcClasseResumo {
  classe: 'A' | 'B' | 'C'
  rotulo: string
  quantidadeItens: number
  valorTotal: number
  percentual: number
}

export interface CurvaAbcFiltros {
  dataInicio: string // yyyy-mm-dd
  dataFim: string // yyyy-mm-dd
  grupo: string
  convenio: string // id da dispensação-fonte do convênio ('todos' = todos)
  busca: string
}

export interface CurvaAbcResult {
  itens: CurvaAbcItem[]
  resumo: CurvaAbcClasseResumo[]
  valorTotalGeral: number
  quantidadeTotal: number
  produtosSemPreco: number
  produtosFallbackCatalogo: number
}

export interface ConvenioCurvaOpcao {
  convenioId: string
  convenioNome: string
}

function matchesFilters(d: SpincareDispensacaoRecord, f: CurvaAbcFiltros): boolean {
  // expected_deliver_dt em ISO (yyyy-mm-dd) — filtro por período da entrega
  const data = (d.expected_deliver_dt || '').slice(0, 10)
  if (!data || data < f.dataInicio || data > f.dataFim) return false
  // Filtro por convênio da dispensação (chave de réplica local)
  if (f.convenio !== 'todos' && String(d.insurance_id || '') !== f.convenio) return false
  return true
}

function produtoMatches(p: SpincareProdutoRecord, f: CurvaAbcFiltros): boolean {
  if (f.grupo !== 'todos' && (p.group_description || '') !== f.grupo) return false
  if (f.busca) {
    const alvo = `${p.code || ''} ${p.description || ''} ${p.group_description || ''}`.toLowerCase()
    if (!alvo.includes(f.busca.toLowerCase())) return false
  }
  return true
}

/** Agrupa dispensações por product_id e classifica em A/B/C dentro do recorte. */
export function computeCurvaAbc(
  dispensacoes: SpincareDispensacaoRecord[],
  produtos: SpincareProdutoRecord[],
  filtros: CurvaAbcFiltros,
): CurvaAbcResult {
  const produtosById = new Map<number, SpincareProdutoRecord>()
  for (const p of produtos) produtosById.set(p.spincare_id, p)

  const grupos = new Set<string>()
  for (const p of produtos) {
    const g = (p.group_description || '').trim()
    if (g) grupos.add(g)
  }

  const porProduto = new Map<number, { quantidade: number; dispensacoes: number }>()
  let produtosSemPreco = 0
  let produtosFallbackCatalogo = 0
  const idsComQt = new Set<number>()

  for (const d of dispensacoes) {
    if (!matchesFilters(d, filtros)) continue
    const itens = Array.isArray(d.itens) ? d.itens : []
    for (const it of itens) {
      const productId = Number(it.product_id || 0)
      if (!productId) continue
      // Conforme Swagger UI do SpinCare (get/dispensations -> items -> sent_qt):
      // A quantidade enviada para casa é representada pelo campo sent_qt.
      // Se sent_qt estiver definido e > 0, usamos sent_qt. Fallback para qt caso sent_qt seja zero/ausente.
      const sentQt = Number(
        it.sent_qt !== undefined && it.sent_qt !== null ? it.sent_qt : it.qt || 0,
      )
      if (!sentQt) continue
      const prev = porProduto.get(productId) || { quantidade: 0, dispensacoes: 0 }
      prev.quantidade += sentQt
      prev.dispensacoes += 1
      porProduto.set(productId, prev)
      idsComQt.add(productId)
    }
  }

  /**
   * Determina o custo médio, última compra e preço base de cálculo.
   * Regra do usuário: Curva ABC calculada com Custo Médio × Quantidade enviada para casa.
   * Custo Médio = média dos valores de preço disponíveis do produto (imported_prices: pfb, price, pmc + catálogo).
   */
  const extrairPrecos = (p: SpincareProdutoRecord) => {
    const uc = Number(p.ultima_compra_price || 0)
    const pc = Number(p.price || 0)

    let cm = Number(p.custo_medio_price || 0)
    if (!(cm > 0)) {
      const precos: number[] = []
      if (uc > 0) precos.push(uc)
      const py = (p.payload || {}) as Record<string, unknown>
      const imported = Array.isArray(py.imported_prices) ? py.imported_prices : []
      for (const rawIp of imported) {
        const ip = (rawIp || {}) as Record<string, unknown>
        const pfb = Number(ip.pfb_value || 0)
        const pr = Number(ip.price || 0)
        const pmc = Number(ip.pmc_value || 0)
        if (pfb > 0 && !precos.includes(pfb)) precos.push(pfb)
        if (pr > 0 && !precos.includes(pr)) precos.push(pr)
        if (pmc > 0 && !precos.includes(pmc)) precos.push(pmc)
      }
      if (pc > 0 && !precos.includes(pc)) precos.push(pc)
      if (precos.length > 0) {
        cm = Number((precos.reduce((a, b) => a + b, 0) / precos.length).toFixed(4))
      }
    }

    let precoCalculo = cm
    let precoBase: 'custo_medio' | 'ultima_compra' | 'catalogo_fallback' = 'custo_medio'

    if (!(precoCalculo > 0)) {
      if (uc > 0) {
        precoCalculo = uc
        precoBase = 'ultima_compra'
      } else if (pc > 0) {
        precoCalculo = pc
        precoBase = 'catalogo_fallback'
      }
    }

    return {
      custoMedio: cm > 0 ? cm : precoCalculo,
      ultimaCompra: uc,
      precoCatalogo: pc,
      precoCalculo,
      precoBase,
    }
  }

  const totalRaw = Array.from(porProduto.entries()).map(([productId, agg]) => {
    const produto = produtosById.get(productId) as SpincareProdutoRecord
    const { custoMedio, ultimaCompra, precoCatalogo, precoCalculo, precoBase } = produto
      ? extrairPrecos(produto)
      : {
          custoMedio: 0,
          ultimaCompra: 0,
          precoCatalogo: 0,
          precoCalculo: 0,
          precoBase: 'catalogo_fallback' as const,
        }

    if (!produto || !(precoCalculo > 0)) {
      produtosSemPreco++
    } else if (precoBase === 'catalogo_fallback') {
      produtosFallbackCatalogo++
    }

    return {
      productId,
      codigo: produto?.code || '',
      descricao: produto?.description || '',
      grupo: produto?.group_description || '',
      unidade: produto?.measure_unit || '',
      precoUnitario: precoCalculo,
      custoMedio,
      ultimaCompra,
      precoCatalogo,
      precoBase,
      quantidade: agg.quantidade,
      quantidadeEnviadaCasa: agg.quantidade,
      dispensacoesCount: agg.dispensacoes,
      valorTotal: agg.quantidade * precoCalculo,
    }
  })

  // Filtro de grupo e busca aplicados ao produto (não à dispensação)
  const filtrados = totalRaw.filter((it) => {
    if (filtros.grupo !== 'todos' && it.grupo !== filtros.grupo) return false
    if (filtros.busca) {
      const alvo = `${it.codigo} ${it.descricao} ${it.grupo}`.toLowerCase()
      if (!alvo.includes(filtros.busca.toLowerCase())) return false
    }
    return true
  })

  const valorTotalGeral = filtrados.reduce((acc, it) => acc + it.valorTotal, 0)
  const quantidadeTotal = filtrados.reduce((acc, it) => acc + it.quantidade, 0)

  // Ordenação por valor decrescente; empate resolve por quantidade, depois descrição
  filtrados.sort((a, b) => {
    if (b.valorTotal !== a.valorTotal) return b.valorTotal - a.valorTotal
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
    return a.descricao.localeCompare(b.descricao, 'pt-BR')
  })

  let acumulado = 0
  const itens: CurvaAbcItem[] = filtrados.map((it, idx) => {
    const percentual = valorTotalGeral > 0 ? (it.valorTotal / valorTotalGeral) * 100 : 0
    acumulado += percentual
    const percentualAcumulado = Math.min(acumulado, 100)
    const classe: CurvaAbcItem['classe'] =
      percentualAcumulado <= 80 ? 'A' : percentualAcumulado <= 95 ? 'B' : 'C'
    return {
      ...it,
      convenio: filtros.convenio === 'todos' ? '' : filtros.convenio,
      percentual: Number(percentual.toFixed(2)),
      percentualAcumulado: Number(percentualAcumulado.toFixed(2)),
      classe,
      posicao: idx + 1,
    }
  })

  const resumo: CurvaAbcClasseResumo[] = (['A', 'B', 'C'] as const).map((classe) => {
    const daClasse = itens.filter((i) => i.classe === classe)
    const valor = daClasse.reduce((acc, i) => acc + i.valorTotal, 0)
    const rotulo =
      classe === 'A'
        ? 'Classe A — até 80% acumulado'
        : classe === 'B'
          ? 'Classe B — 80% a 95% acumulado'
          : 'Classe C — 95% a 100% acumulado'
    return {
      classe,
      rotulo,
      quantidadeItens: daClasse.length,
      valorTotal: valor,
      percentual: valorTotalGeral > 0 ? Number(((valor / valorTotalGeral) * 100).toFixed(1)) : 0,
    }
  })

  return {
    itens,
    resumo,
    valorTotalGeral,
    quantidadeTotal,
    produtosSemPreco,
    produtosFallbackCatalogo,
  }
}

/** Lista de grupos distintos do catálogo (para o filtro). */
export function distinctGrupos(produtos: SpincareProdutoRecord[]): string[] {
  const set = new Set<string>()
  for (const p of produtos) {
    const g = (p.group_description || '').trim()
    if (g) set.add(g)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Lista de convênios presentes nas dispensações (para o filtro da Curva ABC). */
export function distinctConvenios(dispensacoes: SpincareDispensacaoRecord[]): ConvenioCurvaOpcao[] {
  const set = new Set<string>()
  for (const d of dispensacoes) {
    const id = Number(d.insurance_id || 0)
    if (!id) continue
    set.add(String(id))
  }
  return Array.from(set)
    .map((id) => {
      const rec = dispensacoes.find((d) => String(Number(d.insurance_id || 0)) === id)
      const nome = (rec?.insurance_name || '').trim() || `Convênio ${id}`
      return { convenioId: id, convenioNome: nome }
    })
    .sort((a, b) => a.convenioNome.localeCompare(b.convenioNome, 'pt-BR'))
}
