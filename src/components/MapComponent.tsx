import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
type Position = [number, number]
import 'leaflet/dist/leaflet.css'
import ReportSidebar from './ReportSidebar'

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
      className="position-absolute end-0 m-2 z-index-1000"
      style={{ zIndex: 1000, bottom: '5.5rem' }}
      onPointerDown={(e) => {
        e.stopPropagation()
        skipNextMapClickRef.current = true
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="btn rounded-pill shadow-sm d-flex align-items-center gap-2"
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
      console.log('Map clicked — coordinates:', { lat, lng })
    },
  })
  return null
}

export default function MapComponent({ position, setSearchSelectHandler = () => {} }: MapComponentProps) {
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [flyToTarget, setFlyToTarget] = useState<Position | null>(null)
  const skipNextMapClickRef = useRef(false)

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
    setIsSidebarOpen(true)
  }

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false)
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
        {selectedPosition && (
          <Marker position={selectedPosition} icon={redMarkerIcon}>
            <Popup>
              <span className="d-block mb-2">New Report</span>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearSelection}>
                Clear selection
              </button>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </>
  )
}
