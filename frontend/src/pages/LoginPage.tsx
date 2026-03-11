import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import 'bootstrap/dist/css/bootstrap.min.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, demoLogin } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (role: 'admin' | 'user') => {
    setError('')
    setLoading(true)
    try {
      await demoLogin(role)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'var(--cityscan-bg, #f5f5f5)' }}>
      <div className="card shadow-sm rounded-3 p-4" style={{ maxWidth: 400, width: '100%' }}>
        <h1 className="h4 mb-4 text-center" style={{ color: 'var(--cityscan-primary)' }}>Sign in to CityScan</h1>
        {error && (
          <div className="alert alert-danger py-2 small" role="alert">{error}</div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="login-email" className="form-label">Email</label>
            <input
              id="login-email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="login-password" className="form-label">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary w-100 rounded-pill py-2" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-3 pt-3 border-top">
          <p className="small text-muted mb-2 text-center">Demo login (read-only / limited)</p>
          <div className="d-flex flex-column gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm rounded-pill"
              disabled={loading}
              onClick={() => handleDemoLogin('admin')}
            >
              Sign in as Admin (demo)
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm rounded-pill"
              disabled={loading}
              onClick={() => handleDemoLogin('user')}
            >
              Sign in as User (demo)
            </button>
          </div>
        </div>
        <p className="mt-3 mb-0 text-center small text-muted">
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}
