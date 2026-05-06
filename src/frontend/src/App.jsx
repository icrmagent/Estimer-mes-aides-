import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BorneProvider } from './context/BorneContext.jsx'
import { FormProvider } from './context/FormContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import StartPage from './pages/StartPage.jsx'
import { FormPage } from './pages/FormPage.jsx'
import { ConfirmationPage } from './pages/ConfirmationPage.jsx'

// Borne ID from env or URL param — in production this comes from the device config
const BORNE_ID = import.meta.env.VITE_BORNE_ID || null

export default function App() {
  return (
    <BorneProvider>
      <FormProvider>
        <BrowserRouter>
          <Routes>
            {/* Connexion AdminBorne sur la borne */}
            <Route path="/login" element={<LoginPage />} />

            {/* Pages visiteur */}
            <Route path="/start" element={<StartPage />} />
            <Route path="/form" element={<FormPage />} />
            <Route path="/confirmation" element={<ConfirmationPage />} />

            {/* Redirect racine vers login */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </FormProvider>
    </BorneProvider>
  )
}
