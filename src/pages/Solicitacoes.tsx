import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import {
  FileQuestion,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
  Filter,
  User as UserIcon,
  Pill,
  Calendar,
  AlertTriangle,
  Loader2,
  Edit3,
  MessageSquare,
  Check,
  X,
  FileText,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export type SolicitacaoStatus = 'Pendente' | 'Aprovada' | 'Atendida' | 'Negada'

import type { RecordModel } from 'pocketbase'

export interface SolicitacaoRecord extends RecordModel {
  medicamento: string
  solicitante: string
  justificativa: string
  status: SolicitacaoStatus
  resposta_comissao?: string
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
  }
}

export default function Solicitacoes() {
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todos' | SolicitacaoStatus>('Todos')

  // Modais de detalhe e de edição de status (Admin)
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<SolicitacaoRecord | null>(null)
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [novoStatus, setNovoStatus] = useState<SolicitacaoStatus>('Pendente')
  const [respostaComissao, setRespostaComissao] = useState('')
  const [salvandoStatus, setSalvandoStatus] = useState(false)

  const loadSolicitacoes = async () => {
    try {
      const records = await pb.collection('solicitacoes').getFullList<SolicitacaoRecord>({
        sort: '-created',
        expand: 'medicamento,solicitante',
      })
      setSolicitacoes(records)
    } catch (err) {
      console.error('Erro ao carregar solicitações:', err)
      toast({
        title: 'Falha ao buscar solicitações',
        description: getErrorMessage(err, 'Não foi possível sincronizar o histórico de pedidos.'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSolicitacoes()
  }, [])

  // Tempo real via useRealtime
  useRealtime<SolicitacaoRecord>('solicitacoes', (event) => {
    if (event.action === 'create') {
      // Recarregar para garantir o expand preenchido
      loadSolicitacoes()
    } else if (event.action === 'update') {
      setSolicitacoes((prev) =>
        prev.map((item) => (item.id === event.record.id ? { ...item, ...event.record } : item)),
      )
    } else if (event.action === 'delete') {
      setSolicitacoes((prev) => prev.filter((item) => item.id !== event.record.id))
    }
  })

  // Filtros: se não for admin, usuário só vê suas próprias solicitações
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
        const medNome = s.expand?.medicamento?.nome?.toLowerCase() || ''
        const medClasse = s.expand?.medicamento?.classe?.toLowerCase() || ''
        const solNome = s.expand?.solicitante?.name?.toLowerCase() || ''
        const solEmail = s.expand?.solicitante?.email?.toLowerCase() || ''
        const just = s.justificativa?.toLowerCase() || ''
        return (
          medNome.includes(q) ||
          medClasse.includes(q) ||
          solNome.includes(q) ||
          solEmail.includes(q) ||
          just.includes(q)
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

  const getStatusBadge = (status: SolicitacaoStatus) => {
    switch (status) {
      case 'Pendente':
        return (
          <Badge className="bg-[#FEF8EC] text-[#92400E] border border-[#F5B31C]/40 text-[11px] font-bold flex items-center gap-1">
            <Clock size={12} className="text-[#F5B31C]" />
            Pendente
          </Badge>
        )
      case 'Aprovada':
        return (
          <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-[11px] font-bold flex items-center gap-1">
            <CheckCircle2 size={12} className="text-[#0D8272]" />
            Aprovada
          </Badge>
        )
      case 'Atendida':
        return (
          <Badge className="bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1">
            <Check size={12} />
            Atendida
          </Badge>
        )
      case 'Negada':
        return (
          <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1">
            <XCircle size={12} className="text-rose-600" />
            Negada
          </Badge>
        )
    }
  }

  const handleOpenAdminModal = (item: SolicitacaoRecord) => {
    setSelectedSolicitacao(item)
    setNovoStatus(item.status)
    setRespostaComissao(item.resposta_comissao || '')
    setAdminModalOpen(true)
  }

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSolicitacao) return

    // Validação client-side: se negada, exigir parecer explicativo
    if (novoStatus === 'Negada' && !respostaComissao.trim()) {
      toast({
        title: 'Parecer obrigatório para negativa',
        description:
          'Por favor, informe a justificativa técnica da comissão para a negativa do medicamento.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoStatus(true)
    try {
      await pb.collection('solicitacoes').update(selectedSolicitacao.id, {
        status: novoStatus,
        resposta_comissao: respostaComissao.trim(),
      })

      toast({
        title: 'Parecer salvo com sucesso!',
        description: `Solicitação atualizada para "${novoStatus}".`,
      })
      setAdminModalOpen(false)
      loadSolicitacoes()
    } catch (err: unknown) {
      console.error('Erro ao atualizar solicitação:', err)
      toast({
        title: 'Erro ao salvar parecer',
        description: getErrorMessage(err, 'Não foi possível salvar a avaliação da comissão.'),
        variant: 'destructive',
      })
    } finally {
      setSalvandoStatus(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight flex items-center gap-2">
            <FileQuestion className="h-6 w-6 text-[#0D8272]" />
            Solicitações de Medicamentos Não Padronizados
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdmin
              ? 'Painel da Comissão: gerencie pedidos e justificativas clínicas da equipe médica'
              : 'Histórico de pedidos com justificativa médica submetidos à Comissão Técnica Help Vida'}
          </p>
        </div>

        {isAdmin && (
          <Badge className="bg-[#0F5342] text-white text-xs px-3 py-1 font-bold w-fit">
            Visão Geral Admin ({counts.Pendente} pendente{counts.Pendente === 1 ? '' : 's'})
          </Badge>
        )}
      </div>

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
          placeholder="Buscar por medicamento, classe, justificativa ou solicitante..."
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
                : 'Quando um profissional médico solicitar a padronização de um medicamento com justificativa, o pedido ficará registrado nesta tela.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleSolicitacoes.map((item) => {
            const dataObj = new Date(item.created)
            const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })

            const medNome = item.expand?.medicamento?.nome || 'Medicamento Solicitado'
            const medClasse = item.expand?.medicamento?.classe || 'Não especificada'
            const solicitanteNome =
              item.expand?.solicitante?.name ||
              item.expand?.solicitante?.email ||
              'Profissional Help Vida'

            return (
              <Card
                key={item.id}
                className="border-emerald-950/10 bg-white hover:border-[#0D8272]/40 transition shadow-xs overflow-hidden"
              >
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Pill size={16} className="text-[#0D8272] shrink-0" />
                        <h4 className="text-sm sm:text-base font-bold text-[#0C4336] leading-snug">
                          {medNome}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500">
                        Classe: <strong className="text-slate-700">{medClasse}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(item.status)}
                      {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenAdminModal(item)}
                          className="h-8 text-xs border-emerald-950/20 text-[#0C4336] hover:bg-[#E6F5F2]"
                        >
                          <Edit3 size={12} className="mr-1 text-[#0D8272]" />
                          Avaliar Pedido
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Justificativa clínica */}
                  <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Justificativa Médica Apresentada
                    </span>
                    <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {item.justificativa}
                    </p>
                  </div>

                  {/* Resposta da comissão se houver */}
                  {item.resposta_comissao && (
                    <div className="p-3 rounded-xl bg-[#E6F5F2] border border-[#0D8272]/20 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0C4336] block flex items-center gap-1">
                        <MessageSquare size={12} className="text-[#0D8272]" />
                        Parecer da Comissão Técnica / Farmácia
                      </span>
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

      {/* Modal de Avaliação / Alteração de Status (Admin) */}
      <Dialog open={adminModalOpen} onOpenChange={setAdminModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
          <form onSubmit={handleSaveStatus} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-[#0D8272]" />
                Avaliar Solicitação de Medicamento
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 pt-1">
                Atualize o parecer da Comissão Técnica Help Vida para esta solicitação.
              </DialogDescription>
            </DialogHeader>

            {selectedSolicitacao && (
              <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 text-xs space-y-1">
                <p className="font-bold text-slate-900">
                  {selectedSolicitacao.expand?.medicamento?.nome}
                </p>
                <p className="text-slate-500 text-[11px]">
                  Solicitante:{' '}
                  {selectedSolicitacao.expand?.solicitante?.name ||
                    selectedSolicitacao.expand?.solicitante?.email}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="statusSelect" className="text-xs font-bold text-slate-700">
                Status da Solicitação *
              </Label>
              <Select
                value={novoStatus}
                onValueChange={(val: SolicitacaoStatus) => setNovoStatus(val)}
              >
                <SelectTrigger id="statusSelect" className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Aprovada">Aprovada (Pela Comissão)</SelectItem>
                  <SelectItem value="Atendida">Atendida (Disponibilizada)</SelectItem>
                  <SelectItem value="Negada">Negada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="respostaComissao" className="text-xs font-bold text-slate-700">
                Parecer / Observação da Comissão (opcional)
              </Label>
              <Textarea
                id="respostaComissao"
                placeholder="Ex: Aprovada para o ciclo de 7 dias conforme protocolo clínico ou justificativa da negativa..."
                value={respostaComissao}
                onChange={(e) => setRespostaComissao(e.target.value)}
                rows={3}
                className="text-xs focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
            </div>

            <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAdminModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoStatus}
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs h-9 min-h-[38px] font-bold rounded-xl"
              >
                {salvandoStatus ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Parecer'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
