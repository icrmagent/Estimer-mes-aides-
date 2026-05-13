import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

const ROUTE_LABELS = {
  '/superadmin/dashboard':           'Tableau de bord',
  '/superadmin/bornes':              'Bornes',
  '/superadmin/bornes/new':          'Nouvelle borne',
  '/superadmin/admin-bornes':        'AdminBornes',
  '/superadmin/admin-bornes/new':    'Nouvel admin',
  '/superadmin/formulaires':         'Formulaires',
  '/superadmin/categories-questions':'Catégories de questions',
  '/superadmin/enregistrements':     'Enregistrements',
  '/superadmin/partage':             'Partage CRM',
  '/adminborne/dashboard':           'Tableau de bord',
  '/adminborne/bornes':              'Mes Bornes',
  '/adminborne/enregistrements':     'Enregistrements',
}

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_BORNE: 'Admin Borne',
}

const ROLE_COLORS = {
  SUPER_ADMIN: { bg: '#5B2D8E', text: '#fff' },
  ADMIN_BORNE: { bg: '#1A56A0', text: '#fff' },
}

function getPageTitle(pathname) {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  for (const [key, value] of Object.entries(ROUTE_LABELS)) {
    if (pathname.startsWith(key + '/')) return `${value} — Modification`
  }
  return ''
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

export default function TopBar({ onMenuToggle }) {
  const { user } = useAuth()
  const location = useLocation()

  const roleColor = ROLE_COLORS[user?.role] || { bg: '#6b7280', text: '#fff' }
  const pageTitle = getPageTitle(location.pathname)

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — visible uniquement sous lg */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          style={{ minHeight: '40px', minWidth: '40px' }}
          aria-label="Ouvrir le menu"
        >
          <HamburgerIcon />
        </button>

        {pageTitle && (
          <h2 className="text-sm font-semibold text-gray-800 truncate">{pageTitle}</h2>
        )}
      </div>

      {/* Infos utilisateur */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span
          className="px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: roleColor.bg, color: roleColor.text }}
        >
          {ROLE_LABELS[user?.role] || user?.role}
        </span>
        <span className="text-sm text-gray-500 hidden md:block truncate max-w-[180px]">{user?.email}</span>
      </div>
    </header>
  )
}
