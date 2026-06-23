// Schedule viewer with manual slot swapping
// Click a filled cell to select it (yellow), click another cell to move it there
// Calls PUT /proposals/{id}/assignments/{assignment_id} with new slot_id

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';
import AdminNavbar from '../components/admin/AdminNavbar';
import Footer from '../components/Footer';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const sessionTimes = {
  1: '08:00–09:40',
  2: '09:55–11:35',
  3: '12:00–13:40',
  4: '14:00–15:40',
  5: '16:00–17:40',
};

// Sub-row for the Missing Sessions panel. Owns its own rotation-dropdown
// state so the parent doesn't have to track one per entry.
function MissingSessionRow({ entry, isActive, onPlace, isPending }) {
  const [rotation, setRotation] = useState('ALWAYS');
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${
      isActive
        ? 'bg-emerald-500/10 border-emerald-500/40'
        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
    }`}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white truncate">
          {entry.subjectCode}{entry.subjectName ? ` — ${entry.subjectName}` : ''}
          <span className="text-white/40 font-medium"> · {entry.instructorName}</span>
        </p>
        <p className="text-[10px] text-white/30 mt-0.5">
          {entry.missingCount} session{entry.missingCount > 1 ? 's' : ''} still need{entry.missingCount > 1 ? '' : 's'} to be placed
        </p>
      </div>
      <select
        value={rotation}
        onChange={(e) => setRotation(e.target.value)}
        disabled={isPending}
        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white/70 font-bold outline-none focus:border-white/30 disabled:opacity-30"
        title="Week rotation for this placement"
      >
        <option value="ALWAYS" className="bg-slate-900 text-white">Every week</option>
        <option value="WEEK_A" className="bg-slate-900 text-white">Week A only</option>
        <option value="WEEK_B" className="bg-slate-900 text-white">Week B only</option>
      </select>
      <button
        onClick={() => onPlace(entry, rotation)}
        disabled={isPending}
        className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-lg transition-all ${
          isActive
            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
            : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
        } disabled:opacity-30`}
      >
        {isActive ? 'Selected' : 'Place'}
      </button>
    </div>
  );
}

