import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  User,
  Mail,
  Lock,
  Building2,
  Phone,
  MapPin,
  Globe,
  FileText,
  Loader2,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'

export default function Configuracoes() {
  const { user, refreshUser } = useAuth()
  const { toast } = useToast()

  // 1. Perfil / Nome
  const [name, setName] = useState(user?.name || '')
  const [savingName, setSavingName] = useState(false)

  // 2. Troca de e-mail
  const [newEmail, setNewEmail] = useState('')
  const [requestingEmail, setRequestingEmail] = useState(false)
  const [emailRequested, setEmailRequested] = useState(false)

  // 3. Troca de senha
  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setSavingName(true)
    try {
      await pb.collection('users').update(user.id, {
        name: name.trim(),
      })
      await refreshUser()
      toast({
        title: 'Nome atualizado',
        description: 'Seu nome institucional foi atualizado com sucesso.',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar nome.'
      toast({
        title: 'Erro ao atualizar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSavingName(false)
    }
  }

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return

    setRequestingEmail(true)
    try {
      await pb.collection('users').requestEmailChange(newEmail.trim().toLowerCase())
      setEmailRequested(true)
      toast({
        title: 'Solicitação enviada',
        description: `Enviamos uma mensagem de confirmação para ${newEmail.trim()}.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao solicitar troca de e-mail.'
      toast({
        title: 'Erro na alteração',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setRequestingEmail(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (password !== passwordConfirm) {
      toast({
        title: 'Senhas divergentes',
        description: 'A confirmação de senha não confere.',
        variant: 'destructive',
      })
      return
    }

    if (password.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A nova senha deve possuir pelo menos 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    setChangingPassword(true)
    try {
      await pb.collection('users').update(user.id, {
        oldPassword,
        password,
        passwordConfirm,
      })
      setOldPassword('')
      setPassword('')
      setPasswordConfirm('')
      toast({
        title: 'Senha atualizada com sucesso',
        description: 'Sua nova senha já está ativa para os próximos acessos.',
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível alterar a senha. Verifique a senha atual digitada.'
      toast({
        title: 'Erro ao alterar senha',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Configurações da Conta</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Gerenciamento de perfil, credenciais de acesso e dados institucionais da Help Vida
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. SEÇÃO DE PERFIL */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <User className="h-4 w-4 text-teal-600" />
              Perfil do Usuário
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Nome exibido nas consultas e registros do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateName} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="userName" className="text-xs font-semibold text-slate-700">
                  Nome Completo
                </Label>
                <Input
                  id="userName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome e Sobrenome"
                  required
                  className="h-10 text-xs focus-visible:ring-teal-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  E-mail atual cadastrado
                </Label>
                <Input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="h-10 text-xs bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>

              <Button
                type="submit"
                disabled={savingName}
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
              >
                {savingName ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Nome'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 2. SEÇÃO DE TROCA DE E-MAIL */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Mail className="h-4 w-4 text-teal-600" />
              Alterar E-mail Institucional
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Um link de confirmação será enviado para validar o novo endereço
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailRequested ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-emerald-950">Confirmação Solicitada</p>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Acesse sua caixa de entrada no novo e-mail para validar a alteração. O endereço só
                  será trocado após a confirmação.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEmailRequested(false)}
                  className="text-xs mt-2"
                >
                  Solicitar para outro e-mail
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestEmailChange} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="newEmail" className="text-xs font-semibold text-slate-700">
                    Novo E-mail
                  </Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="novo.email@helpvida.com.br"
                    required
                    className="h-10 text-xs focus-visible:ring-teal-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={requestingEmail || !newEmail.trim()}
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                >
                  {requestingEmail ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Solicitando...
                    </>
                  ) : (
                    'Solicitar Troca de E-mail'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* 3. SEÇÃO DE TROCA DE SENHA */}
        <Card className="border-slate-200 bg-white shadow-sm md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Lock className="h-4 w-4 text-teal-600" />
              Segurança & Senha
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Altere sua senha de acesso ao sistema (mínimo de 8 caracteres)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="oldPass" className="text-xs font-semibold text-slate-700">
                    Senha Atual *
                  </Label>
                  <Input
                    id="oldPass"
                    type="password"
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    className="h-10 text-xs focus-visible:ring-teal-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPass" className="text-xs font-semibold text-slate-700">
                    Nova Senha *
                  </Label>
                  <Input
                    id="newPass"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-10 text-xs focus-visible:ring-teal-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confPass" className="text-xs font-semibold text-slate-700">
                    Confirmar Nova Senha *
                  </Label>
                  <Input
                    id="confPass"
                    type="password"
                    placeholder="••••••••"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    required
                    className="h-10 text-xs focus-visible:ring-teal-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={changingPassword || !oldPassword || !password}
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  'Salvar Nova Senha'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* 4. CARD SOBRE A HELP VIDA (DADOS VERBATIM DO PDF) */}
      <Card className="border-teal-200/80 bg-gradient-to-br from-white to-teal-50/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-teal-600" />
              Sobre a Help Vida & Comissão Técnica
            </CardTitle>
            <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-teal-100 text-teal-800">
              Documento Oficial
            </span>
          </div>
          <CardDescription className="text-xs text-slate-600 font-medium">
            Relação dos Medicamentos Avaliados e Definição de Padronização – ANEXO I
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/80 border border-teal-100/80">
              <Phone className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Telefones
                </p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  65 3611-1300 / 65 3622-0911
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/80 border border-teal-100/80">
              <MapPin className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Endereço
                </p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  Rua das Camélias, 381 – Jardim Cuiabá
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/80 border border-teal-100/80">
              <Globe className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Website Oficial
                </p>
                <a
                  href="https://www.helpvida.com.br"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-teal-700 hover:underline mt-0.5 block"
                >
                  www.helpvida.com.br
                </a>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/80 border border-teal-100/80">
              <Mail className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  E-mail Institucional
                </p>
                <a
                  href="mailto:contato@helpvida.com.br"
                  className="text-xs font-semibold text-teal-700 hover:underline mt-0.5 block"
                >
                  contato@helpvida.com.br
                </a>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-teal-100/60 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
            <span>Sistema Spincare – Controle da Farmácia Help Vida</span>
            <span className="font-medium text-teal-800">
              Cuiabá / MT — Atenção Domiciliar & Cuidados Especiais
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
