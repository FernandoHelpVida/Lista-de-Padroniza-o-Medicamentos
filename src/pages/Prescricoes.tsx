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
  FileSpreadsheet,
  Search,
  Calendar,
  User,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ChevronRight,
  Pill,
  CheckCircle2,
  Settings,
  X,
  Stethoscope,
  Clock,
  RefreshCw,
  Database,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Code2,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  triggerPrescriptionsSync,
  getPrescriptionsSyncStatus,
  type SpincarePrescriptionItem,
  type PrescricaoSyncRecord,
} from '@/services/spincare'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { SpincareTabsNav } from '@/components/SpincareTabsNav'

export default function Prescricoes() {
  const { isAdmin, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Formulário de consulta combinada
  const hojeIso = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [medQuery, setMedQuery] = useState('')
  const [patientQuery, setPatientQuery] = useState('')
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState(hojeIso)

  // Filtro de texto geral na listagem (médico, protocolo ou paciente)
  const [generalSearch, setGeneralSearch] = useState('')
  const [debouncedGeneralSearch, setDebouncedGeneralSearch] = useState('')

  // Estado de execução da consulta combinada
  const [hasExecutedMedCheck, setHasExecutedMedCheck] = useState(false)
  const [activeCheckMed, setActiveCheckMed] = useState('')
  const [activeCheckPatient, setActiveCheckPatient] = useState('')
  const [activeCheckStart, setActiveCheckStart] = useState('2026-01-01')
  const [activeCheckEnd, setActiveCheckEnd] = useState(hojeIso)

  // Paginação e registros do banco local
  const [loading, setLoading] = useState(false)
  const [prescriptions, setPrescriptions] = useState<PrescricaoSyncRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 30

  // Status da sincronização (CDC)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('')
  const [totalReplicated, setTotalReplicated] = useState<number>(0)

  // Modal com detalhes da prescrição
  const [selectedPrescription, setSelectedPrescription] = useState<PrescricaoSyncRecord | null>(
    null,
  )
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [viewPayloadJson, setViewPayloadJson] = useState(false)

  // IDs das prescrições expandidas inline no resultado da busca combinada
  const [expandedPrescriptionIds, setExpandedPrescriptionIds] = useState<Record<string, boolean>>(
    {},
  )

  const togglePrescriptionExpanded = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setExpandedPrescriptionIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Debounce da busca de texto
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

  // Converte data dd/mm/aaaa ou yyyy-mm-dd (ou ISO 8601 com T/Z/espaço) para número comparável yyyymmdd.
  // Para strings ISO contendo 'T', 'Z' ou offset de fuso, converte no fuso America/Sao_Paulo (UTC-3),
  // garantindo que timestamps como "2026-10-01T03:59:00Z" sejam lidos como 20260930 (30/09/2026 às 23:59 em SP).
  const parseDateToComparable = (
    dateStr: string,
    options?: { interpretInSaoPauloTz?: boolean },
  ): number | null => {
    if (!dateStr || dateStr === '—') return null
    const raw = dateStr.trim()

    // Se possui indicação de horário ISO com fuso (ex: 'T', 'Z' ou offset + / -) ou a opção está ativa
    if (options?.interpretInSaoPauloTz || raw.includes('T') || raw.includes('Z')) {
      try {
        const d = new Date(raw)
        if (!Number.isNaN(d.getTime())) {
          // Extrai ano, mês e dia no fuso America/Sao_Paulo
          const formatter = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
          const parts = formatter.formatToParts(d)
          const y = parts.find((p) => p.type === 'year')?.value
          const m = parts.find((p) => p.type === 'month')?.value
          const day = parts.find((p) => p.type === 'day')?.value
          if (y && m && day) {
            return parseInt(`${y}${m.padStart(2, '0')}${day.padStart(2, '0')}`, 10)
          }
        }
      } catch (_) {
        // Fallback para parse textual abaixo
      }
    }

    // Parse de data textual simples (dd/mm/aaaa ou yyyy-mm-dd)
    const s = raw.split('T')[0].split(' ')[0]
    if (s.includes('/')) {
      const parts = s.split('/')
      if (parts.length === 3) {
        return parseInt(`${parts[2]}${parts[1].padStart(2, '0')}${parts[0].padStart(2, '0')}`, 10)
      }
    } else if (s.includes('-')) {
      const parts = s.split('-')
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return parseInt(`${parts[0]}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`, 10)
        } else if (parts[2].length === 4) {
          return parseInt(`${parts[2]}${parts[1].padStart(2, '0')}${parts[0].padStart(2, '0')}`, 10)
        }
      }
    }
    return null
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

  // Consulta o status atual de sincronização do backend
  const checkSyncStatus = useCallback(async () => {
    try {
      const status = await getPrescriptionsSyncStatus()
      setLastSyncedAt(status.lastSyncedAt || '')
      setTotalReplicated(status.totalPrescriptions || 0)
      if (status.isRunning) setSyncing(true)
    } catch {
      /* intentionally ignored */
    }
  }, [])

  // Carrega prescrições diretamente da coleção local prescricoes_sync (rápido, server-side PB)
  const loadLocalPrescriptions = useCallback(
    async (pageToLoad: number = 1) => {
      if (isMedicoVisitador) return
      setLoading(true)
      try {
        const filters: string[] = []

        // Filtro por texto livre na busca geral
        if (debouncedGeneralSearch.trim()) {
          const q = debouncedGeneralSearch.trim().replace(/"/g, '\\"')
          filters.push(`(paciente_nome ~ "${q}" || medico_prescritor ~ "${q}" || numero ~ "${q}")`)
        }

        // Filtro por paciente se informado na consulta combinada
        if (hasExecutedMedCheck && activeCheckPatient.trim()) {
          const qPat = activeCheckPatient.trim().replace(/"/g, '\\"')
          filters.push(`paciente_nome ~ "${qPat}"`)
        }

        const filterString = filters.join(' && ')

        const resultList = await pb
          .collection('prescricoes_sync')
          .getList<PrescricaoSyncRecord>(pageToLoad, pageSize, {
            filter: filterString || undefined,
            sort: '-data_inicial_iso,-created',
            requestKey: null,
          })

        setPrescriptions(resultList.items)
        setTotalCount(resultList.totalItems)
        setTotalPages(resultList.totalPages || 1)
        setCurrentPage(pageToLoad)
      } catch (err: unknown) {
        console.error('Erro ao buscar prescricoes_sync no banco local:', err)
        toast({
          title: 'Erro ao carregar prescrições locais',
          description: getErrorMessage(err) || 'Verifique sua conexão.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [isMedicoVisitador, debouncedGeneralSearch, hasExecutedMedCheck, activeCheckPatient, toast],
  )

  useEffect(() => {
    checkSyncStatus()
  }, [checkSyncStatus])

  useEffect(() => {
    loadLocalPrescriptions(1)
  }, [loadLocalPrescriptions])

  // Disparo manual do CDC (Admin e Corpo Clínico)
  const handleTriggerSync = async () => {
    setSyncing(true)
    try {
      const res = await triggerPrescriptionsSync()
      if (res.alreadyRunning) {
        toast({
          title: 'Sincronização em andamento',
          description: res.message || 'Aguarde a replicação em execução.',
        })
      } else {
        toast({
          title: 'Replicação concluída com sucesso',
          description: `Buscadas: ${res.totalFetched} | Criadas: ${res.created} | Atualizadas: ${res.updated} em ${Math.round(res.durationMs / 1000)}s`,
        })
        setLastSyncedAt(res.syncedAt)
        checkSyncStatus()
        loadLocalPrescriptions(1)
      }
    } catch (err: unknown) {
      console.error('Erro ao disparar sincronização manual:', err)
      toast({
        title: 'Falha na sincronização',
        description: getErrorMessage(err) || 'Não foi possível rodar o sincronizador agora.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  // Handler da busca combinada de medicamento
  const handleExecuteCombinedSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const targetMed = medQuery.trim()
    if (!targetMed) {
      toast({
        title: 'Nome do medicamento obrigatório',
        description: 'Digite o nome do medicamento para verificar as prescrições.',
        variant: 'destructive',
      })
      return
    }

    setActiveCheckMed(targetMed)
    setActiveCheckPatient(patientQuery.trim())
    setActiveCheckStart(startDate.trim() || '2026-01-01')
    setActiveCheckEnd(endDate.trim() || hojeIso)
    setHasExecutedMedCheck(true)
  }

  const handleClearCombinedSearch = () => {
    setMedQuery('')
    setPatientQuery('')
    setStartDate('2026-01-01')
    setEndDate(hojeIso)
    setActiveCheckMed('')
    setActiveCheckPatient('')
    setActiveCheckStart('2026-01-01')
    setActiveCheckEnd(hojeIso)
    setHasExecutedMedCheck(false)
  }

  // Avaliação combinada das prescrições carregadas
  interface OccurrenceItem {
    presc: PrescricaoSyncRecord
    item: SpincarePrescriptionItem
  }

  const combinedOccurrences = useMemo(() => {
    if (!hasExecutedMedCheck || !activeCheckMed.trim()) return null

    const qMed = normalize(activeCheckMed)
    const medWords = qMed.split(' ').filter((w) => w.length > 1)
    const qPatient = activeCheckPatient ? normalize(activeCheckPatient) : ''
    const patWords = qPatient.split(' ').filter(Boolean)
    const startComp = parseDateToComparable(activeCheckStart)
    const endComp = parseDateToComparable(activeCheckEnd)

    const occurrences: OccurrenceItem[] = []
    const matchingPrescriptionIds = new Set<string>()

    prescriptions.forEach((p) => {
      // 1. Filtro estrito de paciente (se informado)
      if (patWords.length > 0) {
        const pNome = normalize(p.paciente_nome)
        const matchWords = patWords.every((w) => pNome.includes(w))
        if (!matchWords) return
      }

      // 2. Filtro de período (critério estrito do SpinCare):
      // No SpinCare, a busca por período de prescrições avalia a data de término (vigência final)
      // convertida no fuso horário local America/Sao_Paulo (UTC-3).
      // Uma prescrição com início 01/01/2026 e término escalonado mensal só pertence ao período em que
      // ela expira / tem seu vencimento (ex.: data_final_iso "2026-10-01T03:59:00Z" expira em 30/09/2026 23:59).
      // Casos sem data final recaem na data inicial ou de prescrição.
      const pDateInit =
        parseDateToComparable(p.data_inicial_iso) ||
        parseDateToComparable(p.data_inicial) ||
        parseDateToComparable(p.data_prescricao)
      const pDateEnd =
        parseDateToComparable(p.data_final_iso) || parseDateToComparable(p.data_final)

      let inPeriod = false
      if (startComp === null && endComp === null) {
        inPeriod = true
      } else if (pDateEnd !== null) {
        // Se possui data final, o critério SpinCare exige que a data de término caia DENTRO do período
        // (expiração no período). Caso a busca tenha apenas início ou apenas fim, valida os limites.
        const endAfterOrAtStart = startComp === null || pDateEnd >= startComp
        const endBeforeOrAtEnd = endComp === null || pDateEnd <= endComp
        inPeriod = endAfterOrAtStart && endBeforeOrAtEnd
      } else if (pDateInit !== null) {
        // Fallback para prescrições sem data final explícita: data inicial dentro do período
        const initAfterOrAtStart = startComp === null || pDateInit >= startComp
        const initBeforeOrAtEnd = endComp === null || pDateInit <= endComp
        inPeriod = initAfterOrAtStart && initBeforeOrAtEnd
      }

      if (!inPeriod && (startComp !== null || endComp !== null)) return

      // 3. Verificação dos itens da prescrição com o medicamento
      const itensArr = Array.isArray(p.itens) ? p.itens : []
      itensArr.forEach((it) => {
        const desc = normalize(it.descricao)
        let isMatch = desc.includes(qMed) || qMed.includes(desc)
        if (!isMatch && medWords.length > 0 && medWords.every((w) => desc.includes(w))) {
          isMatch = true
        }
        if (
          !isMatch &&
          qMed.includes('INSULINA') &&
          (desc.includes('LANTUS') ||
            desc.includes('GLARGINA') ||
            desc.includes('TRESIBA') ||
            desc.includes('NOVORAPID') ||
            desc.includes('HUMALOG') ||
            desc.includes('NPH') ||
            desc.includes('REGULAR') ||
            desc.includes('DEGLUDECA') ||
            desc.includes('LISPRO') ||
            desc.includes('ASPART'))
        ) {
          isMatch = true
        }

        if (isMatch) {
          occurrences.push({ presc: p, item: it })
          matchingPrescriptionIds.add(p.id)
        }
      })
    })

    const uniquePatients = Array.from(new Set(occurrences.map((o) => o.presc.paciente_nome)))
    const uniquePrescriptions = prescriptions.filter((p) => matchingPrescriptionIds.has(p.id))

    return {
      queryMed: activeCheckMed,
      queryPatient: activeCheckPatient,
      startDate: activeCheckStart,
      endDate: activeCheckEnd,
      occurrences,
      uniquePatients,
      uniquePrescriptions,
    }
  }, [
    hasExecutedMedCheck,
    activeCheckMed,
    activeCheckPatient,
    activeCheckStart,
    activeCheckEnd,
    prescriptions,
  ])

  // Total de itens somados na visão atual
  const totalItensPrescritos = prescriptions.reduce((acc, p) => acc + (p.total_itens || 0), 0)

  // Formatação amigável de data
  const formatIsoToBr = (isoDate: string) => {
    if (!isoDate) return ''
    if (isoDate.includes('/')) return isoDate
    const parts = isoDate.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return isoDate
  }

  // Formatação amigável de data/hora para o lastSyncedAt
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

  // Bloqueio do médico visitador
  if (isMedicoVisitador) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito ao Perfil</h2>
        <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
          Em conformidade com a LGPD e as diretrizes da Help Vida, o perfil{' '}
          <strong>Médico Visitador</strong> tem acesso exclusivo ao catálogo de medicamentos
          padronizados, não possuindo autorização para consultar prescrições médicas de pacientes.
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
              <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6 text-[#0D8272] shrink-0" />
              <span>Prescrições Médicas — SpinCare</span>
            </h2>
            <Badge className="bg-[#E6F5F2] text-[#0C4336] border-[#0D8272]/30 text-[10px] font-bold flex items-center gap-1">
              <Database size={11} className="text-[#0D8272]" />
              Banco Local (2026+)
            </Badge>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-snug">
            Replicação local ultrarrápida das prescrições a partir de 01/01/2026 com payload
            completo da API SpinCare.
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
                Replicadas no banco: <strong>{totalReplicated || totalCount}</strong>
              </span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">Cron automático diário agendado (03:00)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
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

      {/* 3. AVISO LGPD DISCRETO */}
      <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="h-4 w-4 text-[#0D8272] shrink-0" />
          <span>
            <strong>Trilha de Auditoria (LGPD):</strong> Replicação e consultas são registradas sem
            dados clínicos sensíveis (somente referências de IDs e métricas).
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">
          DPO: Fernando Fernandes
        </span>
      </div>

      {/* 4. FORMULÁRIO DE CONSULTA COMBINADA */}
      <Card className="border-blue-200/90 bg-blue-50/50 shadow-xs">
        <CardContent className="p-3.5 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <Pill size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-blue-950 flex items-center gap-1.5">
                  <span>Consulta de Medicamento Prescrito</span>
                </h3>
                <p className="text-[11px] text-blue-800/80">
                  Verifica no banco local se o paciente possui o medicamento prescrito no período
                  informado.
                </p>
              </div>
            </div>

            {hasExecutedMedCheck && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearCombinedSearch}
                className="h-9 text-xs border-blue-300 text-blue-900 rounded-xl px-3 bg-white hover:bg-blue-100 flex items-center"
              >
                <X size={14} className="mr-1 text-blue-700" />
                <span>Limpar Consulta</span>
              </Button>
            )}
          </div>

          <form onSubmit={handleExecuteCombinedSearch} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Medicamento */}
              <div className="md:col-span-4 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Pill size={13} className="text-blue-600" />
                  <span>Nome do Medicamento *</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
                  <Input
                    type="text"
                    required
                    placeholder="Ex: Dipirona, Enoxaparina, Omeprazol..."
                    value={medQuery}
                    onChange={(e) => setMedQuery(e.target.value)}
                    className="h-11 pl-9 text-base sm:text-xs bg-white border-blue-200 rounded-xl focus-visible:ring-blue-600 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Paciente */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <User size={13} className="text-[#0D8272]" />
                  <span>Nome do Paciente</span>
                  <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                </label>
                <Input
                  type="text"
                  placeholder="Ex: Agrinaldo, Maria..."
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                  className="h-11 text-base sm:text-xs bg-white border-blue-200 rounded-xl focus-visible:ring-blue-600 min-h-[44px]"
                />
              </div>

              {/* Data Inicial */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Calendar size={13} className="text-[#0D8272]" />
                  <span>Data Inicial</span>
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 text-base sm:text-xs bg-white border-blue-200 rounded-xl font-mono min-h-[44px]"
                />
              </div>

              {/* Data Final */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Calendar size={13} className="text-[#0D8272]" />
                  <span>Data Final</span>
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 text-base sm:text-xs bg-white border-blue-200 rounded-xl font-mono min-h-[44px]"
                />
              </div>

              {/* Botão Consultar */}
              <div className="md:col-span-1 flex items-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                  title="Executar Verificação"
                >
                  <Search size={15} className="shrink-0" />
                  <span className="md:hidden">Consultar</span>
                </Button>
              </div>
            </div>
          </form>

          {/* Resultado da verificação combinada */}
          {hasExecutedMedCheck && combinedOccurrences && (
            <div className="pt-2">
              {combinedOccurrences.occurrences.length > 0 ? (
                <div className="p-3.5 rounded-xl bg-white border border-emerald-300 text-xs space-y-2.5 shadow-2xs">
                  <div className="flex items-start gap-2 text-emerald-950 font-bold">
                    <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm text-emerald-900 leading-snug">
                        Encontrada{combinedOccurrences.occurrences.length === 1 ? '' : 's'}{' '}
                        <strong>{combinedOccurrences.occurrences.length}</strong> ocorrência
                        {combinedOccurrences.occurrences.length === 1 ? '' : 's'} em{' '}
                        <strong>{combinedOccurrences.uniquePrescriptions.length}</strong> prescriç
                        {combinedOccurrences.uniquePrescriptions.length === 1 ? 'ão' : 'ões'} com o
                        medicamento <strong>&quot;{combinedOccurrences.queryMed}&quot;</strong>
                        {combinedOccurrences.queryPatient ? (
                          <>
                            {' '}
                            para o paciente{' '}
                            <strong>&quot;{combinedOccurrences.queryPatient}&quot;</strong>
                          </>
                        ) : (
                          <>
                            {' '}
                            em <strong>{combinedOccurrences.uniquePatients.length}</strong>{' '}
                            paciente(s)
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
                        const prescKey = occ.presc.id || String(occ.presc.numero)
                        const isExpanded = !!expandedPrescriptionIds[prescKey]
                        const allItens = Array.isArray(occ.presc.itens) ? occ.presc.itens : []
                        const dataFimFormatada = occ.presc.data_final_iso
                          ? formatIsoToBrTz(occ.presc.data_final_iso)
                          : occ.presc.data_final || '—'
                        const dataIniFormatada = occ.presc.data_inicial_iso
                          ? formatIsoToBrTz(occ.presc.data_inicial_iso)
                          : occ.presc.data_inicial || '—'

                        return (
                          <div
                            key={idx}
                            className="rounded-xl bg-emerald-50/60 border border-emerald-200 transition overflow-hidden shadow-2xs"
                          >
                            {/* Cabeçalho do Card da Ocorrência */}
                            <div
                              onClick={() => togglePrescriptionExpanded(prescKey)}
                              className="p-3 hover:bg-emerald-100/50 cursor-pointer space-y-1.5 transition select-none"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 min-w-0">
                                  <Pill size={14} className="text-emerald-700 shrink-0" />
                                  <span className="truncate">{occ.item.descricao}</span>
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge className="bg-white text-emerald-800 border-emerald-300 text-[10px] font-bold">
                                    Prescrição #{occ.presc.numero}
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => togglePrescriptionExpanded(prescKey, e)}
                                    className="h-7 w-7 p-0 text-emerald-800 hover:bg-emerald-200/60 rounded-lg"
                                    title={
                                      isExpanded
                                        ? 'Recolher detalhes'
                                        : 'Expandir e detalhar prescrição'
                                    }
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
                                    {occ.presc.paciente_nome}
                                  </strong>
                                </div>
                                <div>
                                  Médico(a):{' '}
                                  <strong className="text-slate-900">
                                    {occ.presc.medico_prescritor || 'Não informado'}
                                  </strong>
                                </div>
                                <div>
                                  Vigência:{' '}
                                  <strong>
                                    {dataIniFormatada} até {dataFimFormatada}
                                  </strong>
                                </div>
                                <div>
                                  Posologia:{' '}
                                  <strong>
                                    {occ.item.posologia || occ.item.dose || 'Conforme prescrição'}
                                  </strong>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1 text-[10px] text-emerald-900/80">
                                <span className="flex items-center gap-1">
                                  <span>
                                    Status: <strong>{occ.presc.status || 'Liberada'}</strong>
                                  </span>
                                  <span>•</span>
                                  <span>
                                    Total de itens:{' '}
                                    <strong>{allItens.length || occ.presc.total_itens || 1}</strong>
                                  </span>
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

                            {/* Detalhamento Expandido da Prescrição com Todos os Itens */}
                            {isExpanded && (
                              <div className="p-3 sm:p-4 bg-white border-t border-emerald-200/80 space-y-3">
                                {/* Informações Gerais da Prescrição */}
                                <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 text-xs space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-950/10 pb-2">
                                    <div className="flex items-center gap-2">
                                      <FileSpreadsheet className="h-4 w-4 text-[#0D8272]" />
                                      <span className="font-bold text-[#0C4336] text-xs sm:text-sm">
                                        Prescrição Médica #{occ.presc.numero}
                                      </span>
                                      <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold">
                                        {occ.presc.status || 'Liberada'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedPrescription(occ.presc)
                                          setViewPayloadJson(false)
                                          setDetailModalOpen(true)
                                        }}
                                        className="h-7 text-[11px] border-emerald-300 text-emerald-900 hover:bg-emerald-50 rounded-lg px-2"
                                      >
                                        Abrir em Modal
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Paciente
                                      </span>
                                      <span className="font-bold text-slate-900">
                                        {occ.presc.paciente_nome}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Médico(a) Prescritor(a)
                                      </span>
                                      <span className="font-bold text-[#0C4336]">
                                        {occ.presc.medico_prescritor || '—'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Data da Prescrição
                                      </span>
                                      <span className="font-semibold text-slate-800">
                                        {occ.presc.data_prescricao || '—'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                        Vigência (Início e Fim)
                                      </span>
                                      <span className="font-semibold text-slate-800">
                                        {dataIniFormatada} até {dataFimFormatada}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Lista Completa de Itens da Prescrição */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                      <Pill size={13} className="text-emerald-700" />
                                      <span>Itens Prescritos ({allItens.length})</span>
                                    </h4>
                                    <span className="text-[11px] text-slate-400">
                                      Fonte: campo itens/payload da prescrição #{occ.presc.numero}
                                    </span>
                                  </div>

                                  {allItens.length > 0 ? (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                                            <tr>
                                              <th className="p-2.5 w-10 text-center">#</th>
                                              <th className="p-2.5">Medicamento / Descrição</th>
                                              <th className="p-2.5">Dose</th>
                                              <th className="p-2.5">Via</th>
                                              <th className="p-2.5">Frequência / Posologia</th>
                                              <th className="p-2.5">Quantidade</th>
                                              <th className="p-2.5">Observação</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {allItens.map((it, itemIdx) => {
                                              const isSearchedItem =
                                                normalize(it.descricao).includes(
                                                  normalize(activeCheckMed),
                                                ) ||
                                                (normalize(activeCheckMed).includes('INSULINA') &&
                                                  (normalize(it.descricao).includes('LANTUS') ||
                                                    normalize(it.descricao).includes('GLARGINA')))

                                              return (
                                                <tr
                                                  key={itemIdx}
                                                  className={`hover:bg-slate-50 transition ${
                                                    isSearchedItem
                                                      ? 'bg-amber-50/70 font-medium'
                                                      : ''
                                                  }`}
                                                >
                                                  <td className="p-2.5 text-center text-slate-400 font-mono text-[10px]">
                                                    {itemIdx + 1}
                                                  </td>
                                                  <td className="p-2.5 text-slate-900 font-semibold">
                                                    <div className="flex items-center gap-1.5">
                                                      <span>{it.descricao}</span>
                                                      {isSearchedItem && (
                                                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[9px] font-bold">
                                                          Buscado
                                                        </Badge>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="p-2.5 text-slate-700 whitespace-nowrap">
                                                    {it.dose || '—'}
                                                  </td>
                                                  <td className="p-2.5 text-slate-700 whitespace-nowrap">
                                                    {it.viaAdministracao || '—'}
                                                  </td>
                                                  <td className="p-2.5 text-slate-700">
                                                    {it.posologia || '—'}
                                                  </td>
                                                  <td className="p-2.5 text-slate-700 whitespace-nowrap font-mono text-[11px]">
                                                    {it.quantidade
                                                      ? `${it.quantidade} ${it.unidade || ''}`.trim()
                                                      : '—'}
                                                  </td>
                                                  <td className="p-2.5 text-slate-500 text-[11px] italic max-w-xs break-words">
                                                    {it.observacao || '—'}
                                                  </td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                                      Nenhum item discriminado na prescrição.
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
                      Nenhuma prescrição com esse medicamento localizada
                    </span>
                    <span className="text-[11px] text-amber-900 leading-relaxed block mt-0.5">
                      No período de <strong>{formatIsoToBr(combinedOccurrences.startDate)}</strong>{' '}
                      até <strong>{formatIsoToBr(combinedOccurrences.endDate)}</strong>,{' '}
                      {combinedOccurrences.queryPatient ? (
                        <>
                          o paciente <strong>&quot;{combinedOccurrences.queryPatient}&quot;</strong>{' '}
                          NÃO possui o medicamento{' '}
                          <strong>&quot;{combinedOccurrences.queryMed}&quot;</strong> prescrito.
                        </>
                      ) : (
                        <>
                          nenhum paciente registrado possui o medicamento{' '}
                          <strong>&quot;{combinedOccurrences.queryMed}&quot;</strong> prescrito.
                        </>
                      )}
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
                placeholder="Buscar por paciente, médico prescritor ou número da prescrição..."
                value={generalSearch}
                onChange={(e) => setGeneralSearch(e.target.value)}
                className="h-11 sm:h-10 pl-9 text-base sm:text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272] min-h-[44px]"
              />
            </div>

            {(generalSearch || hasExecutedMedCheck) && (
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

      {/* 6. LISTAGEM DAS PRESCRIÇÕES DO BANCO LOCAL */}
      {loading ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
            <p className="text-xs font-medium text-slate-600">
              Carregando prescrições do banco local...
            </p>
          </CardContent>
        </Card>
      ) : prescriptions.length === 0 ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-12 text-center text-slate-400 space-y-3">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">
              Nenhuma prescrição encontrada no banco local
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              {totalReplicated === 0
                ? 'O banco local ainda não foi sincronizado com as prescrições de 2026. Clique em "Sincronizar agora" acima para replicar.'
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  Medicamentos nesta Página
                </p>
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">{totalItensPrescritos}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <Pill size={18} />
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

          {/* Cards de Prescrições */}
          <div className="space-y-2.5">
            {prescriptions.map((p) => {
              const itensList = Array.isArray(p.itens) ? p.itens : []
              return (
                <Card
                  key={p.id}
                  onClick={() => {
                    setSelectedPrescription(p)
                    setViewPayloadJson(false)
                    setDetailModalOpen(true)
                  }}
                  className="border-emerald-950/10 bg-white hover:border-[#0D8272]/50 hover:shadow-md transition-all cursor-pointer rounded-2xl group"
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-[#0D8272] group-hover:text-white transition-colors">
                        <FileSpreadsheet size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            Prescrição #{p.numero}
                          </span>
                          <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold">
                            {p.status || 'Liberada'}
                          </Badge>
                          <span className="text-[10px] text-slate-400 font-mono">
                            SpinCare ID: {p.spincare_id}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[#0C4336] truncate mt-0.5">
                          Paciente: {p.paciente_nome}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Stethoscope size={11} className="text-[#0D8272]" />
                            Médico:{' '}
                            <strong className="text-slate-700">{p.medico_prescritor}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            Vigência:{' '}
                            <strong className="text-slate-700">
                              {p.data_inicial || p.data_prescricao}
                            </strong>
                          </span>
                          {itensList.length > 0 && (
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-normal">
                              <Pill size={10} className="mr-1 text-blue-600" />
                              {itensList.length}{' '}
                              {itensList.length === 1 ? 'medicamento' : 'medicamentos'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Itens
                        </span>
                        <span className="text-sm font-bold text-[#0C4336] font-mono">
                          {p.total_itens || itensList.length} item(ns)
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

          {/* Paginação Server-Side */}
          {totalPages > 1 && (
            <div className="p-4 rounded-2xl bg-white border border-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 text-center sm:text-left">
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({totalCount}{' '}
                prescrições no total)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => loadLocalPrescriptions(1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsLeft size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => loadLocalPrescriptions(currentPage - 1)}
                  className="h-8 px-2.5 text-xs flex items-center gap-1"
                >
                  <ChevronLeft size={14} />
                  <span>Anterior</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => loadLocalPrescriptions(currentPage + 1)}
                  className="h-8 px-2.5 text-xs flex items-center gap-1"
                >
                  <span>Próxima</span>
                  <ChevronRight size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => loadLocalPrescriptions(totalPages)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. MODAL DETALHE DA PRESCRIÇÃO COM PAYLOAD CRU (TODOS OS CAMPOS) */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl w-[96vw] sm:w-full p-3 sm:p-6 rounded-2xl bg-white max-h-[94vh] sm:max-h-[92vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-emerald-950/10 shrink-0 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pr-1">
                <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2 truncate">
                  <FileSpreadsheet className="h-5 w-5 text-[#0D8272] shrink-0" />
                  <span>Prescrição #{selectedPrescription?.numero}</span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-slate-500 pt-0.5 truncate">
                  ID SpinCare: {selectedPrescription?.spincare_id} | Sincronizado em:{' '}
                  {formatDateTimeBr(selectedPrescription?.synced_at || '')}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewPayloadJson(!viewPayloadJson)}
                  className="h-7 text-[10px] font-bold text-slate-600 hover:text-[#0C4336] flex items-center gap-1 px-2 rounded-lg"
                >
                  <Code2 size={12} />
                  <span>{viewPayloadJson ? 'Ver Formatado' : 'Ver Payload Cru'}</span>
                </Button>
                <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold">
                  {selectedPrescription?.status || 'Liberada'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-1 sm:pr-2 space-y-3 py-3">
            {viewPayloadJson ? (
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Payload JSON Completo da API SpinCare (Todos os Campos):
                </span>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-[60vh] select-text">
                  {JSON.stringify(selectedPrescription?.payload || {}, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 sm:p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">
                      Paciente:
                    </span>
                    <span className="font-bold text-slate-900 text-sm sm:text-base break-words">
                      {selectedPrescription?.paciente_nome || '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-emerald-950/10">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Médico Prescritor:</span>
                      <span className="font-bold text-[#0C4336] break-words">
                        {selectedPrescription?.medico_prescritor || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Data da Prescrição:</span>
                      <span className="font-semibold text-slate-800">
                        {selectedPrescription?.data_prescricao || '—'}
                      </span>
                    </div>
                    {selectedPrescription?.data_inicial && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">Início Vigência:</span>
                        <span className="font-semibold text-slate-700">
                          {selectedPrescription.data_inicial}
                        </span>
                      </div>
                    )}
                    {selectedPrescription?.data_final && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">Fim Vigência:</span>
                        <span className="font-semibold text-slate-700">
                          {selectedPrescription.data_final}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Itens */}
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Medicamentos e Itens Prescritos (
                    {selectedPrescription?.itens ? selectedPrescription.itens.length : 0}):
                  </span>

                  {selectedPrescription?.itens && selectedPrescription.itens.length > 0 ? (
                    <div className="space-y-2">
                      {selectedPrescription.itens.map((it, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 sm:p-3 rounded-xl border border-emerald-950/10 bg-white hover:bg-slate-50 transition space-y-1.5 text-xs shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="h-5 w-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono mt-0.5">
                                {idx + 1}
                              </span>
                              <p className="font-bold text-slate-900 break-words leading-snug">
                                {it.descricao}
                              </p>
                            </div>
                            {it.quantidade ? (
                              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] shrink-0 font-mono">
                                Qtd: {it.quantidade} {it.unidade || ''}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-7 text-[11px] text-slate-600">
                            {it.posologia && (
                              <div className="break-words">
                                <span className="text-slate-400 font-medium">Posologia: </span>
                                <span className="font-semibold text-slate-800">{it.posologia}</span>
                              </div>
                            )}
                            {it.dose && (
                              <div>
                                <span className="text-slate-400 font-medium">Dose: </span>
                                <span className="font-semibold text-slate-800">{it.dose}</span>
                              </div>
                            )}
                            {it.viaAdministracao && (
                              <div>
                                <span className="text-slate-400 font-medium">Via: </span>
                                <span className="font-semibold text-slate-800">
                                  {it.viaAdministracao}
                                </span>
                              </div>
                            )}
                            {it.fornecimento && (
                              <div>
                                <span className="text-slate-400 font-medium">Fornecimento: </span>
                                <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[9px]">
                                  {it.fornecimento}
                                </Badge>
                              </div>
                            )}
                          </div>

                          {it.observacao && (
                            <p className="text-[11px] text-slate-500 italic pl-7 bg-[#F4FAF8] p-1.5 rounded-lg break-words">
                              &quot;{it.observacao}&quot;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400">
                      Nenhum item discriminado na prescrição.
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="pt-3 border-t border-emerald-950/10 shrink-0 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Banco Local Help Vida</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailModalOpen(false)}
              className="h-9 text-xs rounded-xl"
            >
              Fechar Detalhes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
