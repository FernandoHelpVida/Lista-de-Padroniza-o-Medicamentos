import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import {
  Users,
  UserPlus,
  ShieldCheck,
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  RefreshCw,
  UserCheck,
  Calendar,
  Lock,
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

  // Modal para cadastrar colega
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('HelpVida@2025')
  const [novoRole, setNovoRole] = useState<'comum' | 'admin'>('comum')
  const [criandoMembro, setCriandoMembro] = useState(false)

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

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoEmail.trim() || !novaSenha.trim()) return

    if (novaSenha.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha inicial deve ter pelo menos 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    setCriandoMembro(true)
    try {
      await pb.collection('users').create({
        name: novoNome.trim(),
        email: novoEmail.trim().toLowerCase(),
        password: novaSenha,
        passwordConfirm: novaSenha,
        role: novoRole,
        verified: true, // Já aprovado pelo admin
      })

      toast({
        title: 'Colega cadastrado com sucesso!',
        description: `A conta para ${novoEmail} foi criada. Ele(a) já pode entrar no app.`,
      })

      setCreateModalOpen(false)
      setNovoNome('')
      setNovoEmail('')
      setNovaSenha('HelpVida@2025')
      setNovoRole('comum')
      loadMembros()
    } catch (err: unknown) {
      console.error('Erro ao cadastrar colega:', err)
      const msg = err instanceof Error ? err.message : 'Falha ao cadastrar usuário.'
      toast({
        title: 'Erro no cadastro',
        description: msg,
        variant: 'destructive',
      })
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
      const msg = err instanceof Error ? err.message : 'Falha ao enviar instruções de redefinição.'
      toast({
        title: 'Erro ao enviar instruções',
        description: msg,
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
            onClick={() => setCreateModalOpen(true)}
            className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold h-10 px-4 rounded-xl shadow-xs"
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
                const initials = m.name
                  ? m.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : m.email.slice(0, 2).toUpperCase()

                const dataCriacao = new Date(m.created).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })

                const isCurrentUser = user?.id === m.id
                const isMemberAdmin =
                  m.role === 'admin' ||
                  m.email.toLowerCase() === 'fernandofernandes@helpvida.com.br'

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
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
          <form onSubmit={handleCreateMember} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#0D8272]" />
                Cadastrar Colega na Help Vida
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 pt-1">
                Crie a conta de acesso para um colega médico ou farmacêutico. Ele(a) poderá alterar
                a senha nas configurações.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="novoNome" className="text-xs font-bold text-slate-700">
                Nome Completo do Profissional *
              </Label>
              <Input
                id="novoNome"
                placeholder="Ex: Dra. Mariana Silva"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                required
                className="h-10 text-xs sm:text-sm focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="novoEmail" className="text-xs font-bold text-slate-700">
                E-mail Institucional *
              </Label>
              <Input
                id="novoEmail"
                type="email"
                placeholder="mariana.silva@helpvida.com.br"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                required
                className="h-10 text-xs sm:text-sm focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="novoRole" className="text-xs font-bold text-slate-700">
                  Perfil de Acesso *
                </Label>
                <Select
                  value={novoRole}
                  onValueChange={(val: 'comum' | 'admin') => setNovoRole(val)}
                >
                  <SelectTrigger id="novoRole" className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="comum">Corpo Clínico (Padrão)</SelectItem>
                    <SelectItem value="admin">Administrador (Comissão)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="novaSenha" className="text-xs font-bold text-slate-700">
                  Senha Inicial Provisória *
                </Label>
                <Input
                  id="novaSenha"
                  type="text"
                  placeholder="HelpVida@2025"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  className="h-10 text-xs font-mono focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#E6F5F2] border border-[#0D8272]/20 text-[11px] text-[#0C4336] leading-relaxed">
              O colega poderá realizar o login imediatamente com o e-mail e a senha inicial
              informada, podendo trocá-la a qualquer momento na tela de{' '}
              <strong>Configurações</strong>.
            </div>

            <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={criandoMembro}
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs h-9 min-h-[38px] font-bold rounded-xl"
              >
                {criandoMembro ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Criando Conta...
                  </>
                ) : (
                  'Concluir Cadastro'
                )}
              </Button>
            </DialogFooter>
          </form>
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
