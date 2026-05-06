import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ProtectedRoute } from './components/layout/ProtectedRoute.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SADashboardPage from './pages/superadmin/DashboardPage.jsx'
import BornesListPage from './pages/superadmin/BornesListPage.jsx'
import BorneFormPage from './pages/superadmin/BorneFormPage.jsx'
import AdminBornesListPage from './pages/superadmin/AdminBornesListPage.jsx'
import AdminBorneFormPage from './pages/superadmin/AdminBorneFormPage.jsx'
import FormulairesListPage from './pages/superadmin/FormulairesListPage.jsx'
import FormulaireEditorPage from './pages/superadmin/FormulaireEditorPage.jsx'
import EnregistrementsListPage from './pages/superadmin/EnregistrementsListPage.jsx'
import PartageJobsPage from './pages/superadmin/PartageJobsPage.jsx'
import ABDashboardPage from './pages/adminborne/DashboardPage.jsx'
import ABBornesPage from './pages/adminborne/BornesPage.jsx'
import ABEnregistrementsPage from './pages/adminborne/EnregistrementsPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/superadmin/*" element={
            <ProtectedRoute requiredRole="SUPER_ADMIN">
              <Routes>
                <Route path="dashboard" element={<SADashboardPage />} />
                <Route path="bornes" element={<BornesListPage />} />
                <Route path="bornes/new" element={<BorneFormPage />} />
                <Route path="bornes/:id/edit" element={<BorneFormPage />} />
                <Route path="admin-bornes" element={<AdminBornesListPage />} />
                <Route path="admin-bornes/new" element={<AdminBorneFormPage />} />
                <Route path="admin-bornes/:id/edit" element={<AdminBorneFormPage />} />
                <Route path="formulaires" element={<FormulairesListPage />} />
                <Route path="formulaires/:id/edit" element={<FormulaireEditorPage />} />
                <Route path="enregistrements" element={<EnregistrementsListPage />} />
                <Route path="partage" element={<PartageJobsPage />} />
              </Routes>
            </ProtectedRoute>
          } />
          <Route path="/adminborne/*" element={
            <ProtectedRoute requiredRole="ADMIN_BORNE">
              <Routes>
                <Route path="dashboard" element={<ABDashboardPage />} />
                <Route path="bornes" element={<ABBornesPage />} />
                <Route path="enregistrements" element={<ABEnregistrementsPage />} />
              </Routes>
            </ProtectedRoute>
          } />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
