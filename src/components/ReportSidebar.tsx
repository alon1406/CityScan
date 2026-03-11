import { useState, useEffect } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

const NOMINATIM_OPTIONS: RequestInit = {
  headers: { 'Accept-Language': 'en', 'User-Agent': 'CityScan/1.0 (hazard reporting)' },
}

export interface ReportSidebarProps {
  isOpen: boolean
  onClose: () => void
  selectedPosition: [number, number] | null
  onFlyToPosition?: (lat: number, lng: number) => void
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

export default function ReportSidebar({ isOpen, onClose, selectedPosition, onFlyToPosition }: ReportSidebarProps) {
  const [type, setType] = useState('pothole')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [findOnMapError, setFindOnMapError] = useState('')
  const [findOnMapLoading, setFindOnMapLoading] = useState(false)
  const [hazardPhoto, setHazardPhoto] = useState<File | null>(null)
  const [hazardPhotoPreview, setHazardPhotoPreview] = useState<string | null>(null)
  const [areaPhoto, setAreaPhoto] = useState<File | null>(null)
  const [areaPhotoPreview, setAreaPhotoPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedPosition || selectedPosition.length < 2) {
      setAddress('')
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

  const handleFindOnMap = () => {
    setFindOnMapError('')
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
      .then((res) => res.json())
      .then((results: NominatimSearchResult[]) => {
        if (!results || results.length === 0) {
          setFindOnMapError('Address not found. Try a different spelling or broader area.')
          return
        }
        const first = results[0]
        const lat = parseFloat(first.lat)
        const lon = parseFloat(first.lon)
        if (typeof onFlyToPosition === 'function') onFlyToPosition(lat, lon)
      })
      .catch(() => setFindOnMapError('Search failed. Please try again.'))
      .finally(() => setFindOnMapLoading(false))
  }

  const handleHazardPhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (hazardPhotoPreview) URL.revokeObjectURL(hazardPhotoPreview)
    if (!file) {
      setHazardPhoto(null)
      setHazardPhotoPreview(null)
      return
    }
    setHazardPhoto(file)
    setHazardPhotoPreview(URL.createObjectURL(file))
  }

  const handleAreaPhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (areaPhotoPreview) URL.revokeObjectURL(areaPhotoPreview)
    if (!file) {
      setAreaPhoto(null)
      setAreaPhotoPreview(null)
      return
    }
    setAreaPhoto(file)
    setAreaPhotoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    console.log('Report submitted:', {
      selectedPosition,
      type,
      description,
      address,
      hazardPhotoName: hazardPhoto?.name ?? null,
      areaPhotoName: areaPhoto?.name ?? null,
    })
    setDescription('')
    setType('pothole')
    setAddress('')
    setCity('')
    setStreet('')
    setHouseNumber('')
    setFindOnMapError('')
    if (hazardPhotoPreview) URL.revokeObjectURL(hazardPhotoPreview)
    if (areaPhotoPreview) URL.revokeObjectURL(areaPhotoPreview)
    setHazardPhoto(null)
    setHazardPhotoPreview(null)
    setAreaPhoto(null)
    setAreaPhotoPreview(null)
    onClose()
  }

  const handleClose = () => {
    setDescription('')
    setType('pothole')
    setAddress('')
    setCity('')
    setStreet('')
    setHouseNumber('')
    setFindOnMapError('')
    if (hazardPhotoPreview) URL.revokeObjectURL(hazardPhotoPreview)
    if (areaPhotoPreview) URL.revokeObjectURL(areaPhotoPreview)
    setHazardPhoto(null)
    setHazardPhotoPreview(null)
    setAreaPhoto(null)
    setAreaPhotoPreview(null)
    onClose()
  }

  return (
    <>
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
                onChange={(e) => setType(e.target.value)}
                required
              >
                <option value="pothole">Pothole</option>
                <option value="lighting">Lighting</option>
                <option value="trash">Trash</option>
                <option value="road damage">Road damage</option>
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
              <label className="form-label cityscan-label">Photo of the Hazard</label>
              <label className="cityscan-upload-zone d-block rounded-3 border overflow-hidden position-relative">
                <input
                  id="hazardPhoto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="visually-hidden"
                  onChange={handleHazardPhotoChange}
                />
                {hazardPhotoPreview ? (
                  <div className="cityscan-upload-preview">
                    <img src={hazardPhotoPreview} alt="Hazard preview" />
                  </div>
                ) : (
                  <div className="cityscan-upload-placeholder">
                    <i className="bi bi-cloud-arrow-up fs-1 text-muted" />
                    <span className="small text-muted">Tap to add photo</span>
                  </div>
                )}
              </label>
            </div>

            <div className="mb-3">
              <label className="form-label cityscan-label">Photo of the Surrounding Area</label>
              <label className="cityscan-upload-zone d-block rounded-3 border overflow-hidden position-relative">
                <input
                  id="areaPhoto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="visually-hidden"
                  onChange={handleAreaPhotoChange}
                />
                {areaPhotoPreview ? (
                  <div className="cityscan-upload-preview">
                    <img src={areaPhotoPreview} alt="Area preview" />
                  </div>
                ) : (
                  <div className="cityscan-upload-placeholder">
                    <i className="bi bi-cloud-arrow-up fs-1 text-muted" />
                    <span className="small text-muted">Tap to add photo</span>
                  </div>
                )}
              </label>
            </div>

            <button type="submit" className="cityscan-submit-btn btn w-100 rounded-pill py-3 fw-semibold">
              Submit
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
