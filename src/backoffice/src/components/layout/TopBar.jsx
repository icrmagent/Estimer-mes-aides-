import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_BORNE: 'Admin Borne',
}

const ROLE_COLORS = {
  SUPER_ADMIN: { bg: '#5B2D8E', text: '#fff' },
  ADMIN_BORNE: { bg: '#1A56A0', text: '#fff' },
}

export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const roleColor = ROLE_COLORS[user?.role] || { bg: '#6b7280', text: '#fff' }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-4">
        <span
          className="px-3 py-1 rounded-full text-xs font-semibold"
          style={{ background: roleColor.bg, color: roleColor.text }}
        >
          {ROLE_LABELS[user?.role] || user?.role}
        </span>
        <span className="text-sm text-gray-600">{user?.email}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors px-3 py-2 rounded-lg hover:bg-gray-100"
          style={{ minHeight: '36px' }}
        >
          Déconnexion
        </button>
      </div>
    </header>
  )
}
