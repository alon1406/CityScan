import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import * as authService from '../services/authService'
import { session, type SessionUser } from '../core/session'

/**
 * SmartCollect has no equivalent of this file: its pages read `session` directly,
 * because plain scripts have nowhere else to put shared state. React does, and a
 * component that reads localStorage during render will not re-render when it changes.
 *
 * So this is the one addition beyond that skeleton — and it is deliberately thin. It
 * holds no keys and touches no storage of its own; `core/session` owns both, and this
 * only mirrors them into React state so the tree re-renders on sign in and sign out.
 */
type User = SessionUser

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)

  useEffect(() => {
    const storedToken = session.getToken()
    const storedUser = session.getUser()
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(storedUser)
      setIsDemoMode(session.isDemoMode())
    } else {
      // Either nothing was stored or the user entry failed to parse. Half a session
      // is worse than none — clear it rather than run with a token and no user.
      session.clear()
      setIsDemoMode(false)
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { token: t, user: u } = await authService.login(email, password)
    session.save(t, u)
    setToken(t)
    setUser(u)
  }, [])

  const demoLogin = useCallback(async (role: 'admin' | 'user') => {
    const { token: t, user: u } = await authService.demoLogin(role)
    session.save(t, u, true)
    setToken(t)
    setUser(u)
    setIsDemoMode(true)
  }, [])

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const { token: t, user: u } = await authService.register(email, password, name)
    session.save(t, u)
    setToken(t)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    session.clear()
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
