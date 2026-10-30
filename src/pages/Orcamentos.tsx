import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  ShieldCheck,
  AlertCircle,
  Loader2,
  ChevronRight,
  Package,
  Clock,
  Settings,
  RefreshCw,
  Database,
  X,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Code2,
  CheckCircle2,
  Download,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  triggerBudgetsSync,
  getBudgetsSyncStatus,
  type OrcamentoSyncRecord,
  type SpincareBudgetItem,
} from '@/services/spincare'
import { parseDateToComparable } from '@/lib/dateUtils'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { SpincareTabsNav } from '@/components/SpincareTabsNav'

export default function Orcamentos() {
  const { isAdmin, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Formulário de consulta combinada / filtros
  const hojeIso = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [termQuery, setTermQuery] = useState('')
  const [patientQuery, setPatientQuery] = useState('')
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState(hojeIso)

  // Filtro geral rápido de texto
  const [generalSearch, setGeneralSearch] = useState('')
  const [debouncedGeneralSearch, setDebouncedGeneralSearch] = useState('')

  // Estado de execução da consulta combinada
  const [hasExecutedCombinedCheck, setHasExecutedCombinedCheck] = useState(false)
  const [activeCheckTerm, setActiveCheckTerm] = useState('')
  const [activeCheckPatient, setActiveCheckPatient] = useState('')
  const [activeCheckStart, setActiveCheckStart] = useState('2026-01-01')
  const [activeCheckEnd, setActiveCheckEnd] = useState(hojeIso)

  // Paginação e registros do banco local
  const [loading, setLoading] = useState(false)
  const [budgets, setBudgets] = useState<OrcamentoSyncRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 30

  // Status da sincronização (CDC)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('')
  const [totalReplicated, setTotalReplicated] = useState<number>(0)

  // Modal detalhe do orçamento
  const [selectedBudget, setSelectedBudget] = useState<OrcamentoSyncRecord | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [viewPayloadJson, setViewPayloadJson] = useState(false)

  // IDs dos orçamentos expandidos inline no resultado da busca combinada
  const [expandedBudgetIds, setExpandedBudgetIds] = useState<Record<string, boolean>>({})

  const toggleBudgetExpanded = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setExpandedBudgetIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Debounce para busca geral
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGeneralSearch(generalSearch)
    }, 250)
    return () => clearTimeout(timer)
  }, [generalSearch])

  // Normalizador tolerante (NFD, sem acentos, trim, uppercase)
  const normalize = (str: string) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()

  // Constante de status exigida: SOMENTE orçamentos aprovados com autorização
  const STATUS_APROVADO_COM_AUTORIZACAO = 'Aprovado com autorização'

  // Exportação CSV dos orçamentos (SOMENTE Aprovado com autorização)
  const [exportingCsv, setExportingCsv] = useState(false)

  const handleExportCsv = async () => {
    try {
      setExportingCsv(true)
      const filters: string[] = [`status = "${STATUS_APROVADO_COM_AUTORIZACAO}"`]
      if (debouncedGeneralSearch.trim()) {
        const q = debouncedGeneralSearch.trim().replace(/"/g, '\\"')
        filters.push(`(paciente_nome ~ "${q}" || numero ~ "${q}" || convenio ~ "${q}")`)
      }
      if (hasExecutedCombinedCheck && activeCheckPatient.trim()) {
        const qPat = activeCheckPatient.trim().replace(/"/g, '\\"')
        filters.push(`paciente_nome ~ "${qPat}"`)
      }

      const allRecords = await pb.collection('orcamentos_sync').getFullList<OrcamentoSyncRecord>({
        filter: filters.join(' && '),
        sort: '-data_aprovacao_iso,-created',
      })

      // Se houver busca combinada com período ou termo, aplicar os mesmos critérios
      let recordsToExport = allRecords
      if (hasExecutedCombinedCheck) {
        const qTerm = activeCheckTerm ? normalize(activeCheckTerm) : ''
        const termWords = qTerm.split(' ').filter((w) => w.length > 1)
        const startComp = parseDateToComparable(activeCheckStart)
        const endComp = parseDateToComparable(activeCheckEnd)

        recordsToExport = allRecords.filter((b) => {
          if (b.status !== STATUS_APROVADO_COM_AUTORIZACAO) return false

          const bDateAprov =
            parseDateToComparable(b.data_aprovacao_iso, { interpretInSaoPauloTz: true }) ||
            parseDateToComparable(b.data_aprovacao) ||
            parseDateToComparable(b.data_inicial_iso)
          const bDateEnd =
            parseDateToComparable(b.data_final_iso, { interpretInSaoPauloTz: true }) ||
            parseDateToComparable(b.data_final)

          let inPeriod = false
          if (startComp === null && endComp === null) {
            inPeriod = true
          } else if (bDateAprov !== null) {
            const afterOrAtStart = startComp === null || bDateAprov >= startComp
            const beforeOrAtEnd = endComp === null || bDateAprov <= endComp
            inPeriod = afterOrAtStart && beforeOrAtEnd
          } else if (bDateEnd !== null) {
            const endAfterOrAtStart = startComp === null || bDateEnd >= startComp
            const endBeforeOrAtEnd = endComp === null || bDateEnd <= endComp
            inPeriod = endAfterOrAtStart && endBeforeOrAtEnd
          }

          if (!inPeriod && (startComp !== null || endComp !== null)) return false

          if (!qTerm) return true

          const itensArr = Array.isArray(b.itens) ? b.itens : []
          const bNum = normalize(b.numero)
          const bObs = normalize(b.observacao)
          const bConv = normalize(b.convenio)

          if (bNum.includes(qTerm) || bObs.includes(qTerm) || bConv.includes(qTerm)) return true

          return itensArr.some((it) => {
            const desc = normalize(it.descricao)
            const cod = normalize(it.codigo)
            return (
              desc.includes(qTerm) ||
              cod.includes(qTerm) ||
              (termWords.length > 0 && termWords.every((w) => desc.includes(w)))
            )
          })
        })
      }

      if (recordsToExport.length === 0) {
        toast({
          title: 'Nenhum orçamento para exportar',
          description: 'Não há orçamentos aprovados com autorização com os filtros atuais.',
          variant: 'destructive',
        })
        return
      }

      const headers = [
        'Número',
        'Paciente',
        'Status',
        'Data Aprovação',
        'Convênio',
        'Valor Total (R$)',
        'Qtd Itens',
        'Observação',
      ]

      const rows = recordsToExport.map((b) => [
        `"${(b.numero || '').replace(/"/g, '""')}"`,
        `"${(b.paciente_nome || '').replace(/"/g, '""')}"`,
        `"${(b.status || STATUS_APROVADO_COM_AUTORIZACAO).replace(/"/g, '""')}"`,
        `"${(b.data_aprovacao_iso ? formatIsoToBrTz(b.data_aprovacao_iso) : b.data_aprovacao || '').replace(/"/g, '""')}"`,
        `"${(b.convenio || '').replace(/"/g, '""')}"`,
        `"${(b.valor_total || 0).toFixed(2).replace('.', ',')}"`,
        b.total_itens || (b.itens ? b.itens.length : 0),
        `"${(b.observacao || '').replace(/"/g, '""')}"`,
      ])

      const csvContent =
        '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `orcamentos-aprovados-autorizacao-${new Date().toISOString().slice(0, 10)}.csv`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: 'Exportação concluída',
        description: `${recordsToExport.length} orçamento(s) aprovado(s) com autorização exportado(s) em CSV.`,
      })
    } catch (err: unknown) {
      console.error('Erro ao exportar CSV:', err)
      toast({
        title: 'Erro na exportação CSV',
        description: getErrorMessage(err) || 'Falha ao gerar arquivo CSV.',
        variant: 'destructive',
      })
    } finally {
      setExportingCsv(false)
    }
  }

  // Formatação em dd/mm/aaaa no fuso horário do Brasil
  const formatIsoToBrTz = (dateStr: string): string => {
    if (!dateStr || dateStr === '—') return '—'
    const raw = dateStr.trim()
    if (raw.includes('T') || raw.includes('Z')) {
      try {
        const d = new Date(raw)
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        }
      } catch {
        /* intentionally ignored */
      }
    }
    const comp = parseDateToComparable(raw)
    if (comp) {
      const str = String(comp)
      return `${str.substring(6, 8)}/${str.substring(4, 6)}/${str.substring(0, 4)}`
    }
    return raw
  }

  const formatIsoToBr = (isoDate: string) => {
    if (!isoDate) return ''
    if (isoDate.includes('/')) return isoDate
    const parts = isoDate.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return isoDate
  }

  const formatDateTimeBr = (dateStr: string) => {
    if (!dateStr) return 'Nunca sincronizado'
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (_) {
      return dateStr
    }
  }

  // Consulta o status atual de sincronização do backend
  const checkSyncStatus = useCallback(async () => {
    try {
      const status = await getBudgetsSyncStatus()
      setLastSyncedAt(status.lastSyncedAt || '')
      setTotalReplicated(status.totalBudgets || 0)
      if (status.isRunning) setSyncing(true)
    } catch {
      /* intentionally ignored */
    }
  }, [])

  // Carrega orçamentos diretamente da coleção local orcamentos_sync
  const loadLocalBudgets = useCallback(
    async (pageToLoad: number = 1) => {
      if (isMedicoVisitador) return
      setLoading(true)
      try {
        const filters: string[] = [`status = "${STATUS_APROVADO_COM_AUTORIZACAO}"`]

        if (debouncedGeneralSearch.trim()) {
          const q = debouncedGeneralSearch.trim().replace(/"/g, '\\"')
          filters.push(`(paciente_nome ~ "${q}" || numero ~ "${q}" || convenio ~ "${q}")`)
        }

        if (hasExecutedCombinedCheck && activeCheckPatient.trim()) {
          const qPat = activeCheckPatient.trim().replace(/"/g, '\\"')
          filters.push(`paciente_nome ~ "${qPat}"`)
        }

        const filterString = filters.join(' && ')

        let resultList = await pb
          .collection('orcamentos_sync')
          .getList<OrcamentoSyncRecord>(pageToLoad, pageSize, {
            filter: filterString,
            sort: '-data_aprovacao_iso,-created',
            requestKey: null,
          })

        // Auto-inicialização na primeira carga caso o banco local de orçamentos esteja zerado
        if (
          resultList.totalItems === 0 &&
          pageToLoad === 1 &&
          !debouncedGeneralSearch &&
          !hasExecutedCombinedCheck &&
          isAdmin
        ) {
          try {
            setSyncing(true)
            await triggerBudgetsSync()
            resultList = await pb
              .collection('orcamentos_sync')
              .getList<OrcamentoSyncRecord>(1, pageSize, {
                sort: '-data_aprovacao_iso,-created',
                requestKey: null,
              })
            await checkSyncStatus()
          } catch {
            /* intentionally ignored */
          }
        }

        setBudgets(resultList.items)
        setTotalCount(resultList.totalItems)
        setTotalPages(resultList.totalPages || 1)
        setCurrentPage(pageToLoad)
      } catch (err: unknown) {
        console.error('Erro ao buscar orcamentos_sync no banco local:', err)
        toast({
          title: 'Erro ao carregar orçamentos locais',
          description: getErrorMessage(err) || 'Verifique sua conexão.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
        setSyncing(false)
      }
    },
    [
      isMedicoVisitador,
      isAdmin,
      debouncedGeneralSearch,
      hasExecutedCombinedCheck,
      activeCheckPatient,
      checkSyncStatus,
      toast,
    ],
  )

  useEffect(() => {
    checkSyncStatus()
  }, [checkSyncStatus])

  useEffect(() => {
    loadLocalBudgets(1)
  }, [loadLocalBudgets])

  // Disparo manual do CDC (Admin e Corpo Clínico)
  const handleTriggerSync = async () => {
    setSyncing(true)
    try {
      const res = await triggerBudgetsSync()
      if (res.alreadyRunning) {
        toast({
          title: 'Sincronização em andamento',
          description: res.message || 'Aguarde a replicação em execução.',
        })
      } else {
        toast({
          title: 'Replicação de orçamentos concluída',
          description: `Buscados: ${res.totalFetched} | Criados: ${res.created} | Atualizados: ${res.updated} em ${Math.round(res.durationMs / 1000)}s`,
        })
        setLastSyncedAt(res.syncedAt)
        checkSyncStatus()
        loadLocalBudgets(1)
      }
    } catch (err: unknown) {
      console.error('Erro ao disparar sincronização manual de orçamentos:', err)
      toast({
        title: 'Falha na sincronização de orçamentos',
        description: getErrorMessage(err) || 'Não foi possível rodar o sincronizador agora.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  // Handler da busca combinada de orçamentos
  const handleExecuteCombinedSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setActiveCheckTerm(termQuery.trim())
    setActiveCheckPatient(patientQuery.trim())
    setActiveCheckStart(startDate.trim() || '2026-01-01')
    setActiveCheckEnd(endDate.trim() || hojeIso)
    setHasExecutedCombinedCheck(true)
  }

  const handleClearCombinedSearch = () => {
    setTermQuery('')
    setPatientQuery('')
    setStartDate('2026-01-01')
    setEndDate(hojeIso)
    setActiveCheckTerm('')
    setActiveCheckPatient('')
    setActiveCheckStart('2026-01-01')
    setActiveCheckEnd(hojeIso)
    setHasExecutedCombinedCheck(false)
  }

  // Avaliação combinada dos orçamentos carregados
  interface OccurrenceItem {
    budget: OrcamentoSyncRecord
    matchedItem?: SpincareBudgetItem
  }

  const combinedOccurrences = useMemo(() => {
    if (!hasExecutedCombinedCheck) return null

    const qTerm = activeCheckTerm ? normalize(activeCheckTerm) : ''
    const termWords = qTerm.split(' ').filter((w) => w.length > 1)
    const qPatient = activeCheckPatient ? normalize(activeCheckPatient) : ''
    const patWords = qPatient.split(' ').filter(Boolean)
    const startComp = parseDateToComparable(activeCheckStart)
    const endComp = parseDateToComparable(activeCheckEnd)

    const occurrences: OccurrenceItem[] = []
    const matchingBudgetIds = new Set<string>()

    budgets.forEach((b) => {
      // 0. SOMENTE orçamentos aprovados com autorização
      if (b.status !== STATUS_APROVADO_COM_AUTORIZACAO) return

      // 1. Filtro estrito de paciente (se informado)
      if (patWords.length > 0) {
        const pNome = normalize(b.paciente_nome)
        const matchWords = patWords.every((w) => pNome.includes(w))
        if (!matchWords) return
      }

      // 2. Filtro de período (America/Sao_Paulo)
      const bDateAprov =
        parseDateToComparable(b.data_aprovacao_iso, { interpretInSaoPauloTz: true }) ||
        parseDateToComparable(b.data_aprovacao) ||
        parseDateToComparable(b.data_inicial_iso)
      const bDateEnd =
        parseDateToComparable(b.data_final_iso, { interpretInSaoPauloTz: true }) ||
        parseDateToComparable(b.data_final)

      let inPeriod = false
      if (startComp === null && endComp === null) {
        inPeriod = true
      } else if (bDateAprov !== null) {
        const afterOrAtStart = startComp === null || bDateAprov >= startComp
        const beforeOrAtEnd = endComp === null || bDateAprov <= endComp
        inPeriod = afterOrAtStart && beforeOrAtEnd
      } else if (bDateEnd !== null) {
        const endAfterOrAtStart = startComp === null || bDateEnd >= startComp
        const endBeforeOrAtEnd = endComp === null || bDateEnd <= endComp
        inPeriod = endAfterOrAtStart && endBeforeOrAtEnd
      }

      if (!inPeriod && (startComp !== null || endComp !== null)) return

      // 3. Verificação de termo (itens, número ou observação/convênio)
      const itensArr = Array.isArray(b.itens) ? b.itens : []
      if (!qTerm) {
        occurrences.push({ budget: b })
        matchingBudgetIds.add(b.id)
      } else {
        let matchedItem: SpincareBudgetItem | undefined = undefined
        const bNum = normalize(b.numero)
        const bObs = normalize(b.observacao)
        const bConv = normalize(b.convenio)

        let isMatch = bNum.includes(qTerm) || bObs.includes(qTerm) || bConv.includes(qTerm)

        for (let i = 0; i < itensArr.length; i++) {
          const it = itensArr[i]
          const desc = normalize(it.descricao)
          const cod = normalize(it.codigo)
          if (
            desc.includes(qTerm) ||
            cod.includes(qTerm) ||
            (termWords.length > 0 && termWords.every((w) => desc.includes(w)))
          ) {
            isMatch = true
            matchedItem = it
            break
          }
        }

        if (isMatch) {
          occurrences.push({ budget: b, matchedItem })
          matchingBudgetIds.add(b.id)
        }
      }
    })

    const uniquePatients = Array.from(new Set(occurrences.map((o) => o.budget.paciente_nome)))
    const uniqueBudgets = budgets.filter((b) => matchingBudgetIds.has(b.id))

    return {
      queryTerm: activeCheckTerm,
      queryPatient: activeCheckPatient,
      startDate: activeCheckStart,
      endDate: activeCheckEnd,
      occurrences,
      uniquePatients,
      uniqueBudgets,
    }
  }, [
    hasExecutedCombinedCheck,
    activeCheckTerm,
    activeCheckPatient,
    activeCheckStart,
    activeCheckEnd,
    budgets,
  ])

  // Totalizadores de valores e itens da página exibida
  const valorTotalPagina = budgets.reduce((acc, b) => acc + (b.valor_total || 0), 0)
  const totalItensPagina = budgets.reduce(
    (acc, b) => acc + (b.total_itens || (b.itens ? b.itens.length : 0)),
    0,
  )

  // Bloqueio do médico visitador
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

      {/* 2. CABEÇALHO COM BOTÃO "SINCRONIZAR AGORA" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-emerald-950/10 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg sm:text-2xl font-bold text-[#0C4336] tracking-tight flex items-center gap-2">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-[#0D8272] shrink-0" />
              <span>Orçamentos Aprovados — SpinCare</span>
            </h2>
            <Badge className="bg-[#E6F5F2] text-[#0C4336] border-[#0D8272]/30 text-[10px] font-bold flex items-center gap-1">
              <Database size={11} className="text-[#0D8272]" />
              Banco Local (2026+)
            </Badge>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-snug">
            Replicação local ultrarrápida dos orçamentos aprovados a partir de 01/01/2026 com
            payload completo e itens detalhados da API SpinCare.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <Clock size={12} className="text-slate-400" />
              <span>
                Última sincronização: <strong>{formatDateTimeBr(lastSyncedAt)}</strong>
              </span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1">
              <Database size={12} className="text-[#0D8272]" />
              <span>
                Replicados no banco: <strong>{totalReplicated || totalCount}</strong>
              </span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">Cron automático diário agendado (03:00)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            disabled={exportingCsv || loading}
            onClick={handleExportCsv}
            className="text-xs border-emerald-300 text-[#0C4336] hover:bg-[#E6F5F2] font-semibold rounded-xl h-10 px-3.5 flex items-center gap-2 min-h-[44px] sm:min-h-0 shadow-2xs"
            title="Exportar orçamentos aprovados com autorização em CSV"
          >
            {exportingCsv ? (
              <Loader2 size={14} className="animate-spin text-[#0D8272]" />
            ) : (
              <Download size={14} className="text-[#0D8272]" />
            )}
            <span>{exportingCsv ? 'Exportando CSV...' : 'Exportar CSV'}</span>
          </Button>

          {isAdmin && (
            <Button
              type="button"
              disabled={syncing}
              onClick={handleTriggerSync}
              className="bg-[#0F5342] hover:bg-[#0C4336] active:bg-[#082921] text-white text-xs font-bold rounded-xl shadow-xs h-10 px-3.5 flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Sincronizando...' : 'Sincronizar agora'}</span>
            </Button>
          )}

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/configuracoes')}
              className="text-xs border-[#0D8272]/30 text-[#0C4336] hover:bg-[#E6F5F2] rounded-xl h-10 min-h-[44px] sm:min-h-0"
              title="Configurações SpinCare"
            >
              <Settings size={14} className="text-[#0D8272]" />
            </Button>
          )}
        </div>
      </div>

      {/* 3. AVISO LGPD */}
      <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="h-4 w-4 text-[#0D8272] shrink-0" />
          <span>
            <strong>Trilha de Auditoria (LGPD):</strong> Replicação e consultas são registradas sem
            dados clínicos sensíveis (somente métricas e identificadores de auditoria).
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">
          DPO: Fernando Fernandes
        </span>
      </div>

      {/* 4. FORMULÁRIO DE CONSULTA COMBINADA */}
      <Card className="border-emerald-200/90 bg-emerald-50/50 shadow-xs">
        <CardContent className="p-3.5 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-[#0F5342] text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <DollarSign size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-[#0C4336] flex items-center gap-1.5">
                  <span>Consulta Combinada de Orçamentos</span>
                </h3>
                <p className="text-[11px] text-emerald-900/80">
                  Filtre por termo, insumo ou serviço, paciente e período no banco local de
                  orçamentos.
                </p>
              </div>
            </div>

            {hasExecutedCombinedCheck && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearCombinedSearch}
                className="h-9 text-xs border-emerald-300 text-emerald-900 rounded-xl px-3 bg-white hover:bg-emerald-100 flex items-center"
              >
                <X size={14} className="mr-1 text-emerald-700" />
                <span>Limpar Consulta</span>
              </Button>
            )}
          </div>

          <form onSubmit={handleExecuteCombinedSearch} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
              {/* Termo / Item */}
              <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Package size={13} className="text-[#0D8272]" />
                  <span>Item, Insumo ou Nº do Orçamento</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Ex: Oxigênio, Fralda, Diária, #75147..."
                    value={termQuery}
                    onChange={(e) => setTermQuery(e.target.value)}
                    className="h-11 pl-9 text-base sm:text-xs bg-white border-emerald-200 rounded-xl focus-visible:ring-[#0D8272] min-h-[44px]"
                  />
                </div>
              </div>

              {/* Paciente */}
              <div className="sm:col-span-1 lg:col-span-3 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <User size={13} className="text-[#0D8272]" />
                  <span>Paciente</span>
                  <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                </label>
                <Input
                  type="text"
                  placeholder="Ex: Ademir..."
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                  className="h-11 text-base sm:text-xs bg-white border-emerald-200 rounded-xl focus-visible:ring-[#0D8272] min-h-[44px]"
                />
              </div>

              {/* Data Inicial */}
              <div className="sm:col-span-1 lg:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Calendar size={13} className="text-[#0D8272]" />
                  <span>Data Inicial</span>
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 text-base sm:text-xs bg-white border-emerald-200 rounded-xl font-mono min-h-[44px]"
                />
              </div>

              {/* Data Final */}
              <div className="sm:col-span-1 lg:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Calendar size={13} className="text-[#0D8272]" />
                  <span>Data Final</span>
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 text-base sm:text-xs bg-white border-emerald-200 rounded-xl font-mono min-h-[44px]"
                />
              </div>

              {/* Botão Consultar */}
              <div className="sm:col-span-2 lg:col-span-1 flex items-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 min-h-[44px] bg-[#0F5342] hover:bg-[#0C4336] active:bg-[#082921] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                  title="Executar Verificação"
                >
                  <Search size={15} className="shrink-0" />
                  <span className="lg:hidden">Consultar</span>
                </Button>
              </div>
            </div>
          </form>

          {/* Resultado da verificação combinada */}
          {hasExecutedCombinedCheck && combinedOccurrences && (
            <div className="pt-2">
              {combinedOccurrences.occurrences.length > 0 ? (
                <div className="p-3.5 rounded-xl bg-white border border-emerald-300 text-xs space-y-2.5 shadow-2xs">
                  <div className="flex items-start gap-2 text-emerald-950 font-bold">
                    <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm text-emerald-900 leading-snug">
                        Encontrado{combinedOccurrences.occurrences.length === 1 ? '' : 's'}{' '}
                        <strong>{combinedOccurrences.occurrences.length}</strong> orçamento
                        {combinedOccurrences.occurrences.length === 1 ? '' : 's'}
                        {combinedOccurrences.queryTerm && (
                          <>
                            {' '}
                            correspondente(s) a{' '}
                            <strong>&quot;{combinedOccurrences.queryTerm}&quot;</strong>
                          </>
                        )}
                        {combinedOccurrences.queryPatient && (
                          <>
                            {' '}
                            para o paciente{' '}
                            <strong>&quot;{combinedOccurrences.queryPatient}&quot;</strong>
                          </>
                        )}{' '}
                        no período de{' '}
                        <strong>{formatIsoToBr(combinedOccurrences.startDate)}</strong> até{' '}
                        <strong>{formatIsoToBr(combinedOccurrences.endDate)}</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-emerald-100">
                    <div className="grid grid-cols-1 gap-2">
                      {combinedOccurrences.occurrences.map((occ, idx) => {
                        const budgetKey = occ.budget.id || String(occ.budget.numero)
                        const isExpanded = !!expandedBudgetIds[budgetKey]
                        const allItens = Array.isArray(occ.budget.itens) ? occ.budget.itens : []
                        const dataAprovFormatada = occ.budget.data_aprovacao_iso
                          ? formatIsoToBrTz(occ.budget.data_aprovacao_iso)
                          : occ.budget.data_aprovacao || '—'

                        return (
                          <div
                            key={idx}
                            className="rounded-xl bg-emerald-50/60 border border-emerald-200 transition overflow-hidden shadow-2xs"
                          >
                            <div
                              onClick={() => toggleBudgetExpanded(budgetKey)}
                              className="p-3 hover:bg-emerald-100/50 cursor-pointer space-y-1.5 transition select-none"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 min-w-0">
                                  <DollarSign size={14} className="text-emerald-700 shrink-0" />
                                  <span className="truncate">Orçamento #{occ.budget.numero}</span>
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge className="bg-white text-emerald-800 border-emerald-300 text-[10px] font-bold">
                                    {occ.budget.status || 'Aprovado'}
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => toggleBudgetExpanded(budgetKey, e)}
                                    className="h-7 w-7 p-0 text-emerald-800 hover:bg-emerald-200/60 rounded-lg"
                                  >
                                    <ChevronRight
                                      size={15}
                                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                    />
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-1 text-[11px] text-slate-600">
                                <div>
                                  Paciente:{' '}
                                  <strong className="text-slate-900">
                                    {occ.budget.paciente_nome}
                                  </strong>
                                </div>
                                <div>
                                  Data Aprovação:{' '}
                                  <strong className="text-slate-900">{dataAprovFormatada}</strong>
                                </div>
                                <div>
                                  Valor Total:{' '}
                                  <strong className="text-emerald-800">
                                    {occ.budget.valor_total > 0
                                      ? occ.budget.valor_total.toLocaleString('pt-BR', {
                                          style: 'currency',
                                          currency: 'BRL',
                                        })
                                      : '—'}
                                  </strong>
                                </div>
                                <div>
                                  Itens:{' '}
                                  <strong>
                                    {allItens.length || occ.budget.total_itens || 0} cadastrados
                                  </strong>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1 text-[10px] text-emerald-900/80">
                                <span className="flex items-center gap-1">
                                  <span>{occ.budget.observacao || '—'}</span>
                                </span>
                                <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                                  <span>
                                    {isExpanded ? 'Ocultar conteúdo' : 'Ver conteúdo completo'}
                                  </span>
                                  <ChevronRight
                                    size={12}
                                    className={isExpanded ? 'rotate-90' : ''}
                                  />
                                </span>
                              </div>
                            </div>

                            {/* Detalhamento Expandido do Orçamento */}
                            {isExpanded && (
                              <div className="p-3 sm:p-4 bg-white border-t border-emerald-200/80 space-y-3">
                                <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 text-xs space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-950/10 pb-2">
                                    <div className="flex items-center gap-2">
                                      <DollarSign className="h-4 w-4 text-[#0D8272]" />
                                      <span className="font-bold text-[#0C4336] text-xs sm:text-sm">
                                        Orçamento #{occ.budget.numero}
                                      </span>
                                      <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold">
                                        {occ.budget.status || 'Aprovado'}
                                      </Badge>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedBudget(occ.budget)
                                        setViewPayloadJson(false)
                                        setDetailModalOpen(true)
                                      }}
                                      className="h-7 text-[11px] border-emerald-300 text-emerald-900 hover:bg-emerald-50 rounded-lg px-2"
                                    >
                                      Abrir em Modal
                                    </Button>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Paciente
                                      </span>
                                      <span className="font-bold text-slate-900">
                                        {occ.budget.paciente_nome}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Data de Aprovação
                                      </span>
                                      <span className="font-semibold text-slate-800">
                                        {dataAprovFormatada}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Convênio / Observação
                                      </span>
                                      <span className="font-semibold text-slate-800">
                                        {occ.budget.convenio || occ.budget.observacao || '—'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Valor Consolidado
                                      </span>
                                      <span className="font-bold text-emerald-800">
                                        {occ.budget.valor_total > 0
                                          ? occ.budget.valor_total.toLocaleString('pt-BR', {
                                              style: 'currency',
                                              currency: 'BRL',
                                            })
                                          : '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Lista de Itens do Orçamento */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                      <Package size={13} className="text-emerald-700" />
                                      <span>Itens & Insumos do Orçamento ({allItens.length})</span>
                                    </h4>
                                    <span className="text-[11px] text-slate-400">
                                      Fonte: campo itens/payload do orçamento #{occ.budget.numero}
                                    </span>
                                  </div>

                                  {allItens.length > 0 ? (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                                            <tr>
                                              <th className="p-2.5 w-10 text-center">#</th>
                                              <th className="p-2.5">Código</th>
                                              <th className="p-2.5">Descrição do Item</th>
                                              <th className="p-2.5">Quantidade</th>
                                              <th className="p-2.5">Valor Unitário</th>
                                              <th className="p-2.5 text-right">Valor Total</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {allItens.map((it, itemIdx) => (
                                              <tr
                                                key={itemIdx}
                                                className="hover:bg-slate-50 transition"
                                              >
                                                <td className="p-2.5 text-center text-slate-400 font-mono text-[10px]">
                                                  {itemIdx + 1}
                                                </td>
                                                <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                                                  {it.codigo || '—'}
                                                </td>
                                                <td className="p-2.5 text-slate-900 font-semibold">
                                                  {it.descricao}
                                                </td>
                                                <td className="p-2.5 text-slate-700 whitespace-nowrap font-mono text-[11px]">
                                                  {it.quantidade} {it.unidade || ''}
                                                </td>
                                                <td className="p-2.5 text-slate-700 whitespace-nowrap font-mono text-[11px]">
                                                  {it.valorUnitario > 0
                                                    ? it.valorUnitario.toLocaleString('pt-BR', {
                                                        style: 'currency',
                                                        currency: 'BRL',
                                                      })
                                                    : '—'}
                                                </td>
                                                <td className="p-2.5 text-right text-[#0C4336] font-bold whitespace-nowrap font-mono text-[11px]">
                                                  {it.valorTotal > 0
                                                    ? it.valorTotal.toLocaleString('pt-BR', {
                                                        style: 'currency',
                                                        currency: 'BRL',
                                                      })
                                                    : '—'}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                                      Nenhum item discriminado no orçamento (apenas valor
                                      consolidado).
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-white border border-amber-300 text-xs flex items-start gap-2.5 shadow-2xs">
                  <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-950 text-xs sm:text-sm block">
                      Nenhum orçamento localizado com os critérios informados
                    </span>
                    <span className="text-[11px] text-amber-900 leading-relaxed block mt-0.5">
                      No período de <strong>{formatIsoToBr(combinedOccurrences.startDate)}</strong>{' '}
                      até <strong>{formatIsoToBr(combinedOccurrences.endDate)}</strong>, nenhum
                      registro corresponde aos filtros selecionados.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. BUSCA RÁPIDA LOCAL */}
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardContent className="p-3.5 sm:p-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                type="search"
                placeholder="Buscar instantaneamente por paciente, número do orçamento ou convênio..."
                value={generalSearch}
                onChange={(e) => setGeneralSearch(e.target.value)}
                className="h-11 sm:h-10 pl-9 text-base sm:text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272] min-h-[44px]"
              />
            </div>

            {(generalSearch || hasExecutedCombinedCheck) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setGeneralSearch('')
                  handleClearCombinedSearch()
                }}
                className="h-11 sm:h-10 min-h-[44px] px-3.5 text-xs border-slate-200 rounded-xl"
              >
                <X size={14} className="mr-1" />
                <span>Limpar Filtros</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 6. LISTAGEM DOS ORÇAMENTOS DO BANCO LOCAL */}
      {loading ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
            <p className="text-xs font-medium text-slate-600">
              Carregando orçamentos do banco local...
            </p>
          </CardContent>
        </Card>
      ) : budgets.length === 0 ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-12 text-center text-slate-400 space-y-3">
            <DollarSign className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">
              Nenhum orçamento encontrado no banco local
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              {totalReplicated === 0
                ? 'O banco local ainda não foi sincronizado com os orçamentos de 2026. Clique em "Sincronizar agora" acima para replicar.'
                : 'Nenhum registro corresponde aos filtros selecionados.'}
            </p>
            {totalReplicated === 0 && isAdmin && (
              <Button
                onClick={handleTriggerSync}
                disabled={syncing}
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl h-10 px-4"
              >
                <RefreshCw size={13} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                Iniciar Primeira Sincronização
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Métricas do banco local */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total no Banco Local
                </p>
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">{totalCount}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center font-bold">
                <Database size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Valor Total Nesta Página
                </p>
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">
                  {valorTotalPagina > 0
                    ? valorTotalPagina.toLocaleString('pt-BR', {
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
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">{totalItensPagina}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-[#F4FAF8] text-[#0D8272] flex items-center justify-center font-bold">
                <Package size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Status de Replicação
                </p>
                <p className="text-xs font-semibold text-slate-800 mt-1">Ativo (2026+)</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <Clock size={18} />
              </div>
            </div>
          </div>

          {/* Cards da Lista */}
          <div className="space-y-2.5">
            {budgets.map((b) => {
              const dataAprovFormatada = b.data_aprovacao_iso
                ? formatIsoToBrTz(b.data_aprovacao_iso)
                : b.data_aprovacao || '—'
              const itensCount = b.total_itens || (b.itens ? b.itens.length : 0)

              return (
                <Card
                  key={b.id}
                  onClick={() => {
                    setSelectedBudget(b)
                    setViewPayloadJson(false)
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
                            {b.status || 'Aprovado'}
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold text-[#0C4336] truncate mt-0.5">
                          Paciente: {b.paciente_nome}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            Data: <strong className="text-slate-700">{dataAprovFormatada}</strong>
                          </span>
                          {itensCount > 0 && (
                            <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-normal">
                              <Package size={10} className="mr-1 text-[#0D8272]" />
                              {itensCount} {itensCount === 1 ? 'item' : 'itens'}
                            </Badge>
                          )}
                          {b.convenio && b.convenio !== '—' && (
                            <span className="text-slate-500 truncate max-w-[200px]">
                              • Convênio: {b.convenio}
                            </span>
                          )}
                          {b.observacao &&
                            b.observacao !== '—' &&
                            !b.observacao.includes(b.convenio) && (
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
                        <span className="text-sm font-bold text-[#0C4336] font-mono">
                          {b.valor_total > 0
                            ? b.valor_total.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })
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
              )
            })}
          </div>

          {/* Paginação do Banco Local */}
          {totalPages > 1 && (
            <div className="p-4 rounded-2xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 text-center sm:text-left">
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({totalCount}{' '}
                orçamentos)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => loadLocalBudgets(1)}
                  className="h-8 w-8 p-0 rounded-lg"
                  title="Primeira Página"
                >
                  <ChevronsLeft size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => loadLocalBudgets(currentPage - 1)}
                  className="h-8 w-8 p-0 rounded-lg"
                  title="Página Anterior"
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="px-3 font-mono font-bold text-slate-700">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => loadLocalBudgets(currentPage + 1)}
                  className="h-8 w-8 p-0 rounded-lg"
                  title="Próxima Página"
                >
                  <ChevronRight size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => loadLocalBudgets(totalPages)}
                  className="h-8 w-8 p-0 rounded-lg"
                  title="Última Página"
                >
                  <ChevronsRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. MODAL DETALHE COMPLETO DO ORÇAMENTO */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl w-[96vw] sm:w-full p-3 sm:p-6 rounded-2xl bg-white max-h-[94vh] sm:max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-emerald-950/10 shrink-0 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pr-1">
                <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2 truncate">
                  <DollarSign className="h-5 w-5 text-[#0D8272] shrink-0" />
                  <span>Orçamento #{selectedBudget?.numero}</span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-slate-500 pt-0.5 truncate">
                  Detalhes completos do orçamento aprovado replicado no banco local Help Vida
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setViewPayloadJson((prev) => !prev)}
                  className="h-7 text-[10px] font-mono border-slate-200 text-slate-700 rounded-lg px-2 flex items-center gap-1"
                >
                  <Code2 size={12} />
                  <span>{viewPayloadJson ? 'Ver Tabela' : 'Ver Payload JSON'}</span>
                </Button>
                <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold">
                  {selectedBudget?.status || 'Aprovado'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2 space-y-4 py-3">
            {viewPayloadJson ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold">Payload Bruto da API SpinCare:</span>
                  <span className="font-mono text-[10px]">
                    spincare_id: {selectedBudget?.spincare_id}
                  </span>
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-[50vh] leading-relaxed">
                  {JSON.stringify(selectedBudget?.payload || selectedBudget, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cabeçalho do Card */}
                <div className="p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">
                      Paciente Vinculado:
                    </span>
                    <span className="font-bold text-slate-900 text-sm">
                      {selectedBudget?.paciente_nome || '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-emerald-950/10">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Data de Aprovação:</span>
                      <span className="font-semibold text-slate-800">
                        {selectedBudget?.data_aprovacao_iso
                          ? formatIsoToBrTz(selectedBudget.data_aprovacao_iso)
                          : selectedBudget?.data_aprovacao || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Convênio:</span>
                      <span className="font-semibold text-slate-800">
                        {selectedBudget?.convenio || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Valor Consolidado:</span>
                      <span className="font-bold text-emerald-800 text-sm font-mono">
                        {selectedBudget && selectedBudget.valor_total > 0
                          ? selectedBudget.valor_total.toLocaleString('pt-BR', {
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
                      &quot;{selectedBudget.observacao}&quot;
                    </p>
                  </div>
                )}

                {/* Tabela de Itens */}
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
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                            <tr>
                              <th className="p-2.5 w-10 text-center">#</th>
                              <th className="p-2.5">Código</th>
                              <th className="p-2.5">Descrição</th>
                              <th className="p-2.5">Quantidade</th>
                              <th className="p-2.5">Valor Unitário</th>
                              <th className="p-2.5 text-right">Valor Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedBudget.itens.map((it, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition">
                                <td className="p-2.5 text-center text-slate-400 font-mono text-[10px]">
                                  {idx + 1}
                                </td>
                                <td className="p-2.5 font-mono text-[11px] text-slate-500">
                                  {it.codigo || '—'}
                                </td>
                                <td className="p-2.5 font-semibold text-slate-900">
                                  {it.descricao}
                                </td>
                                <td className="p-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                  {it.quantidade} {it.unidade || ''}
                                </td>
                                <td className="p-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                  {it.valorUnitario > 0
                                    ? it.valorUnitario.toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })
                                    : '—'}
                                </td>
                                <td className="p-2.5 text-right font-mono text-[11px] font-bold text-[#0C4336] whitespace-nowrap">
                                  {it.valorTotal > 0
                                    ? it.valorTotal.toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 space-y-1">
                    <Package className="h-6 w-6 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">
                      Nenhum item discriminado no orçamento
                    </p>
                    <p className="text-[11px] text-slate-400">
                      O orçamento consta apenas com o valor consolidado.
                    </p>
                  </div>
                )}
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
