import { useState, useEffect } from 'react'
import NavBar from './components/NavBar'
import MapComponent from './components/MapComponent'
import './App.css'

const LOCATION_ERROR_MESSAGE =
  'Location access is required to use CityScan. Please enable location in your browser settings.'

function App() {
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [positionError, setPositionError] = useState<string | null>(null)
  const [searchSelectHandler, setSearchSelectHandler] = useState<((lat: number, lng: number) => void) | null>(null)

  const fetchLocation = () => {
    setPositionError(null)
    setPosition(null)
    if (!navigator.geolocation) {
      setPositionError(LOCATION_ERROR_MESSAGE)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setPosition([latitude, longitude])
      },
      () => setPositionError(LOCATION_ERROR_MESSAGE),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      const id = setTimeout(() => setPositionError(LOCATION_ERROR_MESSAGE), 0)
      return () => clearTimeout(id)
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
      () => setPositionError(LOCATION_ERROR_MESSAGE),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  const handleSearchSelect = (lat: number, lng: number) => {
    searchSelectHandler?.(lat, lng)
  }

  if (positionError) {
    return (
      <div className="cityscan-app d-flex flex-column vh-100 justify-content-center align-items-center p-4">
          <div className="alert alert-warning shadow-sm mb-3 text-center">{positionError}</div>
          <button type="button" className="btn btn-primary rounded-pill px-4" onClick={fetchLocation}>
            Try Again
          </button>
        </div>
    )
  }

  if (!position) {
    return (
      <div className="cityscan-app d-flex flex-column vh-100 justify-content-center align-items-center text-muted">
          <div className="spinner-border text-primary mb-2" role="status">
            <span className="visually-hidden">Loading…</span>
          </div>
          <p className="mb-0">Locating you...</p>
        </div>
    )
  }

  return (
    <div className="cityscan-app d-flex flex-column vh-100">
      <NavBar position={position} onSelectAddress={handleSearchSelect} />
      <main className="container-fluid flex-grow-1 p-0 cityscan-main" style={{ minHeight: 0 }}>
        <MapComponent position={position} setSearchSelectHandler={setSearchSelectHandler} />
      </main>
    </div>
  )
}

export default App
