import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import {
  DollarSign,
  Search,
  Calendar,
  User,
  FileText,
  Filter,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ChevronRight,
  Package,
  Clock,
  Sparkles,
  Settings,
} from 'lucide-react'
import { getSpincareBudgets, type SpincareBudget } from '@/services/spincare'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { SpincareTabsNav } from '@/components/SpincareTabsNav'

export default function Orcamentos() {
  const { user, isAdmin, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Aprovado')

  const [loading, setLoading] = useState(false)
  const [allLoadedBudgets, setAllLoadedBudgets] = useState<SpincareBudget[]>([])
  const [budgets, setBudgets] = useState<SpincareBudget[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unconfigured, setUnconfigured] = useState(false)

  // Paginação progressiva na exibição de orçamentos
  const [displayLimit, setDisplayLimit] = useState(50)

  // Modal detalhe do orçamento
  const [selectedBudget, setSelectedBudget] = useState<SpincareBudget | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  // Debounce para digitação na busca (evita travamento e re-fetch a cada tecla)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  const handleFetchBudgets = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)
    setUnconfigured(false)
    setDisplayLimit(50)
    try {
      // Busca todo o censo de orçamentos do período (sem passar search na API para armazenar o mapa completo)
      const res = await getSpincareBudgets({
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        status: statusFilter,
        fetchAll: true,
      })
      const items = res.items || []
      setAllLoadedBudgets(items)
      setBudgets(items)
      setTotalCount(res.total || items.length)
    } catch (err: unknown) {
      console.error('Erro ao consultar orçamentos no SpinCare:', err)
      const msg = getErrorMessage(err, 'Não foi possível consultar os orçamentos no SpinCare.')
      if (msg.includes('ainda não foi configurada') || msg.includes('503')) {
        setUnconfigured(true)
      } else {
        toast({
          title: 'Erro na consulta de orçamentos',
          description: msg,
          variant: 'destructive',
        })
      }
      setBudgets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isMedicoVisitador) {
      handleFetchBudgets()
    }
  }, [isMedicoVisitador])

  // Busca instantânea indexada sobre os orçamentos já carregados
  useEffect(() => {
    if (!allLoadedBudgets.length) return
    if (!debouncedSearch.trim()) {
      setBudgets(allLoadedBudgets)
      return
    }

    const norm = (s: string) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()

    const q = norm(debouncedSearch)
    const filtered = allLoadedBudgets.filter((b) => {
      const pNome = norm(b.pacienteNome)
      const num = norm(b.numero)
      const obs = norm(b.observacao)
      return pNome.includes(q) || num.includes(q) || obs.includes(q)
    })
    setBudgets(filtered)
    setDisplayLimit(50)
  }, [debouncedSearch, allLoadedBudgets])

  // Totalizador de valores
  const valorTotalAprovado = budgets.reduce((acc, b) => acc + (b.valor || 0), 0)

  // Totalizador de itens somados em todos os orçamentos
  const totalItensAprovados = budgets.reduce((acc, b) => acc + (b.itens ? b.itens.length : 0), 0)

  // Orçamentos visíveis na tela
  const visibleBudgets = budgets.slice(0, displayLimit)
  const hasMoreBudgets = displayLimit < budgets.length

  const handleLoadMore = () => {
    setDisplayLimit((prev) => prev + 50)
  }

  const handleShowAll = () => {
    setDisplayLimit(budgets.length)
  }

  // Bloqueio do médico visitador (abaixo dos hooks para cumprir rules-of-hooks)
  if (isMedicoVisitador) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito ao Perfil</h2>
        <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
          Em conformidade com a LGPD e as normas da Help Vida, o perfil{' '}
          <strong>Médico Visitador</strong> tem acesso exclusivo ao catálogo de medicamentos
          padronizados, não possuindo autorização para consultar orçamentos ou dados de pacientes.
        </p>
        <Button
          onClick={() => navigate('/medicamentos')}
          className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl"
        >
          Ir para Medicamentos
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* 1. NAVEGAÇÃO DE ABAS SPINCARE */}
      <SpincareTabsNav />

      {/* 2. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-[#0D8272]" />
              Orçamentos Aprovados — SpinCare
            </h2>
            <Badge className="bg-[#FEF8EC] text-[#92400E] border-[#F5B31C]/40 text-[10px] font-bold">
              &ge; 2026
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Leitura em tempo real dos orçamentos aprovados a partir de 2026 no sistema SpinCare.
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/configuracoes')}
            className="text-xs border-[#0D8272]/30 text-[#0C4336] hover:bg-[#E6F5F2] rounded-xl self-start sm:self-auto"
          >
            <Settings size={13} className="mr-1.5 text-[#0D8272]" />
            Configurar SpinCare
          </Button>
        )}
      </div>

      {/* 2. AVISO LGPD */}
      <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="h-4 w-4 text-[#0D8272] shrink-0" />
          <span>
            <strong>Trilha de Auditoria (LGPD):</strong> Consultas a orçamentos e pacientes são
            registradas no servidor com carimbo de data e identificação do profissional.
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">
          DPO: Fernando Fernandes
        </span>
      </div>

      {/* 3. FILTROS & PERÍODO */}
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardContent className="p-3.5 sm:p-5">
          <form onSubmit={handleFetchBudgets} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Data Inicial *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 sm:h-10 pl-9 text-base sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl font-mono min-h-[44px]"
                  />
                </div>
                <span className="text-[10px] text-emerald-800 font-semibold block">
                  Padrão: 01/01/2026
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Data Final (Opcional)</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-11 sm:h-10 pl-9 text-base sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl font-mono min-h-[44px]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Buscar por Paciente ou Nº
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    type="search"
                    placeholder="Nome do paciente ou protocolo..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 sm:h-10 pl-9 text-base sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272] min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 sm:pt-0 sm:items-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 sm:w-full h-11 sm:h-10 min-h-[44px] bg-[#0F5342] hover:bg-[#0C4336] active:bg-[#082921] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Consultando...
                    </>
                  ) : (
                    <>
                      <Filter className="h-4 w-4 text-[#F5B31C]" />
                      Filtrar Orçamentos
                    </>
                  )}
                </Button>

                {(search || endDate || startDate !== '2026-01-01') && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStartDate('2026-01-01')
                      setEndDate('')
                      setSearch('')
                    }}
                    className="h-11 sm:h-10 min-h-[44px] px-3.5 text-xs border-slate-200 rounded-xl"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 4. TOTALIZADORES & RESULTADOS */}
      {unconfigured ? (
        <Card className="border-amber-200 bg-amber-50/40 shadow-xs">
          <CardContent className="p-8 text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
              <Settings className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Integração SpinCare Não Configurada
            </h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              {isAdmin
                ? 'Configure a URL e o token de acesso à API SpinCare para habilitar a consulta em tempo real de orçamentos aprovados.'
                : 'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.'}
            </p>
            {isAdmin && (
              <Button
                onClick={() => navigate('/configuracoes')}
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl h-10 px-4"
              >
                Configurar Parâmetros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
            <p className="text-xs font-medium text-slate-600">
              Consultando orçamentos ao vivo no SpinCare...
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Filtrando período a partir de 2026</p>
          </CardContent>
        </Card>
      ) : budgets.length === 0 ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-12 text-center text-slate-400 space-y-2">
            <DollarSign className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">
              Nenhum orçamento aprovado encontrado
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Não constam orçamentos com aprovação a partir de {startDate} com os critérios
              selecionados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Card Resumo do Período */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total de Orçamentos
                </p>
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">{budgets.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center font-bold">
                <FileText size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Valor Total Aprovado
                </p>
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">
                  {valorTotalAprovado > 0
                    ? valorTotalAprovado.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })
                    : '—'}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                <DollarSign size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Itens Cadastrados
                </p>
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">{totalItensAprovados}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-[#F4FAF8] text-[#0D8272] flex items-center justify-center font-bold">
                <Package size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Período
                </p>
                <p className="text-xs font-semibold text-slate-800 mt-1">
                  A partir de {startDate.split('-').reverse().join('/')}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <Calendar size={18} />
              </div>
            </div>
          </div>

          {/* Lista de Orçamentos em Cards */}
          <div className="space-y-2.5">
            {visibleBudgets.map((b) => (
              <Card
                key={b.id}
                onClick={() => {
                  setSelectedBudget(b)
                  setDetailModalOpen(true)
                }}
                className="border-emerald-950/10 bg-white hover:border-[#0D8272]/50 hover:shadow-md transition-all cursor-pointer rounded-2xl group"
              >
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-[#0D8272] group-hover:text-white transition-colors">
                      <DollarSign size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          Orçamento #{b.numero}
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold">
                          {b.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-[#0C4336] truncate mt-0.5">
                        Paciente: {b.pacienteNome}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          Data: <strong className="text-slate-700">{b.dataAprovacao}</strong>
                        </span>
                        {b.itens && b.itens.length > 0 && (
                          <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-normal">
                            <Package size={10} className="mr-1 text-[#0D8272]" />
                            {b.itens.length} {b.itens.length === 1 ? 'item' : 'itens'}
                          </Badge>
                        )}
                        {b.observacao && b.observacao !== '—' && (
                          <span className="text-slate-400 truncate max-w-[200px]">
                            • {b.observacao}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Valor Aprovado
                      </span>
                      <span className="text-sm font-bold text-[#0C4336]">
                        {b.valor > 0
                          ? b.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '—'}
                      </span>
                    </div>

                    <div className="h-8 w-8 rounded-lg bg-slate-50 group-hover:bg-[#0D8272]/10 flex items-center justify-center text-slate-400 group-hover:text-[#0D8272] transition-colors">
                      <ChevronRight
                        size={16}
                        className="group-hover:translate-x-0.5 transition-transform"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Barra de carregamento progressivo de orçamentos */}
          {hasMoreBudgets && (
            <div className="p-4 rounded-2xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 text-center sm:text-left">
                Mostrando <strong>{visibleBudgets.length}</strong> de{' '}
                <strong>{budgets.length}</strong> orçamentos aprovados
              </span>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={handleLoadMore}
                  className="bg-[#0F5342] hover:bg-[#0C4336] active:bg-[#082921] text-white text-xs font-bold rounded-xl h-11 sm:h-9 min-h-[44px] sm:min-h-0 px-4 flex-1 sm:flex-initial"
                >
                  Carregar Mais 50
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleShowAll}
                  className="text-xs border-emerald-950/15 rounded-xl h-11 sm:h-9 min-h-[44px] sm:min-h-0 px-4 shrink-0"
                >
                  Exibir Todos ({budgets.length})
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. MODAL DETALHE DO ORÇAMENTO */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-lg w-[96vw] sm:w-full p-3 sm:p-6 rounded-2xl bg-white max-h-[94vh] sm:max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-emerald-950/10 shrink-0 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pr-1">
                <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2 truncate">
                  <DollarSign className="h-5 w-5 text-[#0D8272] shrink-0" />
                  <span>Orçamento #{selectedBudget?.numero}</span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-slate-500 pt-0.5 truncate">
                  Detalhes do orçamento aprovado no sistema SpinCare
                </DialogDescription>
              </div>
              <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold shrink-0">
                {selectedBudget?.status || 'Aprovado'}
              </Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2 space-y-4 py-3">
            <div className="p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">
                  Paciente Vinculado:
                </span>
                <span className="font-bold text-slate-800 text-sm">
                  {selectedBudget?.pacienteNome || '—'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-950/10">
                <div>
                  <span className="text-slate-400 block text-[10px]">Data de Aprovação:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedBudget?.dataAprovacao || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Valor Total Aprovado:</span>
                  <span className="font-bold text-emerald-800 text-sm">
                    {selectedBudget && selectedBudget.valor > 0
                      ? selectedBudget.valor.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            {selectedBudget?.observacao && selectedBudget.observacao !== '—' && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Observações / Parecer do Orçamento:
                </span>
                <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200 italic">
                  "{selectedBudget.observacao}"
                </p>
              </div>
            )}

            {selectedBudget?.itens && selectedBudget.itens.length > 0 ? (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Lista Completa de Itens & Insumos ({selectedBudget.itens.length}):
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Soma dos itens:{' '}
                    <strong className="text-emerald-800 font-mono">
                      {selectedBudget.itens
                        .reduce((acc, i) => acc + (i.valorTotal || 0), 0)
                        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                  </span>
                </div>
                <div className="space-y-2">
                  {selectedBudget.itens.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-emerald-950/10 bg-white hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 pr-2 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-md bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">
                            {idx + 1}
                          </span>
                          <p className="font-bold text-slate-900 leading-snug">{it.descricao}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-7 text-[11px] text-slate-500">
                          {it.codigo && (
                            <span className="font-mono text-slate-400">Cód: {it.codigo}</span>
                          )}
                          <span className="font-mono">
                            Qtd: <strong>{it.quantidade}</strong> {it.unidade || ''}
                          </span>
                          {it.valorUnitario > 0 && (
                            <span className="text-slate-400">
                              • Unit:{' '}
                              {it.valorUnitario.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-7 sm:pl-0">
                        <span className="text-[10px] uppercase text-slate-400 block font-bold">
                          Subtotal
                        </span>
                        <span className="text-sm font-bold text-[#0C4336] font-mono">
                          {it.valorTotal > 0
                            ? it.valorTotal.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })
                            : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 space-y-1">
                <Package className="h-6 w-6 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">
                  Nenhum item discriminado no orçamento
                </p>
                <p className="text-[11px] text-slate-400">
                  O orçamento consta apenas com o valor consolidado na API SpinCare.
                </p>
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="pt-3 border-t border-emerald-950/10 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailModalOpen(false)}
              className="w-full sm:w-auto h-11 sm:h-9 min-h-[44px] sm:min-h-0 text-xs rounded-xl"
            >
              Fechar Detalhes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
