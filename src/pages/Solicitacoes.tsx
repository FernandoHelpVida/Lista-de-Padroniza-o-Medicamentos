import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import {
  FileQuestion,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  User as UserIcon,
  Pill,
  Calendar,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Check,
  ShieldCheck,
  History,
  Plus,
  RefreshCw,
  Info,
  CheckCheck,
  Ban,
  PackageCheck,
  Building,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarDataSegura } from '@/lib/formatters'
import { NovaSolicitacaoModal } from '@/components/NovaSolicitacaoModal'
import type { RecordModel } from 'pocketbase'

export type SolicitacaoStatus = 'Pendente' | 'Aprovada' | 'Atendida' | 'Negada'

export interface SolicitacaoRecord extends RecordModel {
  medicamento?: string
  nome_medicamento_novo?: string
  classe_terapeutica?: string
  apresentacao?: string
  dados_paciente?: string
  solicitante: string
  justificativa: string
  status: SolicitacaoStatus
  resposta_comissao?: string
  avaliador?: string
  expand?: {
    medicamento?: {
      nome: string
      classe: string
      status: string
    }
    solicitante?: {
      name?: string
      email?: string
    }
    avaliador?: {
      name?: string
      email?: string
    }
  }
}

export interface AuditLogRecord extends RecordModel {
  colecao: string
  registro_id: string
  acao: string
  usuario?: string
  usuario_nome?: string
  usuario_email?: string
  usuario_role?: string
  status_anterior?: string
  status_novo?: string
  detalhes?: string
}

