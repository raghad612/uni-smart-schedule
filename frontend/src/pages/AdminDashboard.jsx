import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';
import Footer from '../components/Footer';

const slotDetails = {
  1: { label: 'Session 1', time: '08:00–09:40' },
  2: { label: 'Session 2', time: '09:55–11:35' },
  3: { label: 'Session 3', time: '12:00–13:40' },
  4: { label: 'Session 4', time: '14:00–15:40' },
  5: { label: 'Session 5', time: '16:00–17:40' },
};
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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

function StatCard({ icon, label, value, sub, color }) {
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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [semester, setSemester] = useState('2024-2');
  const [activeProposal, setActiveProposal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Step 1: fetch instructors
  const { data: instructors = [], isLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });

  // Step 2: fetch availability for each instructor
  // instructor IDs are in the query key so this re-runs when instructors change
  const instructorIds = instructors.map(i => i.id);

  const { data: allAvailability = [] } = useQuery({
    queryKey: ['all-availability', instructorIds],
    queryFn: async () => {
      const results = await Promise.all(
        instructorIds.map(id =>
          api.get(`/availability/${id}`)
            .then(r => ({ instructor_id: id, count: r.data.length }))
            .catch(() => ({ instructor_id: id, count: 0 }))
        )
      );
      return results;
    },
    enabled: instructorIds.length > 0,
  });

  // true = submitted at least one slot, false = nothing submitted
  const availabilityMap = Object.fromEntries(
    allAvailability.map(a => [a.instructor_id, a.count > 0])
  );

  // Step 3: fetch active proposal details (only when one is selected)
  const { data: proposal } = useQuery({
    queryKey: ['proposal', activeProposal],
    queryFn: () => api.get(`/proposals/${activeProposal}`).then(r => r.data),
    enabled: !!activeProposal,
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ['conflicts', activeProposal],
    queryFn: () => api.get(`/proposals/${activeProposal}/conflicts`).then(r => r.data),
    enabled: !!activeProposal,
  });

  const runMutation = useMutation({
    mutationFn: () => api.post('/scheduling/run', { semester, notes, simulation: false }),
    onSuccess: (res) => {
      setActiveProposal(res.data.proposal_id);
      toast.success(`Schedule generated! ${res.data.assignments_count} classes placed.`);
      queryClient.invalidateQueries({ queryKey: ['all-availability'] });
    },
    onError: (e) => {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(d => d.msg).join(', ')
        : detail || 'Error during generation.';
      toast.error(msg);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/approve`),
    onSuccess: () => {
      toast.success('Proposal approved successfully!');
      queryClient.invalidateQueries({ queryKey: ['proposal', activeProposal] });
    },
    onError: () => toast.error('Failed to approve proposal.'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/reject`),
    onSuccess: () => {
      toast.success('Proposal marked as rejected.');
      queryClient.invalidateQueries({ queryKey: ['proposal', activeProposal] });
    },
    onError: () => toast.error('Failed to reject proposal.'),
  });

  const filteredInstructors = instructors.filter(i =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const submittedCount = instructors.filter(i => availabilityMap[i.id]).length;

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
      <Navbar onLogout={() => { removeToken(); navigate('/login'); }} />

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Instructors" value={instructors.length} sub="Total registered" color="#60a5fa" icon="👥" />
          <StatCard label="Responses" value={submittedCount} sub={`${instructors.length - submittedCount} pending`} color="#34d399" icon="✅" />
          <StatCard label="Conflicts" value={activeProposal ? conflicts.length : 0} sub="Issues to resolve" color="#f87171" icon="⚠️" />
          <StatCard label="Semester" value={semester} sub="Active period" color="#a78bfa" icon="📅" />
        </div>

        <div className="grid lg:grid-cols-12 gap-8">

          {/* Left panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 shadow-xl">
              <h2 className="text-lg font-bold mb-4 text-white/90">Scheduling Engine</h2>
              <div className="space-y-4">
                <input
                  value={semester}
                  onChange={e => setSemester(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none"
                  placeholder="Semester (ex: 2024-2)"
                />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
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
                <button
                  onClick={() => navigate('/proposals')}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-[10px] text-white/40 hover:text-white uppercase tracking-widest transition-all"
                >
                  🗂 View History & Archives
                </button>
                <button
                  onClick={() => navigate('/data')}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-[10px] text-white/40 hover:text-white uppercase tracking-widest transition-all"
                >
                  ⚙️ Manage Data
                </button>
              </div>
            </div>

            {/* Instructor status panel */}
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold uppercase text-[11px] tracking-widest text-white/40">
                  Instructor Status
                </h3>
                <input
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none w-24"
                />
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {isLoading
                  ? <SkeletonRow />
                  : filteredInstructors.map(i => (
                    <div
                      key={i.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          availabilityMap[i.id] ? 'bg-green-500' : 'bg-orange-500 animate-pulse'
                        }`} />
                        <div>
                          <p className="text-xs font-semibold">{i.name}</p>
                          <p className="text-[10px] opacity-30 uppercase">{i.type}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        availabilityMap[i.id]
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-orange-500/10 text-orange-400'
                      }`}>
                        {availabilityMap[i.id] ? 'Submitted' : 'Pending'}
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Right panel — timetable */}
          <div className="lg:col-span-8">
            {conflicts.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="text-red-400 font-bold text-sm">
                      Action Required: {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected
                    </h4>
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
                  {proposal && (
                    <span className="text-[10px] text-white/40 block mt-1">
                      Status: <span className="text-blue-400 font-bold uppercase">{proposal.status}</span>
                    </span>
                  )}
                </div>

                {proposal && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending || proposal.status === 'approved'}
                      className="bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase disabled:opacity-30"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending || proposal.status === 'rejected'}
                      className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase disabled:opacity-30"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => navigate(`/schedule?proposalId=${activeProposal}`)}
                      className="bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase border border-white/10"
                    >
                      Full View
                    </button>
                    <span className="text-[10px] bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40">
                      REF: #{proposal.id}
                    </span>
                  </div>
                )}
              </div>

              {!proposal ? (
                <div className="flex flex-col items-center justify-center h-[400px] opacity-20 border-2 border-dashed border-white/10 rounded-3xl text-center p-10">
                  <div className="text-5xl mb-4">🗓️</div>
                  <p className="text-sm font-medium">No schedule generated yet.</p>
                  <p className="text-xs mt-2">Run the engine to generate a schedule.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-2">
                    <thead>
                      <tr>
                        <th className="text-left p-2 text-[9px] uppercase opacity-20 tracking-widest font-black">
                          Timeline
                        </th>
                        {days.map(d => (
                          <th key={d} className="p-2 text-[9px] uppercase opacity-20 font-black tracking-[0.2em]">
                            {d}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5].map(slotNum => (
                        <tr key={slotNum}>
                          <td className="p-2 border-r border-white/5 text-left min-w-[110px]">
                            <div className="text-[11px] font-black text-blue-400 uppercase tracking-tighter">
                              {slotDetails[slotNum].label}
                            </div>
                            <div className="text-[9px] font-medium text-white/30 mt-0.5">
                              {slotDetails[slotNum].time}
                            </div>
                          </td>
                          {days.map((_, dayIdx) => {
                            // slot IDs: Monday slot1=1, Monday slot2=2 ... Tuesday slot1=6 ...
                            const slotId = dayIdx * 5 + slotNum;
                            const assignment = proposal.assignments?.find(a => a.slot_id === slotId);
                            return (
                              <td key={dayIdx} className="min-w-[130px]">
                                {assignment ? (
                                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all cursor-pointer">
                                    <div className="text-[9px] font-black text-blue-400 truncate uppercase tracking-tighter mb-1">
                                      {assignment.subject_name}
                                    </div>
                                    <div className="text-[10px] font-bold text-white/90 truncate leading-tight">
                                      {assignment.instructor_name}
                                    </div>
                                    <div className="text-[8px] text-white/20 mt-1.5 uppercase font-bold">
                                      Rm: {assignment.room_name}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-16 rounded-2xl bg-white/[0.01] border border-white/[0.03] flex items-center justify-center opacity-10">
                                    <span className="text-[8px] font-black tracking-widest italic uppercase">Free</span>
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
      <Footer />
    </div>
  );
}