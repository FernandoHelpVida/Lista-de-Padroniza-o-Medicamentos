import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ArrowLeft } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'

export default function RedefinirSenha() {
  const [searchParams] = useSearchParams()
  const params = useParams<{ token?: string }>()
  const location = useLocation()

  // Extrair token de múltiplos formatos possíveis:
  // 1. ?token=...
  // 2. useParams() /:token
  // 3. Hash fragment (ex: #/auth/confirm-password-reset/TOKEN ou #token=...)
  // 4. Path direto /auth/confirm-password-reset/TOKEN
  const resolveToken = (): string => {
    const fromQuery = searchParams.get('token')
    if (fromQuery) return fromQuery.trim()

    if (params.token) return params.token.trim()

    // Verificar no location.hash
    if (location.hash) {
      const matchHashPath = location.hash.match(/confirm-password-reset\/([a-zA-Z0-9_\-.]+)/)
      if (matchHashPath && matchHashPath[1]) return matchHashPath[1]

      const matchHashQuery = location.hash.match(/[?&]token=([a-zA-Z0-9_\-.]+)/)
      if (matchHashQuery && matchHashQuery[1]) return matchHashQuery[1]
    }

    // Verificar no location.pathname caso caia direto
    const matchPath = location.pathname.match(/confirm-password-reset\/([a-zA-Z0-9_\-.]+)/)
    if (matchPath && matchPath[1]) return matchPath[1]

    return ''
  }

  const token = resolveToken()

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('Token de redefinição ausente ou inválido.')
      return
    }

    if (password !== passwordConfirm) {
      setError('As senhas digitadas não coincidem.')
      return
    }

    if (password.length < 8) {
      setError('A nova senha deve possuir no mínimo 8 caracteres.')
      return
    }

    setLoading(true)

    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
      setSuccess(true)
      setTimeout(() => {
        navigate('/login')
      }, 2500)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao redefinir senha. O link pode ter expirado.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Criar nova senha" subtitle="Defina sua nova credencial de acesso ao sistema">
      {!token ? (
        <div className="space-y-4 py-2 text-center">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Token de validação ausente. Utilize o link enviado por e-mail para prosseguir.
            </AlertDescription>
          </Alert>
          <Link to="/esqueci-senha" className="block pt-2">
            <Button variant="outline" className="w-full text-xs">
              Solicitar novo link
            </Button>
          </Link>
        </div>
      ) : success ? (
        <div className="space-y-4 py-2 text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Senha alterada com sucesso!</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Sua nova senha foi gravada. Redirecionando para a tela de autenticação...
          </p>
          <Link to="/login" className="block pt-2">
            <Button className="w-full h-12 min-h-[48px] text-xs font-bold bg-[#0F5342] hover:bg-[#0C4336] text-white rounded-xl">
              Ir para o Login
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
              Nova senha (mínimo 8 caracteres)
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="h-10 text-sm focus-visible:ring-teal-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="passwordConfirm" className="text-xs font-semibold text-slate-700">
              Confirmar nova senha
            </Label>
            <Input
              id="passwordConfirm"
              type="password"
              placeholder="••••••••"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="h-10 text-sm focus-visible:ring-teal-500"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 min-h-[48px] bg-[#0F5342] hover:bg-[#0C4336] text-white font-bold shadow-xs rounded-xl"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando nova senha...
              </>
            ) : (
              <>
                <KeyRound className="mr-2 h-4 w-4 text-[#F5B31C]" />
                Salvar Nova Senha
              </>
            )}
          </Button>
          <div className="pt-3 text-center border-t border-slate-100">
            <Link
              to="/login"
              className="inline-flex items-center text-xs font-bold text-[#0D8272] hover:text-[#0C4336]"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Cancelar e voltar ao login
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
