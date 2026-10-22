import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PoliticaPrivacidadeModal } from '@/components/PoliticaPrivacidadeModal'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [politicaOpen, setPoliticaOpen] = useState(false)
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
              className="text-xs font-semibold text-[#0D8272] hover:text-[#0C4336] hover:underline"
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
            className="h-11 text-sm bg-[#F4FAF8] border-emerald-950/15 focus-visible:ring-[#0D8272] rounded-xl"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 min-h-[48px] bg-[#0F5342] hover:bg-[#0C4336] text-white font-bold rounded-xl shadow-xs transition text-sm mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando no sistema...
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4 text-[#F5B31C]" />
              Entrar no Catálogo
            </>
          )}
        </Button>

        <div className="pt-3 text-center border-t border-slate-100">
          <p className="text-xs text-slate-600">
            Novo na equipe Help Vida?{' '}
            <Link
              to="/cadastro"
              className="font-bold text-[#0D8272] hover:text-[#0C4336] hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </div>

        {/* Link LGPD no Login */}
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setPoliticaOpen(true)}
            className="text-[11px] text-slate-400 hover:text-[#0C4336] underline inline-flex items-center gap-1"
          >
            <ShieldCheck size={12} className="text-[#0D8272]" />
            Aviso de Privacidade & LGPD (Lei nº 13.709/2018)
          </button>
        </div>
      </form>
      <PoliticaPrivacidadeModal open={politicaOpen} onOpenChange={setPoliticaOpen} />
    </AuthLayout>
  )
}
