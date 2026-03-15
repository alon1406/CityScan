import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import * as api from '../api/client'

type User = { _id: string; email: string; name?: string; role?: 'user' | 'admin' }

interface AuthContextValue {
  user: User | null
  token: string | null
  isLoading: boolean
  isDemoMode: boolean
  login: (email: string, password: string) => Promise<void>
  demoLogin: (role: 'admin' | 'user') => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'cityscan_token'
const USER_KEY = 'cityscan_user'
const DEMO_MODE_KEY = 'cityscan_demo'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)
    const storedDemo = localStorage.getItem(DEMO_MODE_KEY)
    if (stored && storedUser) {
      try {
        setToken(stored)
        setUser(JSON.parse(storedUser) as User)
        setIsDemoMode(storedDemo === '1')
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(DEMO_MODE_KEY)
      }
    } else {
      setIsDemoMode(false)
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { token: t, user: u } = await api.login(email, password)
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setToken(t)
    setUser(u)
  }, [])

  const demoLogin = useCallback(async (role: 'admin' | 'user') => {
    const { token: t, user: u } = await api.demoLogin(role)
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    localStorage.setItem(DEMO_MODE_KEY, '1')
    setToken(t)
    setUser(u)
    setIsDemoMode(true)
  }, [])

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const { token: t, user: u } = await api.register(email, password, name)
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setToken(t)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(DEMO_MODE_KEY)
    setToken(null)
    setUser(null)
    setIsDemoMode(false)
  }, [])

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    isDemoMode,
    login,
    demoLogin,
    register,
    logout,
    isAuthenticated: !!token,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
