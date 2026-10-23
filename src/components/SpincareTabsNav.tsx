import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { UserSquare2, DollarSign, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpincareTabsNavProps {
  className?: string
}

/**
 * Componente de Abas / Tabs para as telas da integração SpinCare.
 * Exibe as opções "Pacientes" e "Orçamentos" de forma evidente e moderna,
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
          Acesso restrito: Médicos Visitadores não possuem acesso às telas de Pacientes e Orçamentos
          da SpinCare.
        </span>
      </div>
    )
  }

  const isPacientes = location.pathname.startsWith('/pacientes')
  const isOrcamentos = location.pathname.startsWith('/orcamentos')

  return (
    <div className={cn('w-full border-b border-emerald-950/10 pb-1', className)}>
      <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
        <NavLink
          to="/pacientes"
          className={cn(
            'flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0',
            isPacientes
              ? 'bg-[#0F5342] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-[#0C4336] hover:bg-emerald-50/70 border border-emerald-950/10',
          )}
        >
          <UserSquare2
            size={16}
            className={cn('transition-colors', isPacientes ? 'text-[#F5B31C]' : 'text-[#0D8272]')}
          />
          <span>Pacientes</span>
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.2 rounded',
              isPacientes
                ? 'bg-white/15 text-emerald-100'
                : 'bg-emerald-50 text-[#0C4336] border border-emerald-200',
            )}
          >
            Ao Vivo
          </span>
        </NavLink>

        <NavLink
          to="/orcamentos"
          className={cn(
            'flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0',
            isOrcamentos
              ? 'bg-[#0F5342] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-[#0C4336] hover:bg-emerald-50/70 border border-emerald-950/10',
          )}
        >
          <DollarSign
            size={16}
            className={cn('transition-colors', isOrcamentos ? 'text-[#F5B31C]' : 'text-[#0D8272]')}
          />
          <span>Orçamentos</span>
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.2 rounded',
              isOrcamentos
                ? 'bg-white/15 text-emerald-100'
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
