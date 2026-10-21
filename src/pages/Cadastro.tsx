import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'

export default function Cadastro() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== passwordConfirm) {
      setError('As senhas não coincidem.')
      return
    }

    if (password.length < 8) {
      setError('A senha deve conter no mínimo 8 caracteres.')
      return
    }

    setLoading(true)

    try {
      await pb.collection('users').create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        passwordConfirm,
      })

      try {
        await pb.collection('users').requestVerification(email.trim().toLowerCase())
      } catch {
        // Silently continue if email server not configured
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/login', {
          state: { message: 'Conta criada! Verifique seu e-mail para ativar sua conta.' },
        })
      }, 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar usuário. Tente novamente.'
      setError(msg)
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
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold text-slate-700">
              Nome completo
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Dra. Juliana Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-10 text-sm focus-visible:ring-teal-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
              E-mail institucional
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="seu.nome@helpvida.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-10 text-sm focus-visible:ring-teal-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
              Senha (mínimo 8 caracteres)
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
              Confirmar senha
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
            className="w-full h-12 min-h-[48px] bg-[#0F5342] hover:bg-[#0C4336] text-white font-bold mt-2 shadow-xs rounded-xl"
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
    </AuthLayout>
  )
}
