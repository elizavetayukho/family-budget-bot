import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/jars', label: 'Jars' },
  { to: '/budget', label: 'Budget' },
  { to: '/history', label: 'History' },
  { to: '/account', label: 'Account' },
];

export default function NavBar() {
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-brand-100 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <div className="w-7 h-7 rounded-lg gradient-card mr-3 flex items-center justify-center">
          <span className="text-white text-xs font-bold">FB</span>
        </div>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-brand-400 hover:text-brand-700 hover:bg-brand-50'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full gradient-card flex items-center justify-center">
          <span className="text-white text-xs font-bold">{initials}</span>
        </div>
        <button onClick={logout} className="text-xs text-brand-300 hover:text-brand-600 transition-colors">
          Sign out
        </button>
      </div>
    </nav>
  );
}
