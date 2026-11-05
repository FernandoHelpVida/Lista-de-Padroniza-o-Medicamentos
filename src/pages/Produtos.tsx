import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Pill,
  RefreshCw,
  Search,
  Download,
  Calendar,
  Filter,
  BarChart3,
  Table2,
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  triggerProductsSync,
  getProductsSyncStatus,
  getSpincareProdutos,
  getSpincareDispensacoes,
} from '@/services/spincare'
import type {
  SpincareProdutoRecord,
  SpincareDispensacaoRecord,
  ProductsSyncStatusResult,
} from '@/services/spincare'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatIsoToBr } from '@/lib/dateUtils'
import { computeCurvaAbc, distinctGrupos } from '@/lib/curvaAbc'
import type { CurvaAbcItem, CurvaAbcFiltros } from '@/lib/curvaAbc'

const DEFAULT_INICIO = '2026-01-01'
const HOJE = new Date().toISOString().slice(0, 10)

function formatCurrency(val: number): string {
  return val.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTimeIso(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CLASSE_BADGE: Record<CurvaAbcItem['classe'], { label: string; className: string }> = {
  A: { label: 'Classe A', className: 'bg-green-100 text-green-800 border-green-300' },
  B: { label: 'Classe B', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  C: { label: 'Classe C', className: 'bg-gray-100 text-gray-600 border-gray-300' },
}

type CatSortField = 'code' | 'description' | 'group_description' | 'type_description' | 'price'
type AbcSortField = 'posicao' | 'descricao' | 'quantidade' | 'valorTotal'

export default function Produtos() {
  const { isAdmin, isFinanceiro, isDispensario } = useAuth()
  const canAccess = isAdmin || isFinanceiro || isDispensario

  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<SpincareProdutoRecord[]>([])
  const [dispensacoes, setDispensacoes] = useState<SpincareDispensacaoRecord[]>([])
  const [syncStatus, setSyncStatus] = useState<ProductsSyncStatusResult | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Aba ativa
  const [aba, setAba] = useState<'catalogo' | 'curva'>('catalogo')

  // Filtros Catálogo
  const [catBusca, setCatBusca] = useState('')
  const [catSomenteAtivos, setCatSomenteAtivos] = useState('todos')
  const [catSortField, setCatSortField] = useState<CatSortField>('description')
  const [catSortDir, setCatSortDir] = useState<'asc' | 'desc'>('asc')

  // Filtros Curva ABC
  const [abcInicio, setAbcInicio] = useState(DEFAULT_INICIO)
  const [abcFim, setAbcFim] = useState(HOJE)
  const [abcGrupo, setAbcGrupo] = useState('todos')
  const [abcBusca, setAbcBusca] = useState('')
  const [abcSortField, setAbcSortField] = useState<AbcSortField>('posicao')
  const [abcSortDir, setAbcSortDir] = useState<'asc' | 'desc'>('asc')

  const grupos = useMemo(() => distinctGrupos(produtos), [produtos])

  // Catálogo filtrado
  const catalogoFiltrado = useMemo(() => {
    const q = catBusca.trim().toLowerCase()
    const lista = produtos.filter((p) => {
      if (catSomenteAtivos === 'ativos' && !p.active) return false
      if (catSomenteAtivos === 'inativos' && p.active) return false
      if (!q) return true
      const alvo = `${p.code || ''} ${p.description || ''} ${p.group_description || ''}`
      return alvo.toLowerCase().includes(q)
    })
    const dir = catSortDir === 'asc' ? 1 : -1
    lista.sort((a, b) => {
      if (catSortField === 'price') return (Number(a.price || 0) - Number(b.price || 0)) * dir
      return (
        String(a[catSortField] || '').localeCompare(String(b[catSortField] || ''), 'pt-BR') * dir
      )
    })
    return lista
  }, [produtos, catBusca, catSomenteAtivos, catSortField, catSortDir])

  // Curva ABC computada a partir dos filtros
  const curva = useMemo(
    () =>
      computeCurvaAbc(dispensacoes, produtos, {
        dataInicio: abcInicio,
        dataFim: abcFim,
        grupo: abcGrupo,
        busca: abcBusca,
      }),
    [dispensacoes, produtos, abcInicio, abcFim, abcGrupo, abcBusca],
  )

  const curvaOrdenada = useMemo(() => {
    const lista = [...curva.itens]
    const dir = abcSortDir === 'asc' ? 1 : -1
    lista.sort((a, b) => {
      if (abcSortField === 'posicao') return (a.posicao - b.posicao) * dir
      if (abcSortField === 'quantidade') return (a.quantidade - b.quantidade) * dir
      if (abcSortField === 'valorTotal') return (a.valorTotal - b.valorTotal) * dir
      return a.descricao.localeCompare(b.descricao, 'pt-BR') * dir
    })
    return lista
  }, [curva.itens, abcSortField, abcSortDir])

  const toggleAbcSort = (field: AbcSortField) => {
    if (abcSortField === field) {
      setAbcSortDir(abcSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setAbcSortField(field)
      setAbcSortDir(field === 'descricao' ? 'asc' : 'desc')
    }
  }

  const toggleCatSort = (field: CatSortField) => {
    if (catSortField === field) {
      setCatSortDir(catSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setCatSortField(field)
      setCatSortDir('asc')
    }
  }

  const loadData = useCallback(async () => {
    if (!canAccess) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [prods, disps, status] = await Promise.all([
        getSpincareProdutos(),
        getSpincareDispensacoes(),
        getProductsSyncStatus().catch(() => null),
      ])
      setProdutos(prods)
      setDispensacoes(disps)
      setSyncStatus(status)
    } catch (err: unknown) {
      console.error('Erro ao carregar produtos/dispensações:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: getErrorMessage(err) || 'Não foi possível carregar os produtos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [canAccess])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSync = async () => {
    try {
      setSyncing(true)
      toast({
        title: 'Sincronização iniciada',
        description: 'Buscando catálogo de produtos e dispensações no SpinCare...',
      })
      const res = await triggerProductsSync()
      if (res.alreadyRunning) {
        toast({
          title: 'Já em andamento',
          description: 'Uma sincronização de produtos já está em execução. Aguarde.',
        })
      } else {
        toast({
          title: 'Sincronização concluída',
          description:
            `${res.produtos.created + res.produtos.updated} produto(s) e ` +
            `${res.dispensacoes.created + res.dispensacoes.updated} dispensação(ões) sincronizado(s).`,
        })
      }
      await loadData()
    } catch (err: unknown) {
      console.error('Erro ao sincronizar produtos:', err)
      toast({
        title: 'Erro na sincronização',
        description: getErrorMessage(err) || 'Falha ao sincronizar com o SpinCare.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  // Exportação XLSX com abas Catálogo, Curva ABC e Resumo
  const handleExportXlsx = () => {
    if (aba === 'catalogo' && catalogoFiltrado.length === 0) {
      toast({
        title: 'Nenhum produto para exportar',
        description: 'Ajuste os filtros da aba Catálogo.',
        variant: 'destructive',
      })
      return
    }
    if (aba === 'curva' && curva.itens.length === 0) {
      toast({
        title: 'Nenhum movimento para exportar',
        description: 'Ajuste os filtros da aba Curva ABC.',
        variant: 'destructive',
      })
      return
    }

    try {
      setExporting(true)
      const workbook = XLSX.utils.book_new()

      if (aba === 'catalogo') {
        const rows = catalogoFiltrado.map((p) => ({
          Código: p.code || '',
          Descrição: p.description || '',
          Grupo: p.group_description || '',
          Tipo: p.type_description || '',
          Unidade: p.measure_unit || '',
          'Preço (R$)': Number(Number(p.price || 0).toFixed(2)),
          Ativo: p.active ? 'Sim' : 'Não',
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        ws['!cols'] = [
          { wch: 14 },
          { wch: 44 },
          { wch: 24 },
          { wch: 20 },
          { wch: 10 },
          { wch: 14 },
          { wch: 8 },
        ]
        XLSX.utils.book_append_sheet(workbook, ws, 'Catálogo')
      } else {
        const rows = curvaOrdenada.map((i) => ({
          Posição: i.posicao,
          Código: i.codigo,
          Produto: i.descricao,
          Grupo: i.grupo,
          Quantidade: i.quantidade,
          'Valor Total (R$)': Number(i.valorTotal.toFixed(2)),
          '% do Total': Number(i.percentual.toFixed(1)),
          '% Acumulado': Number(i.percentualAcumulado.toFixed(1)),
          Classe: i.classe,
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        ws['!cols'] = [
          { wch: 9 },
          { wch: 14 },
          { wch: 44 },
          { wch: 24 },
          { wch: 12 },
          { wch: 16 },
          { wch: 11 },
          { wch: 12 },
          { wch: 9 },
        ]
        XLSX.utils.book_append_sheet(workbook, ws, 'Curva ABC')

        const resumoRows = curva.resumo.map((r) => ({
          Classe: r.rotulo,
          'Nº de Itens': r.quantidadeItens,
          'Valor Total (R$)': Number(r.valorTotal.toFixed(2)),
          '% do Movimento': r.percentual,
        }))
        const wsRes = XLSX.utils.json_to_sheet(resumoRows)
        wsRes['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 16 }, { wch: 15 }]
        XLSX.utils.book_append_sheet(workbook, wsRes, 'Resumo')
      }

      const fileName = `produtos-helpvida-${aba}-${HOJE}.xlsx`
      XLSX.writeFile(workbook, fileName)

      toast({
        title: 'Planilha exportada com sucesso',
        description: 'Arquivo Excel .xlsx gerado conforme a aba ativa e os filtros aplicados.',
      })
    } catch (err: unknown) {
      console.error('Erro ao exportar planilha XLSX:', err)
      toast({
        title: 'Erro na exportação',
        description: getErrorMessage(err) || 'Falha ao gerar o arquivo Excel.',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  // Bloqueio de acesso para perfis não autorizados
  if (!canAccess) {
    return (
      <div className="p-4 sm:p-8 max-w-2xl mx-auto my-12">
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm text-center p-6 sm:p-8 rounded-2xl">
          <div className="h-16 w-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-xl font-bold text-amber-950">Acesso Restrito</CardTitle>
          <CardDescription className="text-amber-900/80 mt-2 text-sm leading-relaxed">
            Esta página exibe o catálogo de produtos do SpinCare e a Curva ABC de dispensações. O
            acesso é exclusivo para usuários com perfil{' '}
            <strong className="text-amber-950">Financeiro</strong>,{' '}
            <strong className="text-amber-950">Dispensário</strong> ou{' '}
            <strong className="text-amber-950">Administrador</strong>.
          </CardDescription>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Pill className="text-[#0D8272]" size={24} />
            Produtos SpinCare
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Catálogo de produtos e Curva ABC de dispensações ({formatIsoToBr(abcInicio)} a{' '}
            {formatIsoToBr(abcFim)}).
          </p>
          <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
            <AlertCircle size={13} />
            Itens de dispensação não trazem valor monetário: o valor da Curva ABC é quantidade
            dispensada × preço do produto.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex items-center gap-2">
            {syncStatus?.isRunning && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-300 gap-1">
                <Clock size={12} /> sincronizando…
              </Badge>
            )}
            <Button
              onClick={handleSync}
              disabled={syncing || syncStatus?.isRunning}
              className="bg-[#0D8272] hover:bg-[#0C6B5E] text-white"
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin mr-2' : 'mr-2'} />
              {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Última sincronização:{' '}
            {syncStatus?.lastSyncedAt
              ? formatDateTimeIso(syncStatus.lastSyncedAt)
              : 'nunca sincronizado'}
            {syncStatus ? ` · ${syncStatus.totalProdutos} produto(s)` : ''}
          </p>
        </div>
      </div>

      {/* Abas */}
      <Tabs value={aba} onValueChange={(v) => setAba(v as 'catalogo' | 'curva')}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList>
            <TabsTrigger value="catalogo" className="gap-1.5">
              <Table2 size={15} /> Catálogo
            </TabsTrigger>
            <TabsTrigger value="curva" className="gap-1.5">
              <BarChart3 size={15} /> Curva ABC
            </TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            onClick={handleExportXlsx}
            disabled={exporting}
            className="text-[#0D8272] border-[#0D8272]/40 hover:bg-emerald-50"
          >
            <Download size={15} className="mr-2" />
            {exporting ? 'Exportando…' : 'Exportar XLSX'}
          </Button>
        </div>

        {/* ===================== ABA CATÁLOGO ===================== */}
        <TabsContent value="catalogo" className="mt-4 space-y-4">
          <Card className="border-slate-200 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search size={16} className="text-[#0D8272]" /> Filtros do Catálogo
              </CardTitle>
              <CardDescription>
                Busca por código, descrição ou grupo · filtro por status de ativo.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  placeholder="Buscar código, descrição ou grupo…"
                  value={catBusca}
                  onChange={(e) => setCatBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={catSomenteAtivos} onValueChange={setCatSomenteAtivos}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="ativos">Somente ativos</SelectItem>
                  <SelectItem value="inativos">Somente inativos</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500 flex items-center">
                {catalogoFiltrado.length} produto(s) de {produtos.length} no catálogo
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {(
                        [
                          ['code', 'Código'],
                          ['description', 'Descrição'],
                          ['group_description', 'Grupo'],
                          ['type_description', 'Tipo'],
                          ['measure_unit', 'Unidade'],
                          ['price', 'Preço'],
                        ] as [CatSortField, string][]
                      ).map(([field, label]) => (
                        <th
                          key={field}
                          onClick={() => toggleCatSort(field)}
                          className="px-3 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:text-[#0D8272] whitespace-nowrap"
                        >
                          {label}
                          {catSortField === field && (catSortDir === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Ativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                          Carregando…
                        </td>
                      </tr>
                    ) : catalogoFiltrado.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                          Nenhum produto encontrado. Clique em “Sincronizar agora” para importar o
                          catálogo do SpinCare.
                        </td>
                      </tr>
                    ) : (
                      catalogoFiltrado.slice(0, 300).map((p) => (
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-emerald-50/40">
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">
                            {p.code || '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-800">{p.description || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{p.group_description || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{p.type_description || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{p.measure_unit || '—'}</td>
                          <td className="px-3 py-2 text-slate-800 font-medium">
                            {formatCurrency(Number(p.price || 0))}
                          </td>
                          <td className="px-3 py-2">
                            {p.active ? (
                              <Badge className="bg-green-100 text-green-800 border-green-300">
                                Ativo
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-500 border-gray-300">
                                Inativo
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {catalogoFiltrado.length > 300 && (
                <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">
                  Exibindo os primeiros 300 de {catalogoFiltrado.length} produtos. Refine a busca
                  para ver mais.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== ABA CURVA ABC ===================== */}
        <TabsContent value="curva" className="mt-4 space-y-4">
          <Card className="border-slate-200 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter size={16} className="text-[#0D8272]" /> Filtros da Curva ABC
              </CardTitle>
              <CardDescription>
                Período de entrega, grupo e busca no catálogo sincronizado.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  <Calendar size={12} className="inline mr-1" /> Data inicial
                </label>
                <Input
                  type="date"
                  value={abcInicio}
                  onChange={(e) => setAbcInicio(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  <Calendar size={12} className="inline mr-1" /> Data final
                </label>
                <Input type="date" value={abcFim} onChange={(e) => setAbcFim(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Grupo</label>
                <Select value={abcGrupo} onValueChange={setAbcGrupo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os grupos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os grupos</SelectItem>
                    {grupos.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Busca</label>
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    placeholder="Código, descrição ou grupo…"
                    value={abcBusca}
                    onChange={(e) => setAbcBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cartões de resumo por classe */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {curva.resumo.map((r) => {
              const cfg =
                r.classe === 'A'
                  ? { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' }
                  : r.classe === 'B'
                    ? { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' }
                    : { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' }
              return (
                <Card key={r.classe} className={`${cfg.bg} border ${cfg.border} rounded-2xl`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${cfg.text}`}>{r.rotulo}</span>
                      <Badge variant="outline" className={cfg.text}>
                        {r.classe}
                      </Badge>
                    </div>
                    <p className={`text-2xl font-bold mt-2 ${cfg.text}`}>
                      {formatCurrency(r.valorTotal)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {r.quantidadeItens} item(ns) · {r.percentual.toFixed(1)}% do movimento
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th
                        onClick={() => toggleAbcSort('posicao')}
                        className="px-3 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:text-[#0D8272]"
                      >
                        #
                      </th>
                      <th
                        onClick={() => toggleAbcSort('descricao')}
                        className="px-3 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:text-[#0D8272] whitespace-nowrap"
                      >
                        Produto
                      </th>
                      <th
                        onClick={() => toggleAbcSort('quantidade')}
                        className="px-3 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:text-[#0D8272]"
                      >
                        Quantidade
                      </th>
                      <th
                        onClick={() => toggleAbcSort('valorTotal')}
                        className="px-3 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:text-[#0D8272]"
                      >
                        Valor Total
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600">
                        % do Total
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600">
                        % Acumulado
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Classe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                          Carregando…
                        </td>
                      </tr>
                    ) : curvaOrdenada.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                          Nenhum movimento no período selecionado. Sincronize dispensações ou ajuste
                          os filtros.
                        </td>
                      </tr>
                    ) : (
                      curvaOrdenada.map((i) => (
                        <tr
                          key={i.productId}
                          className="border-b border-slate-100 hover:bg-emerald-50/40"
                        >
                          <td className="px-3 py-2 text-slate-400 font-mono text-xs">
                            {i.posicao}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-slate-800 font-medium">{i.descricao}</span>
                            <span className="block text-xs text-slate-400 font-mono">
                              {i.codigo || '—'} · {i.grupo || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{i.quantidade}</td>
                          <td className="px-3 py-2 text-slate-800 font-medium">
                            {formatCurrency(i.valorTotal)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{i.percentual.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-slate-600">
                            {i.percentualAcumulado.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={CLASSE_BADGE[i.classe].className}>
                              {CLASSE_BADGE[i.classe].label}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {curva.itens.length > 0 && (
                <div className="px-3 py-2.5 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>
                    Valor total do período:{' '}
                    <strong className="text-slate-700">
                      {formatCurrency(curva.valorTotalGeral)}
                    </strong>
                  </span>
                  <span>
                    Quantidade dispensada:{' '}
                    <strong className="text-slate-700">{curva.quantidadeTotal}</strong>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
