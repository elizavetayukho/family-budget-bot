import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const tabs = [
  {
    to: '/', label: 'Dashboard', end: true,
    icon: (active: boolean) => (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
          stroke="currentColor" strokeWidth="2" fill={active ? 'currentColor' : 'none'} strokeLinecap="round" strokeLinejoin="round" fillOpacity={active ? 0.15 : 0} />
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/jars', label: 'Jars', end: false,
    icon: (active: boolean) => (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M8 3h8l1 4H7L8 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <rect x="6" y="7" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.1 : 0} />
      </svg>
    ),
  },
  {
    to: '/budget', label: 'Budget', end: false,
    icon: (active: boolean) => (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.1 : 0} />
        <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/history', label: 'History', end: false,
    icon: (active: boolean) => (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.1 : 0} />
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/account', label: 'Account', end: false,
    icon: (active: boolean) => (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <>
      {/* Desktop top nav */}
      <nav className="hidden sm:flex bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-brand-100 px-6 py-3 items-center justify-between">
        <div className="flex items-center gap-1">
          <div className="w-7 h-7 rounded-lg gradient-card mr-3 flex items-center justify-center">
            <span className="text-white text-xs font-bold">FB</span>
          </div>
          {tabs.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-100 text-brand-800' : 'text-gray-500 hover:text-brand-700 hover:bg-brand-50'
                }`
              }>
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full gradient-card flex items-center justify-center">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
          <button onClick={logout} className="text-xs text-gray-500 hover:text-brand-700 transition-colors">
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="sm:hidden flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-md border-b border-brand-100 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-card flex items-center justify-center">
            <span className="text-white text-xs font-bold">FB</span>
          </div>
          <span className="font-semibold text-brand-900 text-sm">Family Budget</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full gradient-card flex items-center justify-center">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-brand-100">
        <div className="flex">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors ${
                  isActive ? 'text-brand-600' : 'text-gray-500'
                }`
              }>
              {({ isActive }) => (
                <>
                  {t.icon(isActive)}
                  <span className="text-[10px] font-medium">{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
