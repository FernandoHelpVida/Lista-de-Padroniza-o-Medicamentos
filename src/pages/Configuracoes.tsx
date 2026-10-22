import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { useNavigate } from 'react-router-dom'
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
  FileUp,
  Users,
  Download,
  Trash2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PoliticaPrivacidadeModal } from '@/components/PoliticaPrivacidadeModal'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function Configuracoes() {
  const { user, refreshUser, isAdmin } = useAuth()
  const navigate = useNavigate()
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

  // 4. Seção LGPD (Direitos do Titular)
  const [politicaOpen, setPoliticaOpen] = useState(false)
  const [exportandoDados, setExportandoDados] = useState(false)
  const [excluirContaModalOpen, setExcluirContaModalOpen] = useState(false)
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('')
  const [excluindoConta, setExcluindoConta] = useState(false)

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const nomeLimpo = name.trim()
    if (!nomeLimpo) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, informe seu nome completo.',
        variant: 'destructive',
      })
      return
    }

    setSavingName(true)
    try {
      await pb.collection('users').update(user.id, {
        name: nomeLimpo,
      })
      await refreshUser()
      toast({
        title: 'Nome atualizado',
        description: 'Seu nome institucional foi atualizado com sucesso.',
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Falha ao atualizar nome.')
      toast({
        title: 'Erro ao atualizar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSavingName(false)
    }
  }

  // LGPD: Exportação dos Dados do Titular (Portabilidade - Art. 18 LGPD)
  const handleExportMyData = async () => {
    if (!user) return
    setExportandoDados(true)
    try {
      // Buscar dados do perfil e solicitações do titular
      const minhasSolicitacoes = await pb.collection('solicitacoes').getFullList({
        filter: `solicitante = "${user.id}"`,
        sort: '-created',
        expand: 'medicamento',
      })

      const dadosTitular = {
        titular: {
          id: user.id,
          nome: user.name || 'Não informado',
          email: user.email,
          perfil: user.role || 'comum',
          criado_em: user.created,
          atualizado_em: user.updated,
        },
        aviso_privacidade: {
          lei: 'Lei Federal nº 13.709/2018 (LGPD)',
          controlador: 'Help Vida — Atenção Domiciliar & Cuidados Especiais',
          finalidade: 'Gestão da Padronização de Medicamentos (ANEXO I)',
          data_exportacao: new Date().toISOString(),
        },
        solicitacoes: minhasSolicitacoes.map((s) => ({
          id: s.id,
          medicamento: s.expand?.medicamento?.nome || 'Não especificado',
          classe: s.expand?.medicamento?.classe || 'Não especificada',
          justificativa_clinica: s.justificativa,
          status: s.status,
          parecer_comissao: s.resposta_comissao || '',
          data_submissao: s.created,
          data_avaliacao: s.updated,
        })),
      }

      const jsonStr = JSON.stringify(dadosTitular, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `meus-dados-helpvida-lgpd-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({
        title: 'Exportação concluída com sucesso!',
        description: 'Seus dados e histórico de solicitações foram baixados em formato JSON.',
      })
    } catch (err: unknown) {
      console.error('Erro ao exportar dados LGPD:', err)
      toast({
        title: 'Erro na exportação',
        description: getErrorMessage(err, 'Falha ao reunir seus dados para exportação.'),
        variant: 'destructive',
      })
    } finally {
      setExportandoDados(false)
    }
  }

  // LGPD: Exclusão de Conta pelo Titular (Direito de Eliminação - Art. 18 LGPD)
  const handleDeleteMyAccount = async () => {
    if (!user) return
    if (confirmacaoTexto.trim().toUpperCase() !== 'EXCLUIR') {
      toast({
        title: 'Confirmação incorreta',
        description: 'Digite a palavra EXCLUIR para confirmar.',
        variant: 'destructive',
      })
      return
    }

    setExcluindoConta(true)
    try {
      await pb.send('/backend/v1/user/delete-account', {
        method: 'POST',
      })

      toast({
        title: 'Conta e dados excluídos',
        description: 'Sua conta e registros pessoais foram removidos conforme a LGPD.',
      })
      setExcluirContaModalOpen(false)
      // Logout e redirecionar para login
      pb.authStore.clear()
      navigate('/login')
    } catch (err: unknown) {
      // Fallback: tentar exclusão via SDK nativo se a rota não responder
      try {
        await pb.collection('users').delete(user.id)
        toast({
          title: 'Conta excluída',
          description: 'Sua conta foi removida com sucesso.',
        })
        pb.authStore.clear()
        navigate('/login')
      } catch (errFallback: unknown) {
        toast({
          title: 'Erro ao excluir conta',
          description: getErrorMessage(
            err || errFallback,
            'Não foi possível processar a exclusão da sua conta.',
          ),
          variant: 'destructive',
        })
      }
    } finally {
      setExcluindoConta(false)
    }
  }

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailLimpo = newEmail.trim().toLowerCase()
    if (!emailLimpo || !emailLimpo.includes('@') || !emailLimpo.includes('.')) {
      toast({
        title: 'E-mail inválido',
        description: 'Por favor, insira um e-mail institucional válido.',
        variant: 'destructive',
      })
      return
    }

    setRequestingEmail(true)
    try {
      await pb.collection('users').requestEmailChange(emailLimpo)
      setEmailRequested(true)
      toast({
        title: 'Solicitação enviada',
        description: `Enviamos uma mensagem de confirmação para ${emailLimpo}.`,
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Falha ao solicitar troca de e-mail.')
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
      const msg = getErrorMessage(
        err,
        'Não foi possível alterar a senha. Verifique se a senha atual está correta.',
      )
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
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight">
          Configurações da Conta
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Gerenciamento de perfil, credenciais de acesso e dados institucionais da Help Vida
        </p>
      </div>

      {/* 0. PAINEL DE GESTÃO INSTITUCIONAL (ADMINISTRADOR ONLY) */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-emerald-600/30 bg-gradient-to-r from-[#0F5342]/10 via-[#0C4336]/5 to-transparent shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-base font-bold text-[#0C4336] flex items-center gap-2">
                  <FileUp className="h-5 w-5 text-[#0D8272]" />
                  Atualização da Padronização (PDF)
                </CardTitle>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0F5342] text-white">
                  Admin
                </span>
              </div>
              <CardDescription className="text-xs text-slate-600">
                Importe e atualize em lote via ANEXO I oficial com histórico completo de registros.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                onClick={() => navigate('/importar')}
                className="w-full bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold h-10 rounded-xl shadow-xs"
              >
                <FileUp className="mr-2 h-4 w-4 text-[#F5B31C]" />
                Abrir Ferramenta de Importação
              </Button>
            </CardContent>
          </Card>

          <Card className="border-emerald-600/30 bg-gradient-to-r from-[#0F5342]/10 via-[#0C4336]/5 to-transparent shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-base font-bold text-[#0C4336] flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#0D8272]" />
                  Gestão da Equipe Help Vida
                </CardTitle>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0F5342] text-white">
                  Admin
                </span>
              </div>
              <CardDescription className="text-xs text-slate-600">
                Cadastre as contas dos colegas médicos e farmacêuticos para circulação na equipe.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                onClick={() => navigate('/equipe')}
                className="w-full bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold h-10 rounded-xl shadow-xs"
              >
                <Users className="mr-2 h-4 w-4 text-[#F5B31C]" />
                Gerenciar Contas da Equipe
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* 1. SEÇÃO DE PERFIL */}
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
              <User className="h-4 w-4 text-[#0D8272]" />
              Perfil do Usuário
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Nome exibido nas consultas e registros do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateName} className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="userName" className="text-xs font-bold text-slate-700">
                  Nome Completo
                </Label>
                <Input
                  id="userName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome e Sobrenome"
                  required
                  className="h-11 text-xs sm:text-sm focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">E-mail atual cadastrado</Label>
                <Input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="h-11 text-xs sm:text-sm bg-slate-50 text-slate-500 cursor-not-allowed rounded-xl"
                />
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={savingName}
                className="w-full sm:w-auto h-11 min-h-[44px] bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl"
              >
                {savingName ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
                    Salvar Nome
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 2. SEÇÃO DE TROCA DE E-MAIL */}
        <Card className="border-emerald-950/10 bg-white shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#0D8272]" />
              Alterar E-mail Institucional
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Um link de confirmação será enviado para validar o novo endereço
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailRequested ? (
              <div className="p-4 rounded-xl bg-[#E6F5F2] border border-[#0D8272]/30 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-[#0D8272] mx-auto" />
                <p className="text-xs font-bold text-[#0C4336]">Confirmação Solicitada</p>
                <p className="text-[11px] text-[#0C4336]/80 leading-relaxed">
                  Acesse sua caixa de entrada no novo e-mail para validar a alteração. O endereço só
                  será trocado após a confirmação.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEmailRequested(false)}
                  className="text-xs mt-2 text-[#0C4336] border-[#0D8272]/30 hover:bg-white"
                >
                  Solicitar para outro e-mail
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestEmailChange} className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="newEmail" className="text-xs font-bold text-slate-700">
                    Novo E-mail
                  </Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="novo.email@helpvida.com.br"
                    required
                    className="h-11 text-xs sm:text-sm focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={requestingEmail || !newEmail.trim()}
                  size="sm"
                  className="w-full sm:w-auto h-11 min-h-[44px] bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl"
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
        <Card className="border-emerald-950/10 bg-white shadow-xs md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#0D8272]" />
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
                  <Label htmlFor="oldPass" className="text-xs font-bold text-slate-700">
                    Senha Atual *
                  </Label>
                  <Input
                    id="oldPass"
                    type="password"
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    className="h-11 text-xs sm:text-sm focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPass" className="text-xs font-bold text-slate-700">
                    Nova Senha *
                  </Label>
                  <Input
                    id="newPass"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 text-xs sm:text-sm focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confPass" className="text-xs font-bold text-slate-700">
                    Confirmar Nova Senha *
                  </Label>
                  <Input
                    id="confPass"
                    type="password"
                    placeholder="••••••••"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    required
                    className="h-11 text-xs sm:text-sm focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={changingPassword || !oldPassword || !password}
                size="sm"
                className="w-full sm:w-auto h-11 min-h-[44px] bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl"
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

      {/* 3.1. PRIVACIDADE, LGPD & DIREITOS DO TITULAR (LEI Nº 13.709/2018) */}
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#0D8272]" />
              Privacidade, LGPD & Direitos do Titular
            </CardTitle>
            <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/20">
              Lei nº 13.709/2018
            </span>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Acesso aos termos de privacidade, portabilidade de dados pessoais e gestão de
            consentimento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-900">
                Aviso de Privacidade & Tratamento de Dados
              </p>
              <p className="text-[11px] text-slate-500">
                Consulte quais dados pessoais coletamos, as finalidades institucionais, bases legais
                e medidas de segurança.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPoliticaOpen(true)}
              className="text-xs border-[#0D8272]/30 text-[#0C4336] hover:bg-[#E6F5F2] shrink-0"
            >
              <FileText size={13} className="mr-1.5 text-[#0D8272]" />
              Ler Política Completa
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Portabilidade / Exportação */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
              <div className="flex items-center gap-2">
                <Download size={16} className="text-[#0D8272]" />
                <span className="text-xs font-bold text-slate-800">
                  Exportar Meus Dados (Portabilidade)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Baixe uma cópia dos seus dados cadastrais e de todas as suas solicitações com
                justificativas em formato aberto (JSON).
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportMyData}
                disabled={exportandoDados}
                className="w-full text-xs border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
              >
                {exportandoDados ? (
                  <>
                    <Loader2 size={13} className="mr-1.5 animate-spin text-[#0D8272]" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download size={13} className="mr-1.5 text-[#0D8272]" />
                    Exportar Minhas Solicitações (JSON)
                  </>
                )}
              </Button>
            </div>

            {/* Eliminação / Exclusão de Conta */}
            <div className="p-3.5 rounded-xl border border-rose-200/70 bg-rose-50/30 space-y-2">
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-rose-600" />
                <span className="text-xs font-bold text-rose-900">
                  Excluir Minha Conta (Direito ao Esquecimento)
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Solicite a exclusão definitiva do seu cadastro e de seus dados pessoais do sistema
                Help Vida conforme o Art. 18 da LGPD.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirmacaoTexto('')
                  setExcluirContaModalOpen(true)
                }}
                disabled={user?.email?.toLowerCase() === 'fernandofernandes@helpvida.com.br'}
                className="w-full text-xs border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold"
              >
                <Trash2 size={13} className="mr-1.5 text-rose-600" />
                {user?.email?.toLowerCase() === 'fernandofernandes@helpvida.com.br'
                  ? 'Conta Admin Principal (Protegida)'
                  : 'Solicitar Exclusão da Minha Conta'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. CARD SOBRE A HELP VIDA */}
      <Card className="border-emerald-950/10 bg-gradient-to-br from-white to-[#E6F5F2]/50 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#0D8272]" />
              Sobre a Help Vida & Comissão Técnica
            </CardTitle>
            <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/20">
              Documento Oficial
            </span>
          </div>
          <CardDescription className="text-xs text-slate-600 font-medium">
            Relação dos Medicamentos Avaliados e Definição de Padronização – ANEXO I
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-1">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/90 border border-emerald-950/10">
              <Phone className="h-4 w-4 text-[#0D8272] shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Telefones
                </p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  65 3611-1300 / 65 3622-0911
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/90 border border-emerald-950/10">
              <MapPin className="h-4 w-4 text-[#0D8272] shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Endereço
                </p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  Rua das Camélias, 381 – Jardim Cuiabá
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/90 border border-emerald-950/10">
              <Globe className="h-4 w-4 text-[#0D8272] shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Website Oficial
                </p>
                <a
                  href="https://www.helpvida.com.br"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-[#0D8272] hover:underline mt-0.5 block"
                >
                  www.helpvida.com.br
                </a>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/90 border border-emerald-950/10">
              <Mail className="h-4 w-4 text-[#0D8272] shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  E-mail Institucional
                </p>
                <a
                  href="mailto:contato@helpvida.com.br"
                  className="text-xs font-semibold text-[#0D8272] hover:underline mt-0.5 block"
                >
                  contato@helpvida.com.br
                </a>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#0D8272]/20 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
            <span>Sistema Spincare – Controle da Farmácia Help Vida</span>
            <span className="font-bold text-[#0C4336]">
              Cuiabá / MT — Atenção Domiciliar & Cuidados Especiais
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Modal LGPD */}
      <PoliticaPrivacidadeModal open={politicaOpen} onOpenChange={setPoliticaOpen} />

      {/* Modal Confirmar Exclusão de Conta (LGPD) */}
      <Dialog open={excluirContaModalOpen} onOpenChange={setExcluirContaModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Exclusão Definitiva de Conta e Dados (LGPD)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Você está solicitando a eliminação completa dos seus dados pessoais cadastrais na
              plataforma da Help Vida com base no{' '}
              <strong>Artigo 18, VI da Lei Geral de Proteção de Dados (LGPD)</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-[11px] space-y-1">
              <p className="font-bold">Atenção aos efeitos desta ação:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Seu acesso ao sistema de padronização será revogado imediatamente;</li>
                <li>Seus registros pessoais serão excluídos ou anonimizados permanentemente;</li>
                <li>Esta ação é irreversível.</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmaExclusao" className="text-xs font-bold text-slate-700">
                Digite a palavra <strong>EXCLUIR</strong> para confirmar:
              </Label>
              <Input
                id="confirmaExclusao"
                type="text"
                value={confirmacaoTexto}
                onChange={(e) => setConfirmacaoTexto(e.target.value)}
                placeholder="EXCLUIR"
                className="h-10 text-xs uppercase focus-visible:ring-rose-500"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExcluirContaModalOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={excluindoConta || confirmacaoTexto.trim().toUpperCase() !== 'EXCLUIR'}
              onClick={handleDeleteMyAccount}
              className="text-xs font-bold h-9 min-h-[38px] rounded-xl"
            >
              {excluindoConta ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Excluindo Dados...
                </>
              ) : (
                'Confirmar Exclusão da Minha Conta'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
