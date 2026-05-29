export default function AdminNavbar({ onLogout }) {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-[#0a1628] border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/20 border border-blue-500/30">
          <span className="text-blue-400 font-bold">S</span>
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">
          SmartSchedule <span className="text-blue-400">Admin</span>
        </span>
      </div>
      <button
        onClick={onLogout}
        className="text-xs px-4 py-2 rounded-lg text-white/40 border border-white/10 hover:text-white transition-colors"
      >
        Sign out
      </button>
    </nav>
  );
}