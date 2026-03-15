import { useState, useEffect } from 'react'
import NavBar from './components/NavBar'
import MapComponent from './components/MapComponent'
import './App.css'

/** Default map center when no user location is available (Tel Aviv). No geolocation pop-up on load. */
export const DEFAULT_MAP_CENTER: [number, number] = [32.0853, 34.7818]

const LOCATION_DENIED_MESSAGE =
  'Location services are disabled. Please enable location permissions in your browser settings to see hazards near you.'

function App() {
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [searchSelectHandler, setSearchSelectHandler] = useState<((lat: number, lng: number) => void) | null>(null)

  const requestLocation = () => {
    if (!navigator.geolocation) {
      alert(LOCATION_DENIED_MESSAGE)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setPosition([latitude, longitude])
      },
      () => {
        alert(LOCATION_DENIED_MESSAGE)
      },
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
