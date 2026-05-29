export default function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-widest text-white/30">{label}</span>
        <div className="p-2 rounded-lg text-lg" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      {sub && <div className="text-[10px] text-white/30 uppercase tracking-tighter">{sub}</div>}
    </div>
  );
}