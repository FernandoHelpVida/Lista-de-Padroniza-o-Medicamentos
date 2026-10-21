import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ArrowLeft } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await pb.collection('users').requestPasswordReset(email.trim().toLowerCase())
      setSubmitted(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao solicitar redefinição de senha.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Enviaremos um link de redefinição para o seu e-mail cadastrado"
    >
      {submitted ? (
        <div className="space-y-4 py-2 text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">E-mail enviado!</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Se houver uma conta registrada com o e-mail{' '}
            <strong className="text-slate-800">{email}</strong>, as instruções de redefinição foram
            encaminhadas. Verifique também a pasta de spam.
          </p>
          <Link to="/login" className="block pt-2">
            <Button variant="outline" className="w-full text-xs">
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Voltar ao login
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
            <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
              E-mail cadastrado
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

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-teal-600 hover:bg-teal-700 text-white font-medium mt-2 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando instruções...
              </>
            ) : (
              <>
                <KeyRound className="mr-2 h-4 w-4" />
                Enviar link de redefinição
              </>
            )}
          </Button>

          <div className="pt-3 text-center border-t border-slate-100">
            <Link
              to="/login"
              className="inline-flex items-center text-xs font-medium text-slate-600 hover:text-teal-600"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Lembrou sua senha? Faça login
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
