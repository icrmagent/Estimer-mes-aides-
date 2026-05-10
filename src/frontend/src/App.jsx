import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { BorneProvider } from './context/BorneContext.jsx'
import { FormProvider } from './context/FormContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import StartPage from './pages/StartPage.jsx'
import { FormPage } from './pages/FormPage.jsx'
import { ConfirmationPage } from './pages/ConfirmationPage.jsx'
import { useBorneConfig } from './hooks/useBorneConfig.js'

// Borne ID from env or URL param — in production this comes from the device config
const BORNE_ID = import.meta.env.VITE_BORNE_ID || null
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function KioskLayout() {
  const { loading, loadError } = useBorneConfig(BORNE_ID, API_URL)

  if (!BORNE_ID) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '24px', color: '#e74c3c', marginBottom: '16px' }}>Erreur de configuration</h2>
        <p>L'identifiant de la borne (<code>VITE_BORNE_ID</code>) n'est pas défini dans le fichier <code>.env</code>.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#5B2D8E', fontSize: '18px', fontWeight: 'bold' }}>Chargement de la configuration de la borne...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '24px', color: '#e74c3c', marginBottom: '16px' }}>Erreur</h2>
        <p style={{ marginBottom: '24px', color: '#333' }}>{loadError}</p>
        <button 
          onClick={() => { localStorage.removeItem('borne_token'); window.location.href='/login' }}
          style={{ background: '#5B2D8E', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
        >
          Se reconnecter
        </button>
      </div>
    )
  }

  return <Outlet />
}

export default function App() {
  return (
    <BorneProvider>
      <FormProvider>
        <BrowserRouter>
          <Routes>
            {/* Connexion AdminBorne sur la borne */}
            <Route path="/login" element={<LoginPage />} />

            {/* Pages visiteur avec configuration chargée */}
            <Route element={<KioskLayout />}>
              <Route path="/start" element={<StartPage />} />
              <Route path="/form" element={<FormPage />} />
              <Route path="/confirmation" element={<ConfirmationPage />} />
            </Route>

            {/* Redirect racine vers login */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </FormProvider>
    </BorneProvider>
  )
}
