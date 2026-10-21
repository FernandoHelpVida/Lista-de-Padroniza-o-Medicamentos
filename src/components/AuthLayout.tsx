import React from 'react'
import logoHelpVida from '@/assets/logo-helpvida-e2205.jpeg'

export const AuthLayout: React.FC<{
  title: string
  subtitle?: string
  children: React.ReactNode
}> = ({ title, subtitle, children }) => {
  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-gradient-to-br from-[#0C4336] via-[#0F5342] to-[#082921] p-3.5 sm:p-6 lg:p-8">
      {/* Container Centralizado */}
      <div className="w-full max-w-md mx-auto">
        {/* Marca Help Vida Oficial */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="bg-white rounded-2xl p-3 sm:p-3.5 shadow-xl border border-white/30 flex items-center justify-center mb-3 transition transform hover:scale-[1.02]">
            <img
              src={logoHelpVida}
              alt="Help Vida"
              className="h-11 sm:h-12 w-auto object-contain max-w-[210px]"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-[11px] font-semibold tracking-wide uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5B31C]" />
            Farmácia Clínica & Padronização
          </div>
          <p className="text-[12px] font-medium text-emerald-100/90 tracking-normal mt-1.5">
            Consulta de Medicamentos — ANEXO I
          </p>
        </div>

        {/* Card do Formulário */}
        <div className="bg-white rounded-2xl shadow-2xl border border-emerald-950/10 p-5 sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>

          {children}
        </div>

        {/* Rodapé institucional */}
        <div className="mt-6 sm:mt-8 text-center text-xs text-white/70 space-y-1">
          <p className="font-semibold text-white/80">Help Vida — Atenção à Saúde e Home Care</p>
          <p className="text-[11px] text-emerald-200/70">
            ANEXO I — Comissão de Padronização de Medicamentos
          </p>
        </div>
      </div>
    </div>
  )
}
