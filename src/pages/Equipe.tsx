import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import {
  Users,
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
  Calendar,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
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
import { formatarDataSegura } from '@/lib/formatters'

export interface UserTeamRecord {
  id: string
  name?: string
  email: string
  role?: 'admin' | 'comum'
  verified?: boolean
  created: string
}

export default function Equipe() {
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()

  const [membros, setMembros] = useState<UserTeamRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const navigate = useNavigate()

  // Modal para cadastrar colega
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('HelpVida@2025')
  const [showNovaSenha, setShowNovaSenha] = useState(false)
  const [novoRole, setNovoRole] = useState<'comum' | 'admin'>('comum')
  const [criandoMembro, setCriandoMembro] = useState(false)
  const [modalFormError, setModalFormError] = useState<string | null>(null)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

  // Modal para convite / redefinição de senha
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [membroParaReset, setMembroParaReset] = useState<UserTeamRecord | null>(null)
  const [enviandoReset, setEnviandoReset] = useState(false)

  const loadMembros = async () => {
    setLoading(true)
    try {
      const records = await pb.collection('users').getFullList<UserTeamRecord>({
        sort: 'name,email',
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
  }, [])

  // Validações em tempo real para o formulário do modal
  const nomeLimpo = novoNome.trim()
  const emailLimpo = novoEmail.trim().toLowerCase()
  const senhaLimpa = novaSenha.trim()

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const emailValido = emailRegex.test(emailLimpo)
  const senhaValida = senhaLimpa.length >= 8
  const nomeValido = nomeLimpo.length >= 2
  const emailJaExiste = membros.some((m) => m.email.toLowerCase() === emailLimpo)

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

      if (
        friendlyMsg.toLowerCase().includes('sessão') ||
        friendlyMsg.toLowerCase().includes('login')
      ) {
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
    setEnviandoReset(true)
    try {
      await pb.collection('users').requestPasswordReset(membroParaReset.email)
      toast({
        title: 'Instruções enviadas!',
        description: `E-mail de redefinição de acesso enviado com sucesso para ${membroParaReset.email}.`,
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

  const filteredMembros = membros.filter((m) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    const nome = m.name?.toLowerCase() || ''
    const email = m.email.toLowerCase()
    return nome.includes(q) || email.includes(q)
  })

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

      {/* Barra de Busca e Atualização */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Buscar por nome ou e-mail institucional..."
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
        >
          <RefreshCw size={13} className={cn('mr-1.5', loading && 'animate-spin')} />
          Atualizar Lista ({membros.length})
        </Button>
      </div>

      {/* Lista de Membros */}
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
              <p className="text-xs">Carregando usuários da Help Vida...</p>
            </div>
          ) : filteredMembros.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700">Nenhum membro encontrado</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Utilize o botão acima para cadastrar os médicos e farmacêuticos da equipe.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-emerald-950/5">
              {filteredMembros.map((m) => {
                const emailTexto = m.email || ''
                const initials = m.name
                  ? m.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : emailTexto
                    ? emailTexto.slice(0, 2).toUpperCase()
                    : 'HV'

                const dataCriacao = formatarDataSegura(m.created, {
                  fallback: 'Data indisponível',
                })

                const isCurrentUser = user?.id === m.id
                const isMemberAdmin =
                  m.role === 'admin' ||
                  emailTexto.toLowerCase() === 'fernandofernandes@helpvida.com.br'

                return (
                  <div
                    key={m.id}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F4FAF8]/60 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 rounded-xl bg-[#0F5342] text-white text-xs font-bold shrink-0 border border-emerald-600/30">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {m.name || 'Sem nome informado'}
                          </p>
                          {isCurrentUser && (
                            <Badge className="bg-emerald-100 text-[#0C4336] text-[10px] font-bold">
                              Você
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                          <Mail size={12} className="text-slate-400 shrink-0" />
                          {m.email}
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
                        onClick={() => {
                          setMembroParaReset(m)
                          setResetModalOpen(true)
                        }}
                        className="h-8 text-xs text-slate-700 hover:bg-slate-50 border-slate-200"
                        title="Enviar e-mail para redefinir senha"
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
                    onValueChange={(val: 'comum' | 'admin') => setNovoRole(val)}
                  >
                    <SelectTrigger
                      id="novoRole"
                      className="h-11 min-h-[44px] text-xs rounded-xl bg-[#F4FAF8] border-emerald-950/15"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-xs z-50">
                      <SelectItem value="comum">Corpo Clínico (Padrão)</SelectItem>
                      <SelectItem value="admin">Administrador (Comissão)</SelectItem>
                    </SelectContent>
                  </Select>
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
              <strong className="text-slate-900">{membroParaReset?.email}</strong> para que o colega
              redefina sua senha de acesso ao sistema?
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
