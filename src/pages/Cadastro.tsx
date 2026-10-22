import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UserPlus,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { PoliticaPrivacidadeModal } from '@/components/PoliticaPrivacidadeModal'
import { cn } from '@/lib/utils'

export default function Cadastro() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [lgpdHealthConsent, setLgpdHealthConsent] = useState(false)
  const [politicaOpen, setPoliticaOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

  const navigate = useNavigate()

  const nomeLimpo = name.trim()
  const emailLimpo = email.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isEmailValid = emailRegex.test(emailLimpo)
  const isNameValid = nomeLimpo.length >= 2
  const isPasswordValid = password.length >= 8
  const isPasswordMatch = password.length > 0 && password === passwordConfirm
  const areConsentsGiven = lgpdConsent && lgpdHealthConsent

  const getMissingRequirements = (): string[] => {
    const list: string[] = []
    if (!nomeLimpo) {
      list.push('Informe seu nome completo institucional.')
    } else if (nomeLimpo.length < 2) {
      list.push('O nome deve possuir pelo menos 2 caracteres.')
    }

    if (!emailLimpo) {
      list.push('Informe seu e-mail institucional.')
    } else if (!isEmailValid) {
      list.push('Informe um e-mail com formato válido (ex: seu.nome@helpvida.com.br).')
    }

    if (!password) {
      list.push('Defina uma senha de acesso.')
    } else if (!isPasswordValid) {
      list.push('A senha deve conter no mínimo 8 caracteres.')
    }

    if (!passwordConfirm) {
      list.push('Confirme a sua senha.')
    } else if (!isPasswordMatch) {
      list.push('A confirmação de senha não confere com a senha digitada.')
    }

    if (!lgpdConsent) {
      list.push('Marque a concordância com a Política de Privacidade LGPD.')
    }

    if (!lgpdHealthConsent) {
      list.push('Marque a autorização para o tratamento de dados de justificativas clínicas.')
    }

    return list
  }

  const isFormValid =
    isNameValid && isEmailValid && isPasswordValid && isPasswordMatch && areConsentsGiven

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setHasAttemptedSubmit(true)
    setError(null)

    const missing = getMissingRequirements()
    if (missing.length > 0) {
      setError(missing[0])
      return
    }

    setLoading(true)

    try {
      await pb.collection('users').create({
        name: nomeLimpo,
        email: emailLimpo,
        password,
        passwordConfirm,
        role: 'comum',
      })

      try {
        await pb.collection('users').requestVerification(emailLimpo)
      } catch {
        // Não interrompe se SMTP não configurado
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/login', {
          state: { message: 'Conta criada com sucesso! Acesse com suas credenciais.' },
        })
      }, 2500)
    } catch (err: unknown) {
      const friendlyMsg = getErrorMessage(
        err,
        'Falha ao realizar cadastro. Verifique se o e-mail já existe.',
      )
      setError(friendlyMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Criar nova conta"
      subtitle="Cadastre-se para ter acesso ao sistema de padronização"
    >
      {success ? (
        <div className="space-y-4 py-4 text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Cadastro realizado!</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Sua conta foi criada com sucesso. Verifique seu e-mail para ativar sua conta.
            Redirecionando para o login...
          </p>
          <Link to="/login">
            <Button variant="outline" className="mt-2 w-full text-xs">
              Ir para o Login agora
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <AlertDescription className="text-xs font-medium">{error}</AlertDescription>
            </Alert>
          )}
          {/* Campo Nome */}
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs font-semibold text-slate-700">
              Nome completo institucional *
            </Label>
            <Input
              id="name"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Dra. Juliana Silva"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              className={cn(
                'h-11 min-h-[44px] text-sm bg-[#F4FAF8] border-emerald-950/15 focus-visible:ring-[#0D8272] rounded-xl',
                hasAttemptedSubmit && !isNameValid && 'border-rose-400 bg-rose-50/40',
              )}
            />
            {hasAttemptedSubmit && !isNameValid && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1">
                <AlertCircle size={11} />
                Informe seu nome completo.
              </p>
            )}
          </div>
          {/* Campo E-mail */}
          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
              E-mail institucional *
            </Label>
            <Input
              id="email"
              type="email"
              name="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              placeholder="seu.nome@helpvida.com.br"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
              className={cn(
                'h-11 min-h-[44px] text-sm bg-[#F4FAF8] border-emerald-950/15 focus-visible:ring-[#0D8272] rounded-xl',
                hasAttemptedSubmit && !isEmailValid && 'border-rose-400 bg-rose-50/40',
              )}
            />
            {hasAttemptedSubmit && !isEmailValid && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1">
                <AlertCircle size={11} />
                Informe um e-mail válido institucional.
              </p>
            )}
          </div>
          {/* Campo Senha */}
          <div className="space-y-1">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
              Senha (mínimo 8 caracteres) *
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                autoComplete="new-password"
                className={cn(
                  'h-11 min-h-[44px] pr-10 text-sm bg-[#F4FAF8] border-emerald-950/15 focus-visible:ring-[#0D8272] rounded-xl',
                  hasAttemptedSubmit && !isPasswordValid && 'border-rose-400 bg-rose-50/40',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md"
                title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {hasAttemptedSubmit && !isPasswordValid && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1">
                <AlertCircle size={11} />
                A senha deve conter pelo menos 8 caracteres.
              </p>
            )}
          </div>
          {/* Campo Confirmar Senha */}
          <div className="space-y-1">
            <Label htmlFor="passwordConfirm" className="text-xs font-semibold text-slate-700">
              Confirmar senha *
            </Label>
            <div className="relative">
              <Input
                id="passwordConfirm"
                type={showConfirmPassword ? 'text' : 'password'}
                name="passwordConfirm"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="••••••••"
                value={passwordConfirm}
                onChange={(e) => {
                  setPasswordConfirm(e.target.value)
                  if (error) setError(null)
                }}
                autoComplete="new-password"
                className={cn(
                  'h-11 min-h-[44px] pr-10 text-sm bg-[#F4FAF8] border-emerald-950/15 focus-visible:ring-[#0D8272] rounded-xl',
                  hasAttemptedSubmit && !isPasswordMatch && 'border-rose-400 bg-rose-50/40',
                )}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md"
                title={showConfirmPassword ? 'Ocultar senha' : 'Ver senha'}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {hasAttemptedSubmit && !isPasswordMatch && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1">
                <AlertCircle size={11} />
                As duas senhas digitadas não coincidem.
              </p>
            )}
          </div>
          {/* Seção LGPD: Consentimentos explícitos e destacados com toque ampliado */}
          <div
            className={cn(
              'p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/15 space-y-3 transition-colors',
              hasAttemptedSubmit && !areConsentsGiven && 'border-rose-300 bg-rose-50/30',
            )}
          >
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="lgpdConsent"
                checked={lgpdConsent}
                onCheckedChange={(checked) => {
                  setLgpdConsent(Boolean(checked))
                  if (error) setError(null)
                }}
                className="mt-0.5 h-4 w-4 data-[state=checked]:bg-[#0F5342] data-[state=checked]:border-[#0F5342]"
              />
              <label
                htmlFor="lgpdConsent"
                className="text-[11px] text-slate-700 leading-tight cursor-pointer select-none"
              >
                Declaro que li e concordo com a{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPoliticaOpen(true)
                  }}
                  className="font-bold text-[#0D8272] hover:underline inline-flex items-center gap-0.5"
                >
                  Política de Privacidade e Termos da LGPD
                </button>{' '}
                (Lei nº 13.709/2018) da Help Vida. *
              </label>
            </div>

            <div className="flex items-start gap-2.5 pt-2 border-t border-emerald-950/10">
              <Checkbox
                id="lgpdHealthConsent"
                checked={lgpdHealthConsent}
                onCheckedChange={(checked) => {
                  setLgpdHealthConsent(Boolean(checked))
                  if (error) setError(null)
                }}
                className="mt-0.5 h-4 w-4 data-[state=checked]:bg-[#0F5342] data-[state=checked]:border-[#0F5342]"
              />
              <label
                htmlFor="lgpdHealthConsent"
                className="text-[11px] text-slate-700 leading-tight cursor-pointer select-none"
              >
                <strong>Consentimento de Dados Sensíveis:</strong> Autorizo o tratamento de
                informações clínicas e justificativas terapêuticas que eu submeter nas solicitações
                de medicamentos para fins exclusivos de avaliação pela comissão técnica. *
              </label>
            </div>
          </div>
          {/* Mensagem explicativa amigável sobre pendências */}
          {hasAttemptedSubmit && !isFormValid && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Por favor, verifique os campos obrigatórios assinalados acima antes de concluir seu
                cadastro.
              </p>
            </div>
          )}
          {/* Botão Concluir Cadastro: sempre clicável com toque ágil (touch-manipulation) */}
          <Button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full h-12 min-h-[48px] text-white font-bold mt-2 shadow-xs rounded-xl touch-manipulation transition-all',
              isFormValid
                ? 'bg-[#0F5342] hover:bg-[#0C4336] active:scale-[0.99]'
                : 'bg-[#0F5342]/85 hover:bg-[#0F5342]',
            )}
            title={
              !isFormValid
                ? 'Clique para validar e ver os campos pendentes'
                : 'Concluir cadastro na Help Vida'
            }
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando conta...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4 text-[#F5B31C]" />
                Concluir Cadastro
              </>
            )}
          </Button>
          <div className="pt-3 text-center border-t border-slate-100">
            <p className="text-xs text-slate-600">
              Já possui cadastro institucional?{' '}
              <Link
                to="/login"
                className="font-bold text-[#0D8272] hover:text-[#0C4336] hover:underline"
              >
                Fazer login
              </Link>
            </p>
          </div>{' '}
        </form>
      )}

      {/* Modal da Política de Privacidade */}
      <PoliticaPrivacidadeModal open={politicaOpen} onOpenChange={setPoliticaOpen} />
    </AuthLayout>
  )
}
