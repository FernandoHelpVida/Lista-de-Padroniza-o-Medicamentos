import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, LogIn } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Credenciais inválidas. Verifique seu e-mail e senha.'
      setError(
        msg.includes('Failed to authenticate') || msg.includes('400')
          ? 'E-mail ou senha incorretos. Tente novamente.'
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Acesse sua conta"
      subtitle="Insira suas credenciais institucionais para continuar"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive" className="py-2.5">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
            E-mail institucional
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="nome@helpvida.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-10 text-sm focus-visible:ring-teal-500"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
              Senha
            </Label>
            <Link
              to="/esqueci-senha"
              className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
            >
              Esqueci a senha?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-10 text-sm focus-visible:ring-teal-500"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-10 bg-teal-600 hover:bg-teal-700 text-white font-medium mt-2 shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" />
              Entrar
            </>
          )}
        </Button>

        <div className="pt-3 text-center border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Novo na equipe Help Vida?{' '}
            <Link
              to="/cadastro"
              className="font-semibold text-teal-600 hover:text-teal-700 hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-teal-50 border border-teal-100 text-[11px] text-teal-900 leading-relaxed">
          <strong>Acesso inicial administrativo de demonstração:</strong>
          <br />
          E-mail:{' '}
          <code className="bg-white/60 px-1 py-0.5 rounded">fernandofernandes@helpvida.com.br</code>
          <br />
          Senha: <code className="bg-white/60 px-1 py-0.5 rounded">Skip@Pass</code>
        </div>
      </form>
    </AuthLayout>
  )
}
