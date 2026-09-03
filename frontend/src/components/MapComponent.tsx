import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
type Position = [number, number]
import 'leaflet/dist/leaflet.css'
import ReportSidebar from './ReportSidebar'
import { fetchHazards, fetchNearbyHazards, type Hazard } from '../services/hazardService'

/**
 * Marker images are served from this app, not from a third party.
 *
 * They previously came from `raw.githubusercontent.com` and `cdnjs.cloudflare.com` —
 * 28 image requests to two foreign hosts on every page load. `raw.githubusercontent.com`
 * is not a CDN: it serves raw repository files for browsing, and GitHub rate-limits and
 * blocks automated use of it. The day that happens every marker vanishes from the map
 * with no change on our side.
 *
 * Files live in `frontend/public/markers/`. Vite copies `public/` into the build
 * verbatim, so these ship with the app and are served from the same origin.
 */
const MARKERS = '/markers'

// Leaflet resolves its default icon paths relative to the bundled CSS, which breaks
// under Vite. Point them at the local copies instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${MARKERS}/marker-default-2x.png`,
  iconUrl: `${MARKERS}/marker-default.png`,
  shadowUrl: `${MARKERS}/marker-shadow.png`,
})

const redMarkerIcon = new L.Icon({
  iconUrl: `${MARKERS}/marker-red.png`,
  shadowUrl: `${MARKERS}/marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const markerIconOptions = {
  shadowUrl: `${MARKERS}/marker-shadow.png`,
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
  popupAnchor: [1, -34] as [number, number],
  shadowSize: [41, 41] as [number, number],
}

const HAZARD_TYPE_MARKER_URLS: Record<string, string> = {
  pothole: `${MARKERS}/marker-red.png`,
  broken_streetlight: `${MARKERS}/marker-yellow.png`,
  debris: `${MARKERS}/marker-grey.png`,
  flooding: `${MARKERS}/marker-blue.png`,
  other: `${MARKERS}/marker-violet.png`,
}

const hazardTypeIcons: Record<string, L.Icon> = {}
function getHazardMarkerIcon(type: string): L.Icon {
  const key = type in HAZARD_TYPE_MARKER_URLS ? type : 'other'
  if (!hazardTypeIcons[key]) {
    hazardTypeIcons[key] = new L.Icon({
      iconUrl: HAZARD_TYPE_MARKER_URLS[key],
      ...markerIconOptions,
    })
  }
  return hazardTypeIcons[key]
}

const TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole',
  broken_streetlight: 'Broken streetlight',
  debris: 'Debris',
  flooding: 'Flooding',
  other: 'Other',
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  open: 'badge badge-status-open',
  in_progress: 'badge badge-status-in_progress',
  resolved: 'badge badge-status-resolved',
}
function getStatusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASS[status] ?? 'badge bg-secondary'
}

export interface MapComponentProps {
  defaultCenter: Position
  position: Position | null
  setSearchSelectHandler?: React.Dispatch<React.SetStateAction<((lat: number, lng: number) => void) | null>>
  onRequestMyLocation: () => void
}

function MapCenter({ center }: { center: Position }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.setView(center)
  }, [center, map])
  return null
}

function FlyToMyLocation({
  position,
  onRequestMyLocation,
  skipNextMapClickRef,
  onClearSelection,
}: {
  position: Position | null
  onRequestMyLocation: () => void
  skipNextMapClickRef: React.MutableRefObject<boolean>
  onClearSelection: () => void
}) {
  const map = useMap()
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    skipNextMapClickRef.current = true
    onClearSelection()
    if (position) {
      map.flyTo(position, map.getZoom(), { duration: 0.8 })
    } else {
      onRequestMyLocation()
    }
  }
  return (
    <div
      className="cityscan-my-location-wrap position-absolute end-0 m-2"
      style={{ zIndex: 1000, bottom: '7rem' }}
      onPointerDown={(e) => {
        e.stopPropagation()
        skipNextMapClickRef.current = true
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="cityscan-my-location-btn btn rounded-pill shadow-sm d-flex align-items-center gap-2"
        style={{
          background: 'var(--cityscan-primary)',
          color: '#fff',
          border: 'none',
          padding: '0.5rem 1rem',
          fontFamily: 'var(--cityscan-font)',
          fontWeight: 600,
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          skipNextMapClickRef.current = true
        }}
        onClick={handleClick}
        title={position ? 'Focus on my location' : 'Get my location'}
        aria-label={position ? 'Focus on my location' : 'Get my location'}
      >
        <i className="bi bi-geo-alt-fill" />
        <span>My location</span>
      </button>
    </div>
  )
}

function MapFlyTo({
  flyToTarget,
  onFlown,
}: {
  flyToTarget: Position | null
  onFlown?: () => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!flyToTarget || flyToTarget.length < 2) return
    map.flyTo(flyToTarget, 16, { duration: 0.8 })
    onFlown?.()
  }, [flyToTarget, map, onFlown])
  return null
}

function MapEvents({
  onMapClick,
  skipNextMapClickRef,
}: {
  onMapClick: (coords: Position) => void
  skipNextMapClickRef: React.MutableRefObject<boolean>
}) {
  const map = useMap()
  useMapEvents({
    click(e: L.LeafletMouseEvent) {
      if (skipNextMapClickRef.current) {
        skipNextMapClickRef.current = false
        return
      }
      const { lat, lng } = e.latlng
      const coords: Position = [lat, lng]
      onMapClick(coords)
      map.flyTo(e.latlng, map.getZoom())
    },
  })
  return null
}

/**
 * Opens the selected marker's popup once nearby reports have loaded.
 *
 * This replaces a component that rendered the same popup through `innerHTML`,
 * interpolating `h.description` — free text written by any reporter — so a report
 * containing markup ran in the browser of everyone who opened the map. Stored XSS,
 * not reflected, and it was the only such sink in the frontend.
 *
 * The equivalent popup already existed in JSX below, where React escapes the
 * content. The only thing the unsafe version added was opening by itself, which is
 * all this does now; there is no longer anything to inject into.
 */
function AutoOpenPopup({
  markerRef,
  openWhen,
}: {
  markerRef: React.RefObject<L.Marker | null>
  openWhen: unknown
}) {
  useEffect(() => {
    markerRef.current?.openPopup()
  }, [markerRef, openWhen])
  return null
}

const NEARBY_RADIUS_M = 50

export default function MapComponent({
  defaultCenter,
  position,
  setSearchSelectHandler = () => {},
  onRequestMyLocation,
}: MapComponentProps) {
  const mapCenter = position ?? defaultCenter
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [flyToTarget, setFlyToTarget] = useState<Position | null>(null)
  const [existingReportsAtClick, setExistingReportsAtClick] = useState<Hazard[]>([])
  const skipNextMapClickRef = useRef(false)
  // Lets AutoOpenPopup open this marker's popup without reaching into the map instance.
  const selectedMarkerRef = useRef<L.Marker | null>(null)
  const hadPositionRef = useRef(false)

  useEffect(() => {
    if (position && !hadPositionRef.current) {
      hadPositionRef.current = true
      setFlyToTarget(position)
    }
    if (!position) hadPositionRef.current = false
  }, [position])

  const loadHazards = useCallback(async () => {
    try {
      const list = await fetchHazards({ limit: 500, unsolved: true })
      setHazards(list)
    } catch {
      setHazards([])
    }
  }, [])

  useEffect(() => {
    loadHazards()
  }, [loadHazards])

  useEffect(() => {
    const interval = setInterval(loadHazards, 8000)
    return () => clearInterval(interval)
  }, [loadHazards])

  useEffect(() => {
    if (!setSearchSelectHandler) return
    const handler = (lat: number, lng: number) => {
      const coords: Position = [lat, lng]
      setSelectedPosition(coords)
      setFlyToTarget(coords)
      setIsSidebarOpen(true)
    }
    setSearchSelectHandler(() => handler)
    return () => setSearchSelectHandler(null)
  }, [setSearchSelectHandler])

  const handleMapClick = (coords: Position) => {
    setSelectedPosition(coords)
    setExistingReportsAtClick([])
    setIsSidebarOpen(true)
    fetchNearbyHazards(coords[0], coords[1], NEARBY_RADIUS_M)
      .then((list) => setExistingReportsAtClick(list))
      .catch(() => setExistingReportsAtClick([]))
  }

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false)
    setExistingReportsAtClick([])
  }

  const handleFlyToPosition = (lat: number, lng: number) => {
    const coords: Position = [lat, lng]
    setSelectedPosition(coords)
    setFlyToTarget(coords)
  }

  const handleFlown = () => setFlyToTarget(null)

  const clearSelection = () => setSelectedPosition(null)

  return (
    <>
      <ReportSidebar
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        selectedPosition={selectedPosition}
        onFlyToPosition={handleFlyToPosition}
        onReportSubmitted={loadHazards}
      />
      <button
        type="button"
        className="cityscan-fab"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="New report"
        title="New report"
      >
        <i className="bi bi-plus-lg" />
      </button>
      <MapContainer
        center={mapCenter}
        zoom={15}
        className="w-100 h-100 min-vh-50 rounded position-relative"
        style={{ minHeight: '400px' }}
        scrollWheelZoom
      >
        {/*
          Reverted from CARTO Voyager back to plain OpenStreetMap tiles.

          CARTO's anonymous basemaps.cartocdn.com endpoint now returns an "API KEY
          REQUIRED" watermark tile for every request, with an HTTP 200 — so it fails
          silently, as a map that renders but shows nothing useful, rather than a
          console error. Confirmed on 2026-08-14: every style on that domain (voyager,
          light_all, dark_all) returns the same watermark, so this is a policy change
          on CARTO's side, not something scoped to this app's traffic.

          Plain OSM tiles are the safer default for a project with no billing account:
          no key, no account, no dependency that can flip from free to gated without
          any change in our own code. The muted-palette upgrade is deferred until a
          tile source with a stable free tier is chosen deliberately, not stumbled
          into by whatever the previous provider allowed anonymously last month.
        */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          subdomains="abc"
          maxZoom={19}
        />
        <MapCenter center={mapCenter} />
        <MapFlyTo flyToTarget={flyToTarget} onFlown={handleFlown} />
        {position && <Marker position={position} />}
        <FlyToMyLocation
          position={position}
          onRequestMyLocation={onRequestMyLocation}
          skipNextMapClickRef={skipNextMapClickRef}
          onClearSelection={clearSelection}
        />
        <MapEvents onMapClick={handleMapClick} skipNextMapClickRef={skipNextMapClickRef} />
        <AutoOpenPopup markerRef={selectedMarkerRef} openWhen={existingReportsAtClick} />
        {hazards.map((h) => (
          <Marker key={h._id} position={[h.latitude, h.longitude]} icon={getHazardMarkerIcon(h.type)}>
            <Popup>
              <div className="mb-2">
                <strong>{TYPE_LABELS[h.type] ?? h.type}</strong>
                <span className={`${getStatusBadgeClass(h.status)} ms-1`}>{h.status === 'open' ? 'Open' : h.status === 'in_progress' ? 'In progress' : 'Resolved'}</span>
              </div>
              {h.description && <p className="small mb-1">{h.description}</p>}
              <p className="small text-muted mb-0">
                {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}
              </p>
            </Popup>
          </Marker>
        ))}
        {selectedPosition && (
          <Marker position={selectedPosition} icon={redMarkerIcon} ref={selectedMarkerRef}>
            <Popup>
              {existingReportsAtClick.length > 0 ? (
                <div className="existing-reports-popup">
                  <strong className="d-block mb-2">Already reported here (within 50m)</strong>
                  <ul className="list-unstyled small mb-2 ps-0">
                    {existingReportsAtClick.slice(0, 8).map((h) => (
                      <li key={h._id} className="mb-1">
                        {TYPE_LABELS[h.type] ?? h.type}
                        <span className={`${getStatusBadgeClass(h.status)} ms-1`}>{h.status === 'open' ? 'Open' : h.status === 'in_progress' ? 'In progress' : 'Resolved'}</span>
                        {h.description && <span className="d-block text-muted">{h.description.slice(0, 60)}{h.description.length > 60 ? '…' : ''}</span>}
                      </li>
                    ))}
                    {existingReportsAtClick.length > 8 && <li className="text-muted">…and {existingReportsAtClick.length - 8} more</li>}
                  </ul>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearSelection}>
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <span className="d-block mb-2">New Report</span>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearSelection}>
                    Clear selection
                  </button>
                </>
              )}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </>
  )
}
