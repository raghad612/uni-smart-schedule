import { useNavigate, useLocation } from 'react-router-dom';
import { removeToken } from '../../utils/auth';

const NAV_LINKS = [
  { label: 'Dashboard', short: 'Home', path: '/admin' },
  { label: 'Data',      short: 'Data', path: '/data' },
  { label: 'Proposals', short: 'Prop', path: '/proposals' },
];

export default function AdminNavbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  return (
    <nav className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-[#0a1628] border-b border-white/5 print:hidden">
      {/* Logo + app name */}
      <button
        onClick={() => navigate('/admin')}
        className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
        title="SmartSchedule"
      >
        <img
          src="/lu-logo.png"
          alt=""
          className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg object-contain bg-white/5 p-0.5"
        />
        <div className="hidden md:block text-left">
          <p className="text-white font-bold text-sm leading-tight tracking-tight">
            SmartSchedule
          </p>
          <p className="text-blue-400 text-[10px] font-semibold leading-tight tracking-wide">
            Faculty of Sciences I
          </p>
        </div>
      </button>

      {/* Nav links — compact labels on phone, full on tablet+ */}
      <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
        {NAV_LINKS.map(({ label, short, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`px-2 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest transition-all ${
                isActive
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Sign out — icon only on phone, full label on tablet+ */}
      <button
        onClick={handleLogout}
        className="text-[10px] sm:text-xs px-2 sm:px-4 py-2 rounded-lg text-white/40 border border-white/10 hover:text-white hover:border-white/20 transition-colors flex-shrink-0"
        title="Sign out"
      >
        <span className="sm:hidden">sign out</span>
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </nav>
  );
}