import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';

export default function ConflictViewer() {
  const { proposalId } = useParams();
  const navigate = useNavigate();

  // On récupère les détails de la proposition (qui contient les logs de conflits)
  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal-conflicts', proposalId],
    queryFn: () => api.get(`/proposals/${proposalId}`).then(r => r.data),
  });

  if (isLoading) return <div className="min-h-screen bg-[#070d1a] flex items-center justify-center text-blue-400">Analysing conflicts...</div>;

  const conflicts = proposal?.conflicts || [];

  return (
    <div className="min-h-screen bg-[#070d1a] text-white p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-10 flex justify-between items-end">
        <div>
          <button 
            onClick={() => navigate('/admin')}
            className="text-xs text-blue-400 mb-4 block hover:underline"
          >
            ← Back to Admin Dashboard
          </button>
          <h1 className="text-3xl font-black">Conflict Report</h1>
          <p className="text-white/40 text-sm">Proposal #{proposalId} — {proposal?.semester}</p>
        </div>
        <div className="bg-red-500/20 border border-red-500/30 px-4 py-2 rounded-xl text-center">
          <div className="text-2xl font-bold text-red-500">{conflicts.length}</div>
          <div className="text-[10px] uppercase font-black text-red-500/60">Issues found</div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-4">
        {conflicts.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-[2rem] border border-dashed border-white/10">
            <span className="text-4xl mb-4 block">🎉</span>
            <p className="text-white/40">No conflicts detected. This schedule is valid!</p>
          </div>
        ) : (
          conflicts.map((conflict, index) => (
            <div 
              key={index} 
              className="group bg-[#0a1628] border border-white/5 rounded-[2rem] p-6 hover:border-red-500/30 transition-all shadow-xl"
            >
              <div className="flex items-start gap-5">
                {/* Icon Column */}
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xl shadow-inner">
                  ⚠️
                </div>

                {/* Info Column */}
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg text-white group-hover:text-red-400 transition-colors">
                        {conflict.type === 'INSTRUCTOR_BUSY' ? 'Instructor Unavailable' : 'Overlap Conflict'}
                      </h3>
                      <p className="text-xs font-mono text-white/30 uppercase tracking-widest">
                        {conflict.day} • Slot {conflict.slot_id}
                      </p>
                    </div>
                    <span className="text-[10px] bg-white/5 px-3 py-1 rounded-full border border-white/10 text-white/40">
                      Severity: High
                    </span>
                  </div>

                  <div className="bg-black/20 rounded-2xl p-4 mt-4 border border-white/5">
                    <p className="text-sm leading-relaxed text-white/70">
                      <strong className="text-white">Issue:</strong> {conflict.message}
                    </p>
                  </div>

                  {/* Contact Action (Simulé) */}
                  <div className="mt-6 pt-6 border-t border-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">
                        {conflict.instructor_name?.charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-white/60">Dr. {conflict.instructor_name}</span>
                    </div>
                    
                    <a 
                      href={`mailto:instructor@university.edu?subject=Schedule Conflict - ${conflict.day}`}
                      className="text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-blue-600 px-4 py-2 rounded-lg transition-all"
                    >
                      Contact Instructor
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Note */}
      <div className="max-w-4xl mx-auto mt-12 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
        <p className="text-[11px] text-blue-400/60 leading-relaxed italic text-center">
          Note: Conflicts are caused by hard constraints (Instructor unavailability or overlaps). 
          Please contact the concerned instructors to negotiate a different slot before re-running the engine.
        </p>
      </div>
    </div>
  );
}