import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Pill,
  BotMessageSquare,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  PlusCircle,
  HelpCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (globalSearch.trim()) {
      navigate(`/medicamentos?q=${encodeURIComponent(globalSearch.trim())}`)
      setGlobalSearch('')
    }
  }

  // Obter título da página atual
  const getPageTitle = () => {
    const path = location.pathname
    if (path === '/') return 'Visão Geral da Padronização'
    if (path.startsWith('/medicamentos')) return 'Catálogo de Medicamentos'
    if (path.startsWith('/assistente')) return 'Assistente Virtual da Farmácia'
    if (path.startsWith('/configuracoes')) return 'Configurações do Usuário'
    return 'Help Vida'
  }

  const navItems = [
    { title: 'Início', path: '/', icon: LayoutDashboard },
    { title: 'Medicamentos', path: '/medicamentos', icon: Pill },
    { title: 'Assistente', path: '/assistente', icon: BotMessageSquare },
    { title: 'Configurações', path: '/configuracoes', icon: Settings },
  ]

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'HV'

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row text-slate-900 antialiased font-sans">
      {/* 1. SIDEBAR (DESKTOP E TABLET) */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-slate-900 text-white shrink-0 transition-all duration-300 ease-in-out border-r border-slate-800 z-30 sticky top-0 h-screen',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Header da Sidebar */}
        <div className="h-16 flex items-center px-4 justify-between border-b border-slate-800/80">
          {!collapsed ? (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shrink-0 shadow-md">
                <svg
                  className="w-5 h-5"
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
              <div className="flex flex-col truncate">
                <span className="text-base font-bold tracking-tight leading-tight">
                  Help <span className="text-teal-400">Vida</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                  Farmácia Clínica
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto h-9 w-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shrink-0 shadow-md">
              <svg
                className="w-5 h-5"
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
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative',
                  isActive
                    ? 'bg-teal-600/15 text-teal-400 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70',
                )}
                title={collapsed ? item.title : undefined}
              >
                {/* Active left bar */}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-teal-500 rounded-r-full" />
                )}
                <Icon
                  size={20}
                  className={cn(
                    'shrink-0 transition-colors',
                    isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-white',
                  )}
                />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          {!collapsed && (
            <div className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center gap-2.5">
              <Avatar className="h-8 w-8 rounded-lg bg-teal-700 text-teal-100 text-xs font-bold shrink-0">
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="truncate flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {user?.name || 'Profissional'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {isAdmin ? 'Administrador' : 'Equipe de Saúde'}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition',
              collapsed && 'justify-center',
            )}
            title="Sair do sistema"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sair da conta</span>}
          </button>
        </div>
      </aside>

      {/* 2. DRAWER MOBILE */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-900 text-white p-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center text-white">
                  <Pill size={18} />
                </div>
                <span className="font-bold text-base text-white">Help Vida</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="mt-4 space-y-1 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive =
                  item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path)

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                      isActive
                        ? 'bg-teal-600/20 text-teal-400 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800',
                    )}
                  >
                    <Icon size={18} className={isActive ? 'text-teal-400' : 'text-slate-400'} />
                    <span>{item.title}</span>
                  </NavLink>
                )
              })}
            </nav>

            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  logout()
                }}
                className="flex items-center gap-2 text-rose-400 text-sm font-medium px-2 py-2 w-full"
              >
                <LogOut size={16} />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. CONTEÚDO PRINCIPAL COM TOPBAR */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Topbar Fixa */}
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {/* Lado esquerdo: Hamburger no mobile + Título */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden text-slate-600 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100"
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
                {getPageTitle()}
              </h1>
              <span className="hidden sm:inline-block text-[11px] font-medium text-slate-400">
                ANEXO I — Relação dos Medicamentos Avaliados
              </span>
            </div>
          </div>

          {/* Centro: Busca Global Rápida */}
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex items-center relative max-w-sm w-full mx-4"
          >
            <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
            <Input
              type="search"
              placeholder="Pesquisar medicamento ou classe..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="h-9 pl-9 pr-3 text-xs bg-slate-50 border-slate-200 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-teal-500 rounded-full"
            />
          </form>

          {/* Lado direito: Perfil do usuário com Dropdown */}
          <div className="flex items-center gap-2 sm:gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-teal-500"
                  aria-label="Menu do usuário"
                >
                  <Avatar className="h-8 w-8 rounded-full bg-teal-600 text-white text-xs font-bold shadow-sm">
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:inline-block text-xs font-medium text-slate-700 max-w-[120px] truncate text-left">
                    {user?.name || user?.email?.split('@')[0]}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 p-1 rounded-xl shadow-lg border-slate-200"
              >
                <DropdownMenuLabel className="px-3 py-2">
                  <p className="text-xs font-semibold text-slate-800 leading-none truncate">
                    {user?.name || 'Profissional'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-normal truncate mt-1">
                    {user?.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/configuracoes')}
                  className="text-xs text-slate-700 cursor-pointer rounded-lg py-2"
                >
                  <Settings size={14} className="mr-2 text-slate-500" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/assistente')}
                  className="text-xs text-slate-700 cursor-pointer rounded-lg py-2"
                >
                  <HelpCircle size={14} className="mr-2 text-slate-500" />
                  Tirar dúvidas com Assistente
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-xs text-rose-600 cursor-pointer rounded-lg py-2 hover:bg-rose-50"
                >
                  <LogOut size={14} className="mr-2 text-rose-500" />
                  Sair do sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Área de Visualização Principal */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-300">
          <Outlet />
        </main>
      </div>

      {/* 4. BARRA DE NAVEGAÇÃO INFERIOR (MOBILE EXCLUSIVO < 768px) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-slate-200 z-40 flex items-center justify-around px-2 shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center w-14 h-full text-[10px] font-medium transition',
                isActive ? 'text-teal-600 font-bold' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <Icon size={18} className={isActive ? 'text-teal-600' : 'text-slate-500'} />
              <span className="mt-0.5">{item.title}</span>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}
