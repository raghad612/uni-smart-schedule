import { useNavigate } from 'react-router-dom';

const slotDetails = {
  1: { label: 'Session 1', time: '08:00–09:40' },
  2: { label: 'Session 2', time: '09:55–11:35' },
  3: { label: 'Session 3', time: '12:00–13:40' },
  4: { label: 'Session 4', time: '14:00–15:40' },
  5: { label: 'Session 5', time: '16:00–17:40' },
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

  return (
    <div className="lg:col-span-8">

      {/* Conflict alert banner */}
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

        {/* Header row */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-xl font-bold italic text-blue-400">Master Timetable Preview</h2>
            {proposal && (
              <span className="text-[10px] text-white/40 block mt-1">
                Status:{' '}
                <span className="text-blue-400 font-bold uppercase">{proposal.status}</span>
              </span>
            )}
          </div>

          {proposal && (
            <div className="flex items-center gap-2">
              <button
                onClick={onApprove}
                disabled={isApprovePending || proposal.status === 'approved'}
                className="bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all uppercase disabled:opacity-30"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                disabled={
                  isRejectPending ||
                  proposal.status === 'rejected' ||
                  proposal.status === 'approved'
                }
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
                              <span className="text-[8px] font-black tracking-widest italic uppercase">
                                Free
                              </span>
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
  );
}