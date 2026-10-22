import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import {
  Users,
  User,
  UserPlus,
  ShieldCheck,
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Clock,
  Calendar,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarDataSegura, textoSeguro, textoMinusculoSeguro } from '@/lib/formatters'

export interface UserTeamRecord {
  id: string
  name?: string | null
  email?: string | null
  role?: 'admin' | 'comum' | 'medico_visitador' | string | null
  approval_status?: 'pendente' | 'aprovado' | 'negado' | string | null
  verified?: boolean | null
  created?: string | null
}

export default function Equipe() {
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()

  const [membros, setMembros] = useState<UserTeamRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'aprovados' | 'pendentes' | 'negados'>('aprovados')

  const navigate = useNavigate()

  // Modal para cadastrar colega
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('HelpVida@2025')
  const [showNovaSenha, setShowNovaSenha] = useState(false)
  const [novoRole, setNovoRole] = useState<'comum' | 'admin' | 'medico_visitador'>('comum')
  const [criandoMembro, setCriandoMembro] = useState(false)
  const [modalFormError, setModalFormError] = useState<string | null>(null)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

  // Modal para convite / redefinição de senha
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [membroParaReset, setMembroParaReset] = useState<UserTeamRecord | null>(null)
  const [enviandoReset, setEnviandoReset] = useState(false)

  // Estado para ação de Aprovar / Negar
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null)
  const [confirmNegarUser, setConfirmNegarUser] = useState<UserTeamRecord | null>(null)
  const [modalRevisarUser, setModalRevisarUser] = useState<UserTeamRecord | null>(null)
  const [selectedRoleForApproval, setSelectedRoleForApproval] = useState<
    'comum' | 'medico_visitador' | 'admin'
  >('comum')
  const [approvalRoleError, setApprovalRoleError] = useState<string | null>(null)

  const loadMembros = async () => {
    setLoading(true)
    try {
      const records = await pb.collection('users').getFullList<UserTeamRecord>({
        sort: '-created',
      })
      setMembros(records)
    } catch (err) {
      console.error('Erro ao carregar equipe:', err)
      toast({
        title: 'Erro ao carregar membros',
        description: 'Não foi possível carregar a lista da equipe Help Vida.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembros()

    // Subscrição em tempo real para refletir novos cadastros e mudanças instantaneamente
    const unsubscribePromise = pb.collection('users').subscribe('*', () => {
      loadMembros()
    })

    return () => {
      unsubscribePromise
        .then((unsub) => {
          if (typeof unsub === 'function') {
            unsub()
          }
        })
        .catch(() => {
          pb.collection('users')
            .unsubscribe('*')
            .catch(() => {})
        })
    }
  }, [])

  // Abre o modal de revisão do cadastro para definir o perfil antes de aprovar
  const handleOpenReviewModal = (targetUser: UserTeamRecord) => {
    setModalRevisarUser(targetUser)
    setApprovalRoleError(null)
    // Se o usuário já tiver perfil pré-definido como médico_visitador ou admin, inicializar com ele; senão default 'comum'
    const currentRole = targetUser?.role?.toLowerCase()
    if (currentRole === 'medico_visitador') {
      setSelectedRoleForApproval('medico_visitador')
    } else if (currentRole === 'admin') {
      setSelectedRoleForApproval('admin')
    } else {
      setSelectedRoleForApproval('comum')
    }
  }

  // Função para aprovar ou negar cadastro
  const handleReviewUser = async (
    targetUser: UserTeamRecord,
    decision: 'aprovar' | 'negar',
    roleToAssign?: 'comum' | 'medico_visitador' | 'admin',
  ) => {
    if (!targetUser?.id) return

    if (decision === 'aprovar') {
      const roleFinal = roleToAssign || selectedRoleForApproval
      if (!roleFinal) {
        setApprovalRoleError('Selecione obrigatoriamente um perfil de acesso antes de aprovar.')
        toast({
          title: 'Perfil obrigatório',
          description:
            'Por favor, defina o nível de acesso do usuário antes de liberar o cadastro.',
          variant: 'destructive',
        })
        return
      }
    }

    setReviewingUserId(targetUser.id)

    try {
      const payload: {
        userId: string
        decision: 'aprovar' | 'negar'
        role?: 'comum' | 'medico_visitador' | 'admin'
      } = {
        userId: targetUser.id,
        decision,
      }
      if (decision === 'aprovar') {
        payload.role = roleToAssign || selectedRoleForApproval
      }

      await pb.send('/backend/v1/admin/review-user', {
        method: 'POST',
        body: payload,
      })

      const roleNomeAmigavel =
        payload.role === 'admin'
          ? 'Administrador'
          : payload.role === 'medico_visitador'
            ? 'Médico Visitador (Apenas Padronizados)'
            : 'Corpo Clínico'

      toast({
        title: decision === 'aprovar' ? 'Cadastro aprovado com sucesso!' : 'Cadastro negado',
        description:
          decision === 'aprovar'
            ? `O acesso de ${targetUser.name || targetUser.email} foi liberado com perfil "${roleNomeAmigavel}".`
            : `O cadastro de ${targetUser.name || targetUser.email} foi negado.`,
      })

      setConfirmNegarUser(null)
      setModalRevisarUser(null)
      await loadMembros()
    } catch (err: unknown) {
      console.error('Erro ao avaliar usuário:', err)
      // Fallback: se a rota custom falhar, tentar atualização direta via SDK pelo admin
      try {
        const novoStatus = decision === 'aprovar' ? 'aprovado' : 'negado'
        const roleFinal =
          decision === 'aprovar' ? roleToAssign || selectedRoleForApproval : targetUser.role
        await pb.collection('users').update(targetUser.id, {
          approval_status: novoStatus,
          role: roleFinal,
          verified: decision === 'aprovar' ? true : targetUser.verified,
        })

        const roleNomeAmigavel =
          roleFinal === 'admin'
            ? 'Administrador'
            : roleFinal === 'medico_visitador'
              ? 'Médico Visitador (Apenas Padronizados)'
              : 'Corpo Clínico'

        // Tentar salvar log de auditoria
        try {
          await pb.collection('audit_logs').create({
            colecao: 'users',
            registro_id: targetUser.id,
            acao: decision === 'aprovar' ? 'CADASTRO_APROVADO' : 'CADASTRO_NEGADO',
            usuario: user?.id,
            usuario_nome: user?.name || '',
            usuario_email: user?.email || '',
            usuario_role: user?.role || 'admin',
            status_anterior: `${targetUser.approval_status || 'pendente'} (perfil: ${targetUser.role || 'comum'})`,
            status_novo: `${novoStatus} (perfil: ${roleFinal})`,
            detalhes:
              (decision === 'aprovar'
                ? `Cadastro aprovado com perfil [${roleNomeAmigavel}] para: `
                : 'Cadastro negado para: ') + (targetUser.name || targetUser.email),
          })
        } catch {
          /* intentionally ignored */
        }

        toast({
          title: decision === 'aprovar' ? 'Cadastro aprovado com sucesso!' : 'Cadastro negado',
          description:
            decision === 'aprovar'
              ? `Acesso de ${targetUser.name || targetUser.email} liberado com perfil "${roleNomeAmigavel}".`
              : `Status de ${targetUser.name || targetUser.email} atualizado.`,
        })
        setConfirmNegarUser(null)
        setModalRevisarUser(null)
        await loadMembros()
      } catch (errFallback: unknown) {
        const friendly = getErrorMessage(
          errFallback,
          'Falha ao atualizar status de aprovação do usuário.',
        )
        setApprovalRoleError(friendly)
        toast({
          title: 'Erro ao avaliar',
          description: friendly,
          variant: 'destructive',
        })
      }
    } finally {
      setReviewingUserId(null)
    }
  }

  // Validações em tempo real para o formulário do modal
  const nomeLimpo = textoSeguro(novoNome).trim()
  const emailLimpo = textoMinusculoSeguro(novoEmail)
  const senhaLimpa = textoSeguro(novaSenha).trim()

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const emailValido = emailLimpo.length > 0 && emailRegex.test(emailLimpo)
  const senhaValida = senhaLimpa.length >= 8
  const nomeValido = nomeLimpo.length >= 2
  const emailJaExiste =
    emailLimpo.length > 0 && membros.some((m) => textoMinusculoSeguro(m?.email) === emailLimpo)

  // Diagnóstico das pendências para orientar o usuário
  const getValidationErrors = (): string[] => {
    const errors: string[] = []
    if (!nomeLimpo) {
      errors.push('Informe o nome completo do profissional.')
    } else if (nomeLimpo.length < 2) {
      errors.push('O nome deve ter pelo menos 2 caracteres.')
    }

    if (!emailLimpo) {
      errors.push('Informe o e-mail institucional.')
    } else if (!emailValido) {
      errors.push('Insira um e-mail válido (ex: colega@helpvida.com.br).')
    } else if (emailJaExiste) {
      errors.push(`O e-mail ${emailLimpo} já está cadastrado na equipe Help Vida.`)
    }

    if (!senhaLimpa) {
      errors.push('Informe a senha inicial provisória.')
    } else if (!senhaValida) {
      errors.push('A senha provisória deve ter no mínimo 8 caracteres.')
    }

    return errors
  }

  const isFormValid = nomeValido && emailValido && !emailJaExiste && senhaValida

  const resetCreateForm = () => {
    setNovoNome('')
    setNovoEmail('')
    setNovaSenha('HelpVida@2025')
    setShowNovaSenha(false)
    setNovoRole('comum')
    setModalFormError(null)
    setHasAttemptedSubmit(false)
  }

  const handleOpenCreateModal = () => {
    resetCreateForm()
    setCreateModalOpen(true)
  }

  const handleCreateMember = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
    }
    setHasAttemptedSubmit(true)
    setModalFormError(null)

    // Checar validade da sessão antes de qualquer chamada
    if (!pb.authStore.isValid || !user) {
      const msg = 'Sua sessão expirou. Por favor, entre novamente no sistema.'
      setModalFormError(msg)
      toast({
        title: 'Sessão expirada',
        description: msg,
        variant: 'destructive',
      })
      setTimeout(() => {
        navigate('/login', { state: { from: { pathname: '/equipe' } } })
      }, 1500)
      return
    }

    // 1. Validações client-side com mensagens claras em pt-BR
    const errors = getValidationErrors()
    if (errors.length > 0) {
      const firstError = errors[0]
      setModalFormError(firstError)
      toast({
        title: 'Preencha os campos obrigatórios',
        description: firstError,
        variant: 'destructive',
      })
      return
    }

    setCriandoMembro(true)
    try {
      // 1ª Tentativa: Endpoint administrativo seguro
      try {
        await pb.send('/backend/v1/admin/create-user', {
          method: 'POST',
          body: {
            name: nomeLimpo,
            email: emailLimpo,
            password: senhaLimpa,
            role: novoRole,
          },
        })

        toast({
          title: 'Colega cadastrado com sucesso!',
          description: `A conta para ${emailLimpo} foi criada. O profissional já pode acessar o sistema com a senha provisória informada.`,
        })

        setCreateModalOpen(false)
        resetCreateForm()
        loadMembros()
        return
      } catch (errAdmin: unknown) {
        // Se foi erro de autenticação (401), avisar explicitamente sobre sessão
        const adminMsg = String(errAdmin)
        if (
          adminMsg.includes('401') ||
          adminMsg.includes('não autorizado') ||
          !pb.authStore.isValid
        ) {
          throw new Error('Sua sessão expirou ou não está autorizada. Por favor, entre novamente.')
        }

        // Fallback: tentar via SDK nativo users.create
        await pb.collection('users').create({
          name: nomeLimpo,
          email: emailLimpo,
          password: senhaLimpa,
          passwordConfirm: senhaLimpa,
          role: novoRole,
          verified: true,
        })

        toast({
          title: 'Colega cadastrado com sucesso!',
          description: `A conta para ${emailLimpo} foi criada. Ele(a) já pode entrar no app.`,
        })

        setCreateModalOpen(false)
        resetCreateForm()
        loadMembros()
      }
    } catch (err: unknown) {
      console.error('Erro ao cadastrar colega:', err)
      const friendlyMsg = getErrorMessage(
        err,
        'Não foi possível concluir o cadastro. Verifique se o e-mail já existe ou se a senha atende aos requisitos.',
      )
      setModalFormError(friendlyMsg)
      toast({
        title: 'Erro no cadastro',
        description: friendlyMsg,
        variant: 'destructive',
      })

      const friendlyMsgLower = textoMinusculoSeguro(friendlyMsg)
      if (friendlyMsgLower.includes('sessão') || friendlyMsgLower.includes('login')) {
        setTimeout(() => {
          navigate('/login', { state: { from: { pathname: '/equipe' } } })
        }, 2000)
      }
    } finally {
      setCriandoMembro(false)
    }
  }

  const handleRequestPasswordReset = async () => {
    if (!membroParaReset) return
    const emailDestino = textoMinusculoSeguro(membroParaReset.email)
    if (!emailDestino) {
      toast({
        title: 'E-mail indisponível',
        description: 'Não foi possível identificar o e-mail do usuário para envio das instruções.',
        variant: 'destructive',
      })
      return
    }

    setEnviandoReset(true)
    try {
      await pb.collection('users').requestPasswordReset(emailDestino)
      toast({
        title: 'Instruções enviadas!',
        description: `E-mail de redefinição de acesso enviado com sucesso para ${emailDestino}.`,
      })
      setResetModalOpen(false)
      setMembroParaReset(null)
    } catch (err: unknown) {
      console.error('Erro ao solicitar reset:', err)
      const friendlyMsg = getErrorMessage(
        err,
        'Falha ao enviar instruções de redefinição para o e-mail informado.',
      )
      toast({
        title: 'Erro ao enviar instruções',
        description: friendlyMsg,
        variant: 'destructive',
      })
    } finally {
      setEnviandoReset(false)
    }
  }

  // Separação por status de aprovação
  // Observação: contas sem status definido são consideradas 'aprovado' (compatibilidade legado)
  const pendentesList = membros.filter((m) => {
    const s = m?.approval_status?.toLowerCase()
    return s === 'pendente'
  })

  const negadosList = membros.filter((m) => {
    const s = m?.approval_status?.toLowerCase()
    return s === 'negado'
  })

  const aprovadosList = membros.filter((m) => {
    const s = m?.approval_status?.toLowerCase()
    return s === 'aprovado' || !s
  })

  const filterBySearch = (list: UserTeamRecord[]) => {
    const q = textoMinusculoSeguro(search)
    if (!q) return list
    return list.filter((m) => {
      const nome = textoMinusculoSeguro(m?.name)
      const email = textoMinusculoSeguro(m?.email)
      const role = textoMinusculoSeguro(m?.role)
      return nome.includes(q) || email.includes(q) || role.includes(q)
    })
  }

  const filteredAprovados = filterBySearch(aprovadosList)
  const filteredPendentes = filterBySearch(pendentesList)
  const filteredNegados = filterBySearch(negadosList)

  // Se houver pendentes e a URL tiver hash ou query indicando aprovações, abrir a aba
  useEffect(() => {
    if (pendentesList.length > 0 && window.location.hash === '#aprovacoes') {
      setActiveTab('pendentes')
    }
  }, [pendentesList.length])

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Acesso Restrito à Comissão</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Em conformidade com a LGPD (Princípio da Minimização), a visualização dos dados cadastrais
          e gestão de contas da equipe é restrita aos administradores e à comissão técnica da Help
          Vida.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-[#0D8272]" />
            Gestão de Contas da Equipe
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre os profissionais da equipe médica e farmacêutica para circulação do app Help
            Vida
          </p>
        </div>

        {isAdmin && (
          <Button
            onClick={handleOpenCreateModal}
            className="bg-[#0F5342] hover:bg-[#0C4336] active:scale-[0.98] text-white text-xs font-bold h-11 min-h-[44px] px-4 rounded-xl shadow-xs touch-manipulation transition-transform"
          >
            <UserPlus className="mr-1.5 h-4 w-4 text-[#F5B31C]" />
            Cadastrar Novo Colega
          </Button>
        )}
      </div>

      {/* Alerta de banner se houver cadastros pendentes de aprovação */}
      {pendentesList.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-amber-950">
                {pendentesList.length === 1
                  ? 'Existe 1 cadastro aguardando sua aprovação'
                  : `Existem ${pendentesList.length} novos cadastros aguardando sua aprovação`}
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Novos usuários que se cadastraram não têm acesso até que você valide e libere.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setActiveTab('pendentes')}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl h-9 px-4 shrink-0 shadow-xs"
          >
            Revisar Pendentes ({pendentesList.length})
          </Button>
        </div>
      )}

      {/* Navegação por Abas: Membros Ativos, Pendentes e Negados */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'aprovados' | 'pendentes' | 'negados')}
        className="w-full space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <TabsList className="bg-[#E6F5F2] p-1 rounded-xl h-auto flex flex-wrap self-start">
            <TabsTrigger
              value="aprovados"
              className="rounded-lg text-xs font-semibold py-2 px-3.5 data-[state=active]:bg-[#0F5342] data-[state=active]:text-white transition-all flex items-center gap-1.5"
            >
              <Users size={14} />
              Equipe Ativa
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                {aprovadosList.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="pendentes"
              className="rounded-lg text-xs font-semibold py-2 px-3.5 data-[state=active]:bg-[#0F5342] data-[state=active]:text-white transition-all flex items-center gap-1.5 relative"
            >
              <Clock size={14} className={pendentesList.length > 0 ? 'text-amber-500' : ''} />
              Aprovações Pendentes
              {pendentesList.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold animate-pulse">
                  {pendentesList.length}
                </span>
              )}
            </TabsTrigger>
            {negadosList.length > 0 && (
              <TabsTrigger
                value="negados"
                className="rounded-lg text-xs font-semibold py-2 px-3.5 data-[state=active]:bg-[#0F5342] data-[state=active]:text-white transition-all flex items-center gap-1.5"
              >
                <UserX size={14} />
                Negados
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                  {negadosList.length}
                </span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Barra de Busca e Atualização */}
          <div className="flex items-center gap-2 flex-1 sm:max-w-md justify-end">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 text-xs sm:text-sm bg-white border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadMembros}
              disabled={loading}
              className="h-10 text-xs border-emerald-950/20 text-[#0C4336] hover:bg-[#E6F5F2] shrink-0"
              title="Atualizar lista"
            >
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* ABA: PENDENTES DE APROVAÇÃO */}
        <TabsContent value="pendentes" className="space-y-3 mt-0">
          <Card className="border-emerald-950/10 bg-white shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-emerald-950/5 bg-[#F4FAF8]/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-[#0C4336] flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    Novos Cadastros Aguardando Validação
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Usuários cadastrados pela página pública. Valide a identidade institucional para
                    liberar o acesso.
                  </CardDescription>
                </div>
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs font-semibold self-start sm:self-auto">
                  {pendentesList.length} {pendentesList.length === 1 ? 'pendência' : 'pendências'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
                  <p className="text-xs">Carregando cadastros pendentes...</p>
                </div>
              ) : filteredPendentes.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Nenhum cadastro pendente no momento
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Todos os auto-cadastros foram avaliados ou não há novas solicitações de acesso.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-emerald-950/5">
                  {filteredPendentes.map((m) => {
                    const nomeTexto = textoSeguro(m?.name).trim()
                    const emailTexto = textoSeguro(m?.email).trim()
                    const dataCriacao = formatarDataSegura(m?.created, {
                      fallback: 'Data indisponível',
                    })
                    const isBusy = reviewingUserId === m.id

                    const initials = nomeTexto
                      ? nomeTexto
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()
                      : emailTexto
                        ? emailTexto.slice(0, 2).toUpperCase()
                        : 'HV'

                    return (
                      <div
                        key={m.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenReviewModal(m)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleOpenReviewModal(m)
                          }
                        }}
                        className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-amber-50/60 cursor-pointer transition focus:outline-none focus:bg-amber-50/70"
                        title="Clique para abrir e definir o nível de acesso antes da aprovação"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10 rounded-xl bg-amber-500 text-white text-xs font-bold shrink-0 border border-amber-600/30">
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {nomeTexto || 'Nome não informado'}
                              </p>
                              <Badge className="bg-amber-100 text-amber-800 text-[10px] font-semibold border-amber-200">
                                Aguardando Aprovação
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                              <Mail size={12} className="text-slate-400 shrink-0" />
                              {emailTexto}
                            </p>
                            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 md:hidden">
                              <Calendar size={11} />
                              Cadastrado em {dataCriacao}
                            </p>
                          </div>
                        </div>

                        <div
                          className="flex items-center justify-between md:justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-0 border-slate-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[11px] text-slate-400 font-mono hidden md:inline-flex items-center gap-1 mr-2">
                            <Calendar size={12} />
                            {dataCriacao}
                          </span>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmNegarUser(m)
                            }}
                            className="h-11 min-h-[44px] px-3 text-xs text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200 rounded-xl"
                          >
                            <UserX size={14} className="mr-1 text-rose-500" />
                            Negar
                          </Button>

                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenReviewModal(m)
                            }}
                            className="h-11 min-h-[44px] text-xs font-bold bg-[#0F5342] hover:bg-[#0C4336] active:scale-[0.98] text-white shadow-xs rounded-xl px-4"
                            title="Abrir cadastro para definir o perfil de acesso e aprovar"
                          >
                            <UserCheck size={14} className="mr-1.5 text-[#F5B31C]" />
                            Revisar e Aprovar
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: EQUIPE ATIVA (APROVADOS) */}
        <TabsContent value="aprovados" className="space-y-3 mt-0">
          <Card className="border-emerald-950/10 bg-white shadow-xs">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
                  <p className="text-xs">Carregando usuários da Help Vida...</p>
                </div>
              ) : filteredAprovados.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Users className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Nenhum membro ativo encontrado
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Utilize o botão acima para cadastrar os médicos e farmacêuticos da equipe.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-emerald-950/5">
                  {filteredAprovados.map((m) => {
                    const nomeTexto = textoSeguro(m?.name).trim()
                    const emailTexto = textoSeguro(m?.email).trim()
                    const emailMinusculo = emailTexto.toLowerCase()

                    const initials = nomeTexto
                      ? nomeTexto
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()
                      : emailTexto
                        ? emailTexto.slice(0, 2).toUpperCase()
                        : 'HV'

                    const dataCriacao = formatarDataSegura(m?.created, {
                      fallback: 'Data indisponível',
                    })

                    const isCurrentUser = Boolean(user?.id && m?.id && user.id === m.id)
                    const isMemberAdmin =
                      m?.role === 'admin' || emailMinusculo === 'fernandofernandes@helpvida.com.br'

                    return (
                      <div
                        key={m?.id || emailTexto || Math.random()}
                        className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F4FAF8]/60 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10 rounded-xl bg-[#0F5342] text-white text-xs font-bold shrink-0 border border-emerald-600/30">
                            <AvatarFallback>{initials || 'HV'}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {nomeTexto || 'Sem nome informado'}
                              </p>
                              {isCurrentUser && (
                                <Badge className="bg-emerald-100 text-[#0C4336] text-[10px] font-bold">
                                  Você
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                              <Mail size={12} className="text-slate-400 shrink-0" />
                              {emailTexto || 'E-mail não informado'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 text-xs">
                          {/* Papel */}
                          {isMemberAdmin ? (
                            <Badge className="bg-[#0F5342] text-white text-[11px] font-bold flex items-center gap-1">
                              <ShieldCheck size={12} className="text-[#F5B31C]" />
                              Administrador
                            </Badge>
                          ) : m?.role === 'medico_visitador' ? (
                            <Badge className="bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-semibold flex items-center gap-1">
                              <User size={12} className="text-sky-600" />
                              Médico Visitador
                            </Badge>
                          ) : (
                            <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-[11px] font-medium">
                              Corpo Clínico
                            </Badge>
                          )}

                          {/* Data */}
                          <span className="text-[11px] text-slate-400 font-mono hidden md:inline-flex items-center gap-1">
                            <Calendar size={12} />
                            {dataCriacao}
                          </span>

                          {/* Ação de reset */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!emailTexto}
                            onClick={() => {
                              setMembroParaReset(m)
                              setResetModalOpen(true)
                            }}
                            className="h-8 text-xs text-slate-700 hover:bg-slate-50 border-slate-200"
                            title={
                              emailTexto
                                ? 'Enviar e-mail para redefinir senha'
                                : 'E-mail não cadastrado'
                            }
                          >
                            <KeyRound size={12} className="mr-1 text-slate-500" />
                            Redefinir Senha
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: CADASTROS NEGADOS */}
        {negadosList.length > 0 && (
          <TabsContent value="negados" className="space-y-3 mt-0">
            <Card className="border-rose-100 bg-white shadow-xs">
              <CardHeader className="p-4 sm:p-5 border-b border-rose-100 bg-rose-50/30">
                <CardTitle className="text-sm sm:text-base font-bold text-rose-950 flex items-center gap-2">
                  <UserX className="h-5 w-5 text-rose-600" />
                  Cadastros Não Autorizados
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Estes usuários tiveram o acesso recusado pela comissão e não conseguem logar no
                  sistema.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-rose-50">
                  {filteredNegados.map((m) => {
                    const nomeTexto = textoSeguro(m?.name).trim()
                    const emailTexto = textoSeguro(m?.email).trim()
                    const dataCriacao = formatarDataSegura(m?.created, {
                      fallback: 'Data indisponível',
                    })
                    const isBusy = reviewingUserId === m.id

                    return (
                      <div
                        key={m.id}
                        className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-rose-50/20"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800 line-through">
                              {nomeTexto || 'Sem nome'}
                            </p>
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">
                              Negado
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{emailTexto}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                            Cadastrado em {dataCriacao}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleReviewUser(m, 'aprovar')}
                          className="h-8 text-xs text-emerald-800 border-emerald-300 hover:bg-emerald-50 self-start sm:self-auto"
                        >
                          <UserCheck size={12} className="mr-1 text-emerald-600" />
                          Reverter e Aprovar
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Modal: Cadastrar Colega */}
      <Dialog
        open={createModalOpen}
        onOpenChange={(open) => {
          setCreateModalOpen(open)
          if (!open) {
            setModalFormError(null)
            setHasAttemptedSubmit(false)
          }
        }}
      >
        <DialogContent
          className="max-w-md w-[95vw] sm:w-full p-4 sm:p-6 rounded-2xl bg-white max-h-[90vh] overflow-y-auto"
          onOpenAutoFocus={(e) => {
            // Evita scroll jump indesejado em dispositivos móveis
            e.preventDefault()
          }}
        >
          <div className="space-y-4">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#0D8272] shrink-0" />
                Cadastrar Colega na Help Vida
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 pt-1">
                Crie a conta de acesso para um médico ou farmacêutico da equipe. Ele(a) poderá
                alterar a senha depois nas configurações.
              </DialogDescription>
            </DialogHeader>

            {/* Alerta de erro com explicação clara se houver falha ou validação */}
            {modalFormError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Atenção ao cadastro:</p>
                  <p className="text-[11px] mt-0.5 text-rose-700 leading-relaxed">
                    {modalFormError}
                  </p>
                </div>
              </div>
            )}

            {/* Aviso visual em caso de sessão inválida */}
            {(!pb.authStore.isValid || !user) && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  Sua sessão parece expirada. Clique em Concluir Cadastro para renovar ou entre
                  novamente.
                </p>
              </div>
            )}

            <form onSubmit={handleCreateMember} noValidate className="space-y-3.5">
              {/* Campo Nome */}
              <div className="space-y-1">
                <Label htmlFor="novoNome" className="text-xs font-bold text-slate-700">
                  Nome Completo do Profissional *
                </Label>
                <Input
                  id="novoNome"
                  name="novoNome"
                  autoComplete="name"
                  placeholder="Ex: Dra. Mariana Silva"
                  value={novoNome}
                  onChange={(e) => {
                    setNovoNome(e.target.value)
                    if (modalFormError) setModalFormError(null)
                  }}
                  className={cn(
                    'h-11 min-h-[44px] text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]',
                    hasAttemptedSubmit &&
                      !nomeValido &&
                      'border-rose-400 bg-rose-50/40 focus-visible:ring-rose-500',
                  )}
                />
                {hasAttemptedSubmit && !nomeValido && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle size={11} />
                    Informe o nome do colega.
                  </p>
                )}
              </div>

              {/* Campo E-mail */}
              <div className="space-y-1">
                <Label htmlFor="novoEmail" className="text-xs font-bold text-slate-700">
                  E-mail Institucional *
                </Label>
                <Input
                  id="novoEmail"
                  name="novoEmail"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  placeholder="mariana.silva@helpvida.com.br"
                  value={novoEmail}
                  onChange={(e) => {
                    setNovoEmail(e.target.value)
                    if (modalFormError) setModalFormError(null)
                  }}
                  className={cn(
                    'h-11 min-h-[44px] text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]',
                    hasAttemptedSubmit &&
                      (!emailValido || emailJaExiste) &&
                      'border-rose-400 bg-rose-50/40 focus-visible:ring-rose-500',
                  )}
                />
                {hasAttemptedSubmit && !emailLimpo && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle size={11} />
                    Informe o e-mail institucional.
                  </p>
                )}
                {hasAttemptedSubmit && emailLimpo && !emailValido && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle size={11} />
                    Formato de e-mail inválido. Deve conter @ e domínio (ex: @helpvida.com.br).
                  </p>
                )}
                {emailJaExiste && (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1 mt-0.5 font-medium">
                    <AlertTriangle size={11} />
                    Este e-mail já pertence a um profissional cadastrado na equipe.
                  </p>
                )}
              </div>

              {/* Perfil e Senha Provisória */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="novoRole" className="text-xs font-bold text-slate-700">
                    Perfil de Acesso *
                  </Label>
                  <Select
                    value={novoRole}
                    onValueChange={(val: 'comum' | 'admin' | 'medico_visitador') =>
                      setNovoRole(val)
                    }
                  >
                    <SelectTrigger
                      id="novoRole"
                      className="h-10 text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                    >
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comum">Corpo Clínico (Médico / Farmacêutico)</SelectItem>
                      <SelectItem value="medico_visitador">
                        Médico Visitador (Apenas Padronizados)
                      </SelectItem>
                      <SelectItem value="admin">Administrador (Gestão / Farmácia)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500">
                    O perfil <strong>Médico Visitador</strong> tem acesso restrito exclusivamente a
                    medicamentos padronizados (não visualiza não padronizados nem inativos).
                  </p>{' '}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="novaSenha" className="text-xs font-bold text-slate-700">
                    Senha Provisória *
                  </Label>
                  <div className="relative">
                    <Input
                      id="novaSenha"
                      name="novaSenha"
                      type={showNovaSenha ? 'text' : 'password'}
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="Mínimo 8 caracteres"
                      value={novaSenha}
                      onChange={(e) => {
                        setNovaSenha(e.target.value)
                        if (modalFormError) setModalFormError(null)
                      }}
                      className={cn(
                        'h-11 min-h-[44px] pr-10 text-xs font-mono bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]',
                        hasAttemptedSubmit &&
                          !senhaValida &&
                          'border-rose-400 bg-rose-50/40 focus-visible:ring-rose-500',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNovaSenha(!showNovaSenha)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md"
                      title={showNovaSenha ? 'Ocultar senha' : 'Ver senha'}
                      tabIndex={-1}
                    >
                      {showNovaSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {hasAttemptedSubmit && !senhaValida && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle size={11} />
                      A senha deve ter no mínimo 8 caracteres.
                    </p>
                  )}
                </div>
              </div>

              {/* Resumo da senha informada */}
              <div className="p-3 rounded-xl bg-[#E6F5F2] border border-[#0D8272]/20 text-[11px] text-[#0C4336] leading-relaxed">
                O profissional poderá entrar no aplicativo imediatamente utilizando este e-mail e a
                senha provisória definida acima.
              </div>

              {/* Botões do Rodapé */}
              <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={criandoMembro}
                  className="h-11 min-h-[44px] text-xs border-slate-200 text-slate-700 w-full sm:w-auto"
                >
                  Cancelar
                </Button>

                {/* Botão Concluir Cadastro: sempre clicável para fornecer feedback explícito */}
                <Button
                  type="submit"
                  disabled={criandoMembro}
                  className={cn(
                    'h-11 min-h-[44px] px-5 rounded-xl text-xs font-bold text-white shadow-xs touch-manipulation transition-all w-full sm:w-auto',
                    isFormValid
                      ? 'bg-[#0F5342] hover:bg-[#0C4336] active:scale-[0.98]'
                      : 'bg-[#0F5342]/80 hover:bg-[#0F5342]',
                  )}
                  title={
                    !isFormValid
                      ? 'Clique para ver o que falta preencher'
                      : 'Cadastrar colega no sistema'
                  }
                >
                  {criandoMembro ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cadastrando Colega...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4 text-[#F5B31C]" />
                      Concluir Cadastro
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Detalhes do Cadastro e Definição de Nível de Acesso (Perfil) Antes da Aprovação */}
      <Dialog
        open={Boolean(modalRevisarUser)}
        onOpenChange={(open) => {
          if (!open) {
            setModalRevisarUser(null)
            setApprovalRoleError(null)
          }
        }}
      >
        <DialogContent
          className="max-w-lg w-[95vw] sm:w-full p-4 sm:p-6 rounded-2xl bg-white max-h-[92vh] overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {modalRevisarUser && (
            <div className="space-y-4">
              <DialogHeader className="text-left">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0 border border-amber-300/40">
                    <ShieldCheck className="h-5 w-5 text-[#0D8272]" />
                  </div>
                  <div>
                    <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336]">
                      Aprovar Cadastro de Colega
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500 mt-0.5">
                      Defina o nível de acesso antes de liberar a circulação deste usuário no Help
                      Vida.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Card com dados do solicitante */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 space-y-2.5">
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11 rounded-xl bg-amber-500 text-white text-xs font-bold shrink-0 border border-amber-600/30">
                    <AvatarFallback>
                      {textoSeguro(modalRevisarUser.name)
                        ? textoSeguro(modalRevisarUser.name)
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()
                        : textoSeguro(modalRevisarUser.email).slice(0, 2).toUpperCase() || 'HV'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {textoSeguro(modalRevisarUser.name) || 'Nome não informado'}
                      </p>
                      <Badge className="bg-amber-100 text-amber-800 text-[10px] font-semibold border-amber-200 shrink-0">
                        Pendente
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 truncate flex items-center gap-1.5 mt-0.5">
                      <Mail size={12} className="text-slate-400 shrink-0" />
                      {textoSeguro(modalRevisarUser.email) || 'E-mail não informado'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-950/10 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" />
                    Data de cadastro:{' '}
                    <strong className="text-slate-700 font-medium">
                      {formatarDataSegura(modalRevisarUser.created, {
                        fallback: 'Data indisponível',
                      })}
                    </strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} className="text-slate-400" />
                    Origem:{' '}
                    <strong className="text-slate-700 font-medium">Auto-cadastro público</strong>
                  </span>
                </div>
              </div>

              {/* Mensagem de erro caso a seleção falhe */}
              {approvalRoleError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Não foi possível aprovar:</p>
                    <p className="text-[11px] mt-0.5 text-rose-700 leading-relaxed">
                      {approvalRoleError}
                    </p>
                  </div>
                </div>
              )}

              {/* Seleção do Nível de Acesso (Perfil) */}
              <div className="space-y-2">
                <Label
                  htmlFor="approvalRoleSelect"
                  className="text-xs font-bold text-slate-800 flex items-center gap-1.5"
                >
                  <ShieldCheck size={14} className="text-[#0D8272]" />
                  Defina o Nível de Acesso (Perfil) *
                </Label>

                <Select
                  value={selectedRoleForApproval}
                  onValueChange={(val: 'comum' | 'medico_visitador' | 'admin') => {
                    setSelectedRoleForApproval(val)
                    if (approvalRoleError) setApprovalRoleError(null)
                  }}
                >
                  <SelectTrigger
                    id="approvalRoleSelect"
                    className="h-11 min-h-[44px] text-xs bg-[#F4FAF8] border-emerald-950/15 rounded-xl font-medium focus-visible:ring-[#0D8272]"
                  >
                    <SelectValue placeholder="Selecione o nível de acesso do colega" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comum">Corpo Clínico (Médico / Farmacêutico)</SelectItem>
                    <SelectItem value="medico_visitador">
                      Médico Visitador (Apenas Padronizados)
                    </SelectItem>
                    <SelectItem value="admin">Administrador (Gestão / Farmácia)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Explicação detalhada de cada perfil selecionado */}
                <div className="space-y-1.5 pt-1">
                  {selectedRoleForApproval === 'medico_visitador' && (
                    <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950 space-y-1 animate-in fade-in">
                      <div className="font-bold flex items-center gap-1.5 text-sky-900">
                        <User size={13} className="text-sky-600" />
                        Médico Visitador (Apenas Padronizados)
                      </div>
                      <p className="text-[11px] text-sky-800 leading-relaxed">
                        Acesso com <strong>restrição automática no servidor</strong>: este usuário
                        só visualiza medicamentos com status{' '}
                        <span className="font-semibold text-emerald-800">Padronizado</span>.
                        Medicamentos não padronizados e inativos ficam ocultos.
                      </p>
                    </div>
                  )}

                  {selectedRoleForApproval === 'comum' && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1 animate-in fade-in">
                      <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                        <Users size={13} className="text-emerald-700" />
                        Corpo Clínico (Médico / Farmacêutico)
                      </div>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        Acesso padrão completo de consulta: visualiza todo o catálogo Help Vida
                        (padronizados, não padronizados e inativos), pode enviar solicitações de
                        inclusão e interagir com o Assistente Virtual.
                      </p>
                    </div>
                  )}

                  {selectedRoleForApproval === 'admin' && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1 animate-in fade-in">
                      <div className="font-bold flex items-center gap-1.5 text-amber-900">
                        <ShieldCheck size={13} className="text-amber-700" />
                        Administrador (Gestão / Farmácia)
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Acesso irrestrito de gestão: edição de medicamentos, aprovação de
                        solicitações da comissão, importação de PDF institucional e aprovação de
                        novos membros da equipe.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Aviso sobre gravação em log de auditoria */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                <Lock size={12} className="text-slate-400 shrink-0" />
                <span>
                  A aprovação e o perfil atribuído serão registrados no log de auditoria da
                  comissão.
                </span>
              </div>

              {/* Rodapé com botões de Ação */}
              <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const usuarioParaNegar = modalRevisarUser
                    setModalRevisarUser(null)
                    setConfirmNegarUser(usuarioParaNegar)
                  }}
                  disabled={Boolean(reviewingUserId)}
                  className="h-11 min-h-[44px] text-xs text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200 w-full sm:w-auto"
                >
                  <UserX size={14} className="mr-1 text-rose-500" />
                  Negar Cadastro
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    handleReviewUser(modalRevisarUser, 'aprovar', selectedRoleForApproval)
                  }
                  disabled={Boolean(reviewingUserId) || !selectedRoleForApproval}
                  className="h-11 min-h-[44px] px-5 rounded-xl text-xs font-bold bg-[#0F5342] hover:bg-[#0C4336] active:scale-[0.98] text-white shadow-xs touch-manipulation transition-all w-full sm:w-auto"
                >
                  {reviewingUserId ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Liberando Acesso...
                    </>
                  ) : (
                    <>
                      <UserCheck className="mr-2 h-4 w-4 text-[#F5B31C]" />
                      Aprovar e Liberar Acesso
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Negação de Cadastro */}
      <Dialog
        open={Boolean(confirmNegarUser)}
        onOpenChange={(open) => {
          if (!open) setConfirmNegarUser(null)
        }}
      >
        <DialogContent className="max-w-md p-5 sm:p-6 rounded-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-950 flex items-center gap-2">
              <UserX className="h-5 w-5 text-rose-600" />
              Negar Acesso ao Sistema
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Tem certeza de que deseja negar o cadastro de{' '}
              <strong className="text-slate-900">
                {confirmNegarUser?.name || confirmNegarUser?.email}
              </strong>
              ? O usuário não conseguirá acessar o aplicativo e verá uma mensagem de cadastro não
              autorizado ao tentar efetuar login.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmNegarUser(null)}
              disabled={Boolean(reviewingUserId)}
              className="h-11 min-h-[44px] text-xs text-slate-700"
            >
              Cancelar
            </Button>
            <Button
              disabled={Boolean(reviewingUserId)}
              onClick={() => {
                if (confirmNegarUser) {
                  handleReviewUser(confirmNegarUser, 'negar')
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-11 min-h-[44px] font-bold rounded-xl px-4"
            >
              {reviewingUserId ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Negando...
                </>
              ) : (
                'Confirmar e Negar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Redefinição de Senha */}
      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#0D8272]" />
              Enviar Redefinição de Senha
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Deseja enviar um link seguro para o e-mail{' '}
              <strong className="text-slate-900">
                {membroParaReset?.email || 'informado'}
              </strong>{' '}
              para que o colega redefina sua senha de acesso ao sistema?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetModalOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={enviandoReset}
              onClick={handleRequestPasswordReset}
              className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs h-9 min-h-[38px] font-bold rounded-xl"
            >
              {enviandoReset ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Confirmar e Enviar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
