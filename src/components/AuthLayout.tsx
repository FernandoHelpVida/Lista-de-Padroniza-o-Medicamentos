import React from 'react'

export const AuthLayout: React.FC<{
  title: string
  subtitle?: string
  children: React.ReactNode
}> = ({ title, subtitle, children }) => {
  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-gradient-to-br from-teal-700 via-slate-800 to-slate-900 p-4 sm:p-6 lg:p-8">
      {/* Container Centralizado */}
      <div className="w-full max-w-md">
        {/* Marca Help Vida */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg mb-3">
            <svg
              className="w-8 h-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5">
            Help <span className="text-teal-400 font-extrabold">Vida</span>
          </h1>
          <p className="text-xs font-medium text-teal-200/80 tracking-wide uppercase mt-0.5">
            Consulta de Medicamentos & Padronização
          </p>
        </div>

        {/* Card do Formulário */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>

          {children}
        </div>

        {/* Rodapé institucional */}
        <div className="mt-8 text-center text-xs text-white/50 space-y-1">
          <p>Help Vida — Atenção à Saúde e Home Care</p>
          <p>ANEXO I — Comissão de Padronização de Medicamentos</p>
        </div>
      </div>
    </div>
  )
}
