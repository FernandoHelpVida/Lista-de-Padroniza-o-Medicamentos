import { useState, useEffect } from 'react'
import {
  Smartphone,
  Share,
  MoreVertical,
  PlusSquare,
  CheckCircle2,
  X,
  Sparkles,
  ArrowDownToLine,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface InstallPwaPromptProps {
  variant?: 'banner' | 'card'
  className?: string
  showAlwaysInSettings?: boolean
}

export function InstallPwaPrompt({
  variant = 'banner',
  className = '',
  showAlwaysInSettings = false,
}: InstallPwaPromptProps) {
  const [isStandalone, setIsStandalone] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installSuccess, setInstallSuccess] = useState(false)

  useEffect(() => {
    // 1. Detect if running standalone (already installed as PWA)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://')
      setIsStandalone(Boolean(isStandaloneMode))
    }

    checkStandalone()

    // 2. Detect iOS (Safari/WebKit)
    const ua = window.navigator.userAgent.toLowerCase()
    const isAppleIos = /iphone|ipad|ipod/.test(ua)
    setIsIos(isAppleIos)

    // 3. Check dismissal preference (stored in localStorage)
    if (!showAlwaysInSettings) {
      const dismissed = localStorage.getItem('helpvida_pwa_dismissed') === 'true'
      setIsDismissed(dismissed)
    }

    // 4. Listen to beforeinstallprompt on Chromium/Android
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [showAlwaysInSettings])

  const handleDismiss = () => {
    setIsDismissed(true)
    if (!showAlwaysInSettings) {
      localStorage.setItem('helpvida_pwa_dismissed', 'true')
    }
  }

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setInstallSuccess(true)
        setDeferredPrompt(null)
      }
    } catch {
      // Ignorar e deixar instruções manuais visíveis
    }
  }

  // If already standalone (running as installed app) and not in settings page, hide
  if (isStandalone && !showAlwaysInSettings) {
    return null
  }

  // If dismissed by user and not in settings, hide
  if (isDismissed && !showAlwaysInSettings) {
    return null
  }

  // If already installed and viewing in settings, display installed badge
  if (isStandalone && showAlwaysInSettings) {
    return (
      <Card className={`border-emerald-200 bg-emerald-50/60 ${className}`}>
        <CardContent className="p-4 sm:p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#0F5342] text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="h-5 w-5 text-[#F5B31C]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#0C4336]">
              Aplicativo Instalado no Dispositivo
            </h4>
            <p className="text-xs text-emerald-800/80 mt-0.5">
              Você está utilizando o Help Vida em modo de tela cheia (PWA instalado).
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Card variant (for Settings / Configuracoes page)
  if (variant === 'card') {
    return (
      <Card className={`border-emerald-200/80 bg-white shadow-xs overflow-hidden ${className}`}>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#E6F5F2] text-[#0F5342] flex items-center justify-center shrink-0 shadow-xs">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0D8272] bg-[#E6F5F2] px-2 py-0.5 rounded-full">
                  Atalho Rápido PWA
                </span>
                <h3 className="text-base font-bold text-[#0C4336] mt-0.5">
                  Instalar o App Help Vida no Celular
                </h3>
              </div>
            </div>

            {deferredPrompt && (
              <Button
                onClick={handleNativeInstall}
                size="sm"
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-semibold rounded-xl shadow-xs shrink-0"
              >
                <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
                Instalar Agora
              </Button>
            )}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Tenha acesso instantâneo ao catálogo de medicamentos com abertura em tela cheia e ícone
            oficial na tela inicial do seu celular ou tablet, sem barras do navegador.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Instruções iPhone / iPad / Safari */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                  
                </span>
                iPhone e iPad (Safari)
              </div>
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4 leading-relaxed">
                <li>
                  Toque no botão <strong className="text-slate-800">Compartilhar</strong> (ícone do
                  quadrado com seta para cima <Share className="inline h-3.5 w-3.5 text-blue-600" />
                  ) na barra do Safari;
                </li>
                <li>
                  Role as opções e selecione{' '}
                  <strong className="text-slate-800">&quot;Adicionar à Tela de Início&quot;</strong>{' '}
                  (<PlusSquare className="inline h-3.5 w-3.5 text-slate-700" />
                  );
                </li>
                <li>
                  Confirme tocando em{' '}
                  <strong className="text-slate-800">&quot;Adicionar&quot;</strong> no canto
                  superior direito.
                </li>
              </ol>
            </div>

            {/* Instruções Android / Chrome */}
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0C4336]">
                <span className="h-5 w-5 rounded-full bg-[#0F5342] text-white flex items-center justify-center text-[10px] font-bold">
                  ▶
                </span>
                Android (Chrome ou Edge)
              </div>
              <ol className="text-xs text-emerald-900/90 space-y-1.5 list-decimal pl-4 leading-relaxed">
                <li>
                  Toque no menu de <strong className="text-[#0C4336]">três pontinhos</strong> (
                  <MoreVertical className="inline h-3.5 w-3.5 text-slate-700" />) no canto superior;
                </li>
                <li>
                  Escolha{' '}
                  <strong className="text-[#0C4336]">&quot;Adicionar à tela inicial&quot;</strong>{' '}
                  ou <strong className="text-[#0C4336]">&quot;Instalar aplicativo&quot;</strong>;
                </li>
                <li>Confirme para fixar o atalho com o ícone oficial da Help Vida na sua tela.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Banner variant (for Index / Home)
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-white to-teal-50/60 p-4 sm:p-5 shadow-xs transition-all ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 sm:gap-3.5">
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-[#0F5342] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
            <Smartphone className="h-5 w-5 text-[#F5B31C]" />
          </div>

          <div className="space-y-1 pr-6 sm:pr-8">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F5342] bg-[#E6F5F2] border border-[#0D8272]/20 px-2 py-0.5 rounded-md">
                Acesso Direto
              </span>
              <h4 className="text-sm sm:text-base font-bold text-[#0C4336]">
                Instalar o App Help Vida no Celular
              </h4>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
              {isIos ? (
                <span>
                  Para usar como app em tela cheia: toque no botão{' '}
                  <strong className="text-slate-800">Compartilhar</strong> (
                  <Share className="inline h-3.5 w-3.5 text-blue-600" />) no Safari e escolha{' '}
                  <strong className="text-slate-800">&quot;Adicionar à Tela de Início&quot;</strong>
                  .
                </span>
              ) : (
                <span>
                  Abra em tela cheia com um toque: no menu (
                  <MoreVertical className="inline h-3.5 w-3.5 text-slate-700" />
                  ), escolha{' '}
                  <strong className="text-[#0C4336]">
                    &quot;Adicionar à tela inicial&quot;
                  </strong>{' '}
                  ou <strong className="text-[#0C4336]">&quot;Instalar aplicativo&quot;</strong>.
                </span>
              )}
            </p>

            {deferredPrompt && (
              <div className="pt-1.5 flex items-center gap-2">
                <Button
                  onClick={handleNativeInstall}
                  size="sm"
                  className="h-8 px-3 bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
                  Instalar Atalho
                </Button>
                {installSuccess && (
                  <span className="text-xs text-[#0D8272] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Instalado com sucesso!
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Botão de fechar/dispensar banner */}
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          title="Dispensar aviso de instalação"
          aria-label="Dispensar aviso de instalação"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
