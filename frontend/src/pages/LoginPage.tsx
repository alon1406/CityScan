import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import 'bootstrap/dist/css/bootstrap.min.css'

const IS_DEMO_MODE = import.meta.env.VITE_IS_DEMO === 'true'

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

  const buttonClass = IS_DEMO_MODE ? 'btn w-100 rounded-pill py-4 fs-5' : 'btn w-100 rounded-pill py-3'
  const demoButtons = (
    <div className="d-flex flex-column gap-3">
      <button
        type="button"
        className={buttonClass}
        style={{ borderWidth: 2, borderStyle: 'solid', borderColor: '#22c55e', color: '#15803d', background: 'rgba(34, 197, 94, 0.12)' }}
        disabled={loading}
        onClick={() => handleDemoLogin('user')}
      >
        Sign in as User (Demo)
      </button>
      <button
        type="button"
        className={buttonClass}
        style={{ background: 'linear-gradient(135deg, #475569 0%, #334155 100%)', color: '#fff', border: 'none' }}
        disabled={loading}
        onClick={() => handleDemoLogin('admin')}
      >
        Sign in as Admin (Demo)
      </button>
    </div>
  )

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'var(--cityscan-bg, #f5f5f5)' }}>
      <div
        className={`card shadow-sm rounded-3 p-4 ${IS_DEMO_MODE ? 'd-flex flex-column justify-content-center' : ''}`}
        style={{ maxWidth: 400, width: '100%', minHeight: IS_DEMO_MODE ? 340 : undefined }}
      >
        {IS_DEMO_MODE ? (
          <>
            <h1 className="h4 mb-2 text-center fw-semibold" style={{ color: 'var(--cityscan-primary)' }}>
              Welcome to CityScan Demo
            </h1>
            <p className="small text-muted text-center mb-4">Choose your path to explore the app</p>
            {error && (
              <div className="alert alert-danger py-2 small mb-3" role="alert">{error}</div>
            )}
            {demoButtons}
          </>
        ) : (
          <>
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
            <div className="mt-4 pt-3 border-top">
              <p className="small text-muted mb-3 text-center">Try the app — no account needed</p>
              {demoButtons}
            </div>
            <p className="mt-3 mb-0 text-center small text-muted">
              Don&apos;t have an account? <Link to="/register">Register</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
