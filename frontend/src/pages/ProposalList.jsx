import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import { removeToken } from '../utils/auth';

export default function ProposalList() {
  const navigate = useNavigate();

  // Récupération de toutes les propositions
  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['proposals'],
    queryFn: () => api.get('/proposals/').then(r => r.data),
  });

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  return (
    <div className="min-h-screen" style={{ background: '#070d1a', color: 'white' }}>
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4"
        style={{ background: '#0a1628', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm cursor-pointer" onClick={() => navigate('/admin')}>
            UniSchedule
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
            History
          </span>
        </div>
        <div className="flex gap-4">
           <button onClick={() => navigate('/admin')} className="text-xs text-white/50 hover:text-white transition-colors">
             Dashboard
           </button>
           <button onClick={handleLogout} className="text-xs text-red-400/70 hover:text-red-400 transition-colors">
             Sign out
           </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex justify-between items-end mb-10">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter mb-1">Schedule History</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Manage and review all generated schedule versions.
            </p>
          </div>
          <button 
            onClick={() => navigate('/admin')}
            className="text-xs px-5 py-2.5 rounded-xl font-bold transition-all"
            style={{ background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer' }}>
            + New Generation
          </button>
        </div>

        {/* List of Proposals */}
        <div className="grid gap-4">
          {isLoading && (
            <p className="text-center py-20 opacity-30 animate-pulse uppercase tracking-widest text-xs">
              Loading database...
            </p>
          )}

          {!isLoading && proposals.length === 0 && (
            <div className="text-center py-20 rounded-[2.5rem]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px border-dashed rgba(255,255,255,0.1)' }}>
              <p className="text-sm text-white/30">No proposals found. Start by generating one from the dashboard.</p>
            </div>
          )}

          {proposals.map((p) => (
            <div key={p.id} className="group flex items-center justify-between p-6 rounded-[2rem] transition-all hover:bg-white/[0.02]"
              style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.05)' }}>
              
              <div className="flex items-center gap-6">
                {/* ID Badge */}
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-mono font-bold text-blue-400"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  #{p.id}
                </div>

                {/* Info */}
                <div>
                  <h3 className="font-bold text-lg text-white">Semester {p.semester}</h3>
                  <p className="text-[10px] uppercase font-black tracking-widest text-white/20">
                    Created: {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Status & Actions */}
              <div className="flex items-center gap-8">
                {/* Quick Conflict Stats */}
                <div className="text-center">
                  <div className={`text-sm font-bold ${p.conflicts_count > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {p.conflicts_count}
                  </div>
                  <div className="text-[9px] uppercase font-black text-white/20 tracking-tighter">Conflicts</div>
                </div>

                {/* Navigation Buttons */}
                <div className="flex gap-2">
                  {/* Dans ton map qui affiche les propositions */}
              <button 
                     onClick={() => navigate('/schedule')} // On enlève l'ID ici
                     className="text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl transition-all" >
                View Schedule
             </button>
                  
                  {p.conflicts_count > 0 && (
                    <button 
                      onClick={() => navigate(`/conflicts/${p.id}`)}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer' }}>
                      Fix Errors
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}