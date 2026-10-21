import React, { useEffect, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'

export default function VerificarEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasRequested = useRef(false)

  useEffect(() => {
    if (hasRequested.current) return
    hasRequested.current = true

    if (!token) {
      setLoading(false)
      setError('Token de verificação não encontrado na URL.')
      return
    }

    const confirmEmail = async () => {
      try {
        await pb.collection('users').confirmVerification(token)
        setSuccess(true)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Link de verificação inválido ou expirado.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    confirmEmail()
  }, [token])

  return (
    <AuthLayout
      title="Verificação de E-mail"
      subtitle="Confirmação de e-mail institucional Help Vida"
    >
      <div className="py-4 text-center space-y-4">
        {loading && (
          <div className="flex flex-col items-center gap-2 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-xs text-slate-600">Validando autenticidade do e-mail...</p>
          </div>
        )}

        {error && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
            <Link to="/login" className="block pt-2">
              <Button variant="outline" className="w-full text-xs">
                Ir para o Login
              </Button>
            </Link>
          </div>
        )}

        {success && (
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">E-mail confirmado com sucesso!</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sua conta está ativada e pronta para uso no sistema de Consulta de Medicamentos.
            </p>
            <Link to="/login" className="block pt-2">
              <Button className="w-full text-xs bg-teal-600 hover:bg-teal-700">
                Ir para o Login
              </Button>
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
