import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchAdminNewReportsCount } from '../api/client'
import 'bootstrap/dist/css/bootstrap.min.css'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const DEBOUNCE_MS = 350
const VIEWBOX_DELTA = 0.05 // ~5km each side for prioritising nearby results

export interface NominatimSuggestion {
  place_id?: number
  display_name?: string
  lat: string
  lon: string
}

export interface NavBarProps {
  position?: [number, number] | null
  onSelectAddress?: (lat: number, lng: number) => void
}

/*
 * Debouncing: We delay the API call until the user has stopped typing for DEBOUNCE_MS.
 * On every query change we (1) clear the previous timeout and (2) set a new timeout to fetch.
 */
const ADMIN_POLL_INTERVAL_MS = 60_000

export default function NavBar({ position = null, onSelectAddress = () => {} }: NavBarProps) {
  const { isAuthenticated, user, logout, isDemoMode } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [newReportsCount, setNewReportsCount] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isAdmin = (user as { role?: string })?.role === 'admin'

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      setNewReportsCount(null)
      return
    }
    const load = () => {
      fetchAdminNewReportsCount()
        .then(({ count }) => setNewReportsCount(count))
        .catch(() => setNewReportsCount(null))
    }
    load()
    const id = setInterval(load, ADMIN_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isAuthenticated, isAdmin])

  const runSearch = useCallback((q?: string) => {
    const trimmed = (typeof q === 'string' ? q : query).trim()
    if (!trimmed) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    let viewbox = ''
    if (position && position.length >= 2) {
      const [lat, lon] = position
      const minLon = lon - VIEWBOX_DELTA
      const minLat = lat - VIEWBOX_DELTA
      const maxLon = lon + VIEWBOX_DELTA
      const maxLat = lat + VIEWBOX_DELTA
      viewbox = `${minLon},${minLat},${maxLon},${maxLat}`
    }
    const params = new URLSearchParams({
      format: 'json',
      q: trimmed,
      addressdetails: '1',
    })
    if (viewbox) {
      params.set('viewbox', viewbox)
      params.set('bounded', '1')
    }
    setLoading(true)
    fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: { 'Accept-Language': 'he,en', 'User-Agent': 'CityScan/1.0 (hazard reporting)' },
    })
      .then((res) => res.json())
      .then((data: NominatimSuggestion[]) => {
        setSuggestions(Array.isArray(data) ? data.slice(0, 8) : [])
        setShowDropdown(true)
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false))
  }, [query, position])

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      runSearch(query)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, position, runSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectSuggestion = (item: NominatimSuggestion) => {
    if (!item || typeof item !== 'object') return
    setSuggestions([])
    setQuery(item.display_name || '')
    setShowDropdown(false)
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      onSelectAddress(lat, lng)
    }
  }

  return (
    <nav
      className="navbar navbar-expand-lg py-2 px-3"
      style={{
        background: 'var(--cityscan-bg)',
        boxShadow: 'var(--cityscan-shadow)',
        fontFamily: 'var(--cityscan-font)',
      }}
    >
      <div className="container-fluid">
        <div className="d-flex align-items-center w-100 justify-content-between flex-lg-row flex-column gap-2 gap-lg-0">
          <div className="d-flex align-items-center gap-2 me-lg-4">
            <Link
              to="/"
              className="navbar-brand text-decoration-none fw-semibold"
              style={{ color: 'var(--cityscan-primary)', fontSize: '1.25rem' }}
            >
              CityScan
            </Link>
            {isDemoMode && (
              <span
                className="badge rounded-pill px-2 py-1 small fw-normal"
                style={{ background: 'var(--cityscan-neutral-500)', color: '#fff', fontSize: '0.7rem' }}
                title="You are in demo mode — simulated environment"
              >
                Demo Mode
              </span>
            )}
          </div>

          <div
            className="flex-grow-1 d-flex justify-content-center mx-2 mx-lg-0 position-relative"
            style={{ maxWidth: 480 }}
            ref={wrapperRef}
          >
            <div className="cityscan-search-wrap rounded-3 border overflow-hidden w-100">
              <div className="d-flex align-items-center">
                <button
                  type="button"
                  className="cityscan-search-icon-btn border-0 bg-transparent text-body-secondary px-3 d-flex align-items-center"
                  onClick={() => runSearch()}
                  disabled={!query.trim() || loading}
                  aria-label="Search"
                  title="Search"
                >
                  <i className={`bi ${loading ? 'bi-arrow-repeat spin' : 'bi-search'}`} aria-hidden />
                </button>
                <input
                  type="search"
                  className="cityscan-search-input border-0 flex-grow-1 rounded-end"
                  placeholder="Street or address"
                  aria-label="Search by street or address"
                  aria-autocomplete="list"
                  aria-expanded={showDropdown && suggestions.length > 0}
                  aria-controls="navbar-search-suggestions"
                  id="navbar-search-input"
                  dir="auto"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      runSearch()
                    }
                  }}
                />
              </div>
            </div>
            {showDropdown && suggestions.length > 0 && (
              <ul
                id="navbar-search-suggestions"
                className="cityscan-search-suggestions list-group position-absolute top-100 start-50 translate-middle-x mt-2 shadow rounded-3 overflow-hidden"
                role="listbox"
              >
                {suggestions.map((item, idx) => (
                  <li
                    key={item.place_id ?? idx}
                    className="list-group-item list-group-item-action cityscan-search-suggestion border-0 py-2 px-3"
                    role="option"
                    tabIndex={0}
                    onClick={() => handleSelectSuggestion(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSelectSuggestion(item)
                      }
                    }}
                  >
                    <span className="d-inline-block text-truncate" dir="auto">{item.display_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="d-flex align-items-center gap-2 ms-2 ms-lg-3">
            {isAuthenticated ? (
              <>
                {!isAdmin && (
                  <Link
                    to="/history-reports"
                    className="cityscan-nav-item btn btn-link text-decoration-none d-flex align-items-center gap-2 rounded-pill px-3 py-2"
                    style={{ color: 'var(--cityscan-neutral-600)', fontFamily: 'var(--cityscan-font)' }}
                    title="My Reports"
                    aria-label="My Reports"
                  >
                    <i className="bi bi-clock-history fs-5" />
                    <span className="d-none d-md-inline">My Reports</span>
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    to="/admin"
                    className={`cityscan-nav-item cityscan-admin-link btn btn-link text-decoration-none d-flex align-items-center gap-2 rounded-pill px-3 py-2 position-relative ${newReportsCount != null && newReportsCount > 0 ? 'cityscan-admin-link-with-badge' : ''}`}
                    style={{ color: 'var(--cityscan-neutral-600)', fontFamily: 'var(--cityscan-font)' }}
                    title={
                      newReportsCount != null && newReportsCount > 0
                        ? `${newReportsCount} open report(s) — Manage reports`
                        : 'Manage reports'
                    }
                    aria-label={
                      newReportsCount != null && newReportsCount > 0
                        ? `Manage reports — ${newReportsCount} open reports`
                        : 'Manage reports'
                    }
                  >
                    <i className="bi bi-shield-check fs-5" />
                    <span className="d-none d-md-inline">Manage reports</span>
                    {newReportsCount != null && newReportsCount > 0 && (
                      <span className="cityscan-admin-badge position-absolute top-0 start-100 translate-middle badge rounded-pill">
                        {newReportsCount > 99 ? '99+' : newReportsCount}
                        <span className="cityscan-admin-badge-label"> new</span>
                      </span>
                    )}
                  </Link>
                )}
                <span className="d-none d-md-inline small text-muted" title={user?.email ?? ''}>
                  {user?.name || user?.email}
                </span>
                <button
                  type="button"
                  className="cityscan-signout-btn btn btn-link text-decoration-none rounded-pill px-3 py-2"
                  style={{ color: 'var(--cityscan-neutral-600)' }}
                  onClick={() => { logout(); navigate('/'); }}
                  title="Sign out"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-outline-primary btn-sm rounded-pill px-3">Sign in</Link>
                <Link to="/register" className="btn btn-primary btn-sm rounded-pill px-3">Register</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
