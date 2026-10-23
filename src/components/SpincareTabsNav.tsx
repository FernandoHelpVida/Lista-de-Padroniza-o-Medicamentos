import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { UserSquare2, DollarSign, FileSpreadsheet, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpincareTabsNavProps {
  className?: string
}

/**
 * Componente de Abas / Tabs para as telas da integração SpinCare.
 * Exibe as opções "Pacientes", "Orçamentos" e "Prescrições" de forma evidente e moderna,
 * mantendo o bloqueio de Médicos Visitadores (LGPD).
 */
export function SpincareTabsNav({ className }: SpincareTabsNavProps) {
  const { isMedicoVisitador } = useAuth()
  const location = useLocation()

  if (isMedicoVisitador) {
    return (
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
        <ShieldAlert size={16} className="text-amber-600 shrink-0" />
        <span>
          Acesso restrito: Médicos Visitadores não possuem acesso às telas de Pacientes, Orçamentos
          ou Prescrições da SpinCare.
        </span>
      </div>
    )
  }

  const isPacientes = location.pathname.startsWith('/pacientes')
  const isOrcamentos = location.pathname.startsWith('/orcamentos')
  const isPrescricoes = location.pathname.startsWith('/prescricoes')

  return (
    <div
      className={cn(
        'w-full border-b border-emerald-950/10 pb-1.5 -mx-1 px-1 sm:mx-0 sm:px-0',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 sm:gap-3 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
        <NavLink
          to="/pacientes"
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 min-h-[44px]',
            isPacientes
              ? 'bg-[#0F5342] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-[#0C4336] hover:bg-emerald-50/70 border border-emerald-950/10 active:bg-emerald-100',
          )}
        >
          <UserSquare2
            size={16}
            className={cn(
              'transition-colors shrink-0',
              isPacientes ? 'text-[#F5B31C]' : 'text-[#0D8272]',
            )}
          />
          <span>Pacientes</span>
          <span
            className={cn(
              'text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shrink-0',
              isPacientes
                ? 'bg-white/20 text-emerald-100'
                : 'bg-emerald-50 text-[#0C4336] border border-emerald-200',
            )}
          >
            Ao Vivo
          </span>
        </NavLink>

        <NavLink
          to="/prescricoes"
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 min-h-[44px]',
            isPrescricoes
              ? 'bg-[#0F5342] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-[#0C4336] hover:bg-emerald-50/70 border border-emerald-950/10 active:bg-emerald-100',
          )}
        >
          <FileSpreadsheet
            size={16}
            className={cn(
              'transition-colors shrink-0',
              isPrescricoes ? 'text-[#F5B31C]' : 'text-[#0D8272]',
            )}
          />
          <span>Prescrições</span>
          <span
            className={cn(
              'text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shrink-0',
              isPrescricoes
                ? 'bg-white/20 text-emerald-100'
                : 'bg-[#EBF3FF] text-[#1E40AF] border border-[#93C5FD]/40',
            )}
          >
            2026
          </span>
        </NavLink>

        <NavLink
          to="/orcamentos"
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 min-h-[44px]',
            isOrcamentos
              ? 'bg-[#0F5342] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-[#0C4336] hover:bg-emerald-50/70 border border-emerald-950/10 active:bg-emerald-100',
          )}
        >
          <DollarSign
            size={16}
            className={cn(
              'transition-colors shrink-0',
              isOrcamentos ? 'text-[#F5B31C]' : 'text-[#0D8272]',
            )}
          />
          <span>Orçamentos</span>
          <span
            className={cn(
              'text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shrink-0',
              isOrcamentos
                ? 'bg-white/20 text-emerald-100'
                : 'bg-[#FEF8EC] text-[#92400E] border border-[#F5B31C]/40',
            )}
          >
            &ge; 2026
          </span>
        </NavLink>
      </div>
    </div>
  )
}
export default SpincareTabsNav
