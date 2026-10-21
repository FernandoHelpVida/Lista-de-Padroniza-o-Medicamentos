import React, { useEffect, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'

export default function ConfirmarEmail() {
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
      setError('Token de alteração de e-mail não encontrado.')
      return
    }

    const confirmEmailChange = async () => {
      try {
        await pb.collection('users').confirmEmailChange(token, '')
        // Logout user because email has changed
        pb.authStore.clear()
        setSuccess(true)
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Link de alteração de e-mail expirado ou inválido.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    confirmEmailChange()
  }, [token])

  return (
    <AuthLayout
      title="Atualização de E-mail"
      subtitle="Confirmação de troca de endereço institucional"
    >
      <div className="py-4 text-center space-y-4">
        {loading && (
          <div className="flex flex-col items-center gap-2 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-xs text-slate-600">Atualizando endereço de e-mail...</p>
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
            <h3 className="text-base font-bold text-slate-800">E-mail atualizado!</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              O novo endereço foi confirmado com sucesso. Para sua segurança, efetue login novamente
              utilizando o novo e-mail.
            </p>
            <Link to="/login" className="block pt-2">
              <Button className="w-full h-12 min-h-[48px] text-xs font-bold bg-[#0F5342] hover:bg-[#0C4336] text-white rounded-xl">
                <ArrowLeft className="mr-2 h-3.5 w-3.5 text-[#F5B31C]" />
                Acessar com novo e-mail
              </Button>
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