export default function ScheduleViewer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const proposalId = searchParams.get('proposalId');

  const [filter, setFilter] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  // { courseInstanceId, instructorName, subjectName, subjectCode, rotation }
  // Mutually exclusive with selectedAssignment - setting one clears the other.
  const [pendingPlacement, setPendingPlacement] = useState(null);

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

  // Place a missing session (POST /proposals/{id}/assignments).
  // On 409 errors we deliberately keep pendingPlacement set so the admin can
  // immediately click another cell without re-clicking the Place button.
  // On success, if the course still has missing sessions we stay in placement
  // mode (rapid-fire); if it's complete the entry disappears and we exit.
  const createMutation = useMutation({
    mutationFn: ({ courseInstanceId, slotId, rotation }) =>
      api.post(`/proposals/${proposalId}/assignments`, {
        course_instance_id: courseInstanceId,
        slot_id: slotId,
        week_rotation: rotation || 'ALWAYS',
      }),
    onSuccess: (res, variables) => {
      toast.success('Session placed.');
      queryClient.setQueryData(['proposal', proposalId], res.data);
      queryClient.invalidateQueries({ queryKey: ['conflicts', proposalId] });
      const stillMissing = (res.data.conflicts || []).some(
        c => c.conflict_type === 'incomplete_assignment'
          && c.course_instance_id === variables.courseInstanceId
      );
      if (!stillMissing) {
        setPendingPlacement(null);
      }
    },
    onError: (e) => {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to place session.', { duration: 6000 });
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

  // Parse incomplete_assignment conflicts into placeable entries for the
  // Missing Sessions panel. The backend stores the canonical "(X missing)"
  // wording in details, so we extract the count directly from that string.
  const missingSessions = (proposal?.conflicts || [])
    .filter(c => c.conflict_type === 'incomplete_assignment')
    .map(c => {
      const missMatch = (c.details || '').match(/\((\d+) missing\)/);
      const codeMatch = (c.details || '').match(/^([A-Z0-9_]+)/);
      return {
        conflictId: c.id,
        courseInstanceId: c.course_instance_id,
        instructorName: c.instructor_name,
        subjectName: c.subject_name,
        subjectCode: codeMatch ? codeMatch[1] : '',
        missingCount: missMatch ? parseInt(missMatch[1], 10) : 1,
      };
    });

const getAssignments = (slotId) => {
    const all = (proposal?.assignments || []).filter(x => x.slot_id === slotId);
    if (all.length === 0 || !filter) return { items: all, faded: false };

    const matches = (a) =>
      a.instructor_name?.toLowerCase().includes(filter.toLowerCase()) ||
      a.subject_name?.toLowerCase().includes(filter.toLowerCase());

    if (all.some(matches)) {
      return { items: all.filter(matches), faded: false };
    }
    return { items: all, faded: true };
  };

  const handleCellClick = (slotId, assignment) => {
    if (isApproved) return;

    // Mode 1: placing a missing session
    if (pendingPlacement) {
      // Clicking an existing assignment cancels placement and switches to move mode
      if (assignment && !assignment.faded) {
        setPendingPlacement(null);
        setSelectedAssignment(assignment);
        toast('Switched to move mode.', { icon: '👆', duration: 2500 });
        return;
      }
      // Empty cell: place the session there
      createMutation.mutate({
        courseInstanceId: pendingPlacement.courseInstanceId,
        slotId,
        rotation: pendingPlacement.rotation,
      });
      return;
    }

    // Mode 2: moving an existing assignment
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

  // Called by the "Place" button on each Missing Sessions row.
  // Mutually exclusive with selectedAssignment - clears move mode if active.
  const startPlacement = (entry, rotation) => {
    setSelectedAssignment(null);
    setPendingPlacement({
      courseInstanceId: entry.courseInstanceId,
      instructorName: entry.instructorName,
      subjectName: entry.subjectName,
      subjectCode: entry.subjectCode,
      rotation: rotation || 'ALWAYS',
    });
    toast('Click an empty slot to place the session.', { icon: '📍', duration: 3000 });
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

                <AdminNavbar />

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
          
        </div>
      </nav>

      <main className="max-w-[1500px] mx-auto px-8 py-10 print:max-w-none print:px-0 print:py-0">

        {/* Missing-sessions panel - only shown when there are incomplete_assignment conflicts */}
        {!isApproved && missingSessions.length > 0 && (
          <div className="mb-6 px-5 py-4 rounded-2xl border bg-red-500/5 border-red-500/20 print:hidden">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚠</span>
              <p className="text-sm font-bold text-red-400">
                Missing Sessions ({missingSessions.length})
              </p>
            </div>
            <div className="space-y-2">
              {missingSessions.map((entry) => (
                <MissingSessionRow
                  key={entry.conflictId}
                  entry={entry}
                  isActive={pendingPlacement?.courseInstanceId === entry.courseInstanceId}
                  onPlace={startPlacement}
                  isPending={createMutation.isPending}
                />
              ))}
            </div>
            <p className="text-[10px] text-white/30 mt-3">
              Click <span className="text-red-300/80 font-bold">Place</span> on a row, then click any empty cell in the grid to drop the session there.
            </p>
          </div>
        )}

        {/* Edit mode banner — hidden on print */}
        {!isApproved && (
          <div className={`mb-6 px-5 py-3 rounded-2xl border flex items-center justify-between print:hidden ${
            pendingPlacement
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : selectedAssignment
              ? 'bg-yellow-500/10 border-yellow-500/30'
              : 'bg-blue-500/10 border-blue-500/20'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-lg">{pendingPlacement ? '📍' : selectedAssignment ? '👆' : '✏️'}</span>
              <div>
                <p className={`text-sm font-bold ${
                  pendingPlacement ? 'text-emerald-400'
                    : selectedAssignment ? 'text-yellow-400'
                    : 'text-blue-400'
                }`}>
                  {pendingPlacement
                    ? `Placing: ${pendingPlacement.subjectCode || pendingPlacement.subjectName} (${pendingPlacement.instructorName}${pendingPlacement.rotation !== 'ALWAYS' ? `, ${pendingPlacement.rotation === 'WEEK_A' ? 'Week A' : 'Week B'}` : ''})`
                    : selectedAssignment
                    ? `Moving: ${selectedAssignment.subject_name} (${selectedAssignment.instructor_name})`
                    : 'Edit Mode — Click any assigned cell to move it'}
                </p>
                <p className="text-[10px] text-white/30">
                  {pendingPlacement
                    ? 'Click any empty slot in the grid to place this session. Click an existing assignment to switch to move mode.'
                    : selectedAssignment
                    ? 'Click an empty slot to place it there, or click another assignment to swap them. Click the same cell to cancel.'
                    : 'Approved proposals cannot be edited. Clone first to create an editable copy.'}
                </p>
              </div>
            </div>
            {(pendingPlacement || selectedAssignment) && (
              <button
                onClick={() => { setSelectedAssignment(null); setPendingPlacement(null); }}
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
                      const { items, faded } = getAssignments(slotId);
                      const hasConflict = conflictSlotIds.has(slotId);
                      const isTarget = (!!selectedAssignment || !!pendingPlacement) && items.length === 0;

                      return (
                        <td key={di} className="min-w-[180px] align-top print:min-w-0 print:border print:border-gray-300">
                          {items.length > 0 && !faded ? (
                            <div className="space-y-2 print:space-y-0">
                              {items.map((a) => {
                                const isSelected = selectedAssignment?.id === a.id;
                                const rotation = a.week_rotation;
                                const showBadge = rotation === 'WEEK_A' || rotation === 'WEEK_B';
                                return (
                                  <div
                                    key={a.id}
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
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-lg uppercase border border-blue-500/20">
                                          {a.room_name || '–'}
                                        </span>
                                        {showBadge && (
                                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase border ${
                                            rotation === 'WEEK_A'
                                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                              : 'bg-pink-500/20 text-pink-300 border-pink-500/30'
                                          }`}>
                                            {rotation === 'WEEK_A' ? 'Week A' : 'Week B'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {hasConflict && <span className="text-xs">⚠️</span>}
                                        {isSelected && <span className="text-xs">✋</span>}
                                      </div>
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
                                      {showBadge && (
                                        <span className="ml-1 text-[7px]">
                                          ({rotation === 'WEEK_A' ? 'Wk A' : 'Wk B'})
                                        </span>
                                      )}
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
                                );
                              })}
                            </div>
                          ) : items.length > 0 && faded ? (
                            <div className="h-28 rounded-[2rem] bg-white/[0.01] border border-white/5 opacity-10 print:h-12 print:rounded-none" />
                          ) : (
                            <div
                              onClick={() => (selectedAssignment || pendingPlacement) && handleCellClick(slotId, null)}
                              className={`h-28 rounded-[2rem] border transition-all flex items-center justify-center print:h-12 print:rounded-none print:border-0 ${
                                isTarget && !isApproved
                                  ? pendingPlacement
                                    ? 'border-emerald-500/40 bg-emerald-500/5 cursor-pointer hover:bg-emerald-500/10 hover:border-emerald-500/60'
                                    : 'border-blue-500/40 bg-blue-500/5 cursor-pointer hover:bg-blue-500/10 hover:border-blue-500/60'
                                  : 'border-dashed border-white/[0.05] bg-white/[0.01]'
                              }`}
                            >
                              {isTarget && !isApproved ? (
                                <span className={`text-[10px] font-black uppercase tracking-widest print:hidden ${
                                  pendingPlacement ? 'text-emerald-400/70' : 'text-blue-400/60'
                                }`}>
                                  {pendingPlacement ? 'Drop here' : 'Place here'}
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
       <div className="mt-8 grid grid-cols-3 items-center text-[10px] text-white/20 uppercase font-black tracking-[0.2em] print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            System Status: Operational
          </div>
          <div className="flex justify-center">
            <Footer />
          </div>
          <div />
        </div>
      </main>
    </div>
  );
}