export default function Solicitacoes() {
  const { user, isAdmin, isMedicoVisitador } = useAuth()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'solicitacoes' | 'auditoria'>('solicitacoes')

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todos' | SolicitacaoStatus>('Todos')

  // Modal de Nova Solicitação (médico)
  const [novaSolicitacaoOpen, setNovaSolicitacaoOpen] = useState(false)

  // Modal de Avaliação / Ação Farmacêutica Clínica
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<SolicitacaoRecord | null>(null)
  const [avaliacaoModalOpen, setAvaliacaoModalOpen] = useState(false)
  const [acaoAvaliacao, setAcaoAvaliacao] = useState<'Aprovada' | 'Negada' | 'Atendida'>('Aprovada')
  const [parecerTexto, setParecerTexto] = useState('')
  const [salvandoAvaliacao, setSalvandoAvaliacao] = useState(false)

  // Timeline / Histórico de Auditoria do Item Selecionado
  const [timelineModalOpen, setTimelineModalOpen] = useState(false)
  const [timelineItem, setTimelineItem] = useState<SolicitacaoRecord | null>(null)
  const [timelineLogs, setTimelineLogs] = useState<AuditLogRecord[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  // Aba Geral de Auditoria (Admin Only)
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditSearch, setAuditSearch] = useState('')
  const [auditAcaoFilter, setAuditAcaoFilter] = useState<string>('Todas')

  const loadSolicitacoes = async () => {
    try {
      const records = await pb.collection('solicitacoes').getFullList<SolicitacaoRecord>({
        sort: '-created',
        expand: 'medicamento,solicitante,avaliador',
      })
      setSolicitacoes(records)
    } catch (err) {
      console.error('Erro ao carregar solicitações:', err)
      toast({
        title: 'Falha ao buscar solicitações',
        description: getErrorMessage(err) || 'Não foi possível sincronizar o histórico de pedidos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    if (!isAdmin) return
    setLoadingAudit(true)
    try {
      const records = await pb.collection('audit_logs').getFullList<AuditLogRecord>({
        sort: '-created',
      })
      setAuditLogs(records)
    } catch (err) {
      console.error('Erro ao carregar log de auditoria:', err)
    } finally {
      setLoadingAudit(false)
    }
  }

  useEffect(() => {
    loadSolicitacoes()
    if (isAdmin) {
      loadAuditLogs()
    }
  }, [isAdmin])

  // Tempo real via useRealtime para solicitações
  useRealtime<SolicitacaoRecord>('solicitacoes', (event) => {
    if (event.action === 'create') {
      loadSolicitacoes()
    } else if (event.action === 'update') {
      setSolicitacoes((prev) =>
        prev.map((item) => (item.id === event.record.id ? { ...item, ...event.record } : item)),
      )
      // Se o modal de timeline estiver aberto para este item, recarregar
      if (timelineItem && timelineItem.id === event.record.id) {
        openTimeline(event.record as SolicitacaoRecord)
      }
    } else if (event.action === 'delete') {
      setSolicitacoes((prev) => prev.filter((item) => item.id !== event.record.id))
    }
  })

  // Tempo real para logs de auditoria
  useRealtime<AuditLogRecord>('audit_logs', (event) => {
    if (event.action === 'create' && isAdmin) {
      setAuditLogs((prev) => [event.record, ...prev])
      if (timelineItem && event.record.registro_id === timelineItem.id) {
        setTimelineLogs((prev) => [event.record, ...prev])
      }
    }
  })

  // Filtros: se não for admin, usuário só vê suas próprias solicitações (reforçado pelo RLS do backend)
  const visibleSolicitacoes = useMemo(() => {
    let list = solicitacoes
    if (!isAdmin && user) {
      list = list.filter((s) => s.solicitante === user.id)
    }

    if (statusFilter !== 'Todos') {
      list = list.filter((s) => s.status === statusFilter)
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim()
      list = list.filter((s) => {
        const medNome =
          s.expand?.medicamento?.nome?.toLowerCase() || s.nome_medicamento_novo?.toLowerCase() || ''
        const medClasse =
          s.expand?.medicamento?.classe?.toLowerCase() || s.classe_terapeutica?.toLowerCase() || ''
        const solNome = s.expand?.solicitante?.name?.toLowerCase() || ''
        const solEmail = s.expand?.solicitante?.email?.toLowerCase() || ''
        const just = s.justificativa?.toLowerCase() || ''
        const dadosPac = s.dados_paciente?.toLowerCase() || ''
        return (
          medNome.includes(q) ||
          medClasse.includes(q) ||
          solNome.includes(q) ||
          solEmail.includes(q) ||
          just.includes(q) ||
          dadosPac.includes(q)
        )
      })
    }

    return list
  }, [solicitacoes, isAdmin, user, statusFilter, searchFilter])

  // Contagens para chips
  const counts = useMemo(() => {
    const baseList =
      isAdmin || !user ? solicitacoes : solicitacoes.filter((s) => s.solicitante === user.id)
    return {
      Todos: baseList.length,
      Pendente: baseList.filter((s) => s.status === 'Pendente').length,
      Aprovada: baseList.filter((s) => s.status === 'Aprovada').length,
      Atendida: baseList.filter((s) => s.status === 'Atendida').length,
      Negada: baseList.filter((s) => s.status === 'Negada').length,
    }
  }, [solicitacoes, isAdmin, user])

  // Filtragem de logs de auditoria
  const visibleAuditLogs = useMemo(() => {
    let list = auditLogs
    if (auditAcaoFilter !== 'Todas') {
      list = list.filter((log) => log.acao === auditAcaoFilter)
    }
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase().trim()
      list = list.filter((log) => {
        const uNome = log.usuario_nome?.toLowerCase() || ''
        const uEmail = log.usuario_email?.toLowerCase() || ''
        const acao = log.acao?.toLowerCase() || ''
        const det = log.detalhes?.toLowerCase() || ''
        const reg = log.registro_id?.toLowerCase() || ''
        return (
          uNome.includes(q) ||
          uEmail.includes(q) ||
          acao.includes(q) ||
          det.includes(q) ||
          reg.includes(q)
        )
      })
    }
    return list
  }, [auditLogs, auditAcaoFilter, auditSearch])

  const getStatusBadge = (status: SolicitacaoStatus) => {
    switch (status) {
      case 'Pendente':
        return (
          <Badge className="bg-[#FEF8EC] text-[#92400E] border border-[#F5B31C]/40 text-[11px] font-bold flex items-center gap-1 shrink-0">
            <Clock size={12} className="text-[#F5B31C]" />
            Pendente de Aprovação
          </Badge>
        )
      case 'Aprovada':
        return (
          <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-[11px] font-bold flex items-center gap-1 shrink-0">
            <CheckCircle2 size={12} className="text-[#0D8272]" />
            Aprovada pela Farmácia
          </Badge>
        )
      case 'Atendida':
        return (
          <Badge className="bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 shrink-0">
            <Check size={12} />
            Atendida / Dispensada
          </Badge>
        )
      case 'Negada':
        return (
          <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 shrink-0">
            <XCircle size={12} className="text-rose-600" />
            Negada
          </Badge>
        )
    }
  }

  // Abrir modal de avaliação com ação pré-selecionada
  const handleOpenAvaliacao = (
    item: SolicitacaoRecord,
    acao: 'Aprovada' | 'Negada' | 'Atendida',
  ) => {
    setSelectedSolicitacao(item)
    setAcaoAvaliacao(acao)
    setParecerTexto(item.resposta_comissao || '')
    setAvaliacaoModalOpen(true)
  }

  // Gravar decisão da farmacêutica clínica
  const handleSaveAvaliacao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSolicitacao || !user) return

    // Validação: parecer obrigatório ao negar
    if (acaoAvaliacao === 'Negada' && !parecerTexto.trim()) {
      toast({
        title: 'Parecer técnico obrigatório',
        description:
          'Por favor, informe a justificativa técnica da Farmácia Clínica para a negativa do medicamento.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoAvaliacao(true)
    try {
      await pb.collection('solicitacoes').update(selectedSolicitacao.id, {
        status: acaoAvaliacao,
        resposta_comissao: parecerTexto.trim(),
        avaliador: user.id,
      })

      toast({
        title: `Solicitação ${acaoAvaliacao.toLowerCase()} com sucesso!`,
        description: `O médico solicitante receberá a atualização do status em tempo real.`,
      })
      setAvaliacaoModalOpen(false)
      loadSolicitacoes()
      if (isAdmin) loadAuditLogs()
    } catch (err: unknown) {
      console.error('Erro ao atualizar solicitação:', err)
      toast({
        title: 'Erro ao registrar avaliação',
        description:
          getErrorMessage(err) || 'Não foi possível registrar a decisão da farmácia clínica.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoAvaliacao(false)
    }
  }

  // Abrir Timeline de Auditoria de um item específico
  const openTimeline = async (item: SolicitacaoRecord) => {
    setTimelineItem(item)
    setTimelineModalOpen(true)
    setLoadingTimeline(true)
    try {
      const records = await pb.collection('audit_logs').getFullList<AuditLogRecord>({
        filter: `colecao = 'solicitacoes' && registro_id = '${item.id}'`,
        sort: '-created',
      })
      setTimelineLogs(records)
    } catch (err) {
      console.error('Erro ao buscar timeline:', err)
    } finally {
      setLoadingTimeline(false)
    }
  }

  const getAcaoBadge = (acao: string) => {
    switch (acao) {
      case 'SOLICITACAO_CRIADA':
        return (
          <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
            Criação
          </Badge>
        )
      case 'SOLICITACAO_APROVADA':
        return (
          <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-[10px] font-bold">
            Aprovação
          </Badge>
        )
      case 'SOLICITACAO_NEGADA':
        return (
          <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
            Negativa
          </Badge>
        )
      case 'SOLICITACAO_ATENDIDA':
        return (
          <Badge className="bg-emerald-600 text-white text-[10px] font-bold">Atendimento</Badge>
        )
      case 'PARECER_ADICIONADO':
        return (
          <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
            Parecer
          </Badge>
        )
      case 'SOLICITACAO_EXCLUIDA':
        return (
          <Badge className="bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold">
            Exclusão
          </Badge>
        )
      default:
        return <Badge className="bg-slate-100 text-slate-700 text-[10px] font-medium">{acao}</Badge>
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight flex items-center gap-2">
            <FileQuestion className="h-6 w-6 text-[#0D8272]" />
            Solicitações de Medicamentos Não Padronizados
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdmin
              ? 'Painel da Farmácia Clínica Help Vida: avalie, aprove ou negue pedidos com registro auditável'
              : 'Cadastre solicitações de medicamentos não padronizados e acompanhe a aprovação em tempo real'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Nova Solicitação para médicos e equipe */}
          <Button
            onClick={() => setNovaSolicitacaoOpen(true)}
            size="sm"
            className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold h-9 min-h-[38px] px-3.5 rounded-xl shadow-xs flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4 text-[#F5B31C]" />
            Nova Solicitação
          </Button>

          {isAdmin && (
            <Badge className="bg-[#0F5342] text-white text-xs px-3 py-1 font-bold w-fit">
              {counts.Pendente} pendente{counts.Pendente === 1 ? '' : 's'} de avaliação
            </Badge>
          )}
        </div>
      </div>

      {/* 2. TABS: SOLICITAÇÕES vs. AUDITORIA GERAL (ADMIN ONLY) */}
      {isAdmin ? (
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'solicitacoes' | 'auditoria')}
          className="space-y-4"
        >
          <TabsList className="bg-emerald-950/10 p-1 rounded-xl">
            <TabsTrigger
              value="solicitacoes"
              className="text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#0C4336] data-[state=active]:shadow-xs"
            >
              <FileQuestion size={14} className="mr-1.5 text-[#0D8272]" />
              Solicitações ({solicitacoes.length})
            </TabsTrigger>
            <TabsTrigger
              value="auditoria"
              className="text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#0C4336] data-[state=active]:shadow-xs"
            >
              <History size={14} className="mr-1.5 text-[#0D8272]" />
              Trilha de Auditoria ({auditLogs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="solicitacoes" className="space-y-4 mt-0">
            {renderSolicitacoesSection()}
          </TabsContent>

          <TabsContent value="auditoria" className="space-y-4 mt-0">
            {renderAuditSection()}
          </TabsContent>
        </Tabs>
      ) : (
        renderSolicitacoesSection()
      )}

      {/* MODAL: NOVA SOLICITAÇÃO (MÉDICO) */}
      <NovaSolicitacaoModal
        open={novaSolicitacaoOpen}
        onOpenChange={setNovaSolicitacaoOpen}
        onSuccess={() => {
          loadSolicitacoes()
          if (isAdmin) loadAuditLogs()
        }}
      />

      {/* MODAL: AVALIAÇÃO DA FARMACÊUTICA CLÍNICA (ADMIN) */}
      <Dialog open={avaliacaoModalOpen} onOpenChange={setAvaliacaoModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSaveAvaliacao} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                <Building className="h-5 w-5 text-[#0D8272]" />
                Parecer da Farmácia Clínica Help Vida
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 pt-1">
                Avaliação técnica de medicamento não padronizado solicitada pelo médico assistente.
              </DialogDescription>
            </DialogHeader>

            {selectedSolicitacao && (
              <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 text-xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <Pill size={14} className="text-[#0D8272]" />
                  <p className="font-bold text-slate-900">
                    {selectedSolicitacao.expand?.medicamento?.nome ||
                      selectedSolicitacao.nome_medicamento_novo}
                  </p>
                </div>
                <p className="text-slate-500 text-[11px]">
                  Solicitante:{' '}
                  <strong className="text-slate-700">
                    {selectedSolicitacao.expand?.solicitante?.name ||
                      selectedSolicitacao.expand?.solicitante?.email}
                  </strong>
                </p>
                {selectedSolicitacao.dados_paciente && (
                  <p className="text-slate-500 text-[11px]">
                    Paciente:{' '}
                    <strong className="text-slate-700">{selectedSolicitacao.dados_paciente}</strong>
                  </p>
                )}
                <div className="mt-1 pt-1.5 border-t border-emerald-950/10">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Justificativa Clínica:
                  </span>
                  <p className="text-[11px] text-slate-700 italic mt-0.5 whitespace-pre-wrap">
                    "{selectedSolicitacao.justificativa}"
                  </p>
                </div>
              </div>
            )}

            {/* Ação: Aprovar, Negar ou Atender */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Decisão da Farmácia Clínica *
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAcaoAvaliacao('Aprovada')}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition',
                    acaoAvaliacao === 'Aprovada'
                      ? 'bg-[#E6F5F2] border-[#0D8272] text-[#0C4336] shadow-xs ring-2 ring-[#0D8272]/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <CheckCircle2
                    size={16}
                    className={acaoAvaliacao === 'Aprovada' ? 'text-[#0D8272]' : 'text-slate-400'}
                  />
                  <span>Aprovar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAcaoAvaliacao('Atendida')}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition',
                    acaoAvaliacao === 'Atendida'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-xs ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <PackageCheck
                    size={16}
                    className={acaoAvaliacao === 'Atendida' ? 'text-emerald-600' : 'text-slate-400'}
                  />
                  <span>Atender</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAcaoAvaliacao('Negada')}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition',
                    acaoAvaliacao === 'Negada'
                      ? 'bg-rose-50 border-rose-600 text-rose-800 shadow-xs ring-2 ring-rose-500/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Ban
                    size={16}
                    className={acaoAvaliacao === 'Negada' ? 'text-rose-600' : 'text-slate-400'}
                  />
                  <span>Negar</span>
                </button>
              </div>
            </div>

            {/* Parecer Técnico */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="parecerTexto" className="text-xs font-bold text-slate-700">
                  Parecer Técnico da Farmacêutica Clínica{' '}
                  {acaoAvaliacao === 'Negada' ? '*' : '(opcional)'}
                </Label>
                {acaoAvaliacao === 'Negada' && (
                  <span className="text-[10px] text-rose-600 font-bold">Obrigatório ao negar</span>
                )}
              </div>
              <Textarea
                id="parecerTexto"
                placeholder={
                  acaoAvaliacao === 'Negada'
                    ? 'Descreva a justificativa técnica da negativa (ex: existência de alternativa terapêutica padronizada com mesmo desfecho clínico, dosagem incompatível...)'
                    : 'Ex: Aprovada para o ciclo de 7 dias conforme protocolo clínico ou orientações de dispensação...'
                }
                value={parecerTexto}
                onChange={(e) => setParecerTexto(e.target.value)}
                required={acaoAvaliacao === 'Negada'}
                rows={3}
                className="text-xs focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
              <ShieldCheck size={14} className="text-[#0D8272] shrink-0" />
              <span>
                Esta ação será gravada no servidor na trilha de auditoria (LGPD) com seu usuário e
                carimbo de data/hora.
              </span>
            </div>

            <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAvaliacaoModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoAvaliacao || (acaoAvaliacao === 'Negada' && !parecerTexto.trim())}
                className={cn(
                  'text-white text-xs h-9 min-h-[38px] font-bold rounded-xl shadow-xs',
                  acaoAvaliacao === 'Negada'
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : 'bg-[#0F5342] hover:bg-[#0C4336]',
                )}
              >
                {salvandoAvaliacao ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Salvando Parecer...
                  </>
                ) : (
                  `Confirmar ${acaoAvaliacao}`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: TIMELINE DE AUDITORIA DO ITEM (ADMIN ONLY) */}
      <Dialog open={timelineModalOpen} onOpenChange={setTimelineModalOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl bg-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
              <History className="h-5 w-5 text-[#0D8272]" />
              Trilha de Auditoria da Solicitação
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Registro imutável no servidor de todas as ações tomadas sobre este medicamento.
            </DialogDescription>
          </DialogHeader>

          {timelineItem && (
            <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 text-xs">
              <p className="font-bold text-slate-900">
                {timelineItem.expand?.medicamento?.nome || timelineItem.nome_medicamento_novo}
              </p>
              <p className="text-[11px] text-slate-500">
                ID do Registro: <span className="font-mono">{timelineItem.id}</span>
              </p>
            </div>
          )}

          {loadingTimeline ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-[#0D8272] mb-2" />
              <p className="text-xs">Carregando eventos do servidor...</p>
            </div>
          ) : timelineLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Nenhum evento registrado até o momento para este item.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {timelineLogs.map((log, index) => {
                const dataFormatada = formatarDataSegura(log.created, {
                  incluirHora: true,
                  incluirSegundos: true,
                  fallback: 'Data indisponível',
                })

                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5 shadow-2xs relative"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getAcaoBadge(log.acao)}
                        <span className="font-semibold text-slate-800">
                          {log.usuario_nome || log.usuario_email || 'Sistema'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Calendar size={11} />
                        {dataFormatada}
                      </span>
                    </div>

                    {log.detalhes && (
                      <p className="text-slate-600 text-[11px] leading-relaxed">{log.detalhes}</p>
                    )}

                    {(log.status_anterior || log.status_novo) && (
                      <div className="text-[10.5px] text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded">
                        Status: <span>{log.status_anterior || '—'}</span> &rarr;{' '}
                        <strong className="text-slate-800">{log.status_novo}</strong>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTimelineModalOpen(false)}
              className="text-xs w-full sm:w-auto"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  // Sub-render: Seção de Solicitações
  function renderSolicitacoesSection() {
    return (
      <div className="space-y-4">
        {/* Chips de filtro por Status */}
        <div className="flex flex-wrap items-center gap-2">
          {(['Todos', 'Pendente', 'Aprovada', 'Atendida', 'Negada'] as const).map((status) => {
            const isActive = statusFilter === status
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 min-h-[34px]',
                  isActive
                    ? 'bg-[#0F5342] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-emerald-950/10 hover:bg-emerald-50/50',
                )}
              >
                <span>{status === 'Todos' ? 'Todas' : status}</span>
                <span
                  className={cn(
                    'font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                    isActive ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-700',
                  )}
                >
                  {counts[status]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Buscar por medicamento, classe, justificativa, paciente ou solicitante..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="h-10 pl-9 text-xs sm:text-sm bg-white border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
          />
        </div>

        {/* Listagem de Solicitações */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
            <p className="text-xs">Carregando solicitações da Help Vida...</p>
          </div>
        ) : visibleSolicitacoes.length === 0 ? (
          <Card className="border-emerald-950/10 bg-white text-center py-12">
            <CardContent className="space-y-3">
              <FileQuestion className="h-12 w-12 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">Nenhuma solicitação encontrada</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {statusFilter !== 'Todos' || searchFilter
                  ? 'Nenhum pedido corresponde aos filtros aplicados.'
                  : 'Quando um profissional médico cadastrar a solicitação de um medicamento não padronizado, o pedido entrará aqui com status pendente de aprovação.'}
              </p>
              <Button
                onClick={() => setNovaSolicitacaoOpen(true)}
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold h-9 rounded-xl shadow-xs"
              >
                <Plus size={14} className="mr-1.5 text-[#F5B31C]" />
                Cadastrar Primeira Solicitação
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleSolicitacoes.map((item) => {
              const dataFormatada = formatarDataSegura(item.created, {
                incluirHora: true,
                fallback: 'Data indisponível',
              })

              const medNome =
                item.expand?.medicamento?.nome ||
                item.nome_medicamento_novo ||
                'Medicamento Solicitado'
              const medClasse =
                item.expand?.medicamento?.classe || item.classe_terapeutica || 'Não especificada'
              const solicitanteNome =
                item.expand?.solicitante?.name ||
                item.expand?.solicitante?.email ||
                'Profissional Help Vida'

              const isNovoNaoCatalogado = !item.medicamento && Boolean(item.nome_medicamento_novo)

              return (
                <Card
                  key={item.id}
                  className="border-emerald-950/10 bg-white hover:border-[#0D8272]/40 transition shadow-xs overflow-hidden"
                >
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill size={16} className="text-[#0D8272] shrink-0" />
                          <h4 className="text-sm sm:text-base font-bold text-[#0C4336] leading-snug">
                            {medNome}
                          </h4>
                          {isNovoNaoCatalogado && (
                            <Badge className="bg-[#FEF8EC] text-[#92400E] border border-[#F5B31C]/40 text-[10px] font-bold">
                              Novo (Não Catalogado)
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Classe: <strong className="text-slate-700">{medClasse}</strong>
                          {item.apresentacao && (
                            <>
                              {' '}
                              &bull; Apresentação:{' '}
                              <strong className="text-slate-700">{item.apresentacao}</strong>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {getStatusBadge(item.status)}

                        {/* Botões rápidos de decisão da Farmacêutica Clínica (Admin) */}
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAvaliacao(item, 'Aprovada')}
                              className="h-8 text-xs border-emerald-950/20 text-[#0C4336] hover:bg-[#E6F5F2]"
                              title="Aprovar ou emitir parecer"
                            >
                              <CheckCheck size={13} className="mr-1 text-[#0D8272]" />
                              Avaliar
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openTimeline(item)}
                              className="h-8 text-xs text-slate-500 hover:text-slate-800"
                              title="Ver log de auditoria"
                            >
                              <History size={13} />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dados minimizados do paciente (se houver) */}
                    {item.dados_paciente && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">
                          Paciente:{' '}
                          <strong className="text-slate-800 font-medium">
                            {item.dados_paciente}
                          </strong>
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <ShieldCheck size={11} className="text-[#0D8272]" /> LGPD Mínima
                        </span>
                      </div>
                    )}

                    {/* Justificativa clínica */}
                    <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Justificativa Médica Apresentada
                      </span>
                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {item.justificativa}
                      </p>
                    </div>

                    {/* Resposta / Parecer da Farmácia Clínica se houver */}
                    {item.resposta_comissao && (
                      <div className="p-3 rounded-xl bg-[#E6F5F2] border border-[#0D8272]/20 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#0C4336] flex items-center gap-1">
                            <MessageSquare size={12} className="text-[#0D8272]" />
                            Parecer da Farmácia Clínica / Comissão Técnica
                          </span>
                          {item.expand?.avaliador?.name && (
                            <span className="text-[10px] text-[#0D8272] font-semibold">
                              Por: {item.expand.avaliador.name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#0C4336] leading-relaxed whitespace-pre-wrap">
                          {item.resposta_comissao}
                        </p>
                      </div>
                    )}

                    {/* Rodapé do card: Solicitante e Data */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5 font-medium text-slate-600">
                        <UserIcon size={13} className="text-[#0D8272]" />
                        Solicitado por: <strong>{solicitanteNome}</strong>
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar size={13} />
                        {dataFormatada}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Sub-render: Seção de Auditoria Geral (Admin Only)
  function renderAuditSection() {
    return (
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                <History className="h-5 w-5 text-[#0D8272]" />
                Trilha de Auditoria do Servidor (Audit Logs)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Registro imutável gerado pelos hooks do servidor a cada ação tomada sobre
                solicitações
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAuditLogs}
              disabled={loadingAudit}
              className="h-8 text-xs border-emerald-950/20 text-[#0C4336]"
            >
              <RefreshCw size={12} className={cn('mr-1.5', loadingAudit && 'animate-spin')} />
              Atualizar Logs
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filtros da auditoria */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Filtrar por usuário, e-mail, id do registro ou detalhe..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="h-9 pl-9 text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
              {[
                { id: 'Todas', label: 'Todas as Ações' },
                { id: 'SOLICITACAO_CRIADA', label: 'Criação' },
                { id: 'SOLICITACAO_APROVADA', label: 'Aprovação' },
                { id: 'SOLICITACAO_NEGADA', label: 'Negativa' },
                { id: 'SOLICITACAO_ATENDIDA', label: 'Atendimento' },
                { id: 'PARECER_ADICIONADO', label: 'Parecer' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAuditAcaoFilter(opt.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold transition',
                    auditAcaoFilter === opt.id
                      ? 'bg-[#0F5342] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Logs */}
          {loadingAudit ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-[#0D8272] mb-2" />
              <p className="text-xs">Carregando registros de auditoria...</p>
            </div>
          ) : visibleAuditLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Nenhum evento registrado com os filtros aplicados.
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleAuditLogs.map((log) => {
                const dataFormatada = formatarDataSegura(log.created, {
                  incluirHora: true,
                  incluirSegundos: true,
                  fallback: 'Data indisponível',
                })

                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-[#F4FAF8]/80 border border-emerald-950/10 text-xs space-y-1.5 hover:bg-[#F4FAF8] transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        {getAcaoBadge(log.acao)}
                        <span className="font-bold text-slate-900">
                          {log.usuario_nome || log.usuario_email || 'Usuário'}
                        </span>
                        {log.usuario_role && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({log.usuario_role})
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Calendar size={12} />
                        {dataFormatada}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-600">
                      <span>{log.detalhes}</span>
                      <span className="font-mono text-slate-400 text-[10px]">
                        Ref: {log.registro_id}
                      </span>
                    </div>

                    {(log.status_anterior || log.status_novo) && (
                      <div className="text-[10.5px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-100 w-fit">
                        Status: <span>{log.status_anterior || '—'}</span> &rarr;{' '}
                        <strong className="text-[#0C4336]">{log.status_novo}</strong>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }
}
