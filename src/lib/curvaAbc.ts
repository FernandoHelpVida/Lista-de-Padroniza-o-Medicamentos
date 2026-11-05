/**
 * Agregação da Curva ABC por quantidade dispensada × preço do produto.
 * Fonte: coleções locais produtos_spincare e dispensacoes_spincare.
 */

import type { SpincareDispensacaoRecord, SpincareProdutoRecord } from '@/services/spincare'

export interface CurvaAbcItem {
  productId: number
  codigo: string
  descricao: string
  grupo: string
  unidade: string
  precoUnitario: number
  quantidade: number
  valorTotal: number
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
  busca: string
}

export interface CurvaAbcResult {
  itens: CurvaAbcItem[]
  resumo: CurvaAbcClasseResumo[]
  valorTotalGeral: number
  quantidadeTotal: number
  produtosSemPreco: number
}

function matchesFilters(d: SpincareDispensacaoRecord, f: CurvaAbcFiltros): boolean {
  // expected_deliver_dt em ISO (yyyy-mm-dd) — filtro por período da entrega
  const data = (d.expected_deliver_dt || '').slice(0, 10)
  if (!data || data < f.dataInicio || data > f.dataFim) return false
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

/** Agrupa dispensações por product_id e classifica em A/B/C. */
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
  const idsComPreco = new Set<number>()

  for (const d of dispensacoes) {
    if (!matchesFilters(d, filtros)) continue
    const itens = Array.isArray(d.itens) ? d.itens : []
    for (const it of itens) {
      const productId = Number(it.product_id || 0)
      if (!productId) continue
      const produto = produtosById.get(productId)
      if (produto && produto.price > 0) {
        const qt = Number(it.qt || 0)
        const prev = porProduto.get(productId) || { quantidade: 0, dispensacoes: 0 }
        prev.quantidade += qt
        prev.dispensacoes += 1
        porProduto.set(productId, prev)
        idsComPreco.add(productId)
      }
    }
  }

  for (const id of idsComPreco) {
    const p = produtosById.get(id)
    if (p && !(p.price > 0)) produtosSemPreco++
  }

  const totalRaw = Array.from(porProduto.entries()).map(([productId, agg]) => {
    const produto = produtosById.get(productId) as SpincareProdutoRecord
    return {
      productId,
      codigo: produto.code || '',
      descricao: produto.description || '',
      grupo: produto.group_description || '',
      unidade: produto.measure_unit || '',
      precoUnitario: Number(produto.price || 0),
      quantidade: agg.quantidade,
      valorTotal: agg.quantidade * Number(produto.price || 0),
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

  return { itens, resumo, valorTotalGeral, quantidadeTotal, produtosSemPreco }
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
