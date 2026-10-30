import React, { createContext, useContext, useEffect, useState } from 'react'
import type { RecordModel } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

export interface UserProfile extends RecordModel {
  email: string
  name?: string
  avatar?: string
  role?: 'admin' | 'comum' | 'medico_visitador' | 'financeiro'
  approval_status?: 'pendente' | 'aprovado' | 'negado'
}

interface AuthContextType {
  user: UserProfile | null
  token: string | null
  isLoading: boolean
  login: (email: string, pass: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  isAdmin: boolean
  isMedicoVisitador: boolean
  isFinanceiro: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(
    (pb.authStore.record as UserProfile | null) ?? null,
  )
  const [token, setToken] = useState<string | null>(pb.authStore.token || null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = async () => {
    try {
      if (pb.authStore.isValid) {
        const authData = await pb.collection('users').authRefresh()
        setUser(authData.record as UserProfile)
        setToken(authData.token)
      } else {
        setUser(null)
        setToken(null)
      }
    } catch {
      pb.authStore.clear()
      setUser(null)
      setToken(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((newToken, model) => {
      setToken(newToken)
      setUser(model as UserProfile | null)
    })

    refreshUser()

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    const authData = await pb.collection('users').authWithPassword(email, pass)
    setUser(authData.record as UserProfile)
    setToken(authData.token)
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }

  const isAdmin =
    user?.email?.toLowerCase() === 'fernandofernandes@helpvida.com.br' ||
    user?.role === 'admin' ||
    Boolean(user?.is_admin)

  const isMedicoVisitador = user?.role === 'medico_visitador'
  const isFinanceiro = user?.role === 'financeiro'

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        isAdmin,
        isMedicoVisitador,
        isFinanceiro,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
