import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { createHazard, fetchNearbyHazards, checkSameHazard, analyzeHazardPhoto, IS_DEMO, type HazardType } from '../api/client'

const NOMINATIM_OPTIONS: RequestInit = {
  headers: { 'Accept-Language': 'en', 'User-Agent': 'CityScan/1.0 (hazard reporting)' },
}

export interface ReportSidebarProps {
  isOpen: boolean
  onClose: () => void
  selectedPosition: [number, number] | null
  onFlyToPosition?: (lat: number, lng: number) => void
  onReportSubmitted?: () => void
}

interface NominatimAddress {
  house_number?: string
  road?: string
  street?: string
  pedestrian?: string
  suburb?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  country?: string
}

interface NominatimReverseResult {
  address?: NominatimAddress
}

interface NominatimSearchResult {
  lat: string
  lon: string
}

export default function ReportSidebar({ isOpen, onClose, selectedPosition, onFlyToPosition, onReportSubmitted }: ReportSidebarProps) {
  const { isAuthenticated } = useAuth()
  // Values must match backend Hazard type enum: pothole | broken_streetlight | debris | flooding | other
  const [type, setType] = useState<HazardType>('pothole')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [findOnMapError, setFindOnMapError] = useState('')
  const [findOnMapLoading, setFindOnMapLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [nearbyHazards, setNearbyHazards] = useState<Array<{ _id: string; type: string; status: string; description?: string; createdAt: string }>>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [aiDuplicate, setAiDuplicate] = useState<{ isDuplicate: boolean; matchingHazardId?: string } | null>(null)
  const [aiCheckLoading, setAiCheckLoading] = useState(false)
  const [duplicateModalMessage, setDuplicateModalMessage] = useState<string | null>(null)
  const [hazardPhotos, setHazardPhotos] = useState<File[]>([])
  const [hazardPhotoPreviews, setHazardPhotoPreviews] = useState<string[]>([])
  const [aiAnalyzeLoading, setAiAnalyzeLoading] = useState(false)
  const hazardPhotoInputRef = useRef<HTMLInputElement>(null)
  const MAX_HAZARD_PHOTOS = 10

  useEffect(() => {
    if (!selectedPosition || selectedPosition.length < 2) {
      queueMicrotask(() => setAddress(''))
      return
    }
    const [lat, lon] = selectedPosition
    setAddress('Loading…')
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      NOMINATIM_OPTIONS
    )
      .then((res) => res.json())
      .then((data: NominatimReverseResult) => {
        const a = data.address || {}
        const parts = [a.house_number, a.road, a.suburb, a.city, a.country].filter(Boolean) as string[]
        setAddress(parts.length ? parts.join(', ') : 'Address not found')
        setCity(a.city || a.town || a.village || a.municipality || '')
        setStreet(a.road || a.street || a.pedestrian || '')
        setHouseNumber(a.house_number || '')
      })
      .catch(() => setAddress('Address lookup failed'))
  }, [selectedPosition])

  useEffect(() => {
    if (isOpen) setSubmitError('')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !selectedPosition || selectedPosition.length < 2) {
      setNearbyHazards([])
      setAiDuplicate(null)
      return
    }
    setNearbyLoading(true)
    setAiDuplicate(null)
    fetchNearbyHazards(selectedPosition[0], selectedPosition[1], 50)
      .then(setNearbyHazards)
      .catch(() => setNearbyHazards([]))
      .finally(() => setNearbyLoading(false))
  }, [isOpen, selectedPosition])

  const aiCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!selectedPosition || selectedPosition.length < 2 || nearbyHazards.length === 0) {
      setAiDuplicate(null)
      return
    }
    if (aiCheckTimeoutRef.current) clearTimeout(aiCheckTimeoutRef.current)
    setAiCheckLoading(true)
    setAiDuplicate(null)
    aiCheckTimeoutRef.current = setTimeout(() => {
      aiCheckTimeoutRef.current = null
      checkSameHazard({
        type,
        description: description.trim() || undefined,
        latitude: selectedPosition[0],
        longitude: selectedPosition[1],
        address: address || undefined,
      })
        .then((r) => {
          setAiDuplicate({ isDuplicate: r.isDuplicate, matchingHazardId: r.matchingHazardId })
          if (r.isDuplicate) {
            setDuplicateModalMessage('This hazard was already reported. No need to submit again.')
          }
        })
        .catch(() => setAiDuplicate(null))
        .finally(() => setAiCheckLoading(false))
    }, 600)
    return () => {
      if (aiCheckTimeoutRef.current) clearTimeout(aiCheckTimeoutRef.current)
    }
  }, [selectedPosition, nearbyHazards.length, type, description, address])

  const TYPE_LABELS: Record<string, string> = {
    pothole: 'Pothole',
    broken_streetlight: 'Broken streetlight',
    debris: 'Debris',
    flooding: 'Flooding',
    other: 'Other',
  }

  const handleFindOnMap = () => {
    setFindOnMapError('')
    setSubmitError('')
    const cityTrim = city.trim()
    const streetTrim = street.trim()
    const numberTrim = houseNumber.trim()
    if (!cityTrim || !streetTrim) {
      setFindOnMapError('Please enter City and Street.')
      return
    }
    const parts = [streetTrim]
    if (numberTrim) parts.unshift(numberTrim)
    parts.push(cityTrim)
    const q = parts.join(' ')
    setFindOnMapLoading(true)
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`,
      NOMINATIM_OPTIONS
    )
      .then((res) => {
        if (!res.ok) {
          if (res.status === 429) {
            throw new Error('Too many requests. Please wait a moment and try again.')
          }
          throw new Error('Search service unavailable. Please try again.')
        }
        return res.json()
      })
      .then((data: unknown) => {
        const results = Array.isArray(data) ? data : []
        if (results.length === 0) {
          setFindOnMapError('Address not found. Try a different spelling or broader area.')
          return
        }
        const first = results[0] as NominatimSearchResult
        const lat = first?.lat != null ? parseFloat(String(first.lat)) : NaN
        const lon = first?.lon != null ? parseFloat(String(first.lon)) : NaN
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setFindOnMapError('Address not found. Try a different spelling or broader area.')
          return
        }
        if (typeof onFlyToPosition === 'function') onFlyToPosition(lat, lon)
      })
      .catch((err) => {
        setFindOnMapError(err instanceof Error ? err.message : 'Search failed. Please try again.')
      })
      .finally(() => setFindOnMapLoading(false))
  }

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (file.size > 1_200_000) {
        reject(new Error('Photo must be under 1.2 MB'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read photo'))
      reader.readAsDataURL(file)
    })

  const handleHazardPhotoAdd = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setHazardPhotos((prev) => {
      if (prev.length >= MAX_HAZARD_PHOTOS) return prev
      return [...prev, file]
    })
    setHazardPhotoPreviews((prev) => {
      if (prev.length >= MAX_HAZARD_PHOTOS) return prev
      return [...prev, URL.createObjectURL(file)]
    })
    if (IS_DEMO) {
      setAiAnalyzeLoading(true)
      setSubmitError('')
      try {
        const dataUrl = await fileToDataUrl(file)
        const aiDesc = await analyzeHazardPhoto(dataUrl)
        if (aiDesc) setDescription((prev) => (prev.trim() ? `${prev}\n\n${aiDesc}` : aiDesc))
        else setSubmitError('AI description unavailable. Check that the AI service is running and GEMINI_API_KEY is set.')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI analysis failed'
        const isNetwork = msg.includes('fetch') || msg.includes('Failed') || err instanceof TypeError
        setSubmitError(isNetwork ? 'Cannot reach AI service. Is it running? (default: http://localhost:8001)' : msg)
      } finally {
        setAiAnalyzeLoading(false)
      }
    }
  }

  const removeHazardPhoto = (index: number) => {
    setHazardPhotoPreviews((prev) => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
    setHazardPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitSuccess(false)
    if (!isAuthenticated) {
      setSubmitError('Please sign in to report a hazard.')
      return
    }
    if (!selectedPosition || selectedPosition.length < 2) {
      setSubmitError('Please select a location on the map (click on the map or use Find on Map).')
      return
    }
    if (nearbyHazards.length > 0 && aiCheckLoading) {
      setSubmitError('Please wait — checking for duplicate reports…')
      return
    }
    if (aiDuplicate?.isDuplicate) {
      setDuplicateModalMessage('This hazard was already reported. No need to submit again.')
      return
    }
    setSubmitLoading(true)
    try {
      const lat = Number(selectedPosition[0])
      const lng = Number(selectedPosition[1])
      const hazardPhotosData = await Promise.all(
        hazardPhotos.map((file) => fileToDataUrl(file))
      )
      await createHazard({
        type,
        latitude: lat,
        longitude: lng,
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        ...(hazardPhotosData.length > 0 && { hazardPhotos: hazardPhotosData }),
      })
      hazardPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
      setDescription('')
      setType('pothole')
      setAddress('')
      setCity('')
      setStreet('')
      setHouseNumber('')
      setFindOnMapError('')
      setHazardPhotos([])
      setHazardPhotoPreviews([])
      setSubmitSuccess(true)
      onReportSubmitted?.()
      setTimeout(() => {
        onClose()
      }, 800)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit report'
      const isDuplicateError = /already reported|50m|duplicate/i.test(msg)
      if (isDuplicateError) {
        setDuplicateModalMessage(msg)
        setSubmitError('')
      } else {
        setSubmitError(msg)
      }
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleClose = () => {
    setNearbyHazards([])
    setAiDuplicate(null)
    setDuplicateModalMessage(null)
    setSubmitError('')
    setSubmitSuccess(false)
    setAiAnalyzeLoading(false)
    setDescription('')
    setType('pothole')
    setAddress('')
    setCity('')
    setStreet('')
    setHouseNumber('')
    setFindOnMapError('')
    hazardPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setHazardPhotos([])
    setHazardPhotoPreviews([])
    onClose()
  }

  return (
    <>
      {/* Duplicate warning modal — blocks interaction until user closes with X */}
      {duplicateModalMessage && (
        <div
          className="cityscan-duplicate-modal-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="duplicate-modal-title"
        >
          <div className="cityscan-duplicate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cityscan-duplicate-modal-header">
              <h3 id="duplicate-modal-title" className="cityscan-duplicate-modal-title">
                Duplicate report
              </h3>
              <button
                type="button"
                className="cityscan-duplicate-modal-close"
                onClick={() => setDuplicateModalMessage(null)}
                aria-label="Close"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className="cityscan-duplicate-modal-body">
              <p className="mb-0">{duplicateModalMessage}</p>
            </div>
          </div>
        </div>
      )}
      <div
        className="cityscan-sidebar-backdrop"
        data-open={isOpen}
        onClick={handleClose}
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
        role="button"
        tabIndex={0}
        aria-label="Close sidebar"
      />
      <div
        className="cityscan-sidebar-panel"
        data-open={isOpen}
        tabIndex={-1}
        aria-labelledby="reportSidebarLabel"
        aria-hidden={!isOpen}
      >
        <div className="cityscan-sidebar-header">
          <h2 className="cityscan-sidebar-title" id="reportSidebarLabel">
            Report hazard
          </h2>
          <button
            type="button"
            className="cityscan-sidebar-close"
            onClick={handleClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="cityscan-sidebar-body">
          <div className="mb-3">
            <label htmlFor="reportCity" className="form-label cityscan-label">City (required)</label>
            <input
              id="reportCity"
              type="text"
              className="form-control cityscan-input"
              placeholder="e.g. Haifa"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="reportStreet" className="form-label cityscan-label">Street (required)</label>
            <input
              id="reportStreet"
              type="text"
              className="form-control cityscan-input"
              placeholder="e.g. Main Street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="reportHouseNumber" className="form-label cityscan-label">House number (optional)</label>
            <input
              id="reportHouseNumber"
              type="text"
              className="form-control cityscan-input"
              placeholder="e.g. 12"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
            />
          </div>
          <div className="mb-3 d-flex gap-2 align-items-center flex-wrap">
            <button
              type="button"
              className="btn btn-outline-primary cityscan-find-on-map"
              onClick={handleFindOnMap}
              disabled={findOnMapLoading}
            >
              {findOnMapLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" aria-hidden />
                  Searching…
                </>
              ) : (
                <>
                  <i className="bi bi-geo-alt me-1" />
                  Find on Map
                </>
              )}
            </button>
            {findOnMapError && (
              <span className="small text-danger">{findOnMapError}</span>
            )}
          </div>

          {!isAuthenticated && (
            <div className="alert alert-warning py-2 small mb-3" role="alert">
              Sign in to submit a report.
            </div>
          )}
          {submitError && !duplicateModalMessage && (
            <div className="alert alert-danger py-2 small mb-3" role="alert">{submitError}</div>
          )}
          {submitSuccess && (
            <div className="alert alert-success py-2 small mb-3" role="alert">
              Report saved successfully. It will appear on the map.
            </div>
          )}
          {selectedPosition && (
            <>
              {nearbyLoading && (
                <p className="small text-muted mb-2">Checking for existing reports nearby…</p>
              )}
              {!nearbyLoading && nearbyHazards.length > 0 && !aiDuplicate?.isDuplicate && (
                <div className="alert alert-info py-2 mb-3">
                  <p className="small fw-semibold mb-2">There are {nearbyHazards.length} open hazard(s) in this area:</p>
                  <ul className="small mb-2 ps-3">
                    {nearbyHazards.slice(0, 5).map((h) => (
                      <li key={h._id}>
                        {TYPE_LABELS[h.type] ?? h.type} — {h.status}
                        {h.description ? `: ${h.description.slice(0, 40)}${h.description.length > 40 ? '…' : ''}` : ''}
                      </li>
                    ))}
                    {nearbyHazards.length > 5 && <li>…and {nearbyHazards.length - 5} more</li>}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={handleClose}
                  >
                    Don&apos;t report — already reported here
                  </button>
                </div>
              )}
            </>
          )}
          {selectedPosition && (
            <div className="cityscan-sidebar-location mb-3">
              <p className="cityscan-sidebar-address">
                <i className="bi bi-geo-alt me-2" style={{ color: 'var(--cityscan-accent)' }} aria-hidden />
                {address || 'Loading address…'}
              </p>
              <p className="cityscan-sidebar-coords">
                <i className="bi bi-bullseye me-2 text-muted" aria-hidden />
                <span>{selectedPosition[0].toFixed(5)}, {selectedPosition[1].toFixed(5)}</span>
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="reportType" className="form-label cityscan-label">
                Type
              </label>
              <select
                id="reportType"
                className="form-select cityscan-select"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                required
              >
                <option value="pothole">Pothole</option>
                <option value="broken_streetlight">Broken streetlight</option>
                <option value="debris">Debris</option>
                <option value="flooding">Flooding</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="mb-3">
              <label htmlFor="reportDescription" className="form-label cityscan-label">
                Description
              </label>
              <textarea
                id="reportDescription"
                className="form-control cityscan-input"
                rows={4}
                placeholder="Describe the hazard..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label cityscan-label">Photos of the Hazard</label>
              {IS_DEMO && (
                <p className="small text-muted mb-1">In demo mode, adding a photo triggers AI description.</p>
              )}
              <input
                id="hazardPhotosInput"
                ref={hazardPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="visually-hidden"
                onChange={handleHazardPhotoAdd}
              />
              {aiAnalyzeLoading && (
                <div className="small text-primary mb-2 d-flex align-items-center gap-2">
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  <span>Analyzing photo…</span>
                </div>
              )}
              {hazardPhotoPreviews.length > 0 && (
                <div className="d-flex flex-wrap gap-2 mb-2">
                  {hazardPhotoPreviews.map((url, i) => (
                    <div key={i} className="cityscan-upload-preview position-relative rounded overflow-hidden" style={{ width: 80, height: 80 }}>
                      <img src={url} alt={`Hazard photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        className="position-absolute top-0 end-0 m-1 btn btn-danger btn-sm rounded-circle p-0 d-flex align-items-center justify-content-center"
                        style={{ width: 22, height: 22 }}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          removeHazardPhoto(i)
                        }}
                        aria-label={`Remove photo ${i + 1}`}
                        title="Remove photo"
                      >
                        <i className="bi bi-x" style={{ fontSize: '0.9rem' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {hazardPhotoPreviews.length < MAX_HAZARD_PHOTOS && (
                <label htmlFor="hazardPhotosInput" className="cityscan-upload-zone d-block rounded-3 border overflow-hidden position-relative mb-0">
                  <div className="cityscan-upload-placeholder">
                    <i className="bi bi-cloud-arrow-up fs-1 text-muted" />
                    <span className="small text-muted">
                      {hazardPhotoPreviews.length === 0 ? 'Tap to add photo(s)' : `Add another (${hazardPhotoPreviews.length}/${MAX_HAZARD_PHOTOS})`}
                    </span>
                  </div>
                </label>
              )}
            </div>

<button
                type="submit"
                className="cityscan-submit-btn btn w-100 rounded-pill py-3 fw-semibold"
                disabled={submitLoading || aiAnalyzeLoading || !isAuthenticated || aiDuplicate?.isDuplicate === true || (nearbyHazards.length > 0 && aiCheckLoading)}
              >
              {submitLoading ? 'Submitting…' : aiAnalyzeLoading ? 'Analyzing…' : 'Submit'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
