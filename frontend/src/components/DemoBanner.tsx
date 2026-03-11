import { IS_DEMO } from '../api/client'

export default function DemoBanner() {
  if (!IS_DEMO) return null

  return (
    <>
      <div
        role="banner"
        className="text-center py-2 small fw-medium text-dark"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1050,
          backgroundColor: '#fff3cd',
          borderBottom: '1px solid #ffc107',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        Demo mode active: changes are saved in your browser only.
      </div>
      <div style={{ height: 38 }} aria-hidden />
    </>
  )
}
