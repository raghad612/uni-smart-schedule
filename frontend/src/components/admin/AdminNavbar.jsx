import { useNavigate, useLocation } from 'react-router-dom';
import { removeToken } from '../../utils/auth';

const NAV_LINKS = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'Data',      path: '/data' },
  { label: 'Proposals', path: '/proposals' },
];

export default function AdminNavbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  return (
    <nav className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0a1628] border-b border-white/5">

      {/* Left — LU logo + app name */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <img
          src="/lu-logo.png"
          alt=""
          className="h-9 w-9 rounded-lg object-contain bg-white/5 p-0.5"
        />
        <div className="hidden sm:block">
          <p className="text-white font-bold text-sm leading-tight tracking-tight">
            SmartSchedule
          </p>
          <p className="text-blue-400 text-[10px] font-semibold leading-tight tracking-wide">
            Faculty of Sciences I
          </p>
        </div>
      </div>

      {/* Centre — nav links */}
      <div className="flex items-center gap-1">
        {NAV_LINKS.map(({ label, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                isActive
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Right — sign out */}
      <button
        onClick={handleLogout}
        className="text-xs px-3 sm:px-4 py-2 rounded-lg text-white/40 border border-white/10 hover:text-white hover:border-white/20 transition-colors flex-shrink-0"
      >
        Sign out
      </button>
    </nav>
  );
}