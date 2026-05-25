import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import { removeToken } from '../utils/auth';
import Footer from '../components/Footer';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const sessionTimes = {
  1: '08:00–09:40',
  2: '09:55–11:35',
  3: '12:00–13:40',
  4: '14:00–15:40',
  5: '16:00–17:40',
};

export default function ScheduleViewer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const proposalId = searchParams.get('proposalId');
  const [filter, setFilter] = useState('');

  const { data: proposal, isLoading, isError } = useQuery({
    queryKey: ['proposal', proposalId],
    queryFn: () => api.get(`/proposals/${proposalId}`).then(r => r.data),
    enabled: !!proposalId,
  });

  const handlePrint = () => window.print();

  const getAssignment = (slotId) => {
    const a = proposal?.assignments?.find(x => x.slot_id === slotId);
    if (!a) return null;
    if (filter && !a.instructor_name.toLowerCase().includes(filter.toLowerCase()) &&
                 !a.subject_name.toLowerCase().includes(filter.toLowerCase())) {
      return { ...a, faded: true };
    }
    return a;
  };

  if (!proposalId) return (
    <div className="min-h-screen bg-[#070d1a] flex flex-col items-center justify-center text-white/40 gap-4">
      <p className="text-sm">No proposal selected.</p>
      <button onClick={() => navigate('/proposals')} className="text-xs text-blue-400 hover:underline">
        ← Go to Proposal List
      </button>
    </div>
  );

  if (isLoading) return (
    <div className="min-h-screen bg-[#070d1a] flex items-center justify-center text-blue-400 font-black animate-pulse">
      LOADING MASTER SCHEDULE...
    </div>
  );

  if (isError) return (
    <div className="min-h-screen bg-[#070d1a] flex flex-col items-center justify-center text-white/40 gap-4">
      <p className="text-sm">Failed to load proposal #{proposalId}.</p>
      <button onClick={() => navigate('/proposals')} className="text-xs text-blue-400 hover:underline">
        ← Go to Proposal List
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070d1a] text-white font-sans print:bg-white print:text-black">

      <nav className="flex items-center justify-between px-8 py-4 bg-[#0a1628]/50 backdrop-blur-md sticky top-0 z-50 border-b border-white/5 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/20 text-white">S</div>
          <div>
            <h2 className="text-sm font-bold leading-tight uppercase tracking-tight">SmartSchedule</h2>
            <p className="text-[10px] text-blue-400/50 tracking-widest uppercase font-black">Master Viewer</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search Professor or Subject..."
              className="bg-white/5 border border-white/10 rounded-full px-5 py-2 text-xs outline-none focus:border-blue-500/50 w-72 transition-all"
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button onClick={handlePrint} className="bg-white/5 hover:bg-white/10 p-2 rounded-xl border border-white/10 transition-all">
            🖨️
          </button>
          <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
          <button onClick={() => navigate('/proposals')} className="text-xs font-black uppercase tracking-widest text-blue-400 hover:text-white transition-colors">History</button>
          <button onClick={() => navigate('/admin')} className="text-xs font-black uppercase tracking-widest text-blue-400 hover:text-white transition-colors">Dashboard</button>
          <button onClick={() => { removeToken(); navigate('/login'); }} className="text-xs bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all font-bold">Sign out</button>
        </div>
      </nav>

      <main className="max-w-[1500px] mx-auto px-8 py-10">

        <div className="flex flex-col md:flex-row gap-6 mb-10 items-start justify-between">
          <div>
            <h1 className="text-4xl font-black mb-2 tracking-tighter italic uppercase">Master Schedule</h1>
            <p className="text-white/30 text-sm font-medium">
              Proposal <span className="text-blue-400">#{proposal?.id}</span> — Semester <span className="text-white/60">{proposal?.semester}</span>
              <span className="ml-4 text-[10px] uppercase font-black px-2 py-0.5 rounded-full"
                style={{
                  background: proposal?.status === 'approved' ? 'rgba(52,211,153,0.1)' : 'rgba(96,165,250,0.1)',
                  color: proposal?.status === 'approved' ? '#34d399' : '#60a5fa',
                }}>
                {proposal?.status}
              </span>
            </p>
          </div>
        </div>

        <div className="bg-[#0a1628] rounded-[3rem] border border-white/5 p-6 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] -mr-64 -mt-64" />

          <div className="overflow-x-auto relative z-10">
            <table className="w-full border-separate border-spacing-4">
              <thead>
                <tr>
                  <th className="w-32"></th>
                  {days.map(d => (
                    <th key={d} className="pb-6">
                      <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20">{d}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(slot => (
                  <tr key={slot}>
                    <td className="pr-8 py-6 border-r border-white/5 text-right">
                      <div className="text-xs font-black text-blue-400 uppercase tracking-tighter">Session {slot}</div>
                      <div className="text-[10px] opacity-20 font-mono mt-1">{sessionTimes[slot]}</div>
                    </td>

                    {days.map((_, di) => {
                      const slotId = di * 5 + slot;
                      const a = getAssignment(slotId);

                      return (
                        <td key={di} className="min-w-[200px]">
                          {a ? (
                            <div className={`p-5 rounded-[2rem] transition-all duration-500 border ${a.faded ? 'opacity-10 scale-95 blur-[1px]' : 'opacity-100 scale-100 shadow-2xl shadow-black/40'}
                              ${a.conflicted ? 'bg-red-500/10 border-red-500/30' : 'bg-white/[0.03] border-white/10 hover:border-blue-500/40 hover:bg-blue-500/[0.02]'}`}
                            >
                              <div className="flex justify-between items-start mb-3">
                                <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-lg uppercase tracking-tighter border border-blue-500/20">
                                  {a.room_name}
                                </span>
                                {a.conflicted && <span className="animate-bounce">⚠️</span>}
                              </div>
                              <div className="text-[12px] font-black text-white mb-1 line-clamp-2 uppercase leading-tight tracking-tight">
                                {a.subject_name}
                              </div>
                              <div className="text-[10px] text-white/40 font-bold italic">
                                Dr. {a.instructor_name}
                              </div>
                            </div>
                          ) : (
                            <div className="h-28 rounded-[2rem] bg-white/[0.01] border border-dashed border-white/[0.05] flex items-center justify-center group hover:bg-white/[0.02] transition-all">
                              <span className="text-[9px] font-black text-white/[0.03] group-hover:text-white/10 tracking-[0.4em] uppercase">Free</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-12 flex justify-between items-center text-[10px] text-white/20 uppercase font-black tracking-[0.2em] print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            System Status: Operational
          </div>
          <div><Footer /></div>
        </div>
      </main>
    </div>
  );
}