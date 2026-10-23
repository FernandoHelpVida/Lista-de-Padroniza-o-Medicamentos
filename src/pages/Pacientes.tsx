import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
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
  Search,
  Users,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building2,
  FileText,
  DollarSign,
  FileSpreadsheet,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ChevronRight,
  Filter,
  Sparkles,
  Settings,
  Pill,
  Layers,
  X,
} from 'lucide-react'
import {
  searchSpincarePatients,
  getSpincarePatientById,
  getSpincarePrescriptions,
  type SpincarePatient,
  type SpincareBudget,
  type SpincarePrescription,
} from '@/services/spincare'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { SpincareTabsNav } from '@/components/SpincareTabsNav'

export default function Pacientes() {
  const { user, isAdmin, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [searchNome, setSearchNome] = useState('')
  const [searchDoc, setSearchDoc] = useState('')
  const [selectedConvenio, setSelectedConvenio] = useState<string>('todos')
  const [selectedModalidade, setSelectedModalidade] = useState<string>('todas')

  const [serverConvenios, setServerConvenios] = useState<string[]>([])
  const [serverModalidades, setServerModalidades] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [patients, setPatients] = useState<SpincarePatient[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unconfigured, setUnconfigured] = useState(false)

  // Paginação no cliente para suportar 539+ pacientes com fluidez
  const [displayLimit, setDisplayLimit] = useState(50)

  // Ficha detalhada do paciente
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [patientDetail, setPatientDetail] = useState<SpincarePatient | null>(null)
  const [patientBudgets, setPatientBudgets] = useState<SpincareBudget[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  // Verificação de prescrições no modal do paciente
  const [patientPrescriptions, setPatientPrescriptions] = useState<SpincarePrescription[]>([])
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false)
  const [medCheckQuery, setMedCheckQuery] = useState('')

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)
    setHasSearched(true)
    setUnconfigured(false)
    setDisplayLimit(50)
    try {
      const res = await searchSpincarePatients({
        query: searchNome.trim(),
        documento: searchDoc.trim(),
        fetchAll: true,
      })
      const items = res.items || []
      setPatients(items)
      setTotalCount(res.total || items.length)
      if (res.convenios && res.convenios.length > 0) {
        setServerConvenios(res.convenios)
      }
      if (res.modalidades && res.modalidades.length > 0) {
        setServerModalidades(res.modalidades)
      }
    } catch (err: unknown) {
      console.error('Erro ao buscar pacientes no SpinCare:', err)
      const msg = getErrorMessage(err, 'Não foi possível consultar os pacientes no SpinCare.')
      if (msg.includes('ainda não foi configurada') || msg.includes('503')) {
        setUnconfigured(true)
      } else {
        toast({
          title: 'Erro na consulta ao SpinCare',
          description: msg,
          variant: 'destructive',
        })
      }
      setPatients([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenPatient = async (p: SpincarePatient) => {
    setSelectedPatientId(p.id)
    setPatientDetail(p)
    setDetailModalOpen(true)
    setLoadingDetail(true)
    setLoadingPrescriptions(true)
    setPatientPrescriptions([])
    setMedCheckQuery('')
    try {
      const [res, prescRes] = await Promise.allSettled([
        getSpincarePatientById(p.id),
        getSpincarePrescriptions({ patientId: p.id, startDate: '2026-01-01', fetchAll: true }),
      ])

      if (res.status === 'fulfilled') {
        if (res.value.patient) setPatientDetail(res.value.patient)
        setPatientBudgets(res.value.budgets || [])
      } else {
        console.warn('Erro ao carregar ficha completa do paciente:', res.reason)
      }

      if (prescRes.status === 'fulfilled') {
        setPatientPrescriptions(prescRes.value.items || [])
      } else {
        console.warn('Erro ao carregar prescrições do paciente:', prescRes.reason)
      }
    } catch (err: unknown) {
      console.warn('Erro ao carregar dados do paciente:', err)
    } finally {
      setLoadingDetail(false)
      setLoadingPrescriptions(false)
    }
  }

  // Busca inicial leve ao abrir a tela
  useEffect(() => {
    if (!isMedicoVisitador) {
      handleSearch()
    }
  }, [isMedicoVisitador])

  // Lista unificada e normalizada de convênios distintos encontrados nos resultados ou no servidor
  const conveniosOptions = useMemo(() => {
    const set = new Set<string>()
    // Prioriza lista completa enviada pelo backend
    serverConvenios.forEach((c) => {
      const clean = (c || '').trim()
      if (clean && clean !== '—') set.add(clean)
    })
    // Complementa com pacientes carregados
    patients.forEach((p) => {
      const conv = (p.convenio || '').trim()
      if (conv && conv !== '—') {
        set.add(conv)
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [serverConvenios, patients])

  // Lista unificada de modalidades distintas
  const modalidadesOptions = useMemo(() => {
    const set = new Set<string>()
    serverModalidades.forEach((m) => {
      const clean = (m || '').trim()
      if (clean && clean !== '—') set.add(clean)
    })
    patients.forEach((p) => {
      const mod = (p.modalidade || '').trim()
      if (mod && mod !== '—') {
        set.add(mod)
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [serverModalidades, patients])

  // Normalizador auxiliar para comparação insensível a acentos, espaços e maiúsculas
  const normalizeCompare = (str: string) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()

  // Pacientes filtrados pelos filtros ativos de convênio e modalidade (com correspondência tolerante)
  const filteredPatients = useMemo(() => {
    const targetConv = selectedConvenio !== 'todos' ? normalizeCompare(selectedConvenio) : ''
    const targetMod = selectedModalidade !== 'todas' ? normalizeCompare(selectedModalidade) : ''

    return patients.filter((p) => {
      if (targetConv) {
        const pConv = normalizeCompare(p.convenio)
        // Comparação exata (dropdown alimenta com a string exata) ou inclusão segura caso seja substring
        if (pConv !== targetConv && !pConv.includes(targetConv) && !targetConv.includes(pConv)) {
          return false
        }
      }
      if (targetMod) {
        const pMod = normalizeCompare(p.modalidade)
        if (pMod !== targetMod && !pMod.includes(targetMod) && !targetMod.includes(pMod)) {
          return false
        }
      }
      return true
    })
  }, [patients, selectedConvenio, selectedModalidade])

  // Itens atualmente visíveis (com paginação progressiva)
  const visiblePatients = useMemo(() => {
    return filteredPatients.slice(0, displayLimit)
  }, [filteredPatients, displayLimit])

  const hasMorePatients = displayLimit < filteredPatients.length

  const hasActiveFilters =
    Boolean(searchNome) ||
    Boolean(searchDoc) ||
    selectedConvenio !== 'todos' ||
    selectedModalidade !== 'todas'

  const handleResetFilters = () => {
    setSearchNome('')
    setSearchDoc('')
    setSelectedConvenio('todos')
    setSelectedModalidade('todas')
    setDisplayLimit(50)
  }

  const handleLoadMore = () => {
    setDisplayLimit((prev) => prev + 50)
  }

  const handleShowAll = () => {
    setDisplayLimit(filteredPatients.length)
  }

  // Redirecionar / bloquear médico visitador (abaixo dos hooks para cumprir rules-of-hooks)
  if (isMedicoVisitador) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito ao Perfil</h2>
        <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
          Em conformidade com a LGPD e as normas institucionais da Help Vida, o perfil{' '}
          <strong>Médico Visitador</strong> tem acesso exclusivo ao catálogo de medicamentos
          padronizados, não possuindo permissão para consultar dados cadastrais de pacientes ou
          orçamentos.
        </p>
        <Button
          onClick={() => navigate('/medicamentos')}
          className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl"
        >
          Ir para Catálogo de Medicamentos
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
              <Users className="h-6 w-6 text-[#0D8272]" />
              Consulta de Pacientes — SpinCare
            </h2>
            <Badge className="bg-[#E6F5F2] text-[#0C4336] border-[#0D8272]/30 text-[10px] font-bold">
              Ao Vivo
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Consulta em tempo real ao cadastro do sistema SpinCare com exibição de convênio,
            modalidade e orçamentos vinculados.
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

      {/* 3. AVISO LGPD DISCRETO */}
      <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="h-4 w-4 text-[#0D8272] shrink-0" />
          <span>
            <strong>Dados sensíveis de saúde (LGPD):</strong> Toda consulta realizada ao sistema
            SpinCare é registrada na trilha de auditoria Help Vida para fins de conformidade legal.
            Não insira dados desnecessários.
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">
          DPO: dpo@helpvida.com.br
        </span>
      </div>

      {/* 4. CARD DE BUSCA & FILTROS (NOME, DOCUMENTO, CONVÊNIO, MODALIDADE) */}
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardContent className="p-3.5 sm:p-5">
          <form onSubmit={handleSearch} className="space-y-3.5">
            {/* Linha 1: Busca por Texto (Nome + Documento) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nome do Paciente</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    type="search"
                    placeholder="Nome completo ou parte..."
                    value={searchNome}
                    onChange={(e) => setSearchNome(e.target.value)}
                    className="h-10 pl-9 text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Documento / CPF / Prontuário
                </label>
                <Input
                  type="text"
                  placeholder="Número do documento..."
                  value={searchDoc}
                  onChange={(e) => setSearchDoc(e.target.value)}
                  className="h-10 text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
                />
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
                      <Search className="h-4 w-4 text-[#F5B31C]" />
                      Buscar no SpinCare
                    </>
                  )}
                </Button>

                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetFilters}
                    className="h-11 sm:h-10 min-h-[44px] text-xs border-slate-200 rounded-xl px-3.5 shrink-0 flex items-center justify-center"
                    title="Limpar todos os filtros"
                  >
                    <X size={14} className="mr-1" />
                    <span>Limpar</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Linha 2: Filtros de Convênio e Modalidade */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-center">
              {/* Filtro por Convênio */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 size={13} className="text-[#0D8272]" />
                  <span>Filtro por Convênio</span>
                  {selectedConvenio !== 'todos' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0D8272]" />
                  )}
                </label>
                <Select
                  value={selectedConvenio}
                  onValueChange={(val) => {
                    setSelectedConvenio(val)
                    setDisplayLimit(50)
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl">
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="todos" className="text-xs font-semibold">
                      Todos os Convênios (
                      {conveniosOptions.length > 0 ? conveniosOptions.length : 'todos'})
                    </SelectItem>
                    {conveniosOptions.map((conv) => {
                      const count = patients.filter((p) => {
                        const c = normalizeCompare(p.convenio)
                        const t = normalizeCompare(conv)
                        return c === t
                      }).length
                      return (
                        <SelectItem key={conv} value={conv} className="text-xs">
                          {conv} {count > 0 ? `(${count})` : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por Modalidade */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers size={13} className="text-[#0D8272]" />
                  <span>Filtro por Modalidade</span>
                  {selectedModalidade !== 'todas' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0D8272]" />
                  )}
                </label>
                <Select
                  value={selectedModalidade}
                  onValueChange={(val) => {
                    setSelectedModalidade(val)
                    setDisplayLimit(50)
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl">
                    <SelectValue placeholder="Todas as modalidades" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="todas" className="text-xs font-semibold">
                      Todas as Modalidades (
                      {modalidadesOptions.length > 0 ? modalidadesOptions.length : 'todas'})
                    </SelectItem>
                    {modalidadesOptions.map((mod) => {
                      const count = patients.filter((p) => {
                        const m = normalizeCompare(p.modalidade)
                        const t = normalizeCompare(mod)
                        return m === t || m.includes(t) || t.includes(m)
                      }).length
                      return (
                        <SelectItem key={mod} value={mod} className="text-xs">
                          {mod} {count > 0 ? `(${count})` : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Indicador de Filtros Aplicados */}
              <div className="flex items-center gap-2 pt-1 sm:pt-4 text-xs text-slate-500">
                <Filter size={14} className="text-[#0D8272] shrink-0" />
                <span>
                  Exibindo <strong>{visiblePatients.length}</strong> de{' '}
                  <strong>{filteredPatients.length}</strong> pacientes{' '}
                  {totalCount > 0 && totalCount !== filteredPatients.length && (
                    <>
                      (censo total: <strong>{totalCount}</strong> ativos)
                    </>
                  )}
                </span>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 5. RESULTADOS */}
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
                ? 'A URL base ou as credenciais da API SpinCare ainda não foram cadastradas. Configure os parâmetros da integração para liberar a consulta de pacientes e orçamentos.'
                : 'A integração com o sistema SpinCare ainda não foi configurada pelo administrador da Help Vida. Solicite à comissão a liberação dos parâmetros de acesso.'}
            </p>
            {isAdmin && (
              <Button
                onClick={() => navigate('/configuracoes')}
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl h-10 px-4"
              >
                Abrir Configurações da Integração
              </Button>
            )}
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
            <p className="text-xs font-medium text-slate-600">
              Consultando API ao vivo do SpinCare...
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Nenhum dado é replicado localmente.</p>
          </CardContent>
        </Card>
      ) : filteredPatients.length === 0 ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-12 text-center text-slate-400 space-y-2">
            <Users className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">Nenhum paciente localizado</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Tente ajustar os termos de busca, convênio ou modalidade selecionados.'
                : hasSearched
                  ? 'Verifique se o paciente está cadastrado e ativo no sistema SpinCare.'
                  : 'Utilize o formulário acima para pesquisar pacientes cadastrados no sistema SpinCare.'}
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="mt-2 text-xs rounded-xl border-slate-200"
              >
                Limpar Filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {filteredPatients.length} paciente{filteredPatients.length === 1 ? '' : 's'}{' '}
              {selectedConvenio !== 'todos' || selectedModalidade !== 'todas'
                ? 'filtrado' + (filteredPatients.length === 1 ? '' : 's')
                : 'encontrado' + (filteredPatients.length === 1 ? '' : 's')}
            </span>
            <span className="text-[10px] text-slate-400">
              Toque no card para abrir a ficha completa
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visiblePatients.map((p) => (
              <Card
                key={p.id}
                onClick={() => handleOpenPatient(p)}
                className="border-emerald-950/10 bg-white hover:border-[#0D8272]/50 hover:shadow-md transition-all cursor-pointer group rounded-2xl"
              >
                <CardContent className="p-4 space-y-2.5">
                  {/* Cabeçalho do Card: Avatar, Nome, Documento e Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-[#0D8272] group-hover:text-white transition-colors">
                        {p.nome
                          .split(' ')
                          .filter(Boolean)
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase() || 'P'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-[#0C4336] transition-colors truncate">
                          {p.nome}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Doc: {p.documento}
                        </p>
                      </div>
                    </div>

                    <Badge
                      className={
                        p.statusAtendimento === 'Ativo'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] shrink-0'
                          : 'bg-slate-100 text-slate-700 text-[10px] shrink-0'
                      }
                    >
                      {p.statusAtendimento}
                    </Badge>
                  </div>

                  {/* DESTAQUE DO CONVÊNIO & MODALIDADE (Pedido do usuário) */}
                  <div className="p-2.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Building2 size={13} className="text-[#0D8272] shrink-0" />
                        <span className="text-[10px] uppercase font-bold text-slate-500 shrink-0">
                          Convênio:
                        </span>
                        <span className="font-bold text-[#0C4336] truncate" title={p.convenio}>
                          {p.convenio || '—'}
                        </span>
                      </div>
                      {p.convenio && p.convenio !== '—' && (
                        <Badge className="bg-[#E6F5F2] text-[#0C4336] border-[#0D8272]/30 text-[9px] font-bold shrink-0">
                          Ativo
                        </Badge>
                      )}
                    </div>

                    {/* Modalidade */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <Layers size={12} className="text-[#0D8272] shrink-0" />
                      <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">
                        Modalidade:
                      </span>
                      <span className="font-medium text-slate-800 truncate" title={p.modalidade}>
                        {p.modalidade || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Informações Complementares: Nascimento e Telefone */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar size={12} className="text-slate-400 shrink-0" />
                      <span className="truncate">Nasc: {p.dataNascimento}</span>
                    </div>

                    <div className="flex items-center gap-1.5 truncate">
                      <Phone size={12} className="text-slate-400 shrink-0" />
                      <span className="truncate">{p.telefone}</span>
                    </div>
                  </div>

                  {/* Link Ficha e Orçamentos */}
                  <div className="flex items-center justify-end text-[11px] font-bold text-[#0D8272] pt-1 border-t border-slate-100">
                    <span>Ver ficha completa & orçamentos</span>
                    <ChevronRight
                      size={14}
                      className="ml-1 group-hover:translate-x-1 transition-transform"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* BARRA DE CARREGAMENTO PROGRESSIVO / PAGINAÇÃO */}
          {hasMorePatients && (
            <div className="p-4 rounded-2xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 text-center sm:text-left">
                Mostrando <strong>{visiblePatients.length}</strong> de{' '}
                <strong>{filteredPatients.length}</strong> pacientes encontrados
              </span>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={handleLoadMore}
                  className="bg-[#0F5342] hover:bg-[#0C4336] active:bg-[#082921] text-white text-xs font-bold rounded-xl h-11 sm:h-9 min-h-[44px] sm:min-h-0 px-4 flex-1 sm:flex-initial"
                >
                  Carregar Mais 50 Pacientes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleShowAll}
                  className="text-xs border-emerald-950/15 rounded-xl h-11 sm:h-9 min-h-[44px] sm:min-h-0 px-4 shrink-0"
                >
                  Exibir Todos ({filteredPatients.length})
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. MODAL: FICHA DO PACIENTE + ORÇAMENTOS VINCULADOS */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl w-[96vw] sm:w-full p-3 sm:p-6 rounded-2xl bg-white max-h-[94vh] sm:max-h-[92vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-emerald-950/10 shrink-0 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pr-1">
                <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2 truncate">
                  <User className="h-5 w-5 text-[#0D8272] shrink-0" />
                  <span className="truncate">{patientDetail?.nome || 'Ficha do Paciente'}</span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-slate-500 pt-0.5 truncate">
                  Dados cadastrais e histórico de orçamentos aprovados no SpinCare
                </DialogDescription>
              </div>
              <Badge className="bg-[#E6F5F2] text-[#0C4336] border-[#0D8272]/30 text-[10px] font-bold shrink-0">
                {patientDetail?.statusAtendimento || 'Ativo'}
              </Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2 space-y-4 py-3">
            {/* Bloco de Destaque: Convênio e Modalidade */}
            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/60 space-y-2">
              <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider block">
                Convênio & Modalidade do Atendimento
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <Building2 size={16} className="text-[#0D8272] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Convênio / Operadora:
                    </span>
                    <span className="text-sm font-bold text-[#0C4336]">
                      {patientDetail?.convenio || '—'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Layers size={16} className="text-[#0D8272] shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Modalidade / Regime:
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {patientDetail?.modalidade || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Demais Dados Cadastrais */}
            <div className="p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Dados Demográficos e Contato
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Documento / CPF:</span>
                  <span className="font-semibold text-slate-800">
                    {patientDetail?.documento || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Data de Nascimento:</span>
                  <span className="font-semibold text-slate-800">
                    {patientDetail?.dataNascimento || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Telefone de Contato:</span>
                  <span className="font-semibold text-slate-800">
                    {patientDetail?.telefone || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">E-mail:</span>
                  <span className="font-semibold text-slate-800">
                    {patientDetail?.email || '—'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-400 block text-[10px]">Endereço / Localidade:</span>
                  <span className="font-semibold text-slate-800">
                    {patientDetail?.endereco || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* VERIFICAR SE MEDICAMENTO CONSTA NA PRESCRIÇÃO MÉDICA DE 2026 (Item 2 do pedido) */}
            <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Pill size={15} className="text-blue-700" />
                  Verificar Medicamento na Prescrição (2026)
                </span>
                <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] font-semibold">
                  {loadingPrescriptions
                    ? 'Buscando...'
                    : `${patientPrescriptions.length} prescriç${patientPrescriptions.length === 1 ? 'ão' : 'ões'}`}
                </Badge>
              </div>
              <p className="text-[11px] text-blue-800/80">
                Digite ou selecione o nome de um medicamento para checar se ele já consta nas
                prescrições médicas deste paciente em 2026.
              </p>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Nome do medicamento (ex: Dipirona, Enoxaparina, Omeprazol)..."
                  value={medCheckQuery}
                  onChange={(e) => setMedCheckQuery(e.target.value)}
                  className="h-11 sm:h-9 pl-8 text-base sm:text-xs bg-white border-blue-200 rounded-xl focus-visible:ring-blue-600 min-h-[44px] sm:min-h-0"
                />
              </div>

              {medCheckQuery.trim() && (
                <div className="space-y-2 pt-1">
                  {(() => {
                    const normQ = normalizeCompare(medCheckQuery)
                    const matches: {
                      prescId: string
                      numero: string
                      data: string
                      medico: string
                      status: string
                      item: import('@/services/spincare').SpincarePrescriptionItem
                    }[] = []

                    patientPrescriptions.forEach((pr) => {
                      pr.itens.forEach((it) => {
                        const itNorm = normalizeCompare(it.descricao)
                        if (itNorm === normQ || itNorm.includes(normQ) || normQ.includes(itNorm)) {
                          matches.push({
                            prescId: pr.id,
                            numero: pr.numero,
                            data: pr.dataPrescricao,
                            medico: pr.medicoPrescritor,
                            status: pr.status,
                            item: it,
                          })
                        }
                      })
                    })

                    if (matches.length > 0) {
                      return (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 space-y-2 text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                            <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                            <span>
                              Medicamento ENCONTRADO na prescrição do paciente ({matches.length}{' '}
                              ocorrência{matches.length === 1 ? '' : 's'})
                            </span>
                          </div>
                          <div className="space-y-2 pt-1">
                            {matches.map((m, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg bg-white border border-emerald-200 shadow-2xs space-y-1"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-slate-800">
                                    {m.item.descricao}
                                  </span>
                                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] font-bold">
                                    {m.status}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-600">
                                  <span>
                                    Prescrição: <strong>#{m.numero}</strong> em{' '}
                                    <strong>{m.data}</strong>
                                  </span>
                                  <span>
                                    Médico: <strong className="text-[#0C4336]">{m.medico}</strong>
                                  </span>
                                  {m.item.posologia && (
                                    <span className="sm:col-span-2 text-slate-500">
                                      Posologia: <em>{m.item.posologia}</em>
                                    </span>
                                  )}
                                  {m.item.viaAdministracao && (
                                    <span className="text-slate-500">
                                      Via: {m.item.viaAdministracao}
                                    </span>
                                  )}
                                  {m.item.quantidade && (
                                    <span className="text-slate-500">
                                      Qtd: {m.item.quantidade} {m.item.unidade || ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                        <AlertCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">
                            Medicamento NÃO encontrado nas prescrições médicas de 2026.
                          </p>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            O termo &quot;{medCheckQuery}&quot; não consta em nenhuma das{' '}
                            {patientPrescriptions.length} prescrições cadastradas neste ano para
                            este paciente.
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {patientPrescriptions.length > 0 && !medCheckQuery.trim() && (
                <div className="pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Itens prescritos recentemente (clique para checar):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {Array.from(
                      new Set(
                        patientPrescriptions
                          .flatMap((p) => p.itens.map((i) => i.descricao))
                          .filter(Boolean),
                      ),
                    )
                      .slice(0, 10)
                      .map((desc, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setMedCheckQuery(desc)}
                          className="px-2 py-1 rounded-lg bg-white border border-blue-200 text-[10px] text-blue-900 font-medium hover:bg-blue-100 transition truncate max-w-[200px]"
                          title={desc}
                        >
                          {desc}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Orçamentos Vinculados */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0C4336] flex items-center gap-1.5">
                  <DollarSign size={14} className="text-[#0D8272]" />
                  Orçamentos Aprovados no SpinCare ({patientBudgets.length})
                </span>
                <span className="text-[10px] text-slate-400">Filtro &ge; 2026 aplicado</span>
              </div>

              {loadingDetail ? (
                <div className="py-8 text-center text-slate-400 space-y-1">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0D8272] mx-auto" />
                  <p className="text-xs">Consultando orçamentos ao vivo...</p>
                </div>
              ) : patientBudgets.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 space-y-1">
                  <FileText className="h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">
                    Nenhum orçamento aprovado encontrado
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Não constam orçamentos aprovados a partir de 2026 para este paciente no
                    SpinCare.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {patientBudgets.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl border border-emerald-950/10 bg-white hover:bg-slate-50 transition space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="font-mono text-emerald-800">
                              Orçamento #{b.numero}
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Aprovado em:{' '}
                            <strong className="text-slate-700">{b.dataAprovacao}</strong>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-[#0C4336] block">
                            {b.valor > 0
                              ? b.valor.toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })
                              : '—'}
                          </span>
                          <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-bold">
                            {b.status}
                          </Badge>
                        </div>
                      </div>
                      {b.observacao && b.observacao !== '—' && (
                        <p className="text-[11px] text-slate-600 italic bg-[#F4FAF8] p-2 rounded-lg">
                          "{b.observacao}"
                        </p>
                      )}
                      {b.itens && b.itens.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <span>Itens & Medicamentos do Orçamento ({b.itens.length}):</span>
                            <span>Qtd / Valor</span>
                          </div>
                          <div className="space-y-1.5">
                            {b.itens.map((it, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded-lg bg-slate-50 border border-slate-150 flex items-center justify-between gap-2 text-[11px]"
                              >
                                <div className="min-w-0 pr-1">
                                  <p
                                    className="font-medium text-slate-800 truncate"
                                    title={it.descricao}
                                  >
                                    {it.descricao}
                                  </p>
                                  {it.codigo && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      Cód: {it.codigo}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-mono text-slate-600 block">
                                    Qtd: <strong>{it.quantidade}</strong> {it.unidade || ''}
                                  </span>
                                  {it.valorTotal > 0 && (
                                    <span className="text-[11px] font-bold text-emerald-800">
                                      {it.valorTotal.toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}{' '}
                    </div>
                  ))}
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
              Fechar Ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
