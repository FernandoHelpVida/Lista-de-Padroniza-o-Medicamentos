import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  ShieldCheck,
  AlertCircle,
  Loader2,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Clock,
  Sparkles,
  Settings,
} from 'lucide-react'
import {
  searchSpincarePatients,
  getSpincarePatientById,
  type SpincarePatient,
  type SpincareBudget,
} from '@/services/spincare'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function Pacientes() {
  const { user, isAdmin, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [searchNome, setSearchNome] = useState('')
  const [searchDoc, setSearchDoc] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [patients, setPatients] = useState<SpincarePatient[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unconfigured, setUnconfigured] = useState(false)

  // Ficha detalhada do paciente
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [patientDetail, setPatientDetail] = useState<SpincarePatient | null>(null)
  const [patientBudgets, setPatientBudgets] = useState<SpincareBudget[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)
    setHasSearched(true)
    setUnconfigured(false)
    try {
      const res = await searchSpincarePatients({
        query: searchNome.trim(),
        documento: searchDoc.trim(),
        limit: 50,
      })
      setPatients(res.items || [])
      setTotalCount(res.total || 0)
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
    try {
      const res = await getSpincarePatientById(p.id)
      if (res.patient) setPatientDetail(res.patient)
      setPatientBudgets(res.budgets || [])
    } catch (err: unknown) {
      console.warn('Erro ao carregar ficha completa do paciente:', err)
      toast({
        title: 'Aviso',
        description: 'Não foi possível carregar os orçamentos vinculados ao paciente.',
      })
    } finally {
      setLoadingDetail(false)
    }
  }

  // Busca inicial leve ao abrir a tela
  useEffect(() => {
    if (!isMedicoVisitador) {
      handleSearch()
    }
  }, [isMedicoVisitador])

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
      {/* 1. CABEÇALHO */}
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
            Consulta em tempo real ao cadastro do sistema SpinCare. Dados cadastrais e orçamentos
            vinculados.
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

      {/* 2. AVISO LGPD DISCRETO */}
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

      {/* 3. CARD DE BUSCA */}
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardContent className="p-3.5 sm:p-5">
          <form onSubmit={handleSearch} className="space-y-3">
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
                      <Search className="h-3.5 w-3.5 text-[#F5B31C]" />
                      Buscar no SpinCare
                    </>
                  )}
                </Button>

                {(searchNome || searchDoc) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSearchNome('')
                      setSearchDoc('')
                    }}
                    className="h-10 text-xs border-slate-200 rounded-xl"
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 4. RESULTADOS */}
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
      ) : patients.length === 0 ? (
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardContent className="py-12 text-center text-slate-400 space-y-2">
            <Users className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">Nenhum paciente localizado</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              {hasSearched
                ? 'Tente buscar por outro termo, nome abreviado ou verifique se o paciente está cadastrado no SpinCare.'
                : 'Utilize o formulário acima para pesquisar pacientes cadastrados no sistema SpinCare.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {totalCount} paciente{totalCount === 1 ? '' : 's'} encontrado
              {totalCount === 1 ? '' : 's'}
            </span>
            <span className="text-[10px] text-slate-400">
              Toque no card para abrir a ficha completa
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {patients.map((p) => (
              <Card
                key={p.id}
                onClick={() => handleOpenPatient(p)}
                className="border-emerald-950/10 bg-white hover:border-[#0D8272]/50 hover:shadow-md transition-all cursor-pointer group rounded-2xl"
              >
                <CardContent className="p-4 space-y-2.5">
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
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]'
                          : 'bg-slate-100 text-slate-700 text-[10px]'
                      }
                    >
                      {p.statusAtendimento}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar size={12} className="text-[#0D8272] shrink-0" />
                      <span className="truncate">Nasc: {p.dataNascimento}</span>
                    </div>

                    <div className="flex items-center gap-1.5 truncate">
                      <Phone size={12} className="text-[#0D8272] shrink-0" />
                      <span className="truncate">{p.telefone}</span>
                    </div>

                    <div className="flex items-center gap-1.5 truncate col-span-2">
                      <Building2 size={12} className="text-[#0D8272] shrink-0" />
                      <span className="truncate">Convênio: {p.convenio}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end text-[11px] font-bold text-[#0D8272] pt-1">
                    <span>Ver ficha & orçamentos</span>
                    <ChevronRight
                      size={14}
                      className="ml-1 group-hover:translate-x-1 transition-transform"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 5. MODAL: FICHA DO PACIENTE + ORÇAMENTOS VINCULADOS */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl w-[94vw] sm:w-full p-4 sm:p-6 rounded-2xl bg-white max-h-[92vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-emerald-950/10 shrink-0 text-left">
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2">
                  <User className="h-5 w-5 text-[#0D8272]" />
                  {patientDetail?.nome || 'Ficha do Paciente'}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 pt-0.5">
                  Dados cadastrais e histórico de orçamentos aprovados no SpinCare
                </DialogDescription>
              </div>
              <Badge className="bg-[#E6F5F2] text-[#0C4336] border-[#0D8272]/30 text-[10px] font-bold shrink-0">
                {patientDetail?.statusAtendimento || 'Ativo'}
              </Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2 space-y-4 py-3">
            {/* Dados Cadastrais */}
            <div className="p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Dados Cadastrais do Paciente
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
                <div className="sm:col-span-2">
                  <span className="text-slate-400 block text-[10px]">Convênio / Operadora:</span>
                  <span className="font-semibold text-slate-800">
                    {patientDetail?.convenio || '—'}
                  </span>
                </div>
              </div>
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
                        <div className="pt-1.5 border-t border-slate-100">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            Itens / Medicamentos:
                          </span>
                          <div className="space-y-1">
                            {b.itens.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-[11px] text-slate-700 bg-slate-50 px-2 py-1 rounded"
                              >
                                <span>{it.descricao}</span>
                                <span className="font-mono text-slate-500">
                                  Qtd: {it.quantidade}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
              className="w-full sm:w-auto h-9 text-xs rounded-xl"
            >
              Fechar Ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
