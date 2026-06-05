import { useNavigate } from 'react-router-dom';

const slotDetails = {
  1: { label: 'Session 1', time: '08:00–09:40', period: 'morning' },
  2: { label: 'Session 2', time: '09:55–11:35', period: 'morning' },
  3: { label: 'Session 3', time: '12:00–13:40', period: 'morning' },
  4: { label: 'Session 4', time: '14:00–15:40', period: 'afternoon' },
  5: { label: 'Session 5', time: '16:00–17:40', period: 'afternoon' },
};

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TimetablePreview({
  proposal,
  conflicts,
  activeProposal,
  onApprove,
  onReject,
  isApprovePending,
  isRejectPending,
}) {
  const navigate = useNavigate();

  // Split conflicts into two categories:
  // 1. no_available_slot → show in banner (these have slot_id = null, nothing to highlight)
  // 2. instructor_double_booked / room_double_booked → highlight cells red (these have slot_id)
  const noSlotConflicts = conflicts.filter(c => c.conflict_type === 'no_available_slot');
  const cellConflicts = conflicts.filter(
    c => c.conflict_type !== 'no_available_slot' && c.slot_id != null
  );
  const conflictSlotIds = new Set(cellConflicts.map(c => c.slot_id));

  return (
    <div className="lg:col-span-8">

      {/* ── Unscheduled Courses Banner ── */}
      {noSlotConflicts.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xl">📋</span>
            <div>
              <h4 className="text-yellow-400 font-bold text-sm">
                {noSlotConflicts.length} Course{noSlotConflicts.length !== 1 ? 's' : ''} Could Not Be Scheduled
              </h4>
              <p className="text-[10px] text-yellow-400/60 uppercase tracking-wider">
                No available slot was found for these courses — all submitted slots were already taken
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {noSlotConflicts.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/15 rounded-xl px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-yellow-300 capitalize">
                    {c.instructor_name || 'Unknown Instructor'}
                  </span>
                  <span className="text-[10px] text-white/50">
                    {c.subject_name || 'Unknown Subject'}
                    {c.section_label ? ` · ${c.section_label}` : ''}
                  </span>
                </div>
                <span className="text-[8px] font-black text-yellow-500/50 uppercase tracking-widest">
                  Unscheduled
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Double-booked Conflict Banner ── */}
      {cellConflicts.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="text-red-400 font-bold text-sm">
                {cellConflicts.length} Scheduling Conflict{cellConflicts.length !== 1 ? 's' : ''} Detected
              </h4>
              <p className="text-[10px] text-red-400/60 uppercase tracking-wider">
                Cells highlighted in red — same instructor or room assigned twice in the same slot
              </p>
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

      {/* ── Combined banner when BOTH types exist ── */}
      {noSlotConflicts.length > 0 && cellConflicts.length === 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => navigate(`/conflicts/${activeProposal}`)}
            className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-[10px] font-bold px-4 py-2 rounded-lg transition-all border border-yellow-500/20 uppercase tracking-wider"
          >
            View All Conflict Details →
          </button>
        </div>
      )}

      <div className="bg-[#0a1628] rounded-[2.5rem] border border-white/10 p-8 shadow-2xl min-h-[600px]">

        {/* Header row */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold italic text-blue-400">Master Timetable Preview</h2>
            {proposal && (
              <span className="text-[10px] text-white/40 block mt-1">
                Proposal #{proposal.id} ·{' '}
                <span className={`font-bold uppercase ${
                  proposal.status === 'approved' ? 'text-green-400' :
                  proposal.status === 'rejected' ? 'text-red-400' : 'text-blue-400'
                }`}>{proposal.status}</span>
              </span>
            )}
          </div>

          {proposal && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={onApprove}
                disabled={isApprovePending || proposal.status === 'approved'}
                className="bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase disabled:opacity-30"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                disabled={isRejectPending || proposal.status === 'rejected' || proposal.status === 'approved'}
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
            </div>
          )}
        </div>

        {/* Legend */}
        {proposal && (
          <div className="flex flex-wrap gap-4 mb-6 p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500/40 border border-blue-500/50" />
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Assigned class</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/40" />
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Slot conflict</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-yellow-500/20 border border-yellow-500/30" />
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Unscheduled course</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm border border-dashed border-white/10" />
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Free slot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-orange-500/10 border border-orange-500/20" />
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Morning</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-purple-500/10 border border-purple-500/20" />
              <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Afternoon</span>
            </div>
          </div>
        )}

        {/* Empty state */}
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
                {[1, 2, 3, 4, 5].map(slotNum => {
                  const isMorning = slotDetails[slotNum].period === 'morning';
                  return (
                    <tr key={slotNum}>
                      <td className="p-2 border-r border-white/5 text-left min-w-[110px]">
                        <div className="text-[11px] font-black text-blue-400 uppercase tracking-tighter">
                          {slotDetails[slotNum].label}
                        </div>
                        <div className="text-[9px] font-medium text-white/30 mt-0.5">
                          {slotDetails[slotNum].time}
                        </div>
                        <div className={`mt-1 text-[7px] font-black px-1.5 py-0.5 rounded w-fit uppercase tracking-wider ${
                          isMorning ? 'bg-orange-500/10 text-orange-500/60' : 'bg-purple-500/10 text-purple-400/60'
                        }`}>
                          {isMorning ? 'Morning' : 'Afternoon'}
                        </div>
                      </td>
                      {days.map((_, dayIdx) => {
                        const slotId = dayIdx * 5 + slotNum;
                        const assignment = proposal.assignments?.find(a => a.slot_id === slotId);
                        const hasConflict = conflictSlotIds.has(slotId);

                        return (
                          <td key={dayIdx} className="min-w-[130px]">
                            {assignment ? (
                              <div className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                                hasConflict
                                  ? 'bg-red-500/15 border-red-500/40 hover:bg-red-500/25'
                                  : 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
                              }`}>
                                {hasConflict && (
                                  <div className="text-[7px] font-black text-red-400 uppercase tracking-widest mb-1">
                                    ⚠ Conflict
                                  </div>
                                )}
                                <div className={`text-[9px] font-black truncate uppercase tracking-tighter mb-1 ${
                                  hasConflict ? 'text-red-400' : 'text-blue-400'
                                }`}>
                                  {assignment.subject_name}
                                </div>
                                <div className="text-[10px] font-bold text-white/90 truncate leading-tight capitalize">
                                  {assignment.instructor_name}
                                </div>
                                <div className="text-[8px] text-white/20 mt-1.5 uppercase font-bold">
                                  Rm: {assignment.room_name}
                                </div>
                              </div>
                            ) : (
                              <div className={`h-16 rounded-2xl border border-dashed flex items-center justify-center ${
                                isMorning
                                  ? 'bg-orange-500/[0.02] border-orange-500/10'
                                  : 'bg-purple-500/[0.02] border-purple-500/10'
                              }`}>
                                <span className="text-[7px] font-black tracking-widest text-white/10 uppercase">
                                  Free
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
