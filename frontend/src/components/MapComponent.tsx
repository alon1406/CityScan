import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
type Position = [number, number]
import 'leaflet/dist/leaflet.css'
import ReportSidebar from './ReportSidebar'
import { fetchHazards, fetchNearbyHazards, type Hazard } from '../api/client'

// Fix default marker icon when using bundlers (Vite/Webpack)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const redMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const markerIconOptions = {
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
  popupAnchor: [1, -34] as [number, number],
  shadowSize: [41, 41] as [number, number],
}

const HAZARD_TYPE_MARKER_URLS: Record<string, string> = {
  pothole: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  broken_streetlight: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
  debris: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  flooding: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  other: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
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
  position: Position
  setSearchSelectHandler?: React.Dispatch<React.SetStateAction<((lat: number, lng: number) => void) | null>>
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
  skipNextMapClickRef,
  onClearSelection,
}: {
  position: Position
  skipNextMapClickRef: React.MutableRefObject<boolean>
  onClearSelection: () => void
}) {
  const map = useMap()
  if (!position) return null
  const setSkipAndFly = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    skipNextMapClickRef.current = true
    onClearSelection()
    map.flyTo(position, map.getZoom(), { duration: 0.8 })
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
        onClick={setSkipAndFly}
        title="Focus on my location"
        aria-label="Focus on my location"
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

/** Opens a popup at the given position with "What was already reported" when there are hazards. */
function OpenExistingReportsPopup({
  position,
  hazards,
  typeLabels,
}: {
  position: Position | null
  hazards: Hazard[]
  typeLabels: Record<string, string>
}) {
  const map = useMap()
  useEffect(() => {
    if (!position || hazards.length === 0) return
    const [lat, lng] = position
    const div = document.createElement('div')
    div.className = 'existing-reports-popup'
    div.style.minWidth = '200px'
    div.innerHTML = `
      <strong class="d-block mb-2">Already reported here (within 50m)</strong>
      <ul class="list-unstyled small mb-2 ps-0">
        ${hazards
          .slice(0, 8)
          .map(
            (h) => `
          <li class="mb-1">
            ${typeLabels[h.type] ?? h.type}
            <span class="badge ms-1 badge-status-${h.status}">${h.status === 'open' ? 'Open' : h.status === 'in_progress' ? 'In progress' : 'Resolved'}</span>
            ${h.description ? `<span class="d-block text-muted">${h.description.slice(0, 60)}${h.description.length > 60 ? '…' : ''}</span>` : ''}
          </li>
        `
          )
          .join('')}
        ${hazards.length > 8 ? `<li class="text-muted">…and ${hazards.length - 8} more</li>` : ''}
      </ul>
    `
    const popup = L.popup().setLatLng([lat, lng]).setContent(div).openOn(map)
    return () => {
      if (map.hasLayer(popup)) map.removeLayer(popup)
    }
  }, [position, hazards, map, typeLabels])
  return null
}

const NEARBY_RADIUS_M = 50

export default function MapComponent({ position, setSearchSelectHandler = () => {} }: MapComponentProps) {
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [flyToTarget, setFlyToTarget] = useState<Position | null>(null)
  const [existingReportsAtClick, setExistingReportsAtClick] = useState<Hazard[]>([])
  const skipNextMapClickRef = useRef(false)

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
        center={position}
        zoom={15}
        className="w-100 h-100 min-vh-50 rounded position-relative"
        style={{ minHeight: '400px' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapCenter center={position} />
        <MapFlyTo flyToTarget={flyToTarget} onFlown={handleFlown} />
        <Marker position={position} />
        <FlyToMyLocation position={position} skipNextMapClickRef={skipNextMapClickRef} onClearSelection={clearSelection} />
        <MapEvents onMapClick={handleMapClick} skipNextMapClickRef={skipNextMapClickRef} />
        <OpenExistingReportsPopup
          position={selectedPosition}
          hazards={existingReportsAtClick}
          typeLabels={TYPE_LABELS}
        />
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
          <Marker position={selectedPosition} icon={redMarkerIcon}>
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
