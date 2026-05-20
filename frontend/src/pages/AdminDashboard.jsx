import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';

// --- CONSTANTES COHÉRENTES AVEC LA BASE DE DONNÉES (1h30 par session) ---
const slotDetails = {
  1: { label: 'Session 1', time: '08:00–09:30' }, 
  2: { label: 'Session 2', time: '09:45–11:15' }, 
  3: { label: 'Session 3', time: '11:30–13:00' }, 
  4: { label: 'Session 4', time: '13:45–15:15' }, 
  5: { label: 'Session 5', time: '15:30–17:00' }, 
};
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// --- SOUS-COMPOSANTS ---

const SkeletonRow = () => (
  <div className="h-12 w-full bg-white/5 rounded-xl animate-pulse mb-2 border border-white/5" />
);

function Navbar({ onLogout }) {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-[#0a1628] border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/20 border border-blue-500/30">
          <span className="text-blue-400 font-bold">S</span>
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">SmartSchedule <span className="text-blue-400">Admin</span></span>
      </div>
      <button onClick={onLogout} className="text-xs px-4 py-2 rounded-lg text-white/40 border border-white/10 hover:text-white transition-colors">
        Sign out
      </button>
    </nav>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-widest text-white/30">{label}</span>
        <div className="p-2 rounded-lg" style={{ background: `${color}15`, color: color }}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      {sub && <div className="text-[10px] text-white/30 uppercase tracking-tighter">{sub}</div>}
    </div>
  );
}

