import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import Layout from '@/components/Layout'

// Páginas de Autenticação
import Login from '@/pages/Login'
import Cadastro from '@/pages/Cadastro'
import EsqueciSenha from '@/pages/EsqueciSenha'
import RedefinirSenha from '@/pages/RedefinirSenha'
import VerificarEmail from '@/pages/VerificarEmail'
import ConfirmarEmail from '@/pages/ConfirmarEmail'

// Páginas Autenticadas
import Index from '@/pages/Index'
import Medicamentos from '@/pages/Medicamentos'
import Importar from '@/pages/Importar'
import Assistente from '@/pages/Assistente'
import Solicitacoes from '@/pages/Solicitacoes'
import Equipe from '@/pages/Equipe'
import Configuracoes from '@/pages/Configuracoes'
import NotFound from '@/pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Rotas Públicas de Autenticação */}
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/verificar-email" element={<VerificarEmail />} />
          <Route path="/confirmar-email" element={<ConfirmarEmail />} />

          {/* Rotas Protegidas no Layout Autenticado */}
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Index />} />
            <Route path="/medicamentos" element={<Medicamentos />} />
            <Route path="/solicitacoes" element={<Solicitacoes />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/equipe" element={<Equipe />} />
            <Route path="/assistente" element={<Assistente />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>

          {/* Fallback 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
