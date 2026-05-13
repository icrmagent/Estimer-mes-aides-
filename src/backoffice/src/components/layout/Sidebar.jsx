import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

const PRIMARY = '#5B2D8E'

const Icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  forms: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  tag: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  monitor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  inbox: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  ),
  refresh: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
}

function SectionLabel({ label }) {
  return (
    <div className="px-4 pt-5 pb-1">
      <span className="text-xs font-semibold text-gray-500 uppercase" style={{ letterSpacing: '0.08em' }}>
        {label}
      </span>
    </div>
  )
}

function NavItem({ to, label, icon, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'text-white shadow-sm'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
        }`
      }
      style={({ isActive }) => isActive ? { background: PRIMARY, minHeight: '48px' } : { minHeight: '48px' }}
    >
      <span className="flex-shrink-0 opacity-90">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const initiale = user?.email?.[0]?.toUpperCase() || '?'

  return (
    <aside
      className={[
        'fixed lg:static inset-y-0 left-0 z-30',
        'w-64 flex flex-col h-screen flex-shrink-0',
        'transition-transform duration-200 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
      style={{ background: '#1a1a2e' }}
    >
      {/* Logo + bouton fermer (mobile/tablette) */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
            style={{ background: PRIMARY }}
          >
            EMA
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold text-sm leading-tight">Back-Office</div>
            <div className="text-gray-400 text-xs truncate">Estimer Mes Aides V2</div>
          </div>
        </div>
        {/* Fermer — visible uniquement en dessous de lg */}
        <button
          onClick={onClose}
          className="lg:hidden flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          style={{ minHeight: '40px', minWidth: '40px' }}
          aria-label="Fermer le menu"
        >
          {Icons.close}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {isSuperAdmin ? (
          <>
            <SectionLabel label="Général" />
            <NavItem to="/superadmin/dashboard" label="Tableau de bord" icon={Icons.dashboard} onClick={onClose} />

            <SectionLabel label="Gestion" />
            <NavItem to="/superadmin/admin-bornes" label="AdminBornes" icon={Icons.users} onClick={onClose} />
            <NavItem to="/superadmin/categories-questions" label="Catégories" icon={Icons.tag} onClick={onClose} />
            <NavItem to="/superadmin/formulaires" label="Formulaires" icon={Icons.forms} onClick={onClose} />
            <NavItem to="/superadmin/bornes" label="Bornes" icon={Icons.monitor} onClick={onClose} />
            <NavItem to="/superadmin/enregistrements" label="Enregistrements" icon={Icons.inbox} onClick={onClose} />

            <SectionLabel label="Intégration" />
            <NavItem to="/superadmin/partage" label="Partage CRM" icon={Icons.refresh} onClick={onClose} />
          </>
        ) : (
          <>
            <div className="pt-2" />
            <NavItem to="/adminborne/dashboard" label="Tableau de bord" icon={Icons.dashboard} onClick={onClose} />
            <NavItem to="/adminborne/bornes" label="Mes Bornes" icon={Icons.monitor} onClick={onClose} />
            <NavItem to="/adminborne/enregistrements" label="Enregistrements" icon={Icons.inbox} onClick={onClose} />
          </>
        )}
      </nav>

      {/* User + Déconnexion */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <div className="px-4 py-2 flex items-center gap-3 min-w-0">
          <div
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
            style={{ background: PRIMARY }}
          >
            {initiale}
          </div>
          <span className="text-gray-400 text-xs truncate">{user?.email}</span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          style={{ minHeight: '48px' }}
        >
          {Icons.logout}
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  )
}
