import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

const PRIMARY = '#5B2D8E'

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
          isActive
            ? 'text-white'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
        }`
      }
      style={({ isActive }) => isActive ? { background: PRIMARY } : {}}
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="w-64 flex flex-col h-screen" style={{ background: '#1a1a2e' }}>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: PRIMARY }}>
            BO
          </div>
          <div>
            <div className="text-white font-bold text-sm">Back-Office</div>
            <div className="text-gray-400 text-xs">Estimer Mes Aides V2</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {isSuperAdmin ? (
          <>
            <NavItem to="/superadmin/dashboard" label="Tableau de bord" icon="📊" />
            <NavItem to="/superadmin/admin-bornes" label="AdminBornes" icon="👥" />
            <NavItem to="/superadmin/formulaires" label="Formulaires" icon="📋" />
            <NavItem to="/superadmin/bornes" label="Bornes" icon="🖥️" />
            <NavItem to="/superadmin/enregistrements" label="Enregistrements" icon="📁" />
            <NavItem to="/superadmin/partage" label="Partage CRM" icon="🔄" />
          </>
        ) : (
          <>
            <NavItem to="/adminborne/dashboard" label="Tableau de bord" icon="📊" />
            <NavItem to="/adminborne/bornes" label="Mes Bornes" icon="🖥️" />
            <NavItem to="/adminborne/enregistrements" label="Enregistrements" icon="📁" />
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          style={{ minHeight: '48px' }}
        >
          <span className="text-lg">🚪</span>
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  )
}
