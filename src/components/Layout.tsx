import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import logoHelpVida from '@/assets/logo-helpvida-e2205.jpeg'
import {
  LayoutDashboard,
  Pill,
  FileUp,
  BotMessageSquare,
  Settings,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ShieldCheck,
  FileQuestion,
  Users,
  Clock,
  UserCheck,
  AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'
import { PoliticaPrivacidadeModal } from '@/components/PoliticaPrivacidadeModal'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [politicaOpen, setPoliticaOpen] = useState(false)

  // Contagem de usuários pendentes para alerta em tempo real do Administrador
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)

  // Carregar contagem de pendentes se o usuário for administrador
  const fetchPendingApprovals = async () => {
    if (!isAdmin) return
    try {
      const records = await pb.collection('users').getList(1, 1, {
        filter: "approval_status = 'pendente'",
      })
      const count = records.totalItems
      setPendingApprovalsCount(count)

      // Se houver pendentes, verificar se o modal já foi dispensado nesta sessão do navegador
      if (count > 0) {
        const dismissed = sessionStorage.getItem('helpvida_approvals_modal_dismissed')
        if (!dismissed) {
          setApprovalModalOpen(true)
        }
      }
    } catch (err) {
      // Ignorar erros caso não esteja autenticado
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    fetchPendingApprovals()

    // Subscrição em tempo real aos usuários para atualizar contador ao vivo
    const unsubscribePromise = pb.collection('users').subscribe('*', () => {
      fetchPendingApprovals()
    })

    return () => {
      unsubscribePromise
        .then((unsub) => {
          if (typeof unsub === 'function') {
            unsub()
          }
        })
        .catch(() => {
          pb.collection('users')
            .unsubscribe('*')
            .catch(() => {})
        })
    }
  }, [isAdmin])

  const handleDismissModal = () => {
    sessionStorage.setItem('helpvida_approvals_modal_dismissed', 'true')
    setApprovalModalOpen(false)
  }

  const handleReviewNow = () => {
    sessionStorage.setItem('helpvida_approvals_modal_dismissed', 'true')
    setApprovalModalOpen(false)
    navigate('/equipe#aprovacoes')
  }

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
    if (path.startsWith('/solicitacoes')) return 'Solicitações de Padronização'
    if (path.startsWith('/importar')) return 'Importar Lista Padronizada (PDF)'
    if (path.startsWith('/equipe')) return 'Gestão de Contas da Equipe'
    if (path.startsWith('/assistente')) return 'Assistente Virtual da Farmácia'
    if (path.startsWith('/configuracoes')) return 'Configurações do Usuário'
    return 'Help Vida'
  }

  // Itens da barra de navegação lateral (Desktop)
  const navItems = [
    { title: 'Início', path: '/', icon: LayoutDashboard },
    { title: 'Medicamentos', path: '/medicamentos', icon: Pill },
    { title: 'Solicitações', path: '/solicitacoes', icon: FileQuestion },
    ...(isAdmin ? [{ title: 'Importar PDF', path: '/importar', icon: FileUp }] : []),
    ...(isAdmin
      ? [
          {
            title: 'Equipe',
            path: '/equipe',
            icon: Users,
            badgeCount: pendingApprovalsCount,
          },
        ]
      : []),
    { title: 'Assistente', path: '/assistente', icon: BotMessageSquare },
    { title: 'Configurações', path: '/configuracoes', icon: Settings },
  ]

  // Barra de navegação inferior mobile: estritamente 5 itens para caber com folga em telas de 360px
  // Início, Medicamentos, Solicitações, Assistente, Configurações (com acesso a Equipe e Importar no menu/topo)
  const mobileNavItems = [
    { title: 'Início', path: '/', icon: LayoutDashboard },
    { title: 'Medicamentos', path: '/medicamentos', icon: Pill },
    { title: 'Solicitações', path: '/solicitacoes', icon: FileQuestion },
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
    <div className="min-h-screen bg-[#F4FAF8] flex flex-col md:flex-row text-slate-900 antialiased font-sans">
      {/* 1. SIDEBAR (DESKTOP E TABLET) */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-[#082921] text-white shrink-0 transition-all duration-300 ease-in-out border-r border-[#0F5342]/50 z-30 sticky top-0 h-screen',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        {/* Header da Sidebar */}
        <div className="h-18 flex items-center px-3.5 justify-between border-b border-[#0F5342]/40 bg-[#06201a]">
          {!collapsed ? (
            <div className="flex items-center gap-2.5 overflow-hidden py-2">
              {/* Card claro para abrigar a logo oficial Help Vida sobre fundo escuro */}
              <div className="bg-white rounded-xl p-1.5 shadow-sm border border-white/20 flex items-center justify-center shrink-0">
                <img
                  src={logoHelpVida}
                  alt="Help Vida"
                  className="h-7 w-auto object-contain max-w-[130px]"
                />
              </div>
              <div className="flex flex-col truncate">
                <span className="text-[10px] font-bold text-[#F5B31C] tracking-wider uppercase leading-none">
                  Padronização
                </span>
                <span className="text-[10px] text-emerald-200/70 font-medium truncate mt-0.5">
                  Farmácia Clínica
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto bg-white rounded-xl p-1.5 shadow-sm border border-white/20 flex items-center justify-center shrink-0">
              <img
                src={logoHelpVida}
                alt="Help Vida"
                className="h-6 w-6 object-contain object-left"
              />
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex text-emerald-300/70 hover:text-white p-1.5 rounded-lg hover:bg-[#0F5342]/60 transition"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 py-4 px-2.5 space-y-1.5 overflow-y-auto">
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
                    ? 'bg-[#0F5342] text-white font-semibold shadow-sm'
                    : 'text-emerald-100/70 hover:text-white hover:bg-[#0C4336]/60',
                )}
                title={collapsed ? item.title : undefined}
              >
                {/* Active indicator bar na lateral */}
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1.5 bg-[#F5B31C] rounded-r-full" />
                )}
                <div className="relative shrink-0">
                  <Icon
                    size={20}
                    className={cn(
                      'transition-colors',
                      isActive ? 'text-[#F5B31C]' : 'text-emerald-200/60 group-hover:text-white',
                    )}
                  />
                  {/* Ponto vermelho na sidebar recolhida se houver pendências */}
                  {collapsed && Boolean(item.badgeCount && item.badgeCount > 0) && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#082921]" />
                  )}
                </div>
                {!collapsed && (
                  <div className="flex items-center justify-between flex-1 min-w-0">
                    <span className="truncate">{item.title}</span>
                    {Boolean(item.badgeCount && item.badgeCount > 0) && (
                      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                        {item.badgeCount}
                      </span>
                    )}
                  </div>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="p-3 border-t border-[#0F5342]/40 bg-[#06201a]/60 space-y-2">
          {!collapsed && (
            <div className="px-3 py-2.5 rounded-xl bg-[#0C4336]/60 border border-[#0F5342]/40 flex items-center gap-2.5">
              <Avatar className="h-8 w-8 rounded-lg bg-[#0F5342] text-white text-xs font-bold shrink-0 border border-[#1A8F7E]/40">
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="truncate flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {user?.name || 'Profissional'}
                </p>
                <p className="text-[10px] text-emerald-200/70 truncate flex items-center gap-1">
                  <ShieldCheck size={11} className="text-[#F5B31C]" />
                  {isAdmin ? 'Administrador' : 'Corpo Clínico'}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-emerald-200/60 hover:text-rose-300 hover:bg-rose-500/10 transition',
              collapsed && 'justify-center',
            )}
            title="Sair do sistema"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sair da conta</span>}
          </button>
        </div>
      </aside>

      {/* 2. CONTEÚDO PRINCIPAL COM TOPBAR MOBILE/DESKTOP */}
      <div className="flex-1 flex flex-col min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        {/* Topbar Fixa - Otimizada para Celular dos Médicos */}
        <header className="sticky top-0 z-30 h-15 sm:h-16 bg-white/95 backdrop-blur-md border-b border-emerald-950/10 px-3 sm:px-6 flex items-center justify-between shadow-xs pt-safe">
          {/* Lado esquerdo: Logo no mobile direto + Título */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Logo direta no mobile */}
            <div className="md:hidden flex items-center shrink-0">
              <img
                src={logoHelpVida}
                alt="Help Vida"
                className="h-8 w-auto object-contain max-w-[125px]"
                onClick={() => navigate('/')}
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-[#0C4336] tracking-tight truncate">
                {getPageTitle()}
              </h1>
              <span className="hidden sm:inline-block text-[11px] font-medium text-emerald-800/70">
                ANEXO I — Relação dos Medicamentos Avaliados
              </span>
            </div>
          </div>

          {/* Centro: Busca Global Rápida (Desktop) */}
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex items-center relative max-w-sm w-full mx-4"
          >
            <Search size={16} className="absolute left-3 text-emerald-700/50 pointer-events-none" />
            <Input
              type="search"
              placeholder="Pesquisar medicamento ou classe..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="h-9 pl-9 pr-3 text-xs bg-emerald-50/50 border-emerald-900/15 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0D8272] rounded-full"
            />
          </form>

          {/* Lado direito: Botão rápido de aprovações pendentes (se houver) + Perfil do usuário com Dropdown */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {isAdmin && pendingApprovalsCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/equipe#aprovacoes')}
                className="h-9 px-2.5 sm:px-3 text-xs bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 font-bold rounded-xl flex items-center gap-1.5 animate-pulse"
                title={`${pendingApprovalsCount} novo(s) cadastro(s) aguardando aprovação`}
              >
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                <span className="hidden sm:inline">Aprovações:</span>
                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {pendingApprovalsCount}
                </span>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 p-1 rounded-full hover:bg-emerald-50 transition focus:outline-none focus:ring-2 focus:ring-[#0D8272] relative"
                  aria-label="Menu do usuário"
                >
                  <Avatar className="h-8 w-8 rounded-full bg-[#0F5342] text-white text-xs font-bold shadow-xs border border-emerald-600/30">
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  {isAdmin && pendingApprovalsCount > 0 && (
                    <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                  )}
                  <span className="hidden lg:inline-block text-xs font-semibold text-slate-800 max-w-[120px] truncate text-left">
                    {user?.name || user?.email?.split('@')[0]}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 p-1 rounded-xl shadow-lg border-emerald-900/15"
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
                {isAdmin && (
                  <>
                    <DropdownMenuItem
                      onClick={() => navigate('/equipe#aprovacoes')}
                      className="text-xs text-slate-700 cursor-pointer rounded-lg py-2 hover:bg-emerald-50 flex items-center justify-between"
                    >
                      <div className="flex items-center">
                        <Users size={14} className="mr-2 text-[#0D8272]" />
                        <span>Gestão da Equipe</span>
                      </div>
                      {pendingApprovalsCount > 0 && (
                        <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                          {pendingApprovalsCount}
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => navigate('/importar')}
                      className="text-xs text-slate-700 cursor-pointer rounded-lg py-2 hover:bg-emerald-50"
                    >
                      <FileUp size={14} className="mr-2 text-[#0D8272]" />
                      Importar Lista (PDF)
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => navigate('/solicitacoes')}
                  className="text-xs text-slate-700 cursor-pointer rounded-lg py-2 hover:bg-emerald-50"
                >
                  <FileQuestion size={14} className="mr-2 text-[#0D8272]" />
                  Solicitações
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/configuracoes')}
                  className="text-xs text-slate-700 cursor-pointer rounded-lg py-2 hover:bg-emerald-50"
                >
                  <Settings size={14} className="mr-2 text-emerald-700" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPoliticaOpen(true)}
                  className="text-xs text-slate-700 cursor-pointer rounded-lg py-2 hover:bg-emerald-50"
                >
                  <ShieldCheck size={14} className="mr-2 text-[#0D8272]" />
                  Aviso de Privacidade LGPD
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/assistente')}
                  className="text-xs text-slate-700 cursor-pointer rounded-lg py-2 hover:bg-emerald-50"
                >
                  <HelpCircle size={14} className="mr-2 text-emerald-700" />
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

        {/* Área de Conteúdo Principal */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-300">
          <ErrorBoundary
            fallbackTitle="Algo deu errado nesta tela."
            fallbackMessage="Ocorreu um erro ao carregar o conteúdo desta tela. Tente atualizar a página ou navegar para outra seção."
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* 3. BARRA DE NAVEGAÇÃO INFERIOR OTIMIZADA PARA CELULAR DOS MÉDICOS (< 768px) */}
      {/* Botões com mínimo de 48px de área de toque, touch seguro, feedback tátil */}
      <nav
        aria-label="Navegação inferior mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] bg-white/95 backdrop-blur-md border-t border-emerald-950/10 z-40 flex items-stretch justify-around px-1 shadow-[0_-4px_16px_rgba(12,67,54,0.08)] pb-[env(safe-area-inset-bottom,0px)]"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full min-h-[48px] min-w-[44px] transition-all relative select-none px-1',
                isActive
                  ? 'text-[#0F5342] font-bold'
                  : 'text-slate-500 hover:text-slate-800 active:text-[#0F5342]',
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#F5B31C] rounded-b-full shadow-xs" />
              )}
              <div
                className={cn(
                  'p-1 rounded-xl transition',
                  isActive && 'bg-[#0D8272]/10 text-[#0F5342]',
                )}
              >
                <Icon
                  size={19}
                  className={cn(
                    'transition-transform',
                    isActive ? 'text-[#0F5342] scale-105' : 'text-slate-500',
                  )}
                />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[56px] text-center">
                {item.title}
              </span>
            </NavLink>
          )
        })}
      </nav>
      {/* Modal Popup de Alerta de Novos Cadastros Pendentes para o Administrador */}
      <Dialog open={approvalModalOpen} onOpenChange={setApprovalModalOpen}>
        <DialogContent className="max-w-md w-[92vw] sm:w-full p-5 sm:p-6 rounded-2xl bg-white border-amber-200">
          <DialogHeader className="text-left space-y-2">
            <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="h-6 w-6" />
            </div>
            <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336]">
              Novos cadastros aguardando aprovação
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 leading-relaxed pt-1">
              {pendingApprovalsCount === 1 ? (
                <span>
                  Existe <strong className="text-slate-900">1 novo usuário</strong> que se cadastrou
                  recentemente no sistema da Help Vida e está aguardando a sua validação e liberação
                  de acesso.
                </span>
              ) : (
                <span>
                  Existem{' '}
                  <strong className="text-slate-900">{pendingApprovalsCount} novos usuários</strong>{' '}
                  que se cadastraram no sistema da Help Vida e estão aguardando sua validação e
                  liberação de acesso.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-[#F4FAF8] border border-emerald-950/10 text-[11px] text-slate-600 space-y-1">
            <p className="font-semibold text-[#0C4336] flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#0D8272]" />
              Segurança Institucional Help Vida
            </p>
            <p>
              Enquanto você não aprovar o acesso, esses profissionais não conseguem visualizar a
              lista padronizada nem efetuar login.
            </p>
          </div>

          <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDismissModal}
              className="h-10 text-xs border-slate-200 text-slate-700 w-full sm:w-auto"
            >
              Mais tarde
            </Button>
            <Button
              type="button"
              onClick={handleReviewNow}
              className="h-10 px-4 rounded-xl text-xs font-bold text-white bg-[#0F5342] hover:bg-[#0C4336] shadow-xs w-full sm:w-auto flex items-center justify-center gap-1.5"
            >
              <UserCheck size={14} className="text-[#F5B31C]" />
              Revisar agora ({pendingApprovalsCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal LGPD acessível globalmente */}
      <PoliticaPrivacidadeModal open={politicaOpen} onOpenChange={setPoliticaOpen} />
    </div>
  )
}
