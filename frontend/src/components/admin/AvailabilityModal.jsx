import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';

const slotDetails = {
  1: { label: 'Session 1', time: '08:00–09:40' },
  2: { label: 'Session 2', time: '09:55–11:35' },
  3: { label: 'Session 3', time: '12:00–13:40' },
  4: { label: 'Session 4', time: '14:00–15:40' },
  5: { label: 'Session 5', time: '16:00–17:40' },
};

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const prefConfig = {
  PREFERRED: { label: 'Preferred', short: 'P', color: '#34d399', bg: 'rgba(52,211,153,0.13)', border: 'rgba(52,211,153,0.35)' },
  AVAILABLE: { label: 'Available', short: 'A', color: '#60a5fa', bg: 'rgba(96,165,250,0.13)', border: 'rgba(96,165,250,0.35)' },
  BUSY:      { label: 'Busy',      short: 'B', color: '#f87171', bg: 'rgba(248,113,113,0.13)', border: 'rgba(248,113,113,0.35)' },
  NONE:      { label: 'Not set',   short: '–', color: 'rgba(255,255,255,0.12)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)' },
};

export default function AvailabilityModal({ instructor, onClose }) {
  const { data: availability = [], isLoading } = useQuery({
    queryKey: ['availability', instructor.id],
    queryFn: () => api.get(`/availability/${instructor.id}`).then(r => r.data),
  });

  const slotMap = Object.fromEntries(
    availability.map(a => [a.slot_id, a.preference])
  );

  const submittedCount = availability.filter(
    a => a.preference === 'PREFERRED' || a.preference === 'AVAILABLE'
  ).length;

  const requirementMet = submittedCount >= instructor.required_sessions;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a1628] border border-white/10 rounded-[2rem] p-8 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="font-bold text-xl text-white">{instructor.name}</h3>
            <p className="text-[11px] uppercase tracking-widest text-white/30 mt-1">
              {instructor.type} · {instructor.required_sessions} sessions required / week
            </p>
            {!isLoading && (
              <p className="text-xs mt-2">
                <span className={`font-bold ${requirementMet ? 'text-green-400' : 'text-orange-400'}`}>
                  {submittedCount} available / preferred slots submitted
                  {requirementMet
                    ? ' — requirement met ✓'
                    : ` — needs ${instructor.required_sessions - submittedCount} more`}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white text-2xl leading-none transition-colors ml-4"
          >
            ✕
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6 p-3 rounded-xl bg-white/[0.02] border border-white/5">
          {Object.entries(prefConfig).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black"
                style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, color: cfg.color }}
              >
                {cfg.short}
              </div>
              <span className="text-[10px] text-white/40 uppercase font-bold">{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="text-center py-10 text-blue-400 animate-pulse text-sm">
            Loading availability...
          </div>
        ) : availability.length === 0 ? (
          <div className="text-center py-10 rounded-2xl border border-dashed border-white/10">
            <p className="text-white/30 text-sm">
              This instructor has not submitted availability yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-2">
              <thead>
                <tr>
                  <th className="text-left p-2 text-[9px] uppercase opacity-20 tracking-widest font-black w-28" />
                  {days.map(d => (
                    <th key={d} className="p-2 text-[9px] uppercase opacity-20 font-black tracking-[0.15em] text-center">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(slotNum => (
                  <tr key={slotNum}>
                    <td className="p-2 border-r border-white/5">
                      <div className="text-[10px] font-black text-blue-400 uppercase">
                        {slotDetails[slotNum].label}
                      </div>
                      <div className="text-[9px] text-white/20 mt-0.5">
                        {slotDetails[slotNum].time}
                      </div>
                    </td>
                    {days.map((_, dayIdx) => {
                      const slotId = dayIdx * 5 + slotNum;
                      const pref = slotMap[slotId] || 'NONE';
                      const cfg = prefConfig[pref];
                      return (
                        <td key={dayIdx} className="text-center">
                          <div
                            className="mx-auto h-14 rounded-xl flex flex-col items-center justify-center"
                            style={{
                              background: cfg.bg,
                              border: `1.5px solid ${cfg.border}`,
                              color: cfg.color,
                            }}
                          >
                            <span className="text-sm font-black">{cfg.short}</span>
                            <span className="text-[8px] font-bold opacity-50 uppercase">{cfg.label}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}