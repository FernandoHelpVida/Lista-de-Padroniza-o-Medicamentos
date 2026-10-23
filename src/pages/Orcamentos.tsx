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

export default function Orcamentos() {
  const { user, isAdmin, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Aprovado')

  const [loading, setLoading] = useState(false)
  const [budgets, setBudgets] = useState<SpincareBudget[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unconfigured, setUnconfigured] = useState(false)

  // Modal detalhe do orçamento
  const [selectedBudget, setSelectedBudget] = useState<SpincareBudget | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const handleFetchBudgets = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)
    setUnconfigured(false)
    try {
      const res = await getSpincareBudgets({
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        search: search.trim(),
        status: statusFilter,
        limit: 100,
      })
      setBudgets(res.items || [])
      setTotalCount(res.total || 0)
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

  // Totalizador de valores
  const valorTotalAprovado = budgets.reduce((acc, b) => acc + (b.valor || 0), 0)

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
      {/* 1. CABEÇALHO */}
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
                    className="h-10 pl-9 text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl font-mono"
                  />
                </div>
                <span className="text-[10px] text-emerald-800 font-semibold">
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
                    className="h-10 pl-9 text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl font-mono"
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
                    className="h-10 pl-9 text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
                  />
                </div>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Consultando...
                    </>
                  ) : (
                    <>
                      <Filter className="h-3.5 w-3.5 text-[#F5B31C]" />
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
                    className="h-10 text-xs border-slate-200 rounded-xl"
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  Período de Análise
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
            {budgets.map((b) => (
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
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar size={11} />
                        Data de Aprovação:{' '}
                        <strong className="text-slate-600">{b.dataAprovacao}</strong>
                      </p>
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
        </div>
      )}

      {/* 5. MODAL DETALHE DO ORÇAMENTO */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-lg w-[94vw] sm:w-full p-4 sm:p-6 rounded-2xl bg-white max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-emerald-950/10 shrink-0 text-left">
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#0D8272]" />
                  Orçamento #{selectedBudget?.numero}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 pt-0.5">
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

            {selectedBudget?.itens && selectedBudget.itens.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Itens & Medicamentos do Orçamento ({selectedBudget.itens.length}):
                </span>
                <div className="space-y-1.5">
                  {selectedBudget.itens.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-slate-800 truncate">{it.descricao}</p>
                        <p className="text-[10px] text-slate-400 font-mono">Qtd: {it.quantidade}</p>
                      </div>
                      {it.valorTotal > 0 && (
                        <span className="text-xs font-bold text-emerald-800 shrink-0">
                          {it.valorTotal.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="pt-3 border-t border-emerald-950/10 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailModalOpen(false)}
              className="w-full sm:w-auto h-9 text-xs rounded-xl"
            >
              Fechar Detalhes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
