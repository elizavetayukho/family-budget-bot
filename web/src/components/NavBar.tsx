
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

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <span className="font-semibold text-gray-700 mr-4">💰 Family Budget</span>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{user?.name}</span>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
