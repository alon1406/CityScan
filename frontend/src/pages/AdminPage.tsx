import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchAdminHazards, updateHazard, getHazardPhotos, type Hazard, type HazardStatus, type HazardType } from '../api/client'
import 'bootstrap/dist/css/bootstrap.min.css'

const TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole',
  broken_streetlight: 'Broken streetlight',
  debris: 'Debris',
  flooding: 'Flooding',
  other: 'Other',
}

const STATUS_LABELS: Record<HazardStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

type SortOption = 'newest' | 'oldest' | 'type' | 'status'
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'type', label: 'Type A–Z' },
  { value: 'status', label: 'Status' },
]

function formatDate(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString('en-US', { dateStyle: 'medium' }) + ' at ' + d.toLocaleTimeString('en-US', { timeStyle: 'short', hour12: true })
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'open' ? 'badge-status-open' : status === 'in_progress' ? 'badge-status-in_progress' : 'badge-status-resolved'
  return (
    <span className={`badge ${cls}`}>
      {STATUS_LABELS[status as HazardStatus] ?? status}
    </span>
  )
}

export default function AdminPage() {
  const { user, isAuthenticated } = useAuth()
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState<HazardStatus | ''>('')
  const [filterType, setFilterType] = useState<HazardType | ''>('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<Hazard | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [photoCarouselIndex, setPhotoCarouselIndex] = useState(0)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const sortedHazards = [...hazards].sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    if (sortBy === 'type') return (TYPE_LABELS[a.type] ?? a.type).localeCompare(TYPE_LABELS[b.type] ?? b.type)
    if (sortBy === 'status') {
      const order = { open: 0, in_progress: 1, resolved: 2 }
      return (order[a.status] ?? 0) - (order[b.status] ?? 0)
    }
    return 0
  })

  const loadHazards = useCallback(() => {
    if (!user || (user as { role?: string }).role !== 'admin') return
    setLoading(true)
    setError('')
    fetchAdminHazards({
      limit: 300,
      ...(filterStatus && { status: filterStatus }),
      ...(filterType && { type: filterType }),
      ...(search.trim() && { search: search.trim() }),
    })
      .then(setHazards)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports'))
      .finally(() => setLoading(false))
  }, [user, filterStatus, filterType, search])

  useEffect(() => {
    if (!isAuthenticated || (user as { role?: string }).role !== 'admin') return
    loadHazards()
  }, [isAuthenticated, user, loadHazards])

  useEffect(() => {
    if (!selectedReport) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedReport(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedReport])

  useEffect(() => {
    if (!selectedPhoto) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPhoto(null)
        setLightboxPhotos([])
        return
      }
      if (lightboxPhotos.length <= 1) return
      if (e.key === 'ArrowLeft') {
        const prev = Math.max(0, lightboxIndex - 1)
        setLightboxIndex(prev)
        setSelectedPhoto(lightboxPhotos[prev])
      }
      if (e.key === 'ArrowRight') {
        const next = Math.min(lightboxPhotos.length - 1, lightboxIndex + 1)
        setLightboxIndex(next)
        setSelectedPhoto(lightboxPhotos[next])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedPhoto, lightboxPhotos, lightboxIndex])

  const handleStatusChange = (hazardId: string, newStatus: HazardStatus) => {
    setUpdatingId(hazardId)
    updateHazard(hazardId, { status: newStatus })
      .then((updated) => {
        setHazards((prev) => prev.map((h) => (h._id === updated._id ? updated : h)))
        if (selectedReport?._id === updated._id) setSelectedReport(updated)
      })
      .catch(() => {})
      .finally(() => setUpdatingId(null))
  }

  if (!isAuthenticated) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'var(--cityscan-bg)' }}>
        <div className="card shadow-sm rounded-3 p-4 text-center" style={{ maxWidth: 400 }}>
          <p className="mb-3">Sign in to access admin.</p>
          <Link to="/login" className="btn btn-primary rounded-pill px-4">Sign in</Link>
        </div>
      </div>
    )
  }

  const isAdmin = (user as { role?: string }).role === 'admin'
  if (!isAdmin) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'var(--cityscan-bg)' }}>
        <div className="card shadow-sm rounded-3 p-4 text-center" style={{ maxWidth: 400 }}>
          <p className="mb-3 text-danger">Admin access required.</p>
          <Link to="/" className="btn btn-outline-primary rounded-pill px-4">Back to map</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-vh-100 p-3" style={{ background: 'var(--cityscan-bg)', fontFamily: 'var(--cityscan-font)' }}>
      <div className="container-fluid py-4" style={{ maxWidth: 1100 }}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <h1 className="h4 mb-0" style={{ color: 'var(--cityscan-primary)' }}>Admin — All reports</h1>
          <Link to="/" className="btn btn-outline-primary btn-sm rounded-pill">Back to map</Link>
        </div>

        <div className="card shadow-sm rounded-3 mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12 col-md-3">
                <label className="form-label small fw-semibold">Filter by status</label>
                <select
                  className="form-select form-select-sm"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus((e.target.value || '') as HazardStatus | '')}
                >
                  <option value="">All</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small fw-semibold">Filter by type</label>
                <select
                  className="form-select form-select-sm"
                  value={filterType}
                  onChange={(e) => setFilterType((e.target.value || '') as HazardType | '')}
                >
                  <option value="">All</option>
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small fw-semibold">Search (address or description)</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadHazards()}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label small fw-semibold">Sort by</label>
                <select
                  className="form-select form-select-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 d-flex align-items-end">
                <button type="button" className="btn btn-primary btn-sm rounded-pill" onClick={loadHazards}>
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status" />
            <p className="mt-2 text-muted small">Loading reports…</p>
          </div>
        )}

        {!loading && hazards.length === 0 && (
          <div className="card shadow-sm rounded-3 p-4 text-center">
            <p className="text-muted mb-0">No reports match the filters.</p>
          </div>
        )}

        {!loading && hazards.length > 0 && (
          <div className="card shadow-sm rounded-3 overflow-hidden">
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Type</th>
                    <th>Address / Description</th>
                    <th>Images</th>
                    <th>Status</th>
                    <th>Change status</th>
                    <th>Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHazards.map((h) => (
                    <tr
                      key={h._id}
                      role="button"
                      tabIndex={0}
                      className="cityscan-admin-report-row align-middle"
                      onClick={() => { setSelectedReport(h); setPhotoCarouselIndex(0) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedReport(h)
                          setPhotoCarouselIndex(0)
                        }
                      }}
                    >
                      <td className="align-top">{TYPE_LABELS[h.type] ?? h.type}</td>
                      <td className="small align-top" style={{ maxWidth: 320 }}>
                        <div className="fw-medium">
                          {h.address || `${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)}`}
                        </div>
                        {h.description && (
                          <p className="text-muted mb-0 mt-1 text-truncate" style={{ maxWidth: 280 }}>
                            {h.description.slice(0, 60)}{h.description.length > 60 ? '…' : ''}
                          </p>
                        )}
                      </td>
                      <td className="align-top" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const photos = getHazardPhotos(h)
                          if (photos.length === 0) return <span className="text-muted small">—</span>
                          return (
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <span className="small text-muted">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
                              <button
                                type="button"
                                className="border-0 bg-transparent p-0 rounded overflow-hidden"
                                onClick={() => {
                                  setLightboxPhotos(photos)
                                  setLightboxIndex(0)
                                  setSelectedPhoto(photos[0])
                                }}
                                title="Open photos"
                              >
                                <img
                                  src={photos[0]}
                                  alt="First hazard photo"
                                  className="rounded border"
                                  style={{ width: 48, height: 48, objectFit: 'cover', cursor: 'pointer' }}
                                />
                              </button>
                            </div>
                          )
                        })()}
                      </td>
                      <td className="align-top">
                        <StatusBadge status={h.status} />
                      </td>
                      <td className="align-top" onClick={(e) => e.stopPropagation()}>
                        <select
                          className="form-select form-select-sm"
                          style={{ width: 'auto', minWidth: 130 }}
                          value={h.status}
                          disabled={updatingId === h._id}
                          onChange={(e) => handleStatusChange(h._id, e.target.value as HazardStatus)}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </td>
                      <td className="small text-muted align-top">{formatDate(h.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedReport && (() => {
          const reportPhotos = getHazardPhotos(selectedReport)
          const carouselIndex = Math.min(photoCarouselIndex, Math.max(0, reportPhotos.length - 1))
          return (
          <div
            className="cityscan-admin-detail-backdrop position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
            style={{ zIndex: 1050, background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setSelectedReport(null)}
            role="presentation"
            aria-hidden="true"
          >
            <div
              className="cityscan-admin-detail-card card shadow-lg rounded-3 overflow-hidden bg-white"
              style={{ maxWidth: 520, maxHeight: '90vh', width: '100%' }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-detail-title"
            >
              <div className="card-header d-flex align-items-center justify-content-between py-3">
                <h2 id="report-detail-title" className="h6 mb-0" style={{ color: 'var(--cityscan-primary)' }}>
                  Report details
                </h2>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary rounded-pill"
                  onClick={() => setSelectedReport(null)}
                  aria-label="Close"
                >
                  Close
                </button>
              </div>
              <div className="card-body overflow-auto py-3" style={{ maxHeight: 'calc(90vh - 60px)' }}>
                <dl className="mb-0">
                  <dt className="small text-muted mb-1">Type</dt>
                  <dd className="mb-3">{TYPE_LABELS[selectedReport.type] ?? selectedReport.type}</dd>

                  <dt className="small text-muted mb-1">Address</dt>
                  <dd className="mb-3">
                    {selectedReport.address || `${selectedReport.latitude.toFixed(5)}, ${selectedReport.longitude.toFixed(5)}`}
                  </dd>

                  {selectedReport.description && (
                    <>
                      <dt className="small text-muted mb-1">Description</dt>
                      <dd className="mb-3" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {selectedReport.description}
                      </dd>
                    </>
                  )}

                  <dt className="small text-muted mb-1">Status</dt>
                  <dd className="mb-3 d-flex align-items-center gap-2 flex-wrap">
                    <StatusBadge status={selectedReport.status} />
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 'auto', minWidth: 130 }}
                      value={selectedReport.status}
                      disabled={updatingId === selectedReport._id}
                      onChange={(e) => handleStatusChange(selectedReport._id, e.target.value as HazardStatus)}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </dd>

                  <dt className="small text-muted mb-1">Reported</dt>
                  <dd className="mb-3">{formatDate(selectedReport.createdAt)}</dd>

                  <>
                    <dt className="small text-muted mb-2">Photos ({reportPhotos.length})</dt>
                    <dd className="mb-0">
                      {reportPhotos.length > 0 ? (
                        <div className="d-flex flex-column gap-2">
                          <div
                            className="position-relative rounded border overflow-hidden bg-light"
                            style={{ minHeight: 200 }}
                            onTouchStart={(e) => { (e.currentTarget as unknown as { _touchX?: number })._touchX = e.touches[0].clientX }}
                            onTouchEnd={(e) => {
                              const start = (e.currentTarget as unknown as { _touchX?: number })._touchX
                              if (start == null) return
                              const end = e.changedTouches[0].clientX
                              const delta = start - end
                              if (delta > 50) setPhotoCarouselIndex((i) => Math.min(i + 1, reportPhotos.length - 1))
                              else if (delta < -50) setPhotoCarouselIndex((i) => Math.max(i - 1, 0))
                            }}
                          >
                            <button
                              type="button"
                              className="position-absolute top-50 start-0 translate-middle-y btn btn-light btn-sm rounded-0 rounded-end opacity-75"
                              style={{ zIndex: 2 }}
                              disabled={reportPhotos.length <= 1 || carouselIndex <= 0}
                              onClick={() => setPhotoCarouselIndex((i) => Math.max(0, i - 1))}
                              aria-label="Previous photo"
                            >
                              <i className="bi bi-chevron-left" />
                            </button>
                            <button
                              type="button"
                              className="position-absolute top-50 end-0 translate-middle-y btn btn-light btn-sm rounded-0 rounded-start opacity-75"
                              style={{ zIndex: 2 }}
                              disabled={reportPhotos.length <= 1 || carouselIndex >= reportPhotos.length - 1}
                              onClick={() => setPhotoCarouselIndex((i) => Math.min(reportPhotos.length - 1, i + 1))}
                              aria-label="Next photo"
                            >
                              <i className="bi bi-chevron-right" />
                            </button>
                            <div className="text-center py-2 small text-muted" style={{ zIndex: 1 }}>
                              {carouselIndex + 1} / {reportPhotos.length}
                            </div>
                            <button
                              type="button"
                              className="border-0 bg-transparent p-0 w-100 d-block"
                              onClick={() => {
                                setLightboxPhotos(reportPhotos)
                                setLightboxIndex(carouselIndex)
                                setSelectedPhoto(reportPhotos[carouselIndex])
                              }}
                              title="Open full size"
                            >
                              <img
                                src={reportPhotos[carouselIndex]}
                                alt={`Hazard photo ${carouselIndex + 1}`}
                                className="rounded mx-auto d-block"
                                style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', cursor: 'pointer' }}
                              />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted small">No photos uploaded for this report.</span>
                      )}
                    </dd>
                  </>
                </dl>
              </div>
            </div>
          </div>
          )
        })()}

        {selectedPhoto && (
          <div
            className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
            style={{ zIndex: 1060, background: 'rgba(0,0,0,0.85)' }}
            onClick={() => { setSelectedPhoto(null); setLightboxPhotos([]) }}
            role="button"
            tabIndex={0}
            aria-label="Close photo"
          >
            <button
              type="button"
              className="position-absolute top-0 end-0 m-3 btn btn-light btn-sm rounded-pill"
              onClick={() => { setSelectedPhoto(null); setLightboxPhotos([]) }}
              aria-label="Close"
            >
              Close
            </button>
            {lightboxPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  className="position-absolute top-50 start-0 translate-middle-y btn btn-light btn-sm rounded-pill ms-2"
                  disabled={lightboxIndex <= 0}
                  onClick={(e) => {
                    e.stopPropagation()
                    const prevIndex = Math.max(0, lightboxIndex - 1)
                    setLightboxIndex(prevIndex)
                    setSelectedPhoto(lightboxPhotos[prevIndex])
                  }}
                  aria-label="Previous photo"
                >
                  <i className="bi bi-chevron-left" />
                </button>
                <button
                  type="button"
                  className="position-absolute top-50 end-0 translate-middle-y btn btn-light btn-sm rounded-pill me-2"
                  disabled={lightboxIndex >= lightboxPhotos.length - 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    const nextIndex = Math.min(lightboxPhotos.length - 1, lightboxIndex + 1)
                    setLightboxIndex(nextIndex)
                    setSelectedPhoto(lightboxPhotos[nextIndex])
                  }}
                  aria-label="Next photo"
                >
                  <i className="bi bi-chevron-right" />
                </button>
                <span className="position-absolute top-0 start-50 translate-middle-x mt-3 badge bg-secondary">
                  {lightboxIndex + 1} / {lightboxPhotos.length}
                </span>
              </>
            )}
            <img
              src={selectedPhoto}
              alt="Report photo"
              className="rounded shadow"
              style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  )
}
