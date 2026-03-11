import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchMyHazards, type Hazard } from '../api/client'
import 'bootstrap/dist/css/bootstrap.min.css'

const TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole',
  broken_streetlight: 'Broken streetlight',
  debris: 'Debris',
  flooding: 'Flooding',
  other: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

function formatDate(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString('en-US', { dateStyle: 'medium' }) + ' at ' + d.toLocaleTimeString('en-US', { timeStyle: 'short', hour12: true })
}

export default function MyReportsPage() {
  const { isAuthenticated } = useAuth()
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) return
    setLoading(true)
    setError('')
    fetchMyHazards({ limit: 200 })
      .then(setHazards)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your reports'))
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'var(--cityscan-bg, #f5f5f5)' }}>
        <div className="card shadow-sm rounded-3 p-4 text-center" style={{ maxWidth: 400 }}>
          <p className="mb-3">Sign in to see your reports.</p>
          <Link to="/login" className="btn btn-primary rounded-pill px-4">Sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-vh-100 p-3" style={{ background: 'var(--cityscan-bg, #f5f5f5)', fontFamily: 'var(--cityscan-font)' }}>
      <div className="container py-4" style={{ maxWidth: 720 }}>
        <div className="d-flex align-items-center justify-content-between mb-4">
          <h1 className="h4 mb-0" style={{ color: 'var(--cityscan-primary)' }}>My Reports</h1>
          <Link to="/" className="btn btn-outline-primary btn-sm rounded-pill">Back to map</Link>
        </div>

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading…</span>
            </div>
            <p className="mt-2 text-muted small">Loading your reports…</p>
          </div>
        )}

        {!loading && error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        {!loading && !error && hazards.length === 0 && (
          <div className="card shadow-sm rounded-3 p-4 text-center">
            <p className="text-muted mb-0">You have not submitted any reports yet.</p>
            <Link to="/" className="btn btn-primary rounded-pill mt-3">Report a hazard on the map</Link>
          </div>
        )}

        {!loading && !error && hazards.length > 0 && (
          <ul className="list-group list-group-flush">
            {hazards.map((h) => (
              <li
                key={h._id}
                className="list-group-item d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 py-3 px-0 border-start-0 border-end-0"
                style={{ background: 'var(--cityscan-bg)' }}
              >
                <div className="flex-grow-1">
                  <span className="fw-semibold">{TYPE_LABELS[h.type] ?? h.type}</span>
                  <span className={`badge ms-2 ${h.status === 'open' ? 'badge-status-open' : h.status === 'in_progress' ? 'badge-status-in_progress' : 'badge-status-resolved'}`}>
                    {STATUS_LABELS[h.status] ?? h.status}
                  </span>
                  {h.address && (
                    <p className="small mb-0 mt-1" style={{ color: 'var(--cityscan-neutral-600)' }}>
                      <strong>Address:</strong> {h.address}
                    </p>
                  )}
                  {h.description && (
                    <p className="small text-muted mb-0 mt-1">{h.description}</p>
                  )}
                  <p className="small text-muted mb-0 mt-1">{formatDate(h.createdAt)}</p>
                </div>
                {!h.address && (
                  <div className="small text-muted">
                    {h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
