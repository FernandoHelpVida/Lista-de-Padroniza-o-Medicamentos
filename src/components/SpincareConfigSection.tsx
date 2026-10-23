import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import {
  Server,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Globe,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react'
import {
  getSpincareConfig,
  saveSpincareConfig,
  testSpincareConnection,
  type SpincareConfig,
} from '@/services/spincare'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export function SpincareConfigSection() {
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const [baseUrl, setBaseUrl] = useState('')
  const [apiLogin, setApiLogin] = useState('')
  const [apiPassword, setApiPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [apiToken, setApiToken] = useState('')
  const [endpointPatients, setEndpointPatients] = useState('/integration-engine/get/patients')
  const [endpointBudgets, setEndpointBudgets] = useState('/integration-engine/get/budgets')
  const [isActive, setIsActive] = useState(true)

  const [currentConfig, setCurrentConfig] = useState<SpincareConfig | null>(null)
  const [testResult, setTestResult] = useState<{
    tested: boolean
    success: boolean
    message: string
    testedAt?: string
  } | null>(null)

  const loadConfig = async () => {
    setLoading(true)
    try {
      const data = await getSpincareConfig()
      setCurrentConfig(data)
      setBaseUrl(data.base_url || 'https://integration.spincare.com.br/spincare_integration')
      setEndpointPatients(data.endpoint_patients || '/integration-engine/get/patients')
      setEndpointBudgets(data.endpoint_budgets || '/integration-engine/get/budgets')
      setIsActive(data.is_active !== undefined ? data.is_active : true)
      if (data.login_masked) {
        setApiLogin(data.login_masked)
      } else {
        setApiLogin('')
      }
      if (data.has_password) {
        setApiPassword('••••••••')
      } else {
        setApiPassword('')
      }
      if (data.token_masked) {
        setApiToken(data.token_masked)
      } else {
        setApiToken('')
      }
      if (data.last_tested_at) {
        setTestResult({
          tested: true,
          success: data.last_test_status === 'ok',
          message: data.last_test_message || '',
          testedAt: data.last_tested_at,
        })
      }
    } catch (err) {
      console.error('Erro ao carregar configurações do SpinCare:', err)
      toast({
        title: 'Aviso de configuração',
        description: 'Não foi possível carregar os parâmetros atuais da integração.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const result = await saveSpincareConfig({
        base_url: baseUrl.trim(),
        api_login: apiLogin.trim(),
        api_password: apiPassword.trim(),
        api_token: apiToken.trim(),
        endpoint_patients: endpointPatients.trim() || '/integration-engine/get/patients',
        endpoint_budgets: endpointBudgets.trim() || '/integration-engine/get/budgets',
        is_active: isActive,
      })

      toast({
        title: 'Integração salva!',
        description: result.message || 'Configurações do SpinCare atualizadas com sucesso.',
      })

      await loadConfig()
    } catch (err: unknown) {
      toast({
        title: 'Falha ao salvar',
        description: getErrorMessage(err, 'Não foi possível salvar as configurações do SpinCare.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const res = await testSpincareConnection({
        base_url: baseUrl.trim(),
        api_login: apiLogin.trim(),
        api_password: apiPassword.trim(),
        endpoint_patients: endpointPatients.trim() || '/integration-engine/get/patients',
        endpoint_budgets: endpointBudgets.trim() || '/integration-engine/get/budgets',
      })

      setTestResult({
        tested: true,
        success: res.success,
        message: res.message,
        testedAt: res.testedAt || new Date().toISOString(),
      })

      if (res.success) {
        toast({
          title: 'Conexão validada com sucesso!',
          description: res.message,
        })
      } else {
        toast({
          title: 'Falha na conexão',
          description: res.message,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(
        err,
        'Não foi possível consultar o SpinCare agora. Verifique a URL ou o token.',
      )
      setTestResult({
        tested: true,
        success: false,
        message: msg,
        testedAt: new Date().toISOString(),
      })
      toast({
        title: 'Erro no teste de conexão',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <Card className="border-emerald-950/10 bg-white shadow-xs">
        <CardContent className="py-12 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-[#0D8272] mb-2" />
          <p className="text-xs">Carregando parâmetros da integração SpinCare...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-emerald-950/10 bg-white shadow-xs">
      <CardHeader className="pb-3 border-b border-emerald-950/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-[#E6F5F2] text-[#0D8272] flex items-center justify-center shrink-0">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                Middleware Sistema SpinCare
                <Badge
                  className={
                    currentConfig?.configured
                      ? 'bg-emerald-100 text-[#0C4336] border-emerald-300 text-[10px] font-bold'
                      : 'bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold'
                  }
                >
                  {currentConfig?.configured ? 'Configurado' : 'Aguardando Configuração'}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Integração segura em tempo real (OpenAPI) para leitura de pacientes e orçamentos
                (&ge; 2026)
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-slate-600 font-medium">Integração ativa</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-5">
        {/* Aviso LGPD & Segurança das Credenciais */}
        <div className="p-3.5 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 text-xs text-slate-700 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-[#0C4336]">
            <ShieldCheck className="h-4 w-4 text-[#0D8272]" />
            <span>Segurança, Criptografia e Proteção LGPD</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            As credenciais ficam armazenadas exclusivamente no backend seguro Help Vida e{' '}
            <strong>nunca</strong> são expostas no código-fonte nem enviadas em texto puro ao
            navegador. O frontend nunca se comunica direto com o SpinCare: todas as requisições
            passam pelo middleware protegido, que audita os acessos e injeta a autenticação no
            servidor.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* 1. URL Base */}
          <div className="space-y-1.5">
            <Label
              htmlFor="baseUrl"
              className="text-xs font-bold text-slate-700 flex items-center justify-between"
            >
              <span>URL Base da API SpinCare *</span>
              <span className="text-[10px] font-normal text-slate-500">
                Ex: https://api.spincare.com.br
              </span>
            </Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="baseUrl"
                type="url"
                required
                placeholder="https://api.spincare.com.br"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="h-11 pl-9 text-xs sm:text-sm bg-[#F4FAF8] border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
              />
            </div>
          </div>

          {/* 2. Credenciais de Autenticação da API (OpenAPI SpinCare: /token/v1) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="h-4 w-4 text-[#0D8272]" />
                Credenciais de Acesso Oficial SpinCare (/token/v1)
              </span>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                OAuth / Token Automático
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="apiLogin" className="text-xs font-bold text-slate-700">
                  Login / E-mail da SpinCare *
                </Label>
                <Input
                  id="apiLogin"
                  type="email"
                  required
                  placeholder="usuario@helpvida.com.br"
                  value={apiLogin}
                  onChange={(e) => setApiLogin(e.target.value)}
                  className="h-11 text-xs sm:text-sm bg-white border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
                />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="apiPassword"
                  className="text-xs font-bold text-slate-700 flex items-center justify-between"
                >
                  <span>Senha de Acesso *</span>
                  {currentConfig?.has_password && (
                    <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-0.5">
                      <Lock size={10} /> Salva
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="apiPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Senha da API SpinCare..."
                    value={apiPassword}
                    onChange={(e) => setApiPassword(e.target.value)}
                    className="h-11 pr-10 text-xs sm:text-sm font-mono bg-white border-emerald-950/15 rounded-xl focus-visible:ring-[#0D8272]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md"
                    title={showPassword ? 'Ocultar' : 'Exibir'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              O middleware efetua login automaticamente contra <code>/token/v1</code>, renova o
              token em memória quando expirar e garante que todas as chamadas de pacientes e
              orçamentos permaneçam ativas.
            </p>
          </div>

          {/* 4. Caminhos dos Endpoints (Editáveis) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="endpointPatients" className="text-xs font-bold text-slate-700">
                Endpoint de Pacientes
              </Label>
              <Input
                id="endpointPatients"
                type="text"
                placeholder="/v1/patients"
                value={endpointPatients}
                onChange={(e) => setEndpointPatients(e.target.value)}
                className="h-11 text-xs sm:text-sm font-mono bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
              <p className="text-[10px] text-slate-400">
                Padrão: /v1/patients (ajustável conforme o OpenAPI)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="endpointBudgets" className="text-xs font-bold text-slate-700">
                Endpoint de Orçamentos
              </Label>
              <Input
                id="endpointBudgets"
                type="text"
                placeholder="/v1/budgets"
                value={endpointBudgets}
                onChange={(e) => setEndpointBudgets(e.target.value)}
                className="h-11 text-xs sm:text-sm font-mono bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
              <p className="text-[10px] text-slate-400">
                Padrão: /v1/budgets (filtro &ge; 2026 aplicado)
              </p>
            </div>
          </div>

          {/* Painel de Resultado do Teste de Conexão */}
          {testResult?.tested && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-bold">
                  {testResult.success
                    ? 'Conexão com SpinCare estabelecida com sucesso'
                    : 'Falha na comunicação'}
                </p>
                <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">
                  {testResult.message}
                </p>
                {testResult.testedAt && (
                  <p className="text-[10px] opacity-75 font-mono mt-1">
                    Verificado em: {new Date(testResult.testedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={testing || !baseUrl.trim()}
              onClick={handleTestConnection}
              className="w-full sm:w-auto h-11 min-h-[44px] text-xs font-bold border-[#0D8272]/30 text-[#0C4336] hover:bg-[#E6F5F2] rounded-xl flex items-center justify-center gap-1.5"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Testando Conexão...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 text-[#0D8272]" />
                  Testar Conexão ao Vivo
                </>
              )}
            </Button>

            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto h-11 min-h-[44px] bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvando Parâmetros...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#F5B31C]" />
                  Salvar Configuração SpinCare
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
