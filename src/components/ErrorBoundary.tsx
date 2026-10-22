import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
  fallbackMessage?: string
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary capturou erro de renderização:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Algo deu errado nesta tela.'
      const message =
        this.props.fallbackMessage ||
        'Ocorreu uma falha inesperada durante a exibição desta página. Tente atualizar a página ou voltar para o início.'

      return (
        <div className="min-h-[50vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-rose-200/80 shadow-md rounded-2xl p-6 text-center space-y-4 animate-in fade-in">
            <div className="h-14 w-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">{title}</h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{message}</p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left">
                <p className="text-[10px] uppercase font-mono font-bold text-slate-400">
                  Detalhes técnicos
                </p>
                <p className="text-xs font-mono text-rose-700 truncate mt-0.5">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button
                onClick={this.handleReload}
                className="w-full sm:w-auto bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs h-10 min-h-[40px] font-bold rounded-xl shadow-xs"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Atualizar Página
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  this.handleReset()
                  window.location.href = '/'
                }}
                className="w-full sm:w-auto text-xs h-10 min-h-[40px] border-slate-200 text-slate-700"
              >
                <Home className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                Ir para o Início
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