// --- COMPOSANT PRINCIPAL ---

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  
  // Synchronisé sur ton jeu de données de test (seed_test_data.sql)
  const [semester, setSemester] = useState('2024-2'); 
  const [activeProposal, setActiveProposal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // API : /instructors/ (List Instructors)
  const { data: instructors = [], isLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });

  // API : /proposals/{proposal_id} (Get Proposal)
  const { data: proposal } = useQuery({
    queryKey: ['proposal', activeProposal],
    queryFn: () => api.get(`/proposals/${activeProposal}`).then(r => r.data),
    enabled: !!activeProposal,
  });

  // API : /proposals/{proposal_id}/conflicts (List Conflicts)
  const { data: conflicts = [] } = useQuery({
    queryKey: ['conflicts', activeProposal],
    queryFn: () => api.get(`/proposals/${activeProposal}/conflicts`).then(r => r.data),
    enabled: !!activeProposal,
  });

  // API : /scheduling/run (Run Scheduling Engine)
  const runMutation = useMutation({
    mutationFn: () => api.post('/scheduling/run', { semester, notes, simulation: false }),
    onSuccess: (res) => {
      setActiveProposal(res.data.proposal_id);
      toast.success(`Schedule generated! ${res.data.assignments_count} classes placed.`);
    },
    onError: () => toast.error('Error during generation.'),
  });

  // API : /proposals/{proposal_id}/approve (Approve Proposal)
  const approveMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/approve`),
    onSuccess: () => {
      toast.success('Proposal approved successfully!');
      queryClient.invalidateQueries(['proposal', activeProposal]);
    },
    onError: () => toast.error('Failed to approve proposal.'),
  });

  // API : /proposals/{proposal_id}/reject (Reject Proposal)
  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/reject`),
    onSuccess: () => {
      toast.error('Proposal marked as rejected.');
      queryClient.invalidateQueries(['proposal', activeProposal]);
    },
    onError: () => toast.error('Failed to reject proposal.'),
  });

  const filteredInstructors = instructors.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const submittedCount = instructors.filter(i => i.availability_submitted).length;

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
      <Navbar onLogout={() => { removeToken(); navigate('/login'); }} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Instructors" value={instructors.length} sub="Total registered" color="#60a5fa" icon="👥" />
          <StatCard label="Responses" value={submittedCount} sub={`${instructors.length - submittedCount} pending`} color="#34d399" icon="✅" />
          <StatCard label="Conflicts" value={activeProposal ? conflicts.length : 0} sub="Issues to resolve" color="#f87171" icon="⚠️" />
          <StatCard label="Semester" value={semester} sub="Active period" color="#a78bfa" icon="📅" />
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-4 space-y-6">
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 shadow-xl">
              <h2 className="text-lg font-bold mb-4 text-white/90">Scheduling Engine</h2>
              <div className="space-y-4">
                <input 
                  value={semester} onChange={e => setSemester(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none"
                  placeholder="Semester (ex: 2024-2)"
                />
                <textarea 
                  value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none h-24 resize-none"
                  placeholder="Notes for this run..."
                />
                <button 
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-4 rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all text-sm"
                >
                  {runMutation.isPending ? 'Running Engine...' : '⚡ Generate New Schedule'}
                </button>

                {/* Seul ce bouton d'historique reste, ce qui est parfait pour le MVP */}
                <button 
                  onClick={() => navigate('/proposals')}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-[10px] text-white/40 hover:text-white uppercase tracking-widest transition-all"
                >
                  📁 View History & Archives
                </button>
              </div>
            </div>

            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold uppercase text-[11px] tracking-widest text-white/40">Instructors Status</h3>
                <input 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none w-24"
                />
              </div>
              
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {isLoading ? <SkeletonRow /> : filteredInstructors.map(i => (
                  <div key={i.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-3">
                      {i.availability_summary === 'MORNING' && <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">AM</span>}
                      {i.availability_summary === 'AFTERNOON' && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">PM</span>}
                      <div>
                        <p className="text-xs font-semibold">{i.name}</p>
                        <p className="text-[10px] opacity-30 uppercase">{i.type}</p>
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${i.availability_submitted ? 'bg-green-500' : 'bg-orange-500 animate-pulse'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            {conflicts.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="text-red-400 font-bold text-sm">Action Required: {conflicts.length} Conflicts detected</h4>
                    <p className="text-[11px] text-red-400/60 uppercase">Algorithmic overlaps found.</p>
                  </div>
                </div>
                <button 
                  onClick={() => navigate(`/conflicts/${activeProposal}`)}
                  className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-lg transition-all"
                >
                  VIEW LOGS
                </button>
              </div>
            )}

            <div className="bg-[#0a1628] rounded-[2.5rem] border border-white/10 p-8 shadow-2xl min-h-[600px]">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-xl font-bold italic text-blue-400">Master Timetable Preview</h2>
                  {proposal && <span className="text-[10px] text-white/40 block mt-1">Status: <span className="text-blue-400 font-bold uppercase">{proposal.status}</span></span>}
                </div>
                
                {proposal && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending || proposal.status === 'APPROVED'}
                      className="bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase disabled:opacity-30"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending || proposal.status === 'REJECTED'}
                      className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase disabled:opacity-30"
                    >
                      Reject
                    </button>
                    <span className="text-[10px] bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40">REF: #{proposal.id}</span>
                  </div>
                )}
              </div>

              {!proposal ? (
                <div className="flex flex-col items-center justify-center h-[400px] opacity-20 border-2 border-dashed border-white/10 rounded-3xl text-center p-10">
                  <div className="text-5xl mb-4">🗓️</div>
                  <p className="text-sm font-medium">No schedule generated yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-2">
                    <thead>
                      <tr>
                        <th className="text-left p-2 text-[9px] uppercase opacity-20 tracking-widest font-black">Timeline</th>
                        {days.map(d => <th key={d} className="p-2 text-[9px] uppercase opacity-20 font-black tracking-[0.2em]">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5].map(slot => (
                        <tr key={slot}>
                          <td className="p-2 border-r border-white/5 text-left min-w-[110px]">
                            <div className="text-[11px] font-black text-blue-400 uppercase tracking-tighter">
                              {slotDetails[slot].label}
                            </div>
                            <div className="text-[9px] font-medium text-white/30 mt-0.5">
                              {slotDetails[slot].time}
                            </div>
                          </td>
                          {days.map((_, dayIdx) => {
                            const slotId = (dayIdx * 5) + slot; 
                            const assignment = proposal.assignments?.find(a => a.slot_id === slotId);
                            
                            return (
                              <td key={dayIdx} className="min-w-[130px]">
                                {assignment ? (
                                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 group hover:bg-blue-500/20 transition-all cursor-pointer">
                                    <div className="text-[9px] font-black text-blue-400 truncate uppercase tracking-tighter mb-1">{assignment.subject_name}</div>
                                    <div className="text-[10px] font-bold text-white/90 truncate leading-tight">{assignment.instructor_name}</div>
                                    <div className="text-[8px] text-white/20 mt-1.5 flex justify-between uppercase font-bold">
                                      <span>Rm: {assignment.room_name}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-16 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-center justify-center grayscale opacity-10">
                                    <span className="text-[8px] font-black tracking-widest italic uppercase">Void</span>
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}