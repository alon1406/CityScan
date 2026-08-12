import { useState, useEffect } from 'react'
import NavBar from './components/NavBar'
import MapComponent from './components/MapComponent'
import './App.css'

/** Default map center when no user location is available (Tel Aviv). No geolocation pop-up on load. */
export const DEFAULT_MAP_CENTER: [number, number] = [32.0853, 34.7818]

const LOCATION_DENIED_MESSAGE =
  'Location unavailable — showing central Tel Aviv. Enable location access in your browser to centre the map on you.'

/** How long the notice stays before fading out. */
const NOTICE_TIMEOUT_MS = 6000

function App() {
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [locationNotice, setLocationNotice] = useState<string | null>(null)
  const [searchSelectHandler, setSearchSelectHandler] = useState<((lat: number, lng: number) => void) | null>(null)

  /**
   * Denial is shown inline rather than through `alert()`.
   *
   * `alert()` is modal: it halts the page until dismissed, and it fired on arrival — so a
   * visitor following a link met an error dialog before seeing the app at all. Nothing is
   * actually broken when location is refused; the map falls back to DEFAULT_MAP_CENTER and
   * works normally. The message should match that severity.
   */
  const notifyLocationUnavailable = () => {
    setLocationNotice(LOCATION_DENIED_MESSAGE)
    window.setTimeout(() => setLocationNotice(null), NOTICE_TIMEOUT_MS)
  }

  const requestLocation = () => {
    if (!navigator.geolocation) {
      notifyLocationUnavailable()
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setPosition([latitude, longitude])
        setLocationNotice(null)
      },
      notifyLocationUnavailable,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  useEffect(() => {
    if (!navigator.geolocation) return
    const perm = navigator.permissions?.query({ name: 'geolocation' })
    if (typeof perm?.then !== 'function') return
    perm.then((result) => {
      if (result.state === 'granted') {
        navigator.geolocation.getCurrentPosition(
          (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        )
      }
    }).catch(() => {})
  }, [])

  const handleSearchSelect = (lat: number, lng: number) => {
    searchSelectHandler?.(lat, lng)
  }

  return (
    <div className="cityscan-app d-flex flex-column vh-100">
      <NavBar position={position} onSelectAddress={handleSearchSelect} />
      {locationNotice && (
        <div
          role="status"
          className="alert alert-warning d-flex align-items-center justify-content-between mb-0 py-2 px-3 small rounded-0"
          style={{ borderLeft: 0, borderRight: 0 }}
        >
          <span>
            <i className="bi bi-geo-alt me-2" aria-hidden />
            {locationNotice}
          </span>
          <button
            type="button"
            className="btn-close btn-close-sm ms-3"
            aria-label="Dismiss"
            onClick={() => setLocationNotice(null)}
          />
        </div>
      )}
      <main className="container-fluid flex-grow-1 p-0 cityscan-main" style={{ minHeight: 0 }}>
        <MapComponent
          defaultCenter={DEFAULT_MAP_CENTER}
          position={position}
          setSearchSelectHandler={setSearchSelectHandler}
          onRequestMyLocation={requestLocation}
        />
      </main>
    </div>
  )
}

export default App
