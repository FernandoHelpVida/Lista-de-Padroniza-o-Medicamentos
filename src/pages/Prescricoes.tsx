import React, { useState, useEffect, useMemo } from 'react'
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
  Filter,
  Pill,
  CheckCircle2,
  Settings,
  X,
  Stethoscope,
  Clock,
  Sparkles,
} from 'lucide-react'
import {
  getSpincarePrescriptions,
  checkSpincareMedicationPrescribed,
  type SpincarePrescription,
  type SpincarePrescriptionItem,
  type CheckMedicationResult,
} from '@/services/spincare'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { SpincareTabsNav } from '@/components/SpincareTabsNav'

export default function Prescricoes() {
  const { user, isAdmin, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Formulário de consulta combinada solicitada pelo usuário:
  // 1. Nome do medicamento (obrigatório para a verificação cruzada)
  // 2. Nome do paciente (opcional; se vazio, busca entre todos)
  // 3. Período: data inicial e data final (opcional; default 2026-01-01 até hoje)
  const hojeIso = useMemo(() => new Date().toISOString().split('T')[0], [])

  const [medQuery, setMedQuery] = useState('')
  const [patientQuery, setPatientQuery] = useState('')
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState(hojeIso)

  // Filtro de texto geral na listagem (médico, protocolo ou paciente adicional)
  const [generalSearch, setGeneralSearch] = useState('')
  const [debouncedGeneralSearch, setDebouncedGeneralSearch] = useState('')

  // Estado de execução da consulta combinada
  const [hasExecutedMedCheck, setHasExecutedMedCheck] = useState(false)
  const [activeCheckMed, setActiveCheckMed] = useState('')
  const [activeCheckPatient, setActiveCheckPatient] = useState('')
  const [activeCheckStart, setActiveCheckStart] = useState('2026-01-01')
  const [activeCheckEnd, setActiveCheckEnd] = useState(hojeIso)

  const [loading, setLoading] = useState(false)
  const [allPrescriptions, setAllPrescriptions] = useState<SpincarePrescription[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unconfigured, setUnconfigured] = useState(false)

  // Paginação progressiva na exibição (50 em 50 com Carregar Mais / Exibir Todos)
  const [displayLimit, setDisplayLimit] = useState(50)

  // Modal com detalhes da prescrição
  const [selectedPrescription, setSelectedPrescription] = useState<SpincarePrescription | null>(
    null,
  )
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGeneralSearch(generalSearch)
    }, 250)
    return () => clearTimeout(timer)
  }, [generalSearch])

  const handleFetchPrescriptions = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)
    setUnconfigured(false)
    setDisplayLimit(50)
    try {
      const res = await getSpincarePrescriptions({
        startDate: startDate.trim() || '2026-01-01',
        endDate: endDate.trim() || undefined,
        fetchAll: true,
      })
      const items = res.items || []
      setAllPrescriptions(items)
      setTotalCount(res.total || items.length)
    } catch (err: unknown) {
      console.error('Erro ao consultar prescrições no SpinCare:', err)
      const msg = getErrorMessage(err, 'Não foi possível consultar as prescrições no SpinCare.')
      if (msg.includes('ainda não foi configurada') || msg.includes('503')) {
        setUnconfigured(true)
      } else {
        toast({
          title: 'Erro na consulta de prescrições',
          description: msg,
          variant: 'destructive',
        })
      }
      setAllPrescriptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isMedicoVisitador) {
      handleFetchPrescriptions()
    }
  }, [isMedicoVisitador])

  // Normalizador tolerante (NFD, sem diacríticos, trim, uppercase)
  const normalize = (str: string) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()

  // Converte data dd/mm/aaaa ou yyyy-mm-dd para objeto Date ou string comparável yyyymmdd
  const parseDateToComparable = (dateStr: string): number | null => {
    if (!dateStr || dateStr === '—') return null
    const s = dateStr.trim().split(' ')[0]
    if (s.includes('/')) {
      const parts = s.split('/')
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0')
        const month = parts[1].padStart(2, '0')
        const year = parts[2]
        return parseInt(`${year}${month}${day}`, 10)
      }
    } else if (s.includes('-')) {
      const parts = s.split('-')
      if (parts.length === 3) {
        const year = parts[0]
        const month = parts[1].padStart(2, '0')
        const day = parts[2].padStart(2, '0')
        return parseInt(`${year}${month}${day}`, 10)
      }
    }
    return null
  }

  // Handler da busca combinada de medicamento
  const handleExecuteCombinedSearch = async (e?: React.FormEvent) => {
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

    const targetPatient = patientQuery.trim()
    const targetStart = startDate.trim() || '2026-01-01'
    const targetEnd = endDate.trim() || hojeIso

    setActiveCheckMed(targetMed)
    setActiveCheckPatient(targetPatient)
    setActiveCheckStart(targetStart)
    setActiveCheckEnd(targetEnd)
    setHasExecutedMedCheck(true)
    setDisplayLimit(50)
    setServerCheckLoading(true)

    try {
      const res = await checkSpincareMedicationPrescribed({
        medication: targetMed,
        patientName: targetPatient || undefined,
        startDate: targetStart,
        endDate: targetEnd,
      })
      setServerCheckResult(res)
    } catch (err: unknown) {
      console.warn('Falha na rota server-side de busca combinada, utilizando fallback:', err)
      setServerCheckResult(null)
    } finally {
      setServerCheckLoading(false)
    }
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
    setServerCheckResult(null)
    setHasExecutedMedCheck(false)
    setDisplayLimit(50)
  }

  // Estrutura de ocorrências combinadas detalhadas de medicamento
  interface OccurrenceItem {
    presc: SpincarePrescription
    item: SpincarePrescriptionItem
  }

  // Resultado direto da verificação combinada server-side (garante busca exaustiva)
  const [serverCheckResult, setServerCheckResult] = useState<CheckMedicationResult | null>(null)
  const [serverCheckLoading, setServerCheckLoading] = useState(false)

  // Cálculo das ocorrências combinadas
  // Se houver resultado do servidor, prioriza o resultado do servidor (que varreu todas as páginas de 100 até esgotar)
  const combinedSearchResults = useMemo(() => {
    if (!hasExecutedMedCheck || !activeCheckMed.trim()) return null

    // Se temos resultado da rota server-side dedicada:
    if (serverCheckResult) {
      // Regra de segurança estrita no cliente: mesmo em qualquer eventualidade,
      // se o usuário buscou por um paciente, NUNCA exibe ocorrências de outro paciente
      const normClientPat = activeCheckPatient ? normalize(activeCheckPatient) : ''
      const clientPatWords = normClientPat ? normClientPat.split(' ').filter(Boolean) : []

      const validRawOccurrences = serverCheckResult.occurrences.filter((occ) => {
        if (clientPatWords.length > 0) {
          const normOccPat = normalize(occ.pacienteNome)
          return clientPatWords.every((w) => normOccPat.includes(w))
        }
        return true
      })

      const occurrences: OccurrenceItem[] = validRawOccurrences.map((occ) => {
        // Encontra ou monta a prescrição
        const existing = allPrescriptions.find((p) => p.id === occ.prescricaoId)
        const presc: SpincarePrescription = existing || {
          id: occ.prescricaoId,
          numero: occ.prescricaoNumero,
          pacienteId: occ.pacienteId,
          pacienteNome: occ.pacienteNome,
          medicoPrescritor: occ.medicoPrescritor,
          dataPrescricao: occ.dataPrescricao,
          dataInicial: occ.dataInicial,
          dataFinal: occ.dataFinal,
          status: occ.status,
          itens: [
            {
              id: occ.item.id,
              codigo: occ.item.codigo,
              descricao: occ.item.descricao,
              posologia: occ.item.posologia || occ.item.dose,
              dose: occ.item.dose,
              viaAdministracao: occ.item.viaAdministracao,
              unidade: occ.item.unidade,
              quantidade: occ.item.quantidade,
              observacao: occ.item.observacao,
              fornecimento: occ.item.fornecimento,
            },
          ],
        }

        const item: SpincarePrescriptionItem = {
          id: occ.item.id,
          codigo: occ.item.codigo,
          descricao: occ.item.descricao,
          posologia: occ.item.posologia || occ.item.dose,
          dose: occ.item.dose,
          viaAdministracao: occ.item.viaAdministracao,
          unidade: occ.item.unidade,
          quantidade: occ.item.quantidade,
          observacao: occ.item.observacao,
          fornecimento: occ.item.fornecimento,
        }

        return { presc, item }
      })

      const uniquePatients = Array.from(new Set(occurrences.map((o) => o.presc.pacienteNome)))
      const matchingIds = new Set(occurrences.map((o) => o.presc.id))
      const uniquePrescriptions = occurrences
        .map((o) => o.presc)
        .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)

      return {
        queryMed: serverCheckResult.searchedMedication || activeCheckMed,
        queryPatient: serverCheckResult.searchedPatient || activeCheckPatient,
        startDate: serverCheckResult.startDate || activeCheckStart,
        endDate: serverCheckResult.endDate || activeCheckEnd,
        occurrences,
        uniquePatients,
        uniquePrescriptions,
        analyzedCount: serverCheckResult.analyzedPrescriptionsCount,
        isServerSide: true,
      }
    }

    // Fallback em memória sobre allPrescriptions com algoritmo tolerante NFD
    const qMed = normalize(activeCheckMed)
    const medWords = qMed.split(' ').filter((w) => w.length > 1)
    const qPatient = activeCheckPatient ? normalize(activeCheckPatient) : ''
    const patWords = qPatient.split(' ').filter(Boolean)
    const startComp = parseDateToComparable(activeCheckStart)
    const endComp = parseDateToComparable(activeCheckEnd)

    const occurrences: OccurrenceItem[] = []
    const matchingPrescriptionIds = new Set<string>()

    allPrescriptions.forEach((p) => {
      // 1. Filtro estrito de paciente (se informado) - todas as palavras do paciente devem estar presentes
      if (patWords.length > 0) {
        const pNome = normalize(p.pacienteNome)
        const matchWords = patWords.every((w) => pNome.includes(w))
        if (!matchWords) {
          return
        }
      }

      // 2. Filtro de período por datas de prescrição OU vigência cruzada
      // Vigência com prioridade: sobreposição do intervalo [dataInicial, dataFinal] com [startComp, endComp]
      const pDatePresc = parseDateToComparable(p.dataPrescricao)
      const pDateInit = parseDateToComparable(p.dataInicial)
      const pDateFinal = parseDateToComparable(p.dataFinal)

      let inPeriod = false

      // A: Se tem datas de vigência inicial e final, verifica sobreposição de intervalos
      if (pDateInit !== null && pDateFinal !== null) {
        if (
          (endComp === null || pDateInit <= endComp) &&
          (startComp === null || pDateFinal >= startComp)
        ) {
          inPeriod = true
        }
      } else if (pDateInit !== null) {
        if (
          (startComp === null || pDateInit >= startComp) &&
          (endComp === null || pDateInit <= endComp)
        ) {
          inPeriod = true
        }
      } else if (pDateFinal !== null) {
        if (
          (startComp === null || pDateFinal >= startComp) &&
          (endComp === null || pDateFinal <= endComp)
        ) {
          inPeriod = true
        }
      }

      // B: Data de prescrição/emissão dentro do período
      if (!inPeriod && pDatePresc !== null) {
        if (
          (startComp === null || pDatePresc >= startComp) &&
          (endComp === null || pDatePresc <= endComp)
        ) {
          inPeriod = true
        }
      }

      if (!inPeriod && (startComp !== null || endComp !== null)) {
        return
      }

      // 3. Verificação dos itens da prescrição com o medicamento
      p.itens.forEach((it) => {
        const desc = normalize(it.descricao)
        let isMatch = desc.includes(qMed) || qMed.includes(desc)
        if (!isMatch && medWords.length > 0 && medWords.every((w) => desc.includes(w))) {
          isMatch = true
        }
        if (
          !isMatch &&
          qMed.includes('insulina') &&
          (desc.includes('lantus') ||
            desc.includes('glargina') ||
            desc.includes('tresiba') ||
            desc.includes('novorapid') ||
            desc.includes('humalog') ||
            desc.includes('nph') ||
            desc.includes('regular') ||
            desc.includes('degludeca') ||
            desc.includes('lispro') ||
            desc.includes('aspart'))
        ) {
          isMatch = true
        }

        if (isMatch) {
          occurrences.push({ presc: p, item: it })
          matchingPrescriptionIds.add(p.id)
        }
      })
    })

    const uniquePatients = Array.from(new Set(occurrences.map((o) => o.presc.pacienteNome)))
    const uniquePrescriptions = allPrescriptions.filter((p) => matchingPrescriptionIds.has(p.id))

    return {
      queryMed: activeCheckMed,
      queryPatient: activeCheckPatient,
      startDate: activeCheckStart,
      endDate: activeCheckEnd,
      occurrences,
      uniquePatients,
      uniquePrescriptions,
      analyzedCount: allPrescriptions.length,
      isServerSide: false,
    }
  }, [
    hasExecutedMedCheck,
    activeCheckMed,
    activeCheckPatient,
    activeCheckStart,
    activeCheckEnd,
    serverCheckResult,
    allPrescriptions,
  ])

  // Prescrições filtradas para a listagem geral
  const prescriptions = useMemo(() => {
    let list = allPrescriptions

    // Se houver busca combinada ativa, limitamos às prescrições que bateram na busca
    if (hasExecutedMedCheck && combinedSearchResults) {
      list = combinedSearchResults.uniquePrescriptions
    }

    // Filtro adicional de texto livre (geral)
    if (debouncedGeneralSearch.trim()) {
      const q = normalize(debouncedGeneralSearch)
      list = list.filter((p) => {
        const pNome = normalize(p.pacienteNome)
        const med = normalize(p.medicoPrescritor)
        const num = normalize(p.numero)
        return pNome.includes(q) || med.includes(q) || num.includes(q)
      })
    }

    return list
  }, [allPrescriptions, hasExecutedMedCheck, combinedSearchResults, debouncedGeneralSearch])

  // Totalizador de itens prescritos somados na visão atual
  const totalItensPrescritos = prescriptions.reduce(
    (acc, p) => acc + (p.itens ? p.itens.length : 0),
    0,
  )

  // Itens visíveis com paginação progressiva
  const visiblePrescriptions = prescriptions.slice(0, displayLimit)
  const hasMore = displayLimit < prescriptions.length

  const handleLoadMore = () => {
    setDisplayLimit((prev) => prev + 50)
  }

  const handleShowAll = () => {
    setDisplayLimit(prescriptions.length)
  }

  // Formatação amigável de data DD/MM/AAAA para resumo
  const formatIsoToBr = (isoDate: string) => {
    if (!isoDate) return ''
    if (isoDate.includes('/')) return isoDate
    const parts = isoDate.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return isoDate
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

      {/* 2. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg sm:text-2xl font-bold text-[#0C4336] tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6 text-[#0D8272] shrink-0" />
              <span>Prescrições Médicas — SpinCare</span>
            </h2>
            <Badge className="bg-[#EBF3FF] text-[#1E40AF] border-[#93C5FD]/40 text-[10px] font-bold">
              2026 Ao Vivo
            </Badge>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug">
            Listagem completa de prescrições médicas com itens prescritos, médico prescritor e
            verificação cruzada de medicamentos.
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/configuracoes')}
            className="text-xs border-[#0D8272]/30 text-[#0C4336] hover:bg-[#E6F5F2] rounded-xl self-start sm:self-auto min-h-[44px] sm:min-h-0"
          >
            <Settings size={13} className="mr-1.5 text-[#0D8272]" />
            Configurar SpinCare
          </Button>
        )}
      </div>

      {/* 3. AVISO LGPD DISCRETO */}
      <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="h-4 w-4 text-[#0D8272] shrink-0" />
          <span>
            <strong>Trilha de Auditoria (LGPD):</strong> Consultas ao módulo de Prescrições Médicas
            são auditadas com identificação de usuário e data/hora. Apenas identificadores e
            quantidades são registrados.
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">
          DPO: Fernando Fernandes
        </span>
      </div>

      {/* 4. FORMULÁRIO DE CONSULTA COMBINADA (Requisito 2 do Usuário)
          "no período X a Y, o paciente de nome NOME já tem o medicamento M prescrito?"
          Campos: Nome do medicamento (obrigatório), Nome do paciente (opcional), Período (data inicial e final, opcional; default 2026-01-01 até hoje)
      */}
      <Card className="border-blue-200/90 bg-blue-50/50 shadow-xs">
        <CardContent className="p-3.5 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <Pill size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-blue-950 flex items-center gap-1.5">
                  <span>Consulta Combinada de Medicamento Prescrito</span>
                  <Badge className="bg-blue-100 text-blue-900 border-blue-300 text-[9px] font-bold">
                    Item 2
                  </Badge>
                </h3>
                <p className="text-[11px] text-blue-800/80">
                  Responde se no período X a Y o paciente já possui o medicamento prescrito.
                </p>
              </div>
            </div>

            {hasExecutedMedCheck && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearCombinedSearch}
                className="h-11 sm:h-8 text-xs border-blue-300 text-blue-900 rounded-xl px-3 self-start sm:self-auto min-h-[44px] sm:min-h-0 flex items-center bg-white hover:bg-blue-100"
              >
                <X size={14} className="mr-1 text-blue-700" />
                <span>Limpar Consulta</span>
              </Button>
            )}
          </div>

          <form onSubmit={handleExecuteCombinedSearch} className="space-y-3">
            {/* TRÊS CAMPOS: 1. Medicamento (obrigatório), 2. Paciente (opcional), 3. Período (inicial e final) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Campo 1: Nome do medicamento (obrigatório) */}
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

              {/* Campo 2: Nome do paciente (opcional; se vazio busca entre todos) */}
              <div className="md:col-span-3 space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <User size={13} className="text-[#0D8272]" />
                  <span>Nome do Paciente</span>
                  <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                </label>
                <Input
                  type="text"
                  placeholder="Ex: Agrinaldo Ovidio Candido..."
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                  className="h-11 text-base sm:text-xs bg-white border-blue-200 rounded-xl focus-visible:ring-blue-600 min-h-[44px]"
                />
              </div>

              {/* Campo 3A: Data Inicial */}
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

              {/* Campo 3B: Data Final */}
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

              {/* Botão de Ação: Verificar Prescrição */}
              <div className="md:col-span-1 flex items-end">
                <Button
                  type="submit"
                  disabled={loading || serverCheckLoading}
                  className="w-full h-11 min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                  title="Executar Verificação Combinada"
                >
                  {serverCheckLoading ? (
                    <Loader2 size={15} className="shrink-0 animate-spin" />
                  ) : (
                    <Search size={15} className="shrink-0" />
                  )}
                  <span className="md:hidden">Consultar</span>
                </Button>
              </div>
            </div>
          </form>

          {/* RESUMO CLARO NO TOPO COM AUDITORIA EXAUSTIVA */}
          {hasExecutedMedCheck &&
            (serverCheckLoading ? (
              <div className="p-4 rounded-xl bg-white border border-blue-200 text-xs flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 shrink-0" />
                <div className="text-blue-950">
                  <p className="font-bold">Realizando busca combinada exaustiva no SpinCare...</p>
                  <p className="text-[11px] text-blue-700">
                    Varrendo todas as páginas de prescrições do período no servidor para garantir
                    segurança total do paciente.
                  </p>
                </div>
              </div>
            ) : (
              combinedSearchResults && (
                <div className="pt-2">
                  {combinedSearchResults.occurrences.length > 0 ? (
                    <div className="p-3.5 rounded-xl bg-white border border-emerald-300 text-xs space-y-2.5 shadow-2xs">
                      <div className="flex items-start gap-2 text-emerald-950 font-bold">
                        <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs sm:text-sm text-emerald-900 leading-snug">
                            Encontrada{combinedSearchResults.occurrences.length === 1 ? '' : 's'}{' '}
                            <strong>{combinedSearchResults.occurrences.length}</strong> ocorrência
                            {combinedSearchResults.occurrences.length === 1 ? '' : 's'} em{' '}
                            <strong>{combinedSearchResults.uniquePrescriptions.length}</strong>{' '}
                            prescriç
                            {combinedSearchResults.uniquePrescriptions.length === 1
                              ? 'ão'
                              : 'ões'}{' '}
                            com o medicamento{' '}
                            <strong>&quot;{combinedSearchResults.queryMed}&quot;</strong>
                            {combinedSearchResults.queryPatient ? (
                              <>
                                {' '}
                                para o paciente{' '}
                                <strong>&quot;{combinedSearchResults.queryPatient}&quot;</strong>
                              </>
                            ) : (
                              <>
                                {' '}
                                em <strong>
                                  {combinedSearchResults.uniquePatients.length}
                                </strong>{' '}
                                paciente(s)
                              </>
                            )}{' '}
                            no período de{' '}
                            <strong>{formatIsoToBr(combinedSearchResults.startDate)}</strong> até{' '}
                            <strong>{formatIsoToBr(combinedSearchResults.endDate)}</strong>.
                          </p>
                          <p className="text-[11px] text-slate-500 font-normal mt-1 flex items-center gap-1.5 flex-wrap">
                            <span>
                              Analisadas exaustivamente{' '}
                              <strong>
                                {combinedSearchResults.analyzedCount.toLocaleString('pt-BR')}
                              </strong>{' '}
                              prescrições do período.
                            </span>
                            <span className="text-emerald-700 font-medium">
                              Veja abaixo os detalhes discriminados com dose, via e fornecimento
                              (F/P).
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* CARDS EMPILHADOS DAS OCORRÊNCIAS (Mobile-First) */}
                      <div className="space-y-2 pt-1 border-t border-emerald-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Ocorrências Discriminadas do Medicamento:
                        </span>
                        <div className="grid grid-cols-1 gap-2">
                          {combinedSearchResults.occurrences.map((occ, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setSelectedPrescription(occ.presc)
                                setDetailModalOpen(true)
                              }}
                              className="p-3 rounded-xl bg-emerald-50/50 hover:bg-emerald-100/50 border border-emerald-200 transition cursor-pointer space-y-1.5"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="h-5 w-5 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">
                                    {idx + 1}
                                  </span>
                                  <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                    {occ.item.descricao}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                                  <Badge className="bg-white text-emerald-800 border-emerald-300 text-[10px] font-bold">
                                    Prescrição #{occ.presc.numero}
                                  </Badge>
                                  <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px]">
                                    {occ.presc.status}
                                  </Badge>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-600">
                                <div>
                                  <span className="text-slate-400 block text-[10px]">
                                    Paciente:
                                  </span>
                                  <strong className="text-slate-900 break-words">
                                    {occ.presc.pacienteNome}
                                  </strong>
                                </div>

                                <div>
                                  <span className="text-slate-400 block text-[10px]">
                                    Data / Vigência:
                                  </span>
                                  <strong className="text-slate-800 block">
                                    {occ.presc.dataInicial &&
                                    occ.presc.dataFinal &&
                                    occ.presc.dataInicial !== '—' ? (
                                      <span>
                                        Vigência: {occ.presc.dataInicial} até {occ.presc.dataFinal}
                                      </span>
                                    ) : (
                                      <span>Data: {occ.presc.dataPrescricao}</span>
                                    )}
                                  </strong>
                                  {occ.presc.dataPrescricao &&
                                    occ.presc.dataPrescricao !== occ.presc.dataInicial && (
                                      <span className="text-[10px] text-slate-500 block">
                                        Emissão: {occ.presc.dataPrescricao}
                                      </span>
                                    )}
                                </div>

                                <div>
                                  <span className="text-slate-400 block text-[10px]">
                                    Médico Prescritor:
                                  </span>
                                  <strong className="text-[#0C4336] break-words">
                                    {occ.presc.medicoPrescritor}
                                  </strong>
                                </div>

                                <div>
                                  <span className="text-slate-400 block text-[10px]">
                                    Quantidade:
                                  </span>
                                  <strong className="text-slate-800 font-mono">
                                    {occ.item.quantidade || 1} {occ.item.unidade || ''}
                                  </strong>
                                </div>
                              </div>

                              {(occ.item.posologia ||
                                occ.item.viaAdministracao ||
                                occ.item.dose ||
                                (occ.item as unknown as { fornecimento?: string })
                                  .fornecimento) && (
                                <div className="pt-1 border-t border-emerald-200/60 flex flex-wrap items-center gap-3 text-[11px] text-slate-700">
                                  {occ.item.dose && (
                                    <span>
                                      <span className="text-slate-400 font-medium">Dose: </span>
                                      <strong className="text-emerald-900">
                                        {occ.item.dose} {occ.item.unidade || ''}
                                      </strong>
                                    </span>
                                  )}
                                  {occ.item.posologia && (
                                    <span>
                                      <span className="text-slate-400 font-medium">
                                        Posologia / Dose:{' '}
                                      </span>
                                      <strong>{occ.item.posologia}</strong>
                                    </span>
                                  )}
                                  {occ.item.viaAdministracao && (
                                    <span>
                                      <span className="text-slate-400 font-medium">Via: </span>
                                      <strong>{occ.item.viaAdministracao}</strong>
                                    </span>
                                  )}
                                  {occ.item.frequencia && (
                                    <span>
                                      <span className="text-slate-400 font-medium">
                                        Frequência:{' '}
                                      </span>
                                      <strong>{occ.item.frequencia}</strong>
                                    </span>
                                  )}
                                  {(occ.item as unknown as { fornecimento?: string })
                                    .fornecimento && (
                                    <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[10px] font-bold">
                                      F/P:{' '}
                                      {(occ.item as unknown as { fornecimento?: string })
                                        .fornecimento === 'e' ||
                                      (occ.item as unknown as { fornecimento?: string })
                                        .fornecimento === 'Empresa'
                                        ? 'Empresa'
                                        : (occ.item as unknown as { fornecimento?: string })
                                              .fornecimento === 'o' ||
                                            (occ.item as unknown as { fornecimento?: string })
                                              .fornecimento === 'Operadora'
                                          ? 'Operadora'
                                          : (occ.item as unknown as { fornecimento?: string })
                                              .fornecimento}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-white border border-amber-300 text-xs flex items-start gap-2.5 shadow-2xs">
                      <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-950 text-xs sm:text-sm block">
                          Nenhuma prescrição encontrada
                        </span>
                        <span className="text-[11px] text-amber-900 leading-relaxed block mt-0.5">
                          No período de{' '}
                          <strong>{formatIsoToBr(combinedSearchResults.startDate)}</strong> até{' '}
                          <strong>{formatIsoToBr(combinedSearchResults.endDate)}</strong>,{' '}
                          {combinedSearchResults.queryPatient ? (
                            <>
                              o paciente{' '}
                              <strong>&quot;{combinedSearchResults.queryPatient}&quot;</strong>{' '}
                              <strong>NÃO</strong> possui o medicamento{' '}
                              <strong>&quot;{combinedSearchResults.queryMed}&quot;</strong>{' '}
                              prescrito.
                            </>
                          ) : (
                            <>
                              nenhum paciente cadastrado possui o medicamento{' '}
                              <strong>&quot;{combinedSearchResults.queryMed}&quot;</strong>{' '}
                              prescrito.
                            </>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-1">
                          (Analisadas{' '}
                          <strong>
                            {combinedSearchResults.analyzedCount.toLocaleString('pt-BR')}
                          </strong>{' '}
                          prescrições no período).
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            ))}
        </CardContent>
      </Card>

      {/* 5. FILTRO COMPLEMENTAR E BUSCA RÁPIDA NA LISTAGEM */}
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardContent className="p-3.5 sm:p-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                type="search"
                placeholder="Filtrar listagem por nome do paciente, médico ou protocolo..."
                value={generalSearch}
                onChange={(e) => setGeneralSearch(e.target.value)}
                className="h-11 sm:h-10 pl-9 text-base sm:text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272] min-h-[44px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleFetchPrescriptions}
                disabled={loading}
                className="h-11 sm:h-10 min-h-[44px] bg-[#0F5342] hover:bg-[#0C4336] active:bg-[#082921] text-white text-xs font-bold rounded-xl shadow-xs px-4 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Atualizando...</span>
                  </>
                ) : (
                  <>
                    <Filter className="h-4 w-4 text-[#F5B31C]" />
                    <span>Atualizar Prescrições</span>
                  </>
                )}
              </Button>

              {(generalSearch || hasExecutedMedCheck) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGeneralSearch('')
                    handleClearCombinedSearch()
                  }}
                  className="h-11 sm:h-10 min-h-[44px] px-3.5 text-xs border-slate-200 rounded-xl"
                  title="Limpar todos os filtros"
                >
                  <X size={14} className="mr-1" />
                  <span>Limpar</span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6. RESULTADOS & CARDS DE PRESCRIÇÃO */}
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
                ? 'Configure a URL e as credenciais da API SpinCare para habilitar a consulta em tempo real de prescrições médicas.'
                : 'A integração com o SpinCare ainda não foi configurada pelo administrador da Help Vida.'}
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
            <p className="text-xs font-medium text-slate-600">
              Consultando prescrições médicas no SpinCare...
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Filtrando período a partir de 2026</p>
          </CardContent>
        </Card>
      ) : prescriptions.length === 0 ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-12 text-center text-slate-400 space-y-2">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">
              Nenhuma prescrição médica localizada
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Não constam prescrições cadastradas a partir de {startDate} com os critérios
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
                  Total de Prescrições
                </p>
                <p className="text-lg font-bold text-[#0C4336] mt-0.5">{prescriptions.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center font-bold">
                <FileSpreadsheet size={18} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-950/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Medicamentos Prescritos
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
                  Período Consultado
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

          {/* Lista de Prescrições */}
          <div className="space-y-2.5">
            {visiblePrescriptions.map((p) => (
              <Card
                key={p.id}
                onClick={() => {
                  setSelectedPrescription(p)
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
                          {p.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-[#0C4336] truncate mt-0.5">
                        Paciente: {p.pacienteNome}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Stethoscope size={11} className="text-[#0D8272]" />
                          Médico: <strong className="text-slate-700">{p.medicoPrescritor}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          Data: <strong className="text-slate-700">{p.dataPrescricao}</strong>
                        </span>
                        {p.itens && p.itens.length > 0 && (
                          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-normal">
                            <Pill size={10} className="mr-1 text-blue-600" />
                            {p.itens.length} {p.itens.length === 1 ? 'medicamento' : 'medicamentos'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Itens Prescritos
                      </span>
                      <span className="text-sm font-bold text-[#0C4336] font-mono">
                        {p.itens.length} item(ns)
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

          {/* Paginação progressiva */}
          {hasMore && (
            <div className="p-4 rounded-2xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 text-center sm:text-left">
                Mostrando <strong>{visiblePrescriptions.length}</strong> de{' '}
                <strong>{prescriptions.length}</strong> prescrições médicas
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
                  Exibir Todos ({prescriptions.length})
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. MODAL DETALHE DA PRESCRIÇÃO - OTIMIZADO PARA MOBILE */}
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
                  Dados do paciente, médico prescritor e itens no SpinCare
                </DialogDescription>
              </div>
              <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold shrink-0">
                {selectedPrescription?.status || 'Liberada'}
              </Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-1 sm:pr-2 space-y-3 sm:space-y-4 py-3">
            <div className="p-3 sm:p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">
                  Paciente:
                </span>
                <span className="font-bold text-slate-900 text-sm sm:text-base break-words">
                  {selectedPrescription?.pacienteNome || '—'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-emerald-950/10">
                <div>
                  <span className="text-slate-400 block text-[10px]">Médico Prescritor:</span>
                  <span className="font-bold text-[#0C4336] break-words">
                    {selectedPrescription?.medicoPrescritor || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Data da Prescrição:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedPrescription?.dataPrescricao || '—'}
                  </span>
                </div>
                {selectedPrescription?.dataInicial && selectedPrescription.dataInicial !== '—' && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Período Inicial:</span>
                    <span className="font-semibold text-slate-700">
                      {selectedPrescription.dataInicial}
                    </span>
                  </div>
                )}
                {selectedPrescription?.dataFinal && selectedPrescription.dataFinal !== '—' && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Período Final:</span>
                    <span className="font-semibold text-slate-700">
                      {selectedPrescription.dataFinal}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Itens e Medicamentos Prescritos */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Medicamentos & Insumos Prescritos (
                  {selectedPrescription?.itens ? selectedPrescription.itens.length : 0}):
                </span>
              </div>

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
                        {it.viaAdministracao && (
                          <div>
                            <span className="text-slate-400 font-medium">Via: </span>
                            <span className="font-semibold text-slate-800">
                              {it.viaAdministracao}
                            </span>
                          </div>
                        )}
                        {it.frequencia && (
                          <div>
                            <span className="text-slate-400 font-medium">Frequência: </span>
                            <span className="font-semibold text-slate-800">{it.frequencia}</span>
                          </div>
                        )}
                        {it.codigo && (
                          <div>
                            <span className="text-slate-400 font-medium font-mono">Código: </span>
                            <span className="font-mono text-slate-700">{it.codigo}</span>
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
                <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 space-y-1">
                  <Pill className="h-6 w-6 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">
                    Nenhum item discriminado na prescrição
                  </p>
                </div>
              )}
            </div>
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
