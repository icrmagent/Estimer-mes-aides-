import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { BorneProvider } from './context/BorneContext.jsx'
import { FormProvider } from './context/FormContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import StartPage from './pages/StartPage.jsx'
import { FormPage } from './pages/FormPage.jsx'
import { ConfirmationPage } from './pages/ConfirmationPage.jsx'
import { useBorneConfig } from './hooks/useBorneConfig.js'
import { connectBorneChannel } from './services/borneRemoteControl.js'
import { exitKiosk } from './services/kioskService'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/* Composant invisible : abonne Pusher au canal borne-{id} dès que l'app charge,
   et déclenche login/logout temps réel sur ordre du back-office. */
function BorneRemoteControlBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    const borneId = import.meta.env.VITE_BORNE_ID || localStorage.getItem('borne_id')
    if (!borneId) return

    const cleanup = connectBorneChannel(borneId, {
      onForceLogin: (data) => {
        // N'écrase pas une session déjà active
        if (data?.token && !localStorage.getItem('borne_token')) {
          localStorage.setItem('borne_token', data.token)
          if (data.email) localStorage.setItem('borne_email', data.email)
          navigate('/start', { replace: true })
        }
      },
      onForceLogout: async () => {
        try { await exitKiosk() } catch { /* tolérant : navigation prime */ }
        localStorage.removeItem('borne_token')
        localStorage.removeItem('borne_email')
        navigate('/login', { replace: true })
      },
    })

    return cleanup
  }, [navigate])

  return null
}

/* Redirige vers /start si un token valide est présent, sinon vers /login.
   Permet la reprise automatique de session après coupure de courant. */
function RootRedirect() {
  const token = localStorage.getItem('borne_token')
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp * 1000 > Date.now()) {
        return <Navigate to="/start" replace />
      }
    } catch {}
    localStorage.removeItem('borne_token')
  }
  return <Navigate to="/login" replace />
}

function KioskLayout() {
  // Env var en priorité (dev local), sinon borneId stocké après login (APK bundle)
  const borneId = import.meta.env.VITE_BORNE_ID || localStorage.getItem('borne_id') || null
  const { loading, loadError } = useBorneConfig(borneId, API_URL)

  if (!borneId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '24px', color: '#e74c3c', marginBottom: '16px' }}>Erreur de configuration</h2>
        <p>Aucune borne assignée à ce compte. Contactez votre administrateur.</p>
        <button
          onClick={() => { localStorage.removeItem('borne_token'); window.location.href = '/login' }}
          style={{ marginTop: '16px', background: '#5B2D8E', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', minHeight: '52px' }}
        >
          Se reconnecter
        </button>
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
          style={{ background: '#5B2D8E', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', minHeight: '52px', minWidth: '160px' }}
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
          <BorneRemoteControlBridge />
          <Routes>
            {/* Connexion AdminBorne sur la borne */}
            <Route path="/login" element={<LoginPage />} />

            {/* Pages visiteur avec configuration chargée */}
            <Route element={<KioskLayout />}>
              <Route path="/start" element={<StartPage />} />
              <Route path="/form" element={<FormPage />} />
              <Route path="/confirmation" element={<ConfirmationPage />} />
            </Route>

            {/* Reprise de session ou redirection vers login */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </FormProvider>
    </BorneProvider>
  )
}
