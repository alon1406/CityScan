import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import DemoBanner from './components/DemoBanner'
import './index.css'
import App from './App.tsx'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyReportsPage from './pages/MyReportsPage'
import AdminPage from './pages/AdminPage'
import NavBar from './components/NavBar'

/** Root route: redirect to login when not authenticated, otherwise show the map. */
function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="d-flex flex-column min-vh-100 align-items-center justify-content-center text-muted">
        <div className="spinner-border text-primary mb-2" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
        <p className="mb-0">Loading…</p>
      </div>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <DemoBanner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/history-reports"
            element={
              <div className="cityscan-app d-flex flex-column min-vh-100">
                <NavBar position={null} />
                <main className="flex-grow-1">
                  <MyReportsPage />
                </main>
              </div>
            }
          />
          <Route
            path="/admin"
            element={
              <div className="cityscan-app d-flex flex-column min-vh-100">
                <NavBar position={null} />
                <main className="flex-grow-1">
                  <AdminPage />
                </main>
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
