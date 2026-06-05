// Schedule viewer with manual slot swapping
// Click a filled cell to select it (yellow), click another cell to move it there
// Calls PUT /proposals/{id}/assignments/{assignment_id} with new slot_id

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const proposalId = searchParams.get('proposalId');

  const [filter, setFilter] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const { data: proposal, isLoading, isError } = useQuery({
    queryKey: ['proposal', proposalId],
    queryFn: () => api.get(`/proposals/${proposalId}`).then(r => r.data),
    enabled: !!proposalId,
  });

  const moveMutation = useMutation({
    mutationFn: ({ assignmentId, slotId }) =>
      api.put(`/proposals/${proposalId}/assignments/${assignmentId}`, { slot_id: slotId }),
    onSuccess: () => {
      toast.success('Assignment moved successfully.');
      setSelectedAssignment(null);
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['conflicts', proposalId] });
    },
    onError: (e) => {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to move assignment.', { duration: 5000 });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${proposalId}/clone`),
    onSuccess: (res) => {
      toast.success(`Cloned as new draft proposal #${res.data.id}`);
      navigate(`/schedule?proposalId=${res.data.id}`);
      queryClient.invalidateQueries({ queryKey: ['proposals-list'] });
    },
    onError: () => toast.error('Failed to clone proposal.'),
  });

  const handlePrint = () => window.print();

  const isApproved = proposal?.status === 'approved';
  const conflictSlotIds = new Set(
    (proposal?.conflicts || []).map(c => c.slot_id).filter(Boolean)
  );

  const getAssignment = (slotId) => {
    const a = proposal?.assignments?.find(x => x.slot_id === slotId);
    if (!a) return null;
    if (filter && !a.instructor_name?.toLowerCase().includes(filter.toLowerCase()) &&
                 !a.subject_name?.toLowerCase().includes(filter.toLowerCase())) {
      return { ...a, faded: true };
    }
    return a;
  };

  const handleCellClick = (slotId, assignment) => {
    if (isApproved) return;

    if (!selectedAssignment) {
      if (assignment && !assignment.faded) {
        setSelectedAssignment(assignment);
        toast('Assignment selected. Click an empty slot or another assignment to swap.', { icon: '👆', duration: 3000 });
      }
      return;
    }

    if (selectedAssignment.slot_id === slotId) {
      setSelectedAssignment(null);
      return;
    }

    moveMutation.mutate({ assignmentId: selectedAssignment.id, slotId });
  };

  const parseSectionLabel = () => {
    if (!proposal?.notes) return '';
    const match = proposal.notes.match(/\(([^)]+)\)/);
    if (match) return match[1];
    return proposal.notes.replace(/[\[\]]/g, '').trim();
  };

  const parseSemesterLabel = () => {
    if (!proposal?.semester) return '';
    const parts = proposal.semester.split('-');
    if (parts.length === 2) {
      return `Semester ${parts[1]} — ${parts[0]}/${parseInt(parts[0]) + 1}`;
    }
    return proposal.semester;
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

      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            table-layout: fixed !important;
          }
          th, td {
            min-width: 0 !important;
            padding: 4px !important;
            font-size: 9px !important;
          }
        }
      `}</style>

      {/* Navbar — hidden on print */}
      <nav className="flex items-center justify-between px-8 py-4 bg-[#0a1628]/50 backdrop-blur-md sticky top-0 z-50 border-b border-white/5 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/20 text-white">S</div>
          <div>
            <h2 className="text-sm font-bold leading-tight uppercase tracking-tight">SmartSchedule</h2>
            <p className="text-[10px] text-blue-400/50 tracking-widest uppercase font-black">
              Proposal #{proposal?.id} · {proposal?.status?.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search instructor or subject..."
            className="bg-white/5 border border-white/10 rounded-full px-5 py-2 text-xs outline-none focus:border-blue-500/50 w-64 transition-all"
            onChange={e => setFilter(e.target.value)}
          />
          <button onClick={handlePrint} className="bg-white/5 hover:bg-white/10 p-2 rounded-xl border border-white/10 transition-all" title="Print">
            🖨️
          </button>
          {!isApproved && (
            <button
              onClick={() => cloneMutation.mutate()}
              disabled={cloneMutation.isPending}
              className="text-xs bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-30"
              title="Clone this proposal as a new draft"
            >
              {cloneMutation.isPending ? 'Cloning...' : '⎘ Clone as Draft'}
            </button>
          )}
          <button onClick={() => navigate(`/conflicts/${proposalId}`)} className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl font-bold transition-all">
            ⚠ Conflicts ({proposal?.conflicts?.length || 0})
          </button>
          <button onClick={() => navigate('/proposals')} className="text-xs font-black uppercase tracking-widest text-blue-400 hover:text-white transition-colors">History</button>
          <button onClick={() => navigate('/admin')} className="text-xs font-black uppercase tracking-widest text-blue-400 hover:text-white transition-colors">Dashboard</button>
          <button onClick={() => { removeToken(); navigate('/login'); }} className="text-xs bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all font-bold">Sign out</button>
        </div>
      </nav>

      <main className="max-w-[1500px] mx-auto px-8 py-10 print:max-w-none print:px-0 print:py-0">

        {/* Edit mode banner — hidden on print */}
        {!isApproved && (
          <div className={`mb-6 px-5 py-3 rounded-2xl border flex items-center justify-between print:hidden ${
            selectedAssignment
              ? 'bg-yellow-500/10 border-yellow-500/30'
              : 'bg-blue-500/10 border-blue-500/20'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-lg">{selectedAssignment ? '👆' : '✏️'}</span>
              <div>
                <p className={`text-sm font-bold ${selectedAssignment ? 'text-yellow-400' : 'text-blue-400'}`}>
                  {selectedAssignment
                    ? `Moving: ${selectedAssignment.subject_name} (${selectedAssignment.instructor_name})`
                    : 'Edit Mode — Click any assigned cell to move it'}
                </p>
                <p className="text-[10px] text-white/30">
                  {selectedAssignment
                    ? 'Click an empty slot to place it there, or click another assignment to swap them. Click the same cell to cancel.'
                    : 'Approved proposals cannot be edited. Clone first to create an editable copy.'}
                </p>
              </div>
            </div>
            {selectedAssignment && (
              <button
                onClick={() => setSelectedAssignment(null)}
                className="text-[10px] font-black uppercase bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all text-white/50"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Screen title — hidden on print */}
        <div className="flex flex-col md:flex-row gap-6 mb-8 items-start justify-between print:hidden">
          <div>
            <h1 className="text-4xl font-black mb-2 tracking-tighter italic uppercase">Master Schedule</h1>
            <p className="text-white/30 text-sm font-medium">
              Proposal <span className="text-blue-400">#{proposal?.id}</span>
              {proposal?.notes && <span className="text-white/40"> · {proposal.notes}</span>}
              <span className="ml-3 text-[10px] uppercase font-black px-2 py-0.5 rounded-full"
                style={{
                  background: proposal?.status === 'approved' ? 'rgba(52,211,153,0.1)' : 'rgba(96,165,250,0.1)',
                  color: proposal?.status === 'approved' ? '#34d399' : '#60a5fa',
                }}>
                {proposal?.status}
              </span>
            </p>
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-4 text-center border-b-2 border-black pb-3">
          <h1 className="text-xl font-black uppercase tracking-tight text-black">
            {parseSemesterLabel()}
          </h1>
          <p className="text-base font-semibold mt-1 text-black">
            {parseSectionLabel()}
          </p>
        </div>

        {/* Timetable */}
        <div className="bg-[#0a1628] rounded-[3rem] border border-white/5 p-6 md:p-10 shadow-2xl relative overflow-hidden print:bg-white print:border-black print:rounded-none print:shadow-none print:p-0 print:overflow-visible">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] -mr-64 -mt-64 print:hidden" />

          <div className="overflow-x-auto relative z-10 print:overflow-visible">
            <table className="w-full border-separate border-spacing-4 print:border-spacing-0">
              <thead>
                <tr>
                  <th className="w-32 print:w-20"></th>
                  {days.map(d => (
                    <th key={d} className="pb-6 print:pb-2">
                      <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20 print:text-black print:tracking-normal print:text-xs">
                        {d}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(slot => (
                  <tr key={slot}>
                    <td className="pr-8 py-6 border-r border-white/5 text-right print:pr-2 print:py-1 print:border-r print:border-black">
                      <div className="text-xs font-black text-blue-400 uppercase tracking-tighter print:text-black print:text-[9px]">
                        Session {slot}
                      </div>
                      <div className="text-[10px] opacity-20 font-mono mt-1 print:opacity-100 print:text-[8px] print:text-black">
                        {sessionTimes[slot]}
                      </div>
                    </td>

                    {days.map((_, di) => {
                      const slotId = di * 5 + slot;
                      const a = getAssignment(slotId);
                      const isSelected = selectedAssignment?.slot_id === slotId;
                      const hasConflict = conflictSlotIds.has(slotId);
                      const isTarget = !!selectedAssignment && !isSelected;

                      return (
                        <td key={di} className="min-w-[180px] print:min-w-0 print:border print:border-gray-300">
                          {a && !a.faded ? (
                            <div
                              onClick={() => handleCellClick(slotId, a)}
                              className={`p-4 rounded-[2rem] transition-all duration-300 border cursor-pointer select-none print:rounded-none print:border-0 print:p-1 print:cursor-default ${
                                isSelected
                                  ? 'bg-yellow-500/20 border-yellow-500/60 shadow-lg shadow-yellow-500/20 scale-105'
                                  : hasConflict
                                  ? 'bg-red-500/10 border-red-500/30 hover:border-red-500/60'
                                  : isApproved
                                  ? 'bg-white/[0.03] border-white/10 cursor-default'
                                  : 'bg-white/[0.03] border-white/10 hover:border-blue-500/40 hover:bg-blue-500/[0.04]'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2 print:hidden">
                                <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-lg uppercase border border-blue-500/20">
                                  {a.room_name || '–'}
                                </span>
                                {hasConflict && <span className="text-xs">⚠️</span>}
                                {isSelected && <span className="text-xs">✋</span>}
                              </div>

                              {/* Screen view */}
                              <div className="text-[11px] font-black text-white mb-1 uppercase leading-tight tracking-tight line-clamp-2 print:hidden">
                                {a.subject_name}
                              </div>
                              <div className="text-[10px] text-white/40 font-bold italic capitalize print:hidden">
                                {a.instructor_name}
                              </div>

                              {/* Print view */}
                              <div className="hidden print:block text-[8px] font-black text-black uppercase tracking-tight">
                                {a.subject_code || a.subject_name}
                              </div>
                              <div className="hidden print:block text-[8px] text-black capitalize mt-0.5">
                                {a.instructor_name}
                              </div>
                              <div className="hidden print:block text-[7px] text-gray-500 mt-0.5">
                                {a.room_name || ''}
                              </div>

                              {!isApproved && !isSelected && (
                                <div className="text-[8px] text-white/20 mt-2 uppercase tracking-widest print:hidden">
                                  Click to move
                                </div>
                              )}
                            </div>
                          ) : a && a.faded ? (
                            <div className="h-28 rounded-[2rem] bg-white/[0.01] border border-white/5 opacity-10 print:h-12 print:rounded-none" />
                          ) : (
                            <div
                              onClick={() => selectedAssignment && handleCellClick(slotId, null)}
                              className={`h-28 rounded-[2rem] border transition-all flex items-center justify-center print:h-12 print:rounded-none print:border-0 ${
                                isTarget && !isApproved
                                  ? 'border-blue-500/40 bg-blue-500/5 cursor-pointer hover:bg-blue-500/10 hover:border-blue-500/60'
                                  : 'border-dashed border-white/[0.05] bg-white/[0.01]'
                              }`}
                            >
                              {isTarget && !isApproved ? (
                                <span className="text-[10px] font-black text-blue-400/60 uppercase tracking-widest print:hidden">
                                  Place here
                                </span>
                              ) : (
                                <span className="text-[9px] font-black text-white/[0.03] tracking-[0.4em] uppercase print:hidden">Free</span>
                              )}
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

        <div className="mt-8 flex justify-between items-center text-[10px] text-white/20 uppercase font-black tracking-[0.2em] print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            System Status: Operational
          </div>
          <Footer />
        </div>
      </main>
    </div>
  );
}