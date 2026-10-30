import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign,
  FileSpreadsheet,
  Calendar,
  Filter,
  Search,
  RefreshCw,
  Building2,
  Layers,
  ArrowUpDown,
  Download,
  AlertCircle,
  ShieldAlert,
  Users,
  CheckCircle2,
  X,
  PieChart as PieChartIcon,
  BarChart3,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { OrcamentoSyncRecord } from '@/services/spincare'
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
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { parseDateToComparable, formatIsoToBr } from '@/lib/dateUtils'

const STATUS_APROVADO_COM_AUTORIZACAO = 'Aprovado com autorização'

const CHART_COLORS = [
  '#0D8272', // Verde principal
  '#0F5342', // Verde escuro
  '#16A34A', // Esmeralda vibrante
  '#2563EB', // Azul royal
  '#0284C7', // Azul ciano
  '#D97706', // Âmbar
  '#7C3AED', // Roxo
  '#DC2626', // Vermelho suave
  '#475569', // Ardósia
  '#14B8A6', // Teal
]

// Função auxiliar de normalização de strings (tolerante a caixa, acentos e espaços)
function normalize(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function formatCurrency(val: number): string {
  return val.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatCompactCurrency(val: number): string {
  if (val >= 1_000_000) {
    return `R$ ${(val / 1_000_000).toFixed(1)}M`
  }
  if (val >= 1_000) {
    return `R$ ${(val / 1_000).toFixed(1)}k`
  }
  return `R$ ${val.toFixed(0)}`
}

// Extrai modalidade do orçamento com fallback em múltiplos campos do payload
function getOrcamentoModalidade(b: OrcamentoSyncRecord): string {
  const p = (b.payload as Record<string, unknown>) || {}
  const rawMod =
    (b as unknown as { modalidade?: string }).modalidade ||
    p.modalidade ||
    p.modality ||
    p.attendance_type ||
    p.attendance_regime ||
    p.regime ||
    p.tipo_atendimento ||
    p.plano ||
    p.insurance_plan_name
  if (rawMod && typeof rawMod === 'string' && rawMod.trim() && rawMod.trim() !== '—') {
    return rawMod.trim()
  }
  return 'Não informada'
}

function getOrcamentoConvenio(b: OrcamentoSyncRecord): string {
  const rawC =
    b.convenio || ((b.payload as Record<string, unknown>)?.insurance_name as string) || ''
  const trimmed = rawC.trim()
  return trimmed && trimmed !== '—' ? trimmed : 'Não informado'
}

export default function RelatorioOrcamentos() {
  const navigate = useNavigate()
  const { isAdmin, isFinanceiro } = useAuth()
  const canAccess = isAdmin || isFinanceiro

  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [allBudgets, setAllBudgets] = useState<OrcamentoSyncRecord[]>([])

  // Filtros em rascunho (controlam os inputs do formulário de filtros)
  const defaultStartDate = '2026-01-01'
  const defaultEndDate = new Date().toISOString().slice(0, 10)

  const [draftStartDate, setDraftStartDate] = useState<string>(defaultStartDate)
  const [draftEndDate, setDraftEndDate] = useState<string>(defaultEndDate)
  const [draftConvenio, setDraftConvenio] = useState<string>('todos')
  const [draftModalidade, setDraftModalidade] = useState<string>('todas')
  const [draftPatientQuery, setDraftPatientQuery] = useState<string>('')

  // Filtros aplicados efetivos (alimentam consultas, resumos, totais e listagem)
  const [appliedFilters, setAppliedFilters] = useState<{
    startDate: string
    endDate: string
    convenio: string
    modalidade: string
    patientQuery: string
  }>({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    convenio: 'todos',
    modalidade: 'todas',
    patientQuery: '',
  })

  // Ordenação da tabela
  const [sortField, setSortField] = useState<
    'data' | 'paciente' | 'convenio' | 'modalidade' | 'valor'
  >('data')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Carregar todos os orçamentos aprovados com autorização
  const loadData = useCallback(async () => {
    if (!canAccess) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const records = await pb.collection('orcamentos_sync').getFullList<OrcamentoSyncRecord>({
        filter: `status = "${STATUS_APROVADO_COM_AUTORIZACAO}"`,
        sort: '-data_aprovacao_iso,-created',
        requestKey: null,
      })
      setAllBudgets(records)
    } catch (err: unknown) {
      console.error('Erro ao buscar orçamentos para o relatório:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: getErrorMessage(err) || 'Não foi possível carregar os orçamentos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [canAccess])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Lista única de convênios a partir dos dados aprovados
  const distinctConvenios = useMemo(() => {
    const set = new Set<string>()
    allBudgets.forEach((b) => {
      const conv = getOrcamentoConvenio(b)
      if (conv) set.add(conv)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allBudgets])

  // Lista única de modalidades a partir dos dados aprovados
  const distinctModalidades = useMemo(() => {
    const set = new Set<string>()
    allBudgets.forEach((b) => {
      const mod = getOrcamentoModalidade(b)
      if (mod) set.add(mod)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allBudgets])

  // Orçamentos filtrados (baseados exclusivamente nos filtros aplicados ao clicar em Pesquisar)
  const filteredBudgets = useMemo(() => {
    const {
      startDate,
      endDate,
      convenio: selectedConvenio,
      modalidade: selectedModalidade,
      patientQuery,
    } = appliedFilters

    const startComp = startDate ? parseDateToComparable(startDate) : null
    const endComp = endDate ? parseDateToComparable(endDate) : null
    const targetConvNorm =
      selectedConvenio && selectedConvenio !== 'todos' ? normalize(selectedConvenio) : ''
    const targetModNorm =
      selectedModalidade && selectedModalidade !== 'todas' ? normalize(selectedModalidade) : ''
    const targetPatientNorm = patientQuery.trim() ? normalize(patientQuery) : ''

    return allBudgets.filter((b) => {
      // 1. Período: compara data_aprovacao_iso/data_aprovacao com o intervalo no fuso America/Sao_Paulo
      if (startComp !== null || endComp !== null) {
        const bDateAprov =
          parseDateToComparable(b.data_aprovacao_iso) ||
          parseDateToComparable(b.data_aprovacao) ||
          parseDateToComparable(b.data_inicial_iso)
        const bDateEnd =
          parseDateToComparable(b.data_final_iso) || parseDateToComparable(b.data_final)

        let inPeriod = false
        if (bDateAprov !== null) {
          const afterOrAtStart = startComp === null || bDateAprov >= startComp
          const beforeOrAtEnd = endComp === null || bDateAprov <= endComp
          inPeriod = afterOrAtStart && beforeOrAtEnd
        } else if (bDateEnd !== null) {
          const endAfterOrAtStart = startComp === null || bDateEnd >= startComp
          const endBeforeOrAtEnd = endComp === null || bDateEnd <= endComp
          inPeriod = endAfterOrAtStart && endBeforeOrAtEnd
        }

        if (!inPeriod) return false
      }

      // 2. Convênio (tolerante a acentos e caixa)
      if (targetConvNorm) {
        const conv = normalize(getOrcamentoConvenio(b))
        if (!conv.includes(targetConvNorm) && !targetConvNorm.includes(conv)) {
          return false
        }
      }

      // 3. Modalidade (tolerante a acentos e caixa)
      if (targetModNorm) {
        const mod = normalize(getOrcamentoModalidade(b))
        if (!mod.includes(targetModNorm) && !targetModNorm.includes(mod)) {
          return false
        }
      }

      // 4. Paciente (tolerante a acentos e caixa)
      if (targetPatientNorm) {
        const pNome = normalize(b.paciente_nome || '')
        if (!pNome.includes(targetPatientNorm)) {
          return false
        }
      }

      return true
    })
  }, [allBudgets, appliedFilters])

  // Total geral e contagem dos orçamentos filtrados (usando SOMENTE valor_total de cada orçamento)
  const totalGeralFiltrado = useMemo(() => {
    return filteredBudgets.reduce((acc, b) => acc + (Number(b.valor_total) || 0), 0)
  }, [filteredBudgets])

  const totalCount = filteredBudgets.length
  const valorMedio = totalCount > 0 ? totalGeralFiltrado / totalCount : 0

  // Resumo por Convênio (soma dos valores totais + contagem)
  const resumoPorConvenio = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    filteredBudgets.forEach((b) => {
      const conv = getOrcamentoConvenio(b)
      const cur = map.get(conv) || { count: 0, total: 0 }
      cur.count += 1
      cur.total += Number(b.valor_total) || 0
      map.set(conv, cur)
    })
    return Array.from(map.entries())
      .map(([nome, dados]) => ({
        nome,
        count: dados.count,
        total: dados.total,
        percentual: totalGeralFiltrado > 0 ? (dados.total / totalGeralFiltrado) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [filteredBudgets, totalGeralFiltrado])

  // Resumo por Modalidade (soma dos valores totais + contagem)
  const resumoPorModalidade = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    filteredBudgets.forEach((b) => {
      const mod = getOrcamentoModalidade(b)
      const cur = map.get(mod) || { count: 0, total: 0 }
      cur.count += 1
      cur.total += Number(b.valor_total) || 0
      map.set(mod, cur)
    })
    return Array.from(map.entries())
      .map(([nome, dados]) => ({
        nome,
        count: dados.count,
        total: dados.total,
        percentual: totalGeralFiltrado > 0 ? (dados.total / totalGeralFiltrado) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [filteredBudgets, totalGeralFiltrado])

  // Evolução Mensal / Total por Mês dentro do período filtrado
  const resumoPorMes = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    const monthNames: Record<string, string> = {
      '01': 'Jan',
      '02': 'Fev',
      '03': 'Mar',
      '04': 'Abr',
      '05': 'Mai',
      '06': 'Jun',
      '07': 'Jul',
      '08': 'Ago',
      '09': 'Set',
      '10': 'Out',
      '11': 'Nov',
      '12': 'Dez',
    }

    filteredBudgets.forEach((b) => {
      const comp =
        parseDateToComparable(b.data_aprovacao_iso) ||
        parseDateToComparable(b.data_aprovacao) ||
        parseDateToComparable(b.data_inicial_iso)
      if (!comp) return
      const s = String(comp)
      if (s.length !== 8) return
      const ano = s.substring(0, 4)
      const mes = s.substring(4, 6)
      const key = `${ano}-${mes}`
      const cur = map.get(key) || { total: 0, count: 0 }
      cur.total += Number(b.valor_total) || 0
      cur.count += 1
      map.set(key, cur)
    })

    const sortedKeys = Array.from(map.keys()).sort()
    return sortedKeys.map((key) => {
      const [ano, mes] = key.split('-')
      const label = `${monthNames[mes] || mes}/${ano.substring(2)}`
      const data = map.get(key)!
      return {
        key,
        mes: label,
        total: data.total,
        count: data.count,
      }
    })
  }, [filteredBudgets])

  // Orçamentos ordenados para exibição na lista simples
  const sortedBudgets = useMemo(() => {
    return [...filteredBudgets].sort((a, b) => {
      let comparison = 0
      if (sortField === 'valor') {
        comparison = (Number(a.valor_total) || 0) - (Number(b.valor_total) || 0)
      } else if (sortField === 'paciente') {
        comparison = (a.paciente_nome || '').localeCompare(b.paciente_nome || '', 'pt-BR')
      } else if (sortField === 'convenio') {
        comparison = getOrcamentoConvenio(a).localeCompare(getOrcamentoConvenio(b), 'pt-BR')
      } else if (sortField === 'modalidade') {
        comparison = getOrcamentoModalidade(a).localeCompare(getOrcamentoModalidade(b), 'pt-BR')
      } else {
        // data
        const dateA =
          parseDateToComparable(a.data_aprovacao_iso) ||
          parseDateToComparable(a.data_aprovacao) ||
          0
        const dateB =
          parseDateToComparable(b.data_aprovacao_iso) ||
          parseDateToComparable(b.data_aprovacao) ||
          0
        comparison = dateA - dateB
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredBudgets, sortField, sortDirection])

  const toggleSort = (field: 'data' | 'paciente' | 'convenio' | 'modalidade' | 'valor') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Aplica os filtros em rascunho
  const handleApplyFilters = () => {
    setAppliedFilters({
      startDate: draftStartDate,
      endDate: draftEndDate,
      convenio: draftConvenio,
      modalidade: draftModalidade,
      patientQuery: draftPatientQuery,
    })
  }

  // Limpa tanto o rascunho quanto os filtros aplicados
  const handleClearFilters = () => {
    setDraftStartDate(defaultStartDate)
    setDraftEndDate(defaultEndDate)
    setDraftConvenio('todos')
    setDraftModalidade('todas')
    setDraftPatientQuery('')

    setAppliedFilters({
      startDate: defaultStartDate,
      endDate: defaultEndDate,
      convenio: 'todos',
      modalidade: 'todas',
      patientQuery: '',
    })
  }

  const hasActiveAppliedFilters =
    appliedFilters.startDate !== defaultStartDate ||
    appliedFilters.endDate !== defaultEndDate ||
    appliedFilters.convenio !== 'todos' ||
    appliedFilters.modalidade !== 'todas' ||
    Boolean(appliedFilters.patientQuery.trim())

  const hasPendingChanges =
    draftStartDate !== appliedFilters.startDate ||
    draftEndDate !== appliedFilters.endDate ||
    draftConvenio !== appliedFilters.convenio ||
    draftModalidade !== appliedFilters.modalidade ||
    draftPatientQuery !== appliedFilters.patientQuery

  // Exportação para Excel .xlsx com SheetJS
  const handleExportXlsx = async () => {
    if (filteredBudgets.length === 0) {
      toast({
        title: 'Nenhum orçamento para exportar',
        description: 'Ajuste os filtros para exibir ao menos um orçamento.',
        variant: 'destructive',
      })
      return
    }

    try {
      setExporting(true)

      // Monta dados no formato exato solicitado: número, paciente, data, convênio, modalidade, valor total
      const rows = filteredBudgets.map((b) => ({
        Número: b.numero || '—',
        Paciente: b.paciente_nome || '—',
        'Data Aprovação': b.data_aprovacao_iso
          ? formatIsoToBr(b.data_aprovacao_iso)
          : b.data_aprovacao || '—',
        Convênio: getOrcamentoConvenio(b),
        Modalidade: getOrcamentoModalidade(b),
        'Valor Total (R$)': Number(Number(b.valor_total || 0).toFixed(2)),
      }))

      // Criar worksheet com largura das colunas ajustada
      const worksheet = XLSX.utils.json_to_sheet(rows)
      worksheet['!cols'] = [
        { wch: 14 }, // Número
        { wch: 38 }, // Paciente
        { wch: 16 }, // Data Aprovação
        { wch: 22 }, // Convênio
        { wch: 22 }, // Modalidade
        { wch: 18 }, // Valor Total
      ]

      // Criar pasta de trabalho e anexar aba
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Orçamentos Filtrados')

      // Criar também aba de Resumo Financeiro
      const resumoConvRows = resumoPorConvenio.map((c) => ({
        Convênio: c.nome,
        Orçamentos: c.count,
        'Soma Total (R$)': Number(c.total.toFixed(2)),
        'Participação (%)': Number(c.percentual.toFixed(1)),
      }))
      const wsConv = XLSX.utils.json_to_sheet(resumoConvRows)
      wsConv['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(workbook, wsConv, 'Resumo Convênio')

      const resumoModRows = resumoPorModalidade.map((m) => ({
        Modalidade: m.nome,
        Orçamentos: m.count,
        'Soma Total (R$)': Number(m.total.toFixed(2)),
        'Participação (%)': Number(m.percentual.toFixed(1)),
      }))
      const wsMod = XLSX.utils.json_to_sheet(resumoModRows)
      wsMod['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(workbook, wsMod, 'Resumo Modalidade')

      const fileName = `relatorio-orcamentos-helpvida-${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(workbook, fileName)

      toast({
        title: 'Planilha exportada com sucesso',
        description: `${filteredBudgets.length} orçamento(s) exportado(s) em arquivo Excel .xlsx.`,
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
          <CardTitle className="text-xl font-bold text-amber-950">
            Acesso Restrito ao Financeiro
          </CardTitle>
          <CardDescription className="text-amber-900/80 mt-2 text-sm leading-relaxed">
            Esta página consolida dados de amostragem de gastos e faturamento de orçamentos
            institucionais. O acesso é exclusivo para usuários com perfil{' '}
            <strong className="text-amber-950">Financeiro</strong> ou{' '}
            <strong className="text-amber-950">Administrador</strong>.
          </CardDescription>
          <div className="mt-6 flex justify-center">
            <Button
              onClick={() => navigate('/')}
              className="bg-[#0F5342] hover:bg-[#0C4336] text-white rounded-xl px-6"
            >
              Voltar ao Início
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-emerald-950/10 shadow-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-[#0D8272]" />
              Relatório Financeiro de Orçamentos
            </h2>
            <Badge className="bg-[#E6F5F2] text-[#0C4336] border-[#0D8272]/30 text-[10px] font-bold">
              {STATUS_APROVADO_COM_AUTORIZACAO}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Amostragem consolidada dos valores totais de orçamentos aprovados com autorização, com
            agrupamentos por convênio e modalidade.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs border-emerald-300 text-[#0C4336] hover:bg-[#E6F5F2] font-semibold rounded-xl h-10 px-3.5 flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar Dados</span>
          </Button>

          <Button
            size="sm"
            onClick={handleExportXlsx}
            disabled={loading || exporting || filteredBudgets.length === 0}
            className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl shadow-xs h-10 px-4 flex items-center gap-2"
          >
            <Download size={15} />
            <span>{exporting ? 'Gerando Planilha...' : 'Exportar Excel (.xlsx)'}</span>
          </Button>
        </div>
      </div>

      {/* 2. CARD DE FILTROS (PERÍODO, CONVÊNIO, MODALIDADE, PACIENTE) */}
      <Card className="border border-emerald-950/10 shadow-xs rounded-2xl bg-white overflow-hidden">
        <CardHeader className="bg-[#F4FAF8] border-b border-emerald-950/10 py-3.5 px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#0C4336] font-bold text-sm">
              <Filter className="h-4 w-4 text-[#0D8272]" />
              <span>Filtros do Relatório</span>
              {hasActiveAppliedFilters && (
                <Badge className="bg-[#0D8272] text-white text-[10px] font-bold px-1.5 py-0">
                  Filtros ativos
                </Badge>
              )}
              {hasPendingChanges && (
                <Badge
                  variant="outline"
                  className="text-[#0D8272] border-[#0D8272]/40 bg-emerald-50 text-[10px] font-semibold px-1.5 py-0"
                >
                  Alterações não aplicadas
                </Badge>
              )}
            </div>
            {hasActiveAppliedFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-8 text-xs text-slate-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1 rounded-lg"
              >
                <X size={13} />
                <span>Limpar filtros</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Data Inicial */}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar size={13} className="text-emerald-700" />
                Data Inicial:
              </label>
              <Input
                type="date"
                value={draftStartDate}
                onChange={(e) => setDraftStartDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyFilters()
                }}
                className="h-9 text-xs rounded-xl border-emerald-900/15 focus-visible:ring-[#0D8272]"
              />
            </div>

            {/* Data Final */}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar size={13} className="text-emerald-700" />
                Data Final:
              </label>
              <Input
                type="date"
                value={draftEndDate}
                onChange={(e) => setDraftEndDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyFilters()
                }}
                className="h-9 text-xs rounded-xl border-emerald-900/15 focus-visible:ring-[#0D8272]"
              />
            </div>

            {/* Convênio */}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Building2 size={13} className="text-emerald-700" />
                Convênio:
              </label>
              <Select value={draftConvenio} onValueChange={setDraftConvenio}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-emerald-900/15 focus:ring-[#0D8272]">
                  <SelectValue placeholder="Todos os convênios" />
                </SelectTrigger>
                <SelectContent className="max-h-60 rounded-xl">
                  <SelectItem value="todos" className="text-xs font-semibold">
                    Todos os Convênios ({distinctConvenios.length})
                  </SelectItem>
                  {distinctConvenios.map((conv) => (
                    <SelectItem key={conv} value={conv} className="text-xs">
                      {conv}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Modalidade */}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Layers size={13} className="text-emerald-700" />
                Modalidade:
              </label>
              <Select value={draftModalidade} onValueChange={setDraftModalidade}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-emerald-900/15 focus:ring-[#0D8272]">
                  <SelectValue placeholder="Todas as modalidades" />
                </SelectTrigger>
                <SelectContent className="max-h-60 rounded-xl">
                  <SelectItem value="todas" className="text-xs font-semibold">
                    Todas as Modalidades ({distinctModalidades.length})
                  </SelectItem>
                  {distinctModalidades.map((mod) => (
                    <SelectItem key={mod} value={mod} className="text-xs">
                      {mod}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Paciente */}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Users size={13} className="text-emerald-700" />
                Paciente:
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Nome do paciente..."
                  value={draftPatientQuery}
                  onChange={(e) => setDraftPatientQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyFilters()
                  }}
                  className="h-9 pl-8 text-xs rounded-xl border-emerald-900/15 focus-visible:ring-[#0D8272]"
                />
              </div>
            </div>
          </div>

          {/* Ações de Pesquisa / Aplicar Filtros */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-500">
              Ajuste os filtros acima e clique em{' '}
              <strong className="text-slate-700">Pesquisar</strong> para atualizar os totais,
              resumos e a listagem.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
                className="h-9 px-3.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border-slate-200 hover:bg-slate-50 rounded-xl"
              >
                <X size={14} className="mr-1.5 text-slate-400" />
                Limpar filtros
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleApplyFilters}
                className="h-9 px-4 text-xs font-bold bg-[#0F5342] hover:bg-[#0C4336] text-white rounded-xl shadow-xs flex items-center gap-1.5"
              >
                <Search size={14} />
                <span>Pesquisar</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. CARTÕES DE TOTAIS GERAIS (SOMENTE VALOR TOTAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Geral */}
        <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-linear-to-br from-white to-[#F4FAF8]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Total Geral Filtrado
              </span>
              <div className="h-9 w-9 rounded-xl bg-[#0F5342] text-white flex items-center justify-center shadow-xs">
                <DollarSign size={18} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#0C4336] mt-3 tracking-tight">
              {formatCurrency(totalGeralFiltrado)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <CheckCircle2 size={12} className="text-[#0D8272]" />
              Soma exclusiva dos valores totais dos orçamentos
            </p>
          </CardContent>
        </Card>

        {/* Quantidade de Orçamentos */}
        <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-linear-to-br from-white to-blue-50/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
                Orçamentos Aprovados
              </span>
              <div className="h-9 w-9 rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-xs">
                <FileSpreadsheet size={18} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-blue-950 mt-3 tracking-tight">
              {totalCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              De um total de {allBudgets.length} orçamentos sincronizados
            </p>
          </CardContent>
        </Card>

        {/* Média por Orçamento */}
        <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-linear-to-br from-white to-amber-50/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Ticket Médio por Orçamento
              </span>
              <div className="h-9 w-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                <ArrowUpDown size={18} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-950 mt-3 tracking-tight">
              {formatCurrency(valorMedio)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Média calculada sobre os registros filtrados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3.1. GRÁFICOS DO RELATÓRIO FINANCEIRO */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Pizza/Rosca: Participação por Convênio */}
          <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-white overflow-hidden flex flex-col">
            <CardHeader className="bg-[#F4FAF8] border-b border-emerald-950/10 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-[#0D8272]" />
                  <CardTitle className="text-sm font-bold text-[#0C4336]">
                    Participação por Convênio
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">
                  Total R$ (% part.)
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
              {resumoPorConvenio.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-500 gap-1.5">
                  <AlertCircle size={22} className="text-slate-400" />
                  <p>Sem dados para o gráfico com os filtros atuais.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <RechartsTooltip
                          formatter={(value: unknown, name: unknown) => [
                            formatCurrency(Number(value) || 0),
                            String(name || ''),
                          ]}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            fontSize: '12px',
                          }}
                        />
                        <Pie
                          data={resumoPorConvenio}
                          dataKey="total"
                          nameKey="nome"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {resumoPorConvenio.map((entry, index) => (
                            <Cell
                              key={`cell-conv-${entry.nome}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                              stroke="#ffffff"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legenda com % e valores */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 max-h-36 overflow-y-auto">
                    {resumoPorConvenio.map((c, idx) => (
                      <div
                        key={`legenda-conv-${c.nome}`}
                        className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                            }}
                          />
                          <span className="font-medium text-slate-700 truncate" title={c.nome}>
                            {c.nome}
                          </span>
                        </div>
                        <div className="text-right shrink-0 font-mono text-[11px] text-slate-600">
                          <span className="font-bold text-[#0C4336] mr-1.5">
                            {formatCurrency(c.total)}
                          </span>
                          <span className="text-slate-400">({c.percentual.toFixed(1)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfico de Barras: Total por Modalidade */}
          <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-white overflow-hidden flex flex-col">
            <CardHeader className="bg-[#F4FAF8] border-b border-emerald-950/10 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#0D8272]" />
                  <CardTitle className="text-sm font-bold text-[#0C4336]">
                    Total por Modalidade
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">
                  {resumoPorModalidade.length} modalidade(s)
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
              {resumoPorModalidade.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-500 gap-1.5">
                  <AlertCircle size={22} className="text-slate-400" />
                  <p>Sem dados para o gráfico com os filtros atuais.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={resumoPorModalidade}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis
                          type="number"
                          tickFormatter={formatCompactCurrency}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <YAxis
                          type="category"
                          dataKey="nome"
                          width={110}
                          tick={{ fontSize: 11, fill: '#334155' }}
                        />
                        <RechartsTooltip
                          formatter={(value: unknown) => [
                            formatCurrency(Number(value) || 0),
                            'Total R$',
                          ]}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="total" radius={[0, 8, 8, 0]}>
                          {resumoPorModalidade.map((entry, index) => (
                            <Cell
                              key={`cell-mod-${entry.nome}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 max-h-36 overflow-y-auto">
                    {resumoPorModalidade.map((m, idx) => (
                      <div
                        key={`legenda-mod-${m.nome}`}
                        className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                            }}
                          />
                          <span className="font-medium text-slate-700 truncate" title={m.nome}>
                            {m.nome}
                          </span>
                        </div>
                        <div className="text-right shrink-0 font-mono text-[11px] text-slate-600">
                          <span className="font-bold text-[#0C4336] mr-1.5">
                            {formatCurrency(m.total)}
                          </span>
                          <span className="text-slate-400">({m.percentual.toFixed(1)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gráfico Adicional: Evolução Financeira por Mês */}
        {resumoPorMes.length > 0 && (
          <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-white overflow-hidden">
            <CardHeader className="bg-[#F4FAF8] border-b border-emerald-950/10 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#0D8272]" />
                  <CardTitle className="text-sm font-bold text-[#0C4336]">
                    Evolução Financeira por Mês de Aprovação
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">
                  {resumoPorMes.length} mês(es) no período
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={resumoPorMes}
                    margin={{ top: 12, right: 16, left: 16, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="mes"
                      tick={{ fontSize: 11, fill: '#334155' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCompactCurrency}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <RechartsTooltip
                      formatter={(value: unknown) => [
                        formatCurrency(Number(value) || 0),
                        'Total R$',
                      ]}
                      labelFormatter={(label) => `Mês: ${label}`}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="total" fill="#0D8272" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 4. RESUMOS POR CONVÊNIO E POR MODALIDADE (SOMA + CONTAGEM) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resumo por Convênio */}
        <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-white overflow-hidden">
          <CardHeader className="bg-[#F4FAF8] border-b border-emerald-950/10 py-3.5 px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#0D8272]" />
                <CardTitle className="text-sm font-bold text-[#0C4336]">
                  Resumo por Convênio
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">
                {resumoPorConvenio.length} convênio(s)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {resumoPorConvenio.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhum registro para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Convênio</th>
                      <th className="py-2.5 px-3 text-center">Qtd</th>
                      <th className="py-2.5 px-4 text-right">Soma dos Valores (R$)</th>
                      <th className="py-2.5 px-3 text-right">Part. (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumoPorConvenio.map((c) => (
                      <tr key={c.nome} className="hover:bg-[#F4FAF8] transition">
                        <td className="py-2.5 px-4 font-medium text-slate-800">{c.nome}</td>
                        <td className="py-2.5 px-3 text-center text-slate-600 font-mono">
                          {c.count}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-[#0C4336] font-mono">
                          {formatCurrency(c.total)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 font-mono">
                          {c.percentual.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#E6F5F2] font-bold text-[#0C4336] border-t border-emerald-900/20">
                    <tr>
                      <td className="py-2.5 px-4">TOTAL</td>
                      <td className="py-2.5 px-3 text-center font-mono">{totalCount}</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatCurrency(totalGeralFiltrado)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumo por Modalidade */}
        <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-white overflow-hidden">
          <CardHeader className="bg-[#F4FAF8] border-b border-emerald-950/10 py-3.5 px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#0D8272]" />
                <CardTitle className="text-sm font-bold text-[#0C4336]">
                  Resumo por Modalidade
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">
                {resumoPorModalidade.length} modalidade(s)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {resumoPorModalidade.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhum registro para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Modalidade</th>
                      <th className="py-2.5 px-3 text-center">Qtd</th>
                      <th className="py-2.5 px-4 text-right">Soma dos Valores (R$)</th>
                      <th className="py-2.5 px-3 text-right">Part. (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumoPorModalidade.map((m) => (
                      <tr key={m.nome} className="hover:bg-[#F4FAF8] transition">
                        <td className="py-2.5 px-4 font-medium text-slate-800">{m.nome}</td>
                        <td className="py-2.5 px-3 text-center text-slate-600 font-mono">
                          {m.count}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-[#0C4336] font-mono">
                          {formatCurrency(m.total)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 font-mono">
                          {m.percentual.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#E6F5F2] font-bold text-[#0C4336] border-t border-emerald-900/20">
                    <tr>
                      <td className="py-2.5 px-4">TOTAL</td>
                      <td className="py-2.5 px-3 text-center font-mono">{totalCount}</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatCurrency(totalGeralFiltrado)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. LISTA SIMPLES DOS ORÇAMENTOS FILTRADOS */}
      <Card className="rounded-2xl border border-emerald-950/10 shadow-xs bg-white overflow-hidden">
        <CardHeader className="bg-[#F4FAF8] border-b border-emerald-950/10 py-3.5 px-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-[#0C4336] flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-[#0D8272]" />
                Lista Simples de Orçamentos Filtrados ({sortedBudgets.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Exibição direta das colunas: Número, Paciente, Data Aprovação, Convênio, Modalidade
                e Valor Total.
              </CardDescription>
            </div>
            <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 self-start sm:self-auto">
              <span>Totalizador:</span>
              <span className="font-mono text-[#0C4336] font-bold bg-[#E6F5F2] px-2 py-0.5 rounded-md">
                {formatCurrency(totalGeralFiltrado)}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {sortedBudgets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
              <AlertCircle size={28} className="text-slate-400" />
              <p className="font-semibold text-slate-700">Nenhum orçamento encontrado</p>
              <p>Tente alterar o período, convênio, modalidade ou paciente nos filtros acima.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 text-left">Número</th>
                    <th
                      className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100 transition"
                      onClick={() => toggleSort('paciente')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Paciente</span>
                        <ArrowUpDown
                          size={12}
                          className={sortField === 'paciente' ? 'text-[#0D8272]' : 'text-slate-400'}
                        />
                      </div>
                    </th>
                    <th
                      className="py-3 px-3 text-left cursor-pointer hover:bg-slate-100 transition"
                      onClick={() => toggleSort('data')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Data Aprovação</span>
                        <ArrowUpDown
                          size={12}
                          className={sortField === 'data' ? 'text-[#0D8272]' : 'text-slate-400'}
                        />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100 transition"
                      onClick={() => toggleSort('convenio')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Convênio</span>
                        <ArrowUpDown
                          size={12}
                          className={sortField === 'convenio' ? 'text-[#0D8272]' : 'text-slate-400'}
                        />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 text-left cursor-pointer hover:bg-slate-100 transition"
                      onClick={() => toggleSort('modalidade')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Modalidade</span>
                        <ArrowUpDown
                          size={12}
                          className={
                            sortField === 'modalidade' ? 'text-[#0D8272]' : 'text-slate-400'
                          }
                        />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition"
                      onClick={() => toggleSort('valor')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Valor Total (R$)</span>
                        <ArrowUpDown
                          size={12}
                          className={sortField === 'valor' ? 'text-[#0D8272]' : 'text-slate-400'}
                        />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedBudgets.map((b) => {
                    const conv = getOrcamentoConvenio(b)
                    const mod = getOrcamentoModalidade(b)
                    const dataFormatada = b.data_aprovacao_iso
                      ? formatIsoToBr(b.data_aprovacao_iso)
                      : b.data_aprovacao || '—'

                    return (
                      <tr key={b.id || b.spincare_id} className="hover:bg-[#F4FAF8]/60 transition">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                          #{b.numero || b.spincare_id || '—'}
                        </td>
                        <td
                          className="py-2.5 px-4 font-medium text-slate-900 max-w-[220px] truncate"
                          title={b.paciente_nome}
                        >
                          {b.paciente_nome || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono whitespace-nowrap">
                          {dataFormatada}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/60 font-medium">
                            {conv}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-medium">
                            {mod}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-[#0C4336] whitespace-nowrap">
                          {formatCurrency(Number(b.valor_total) || 0)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
