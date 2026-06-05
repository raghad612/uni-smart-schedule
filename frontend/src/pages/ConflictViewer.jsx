// Conflict viewer — shows enriched conflict details with instructor name,
// subject, section, slot label, and resolution form

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import Footer from '../components/Footer';

// Human-readable conflict type labels
const CONFLICT_LABELS = {
  no_available_slot: 'No Available Slot',
  instructor_double_booked: 'Instructor Double-Booked',
  room_double_booked: 'Room Double-Booked',
};

// Explanation of what each conflict type means
const CONFLICT_EXPLANATIONS = {
  no_available_slot: null, // handled dynamically below — see getNoSlotExplanation()
  instructor_double_booked: 'This instructor was assigned to two different courses in the same time slot within this proposal.',
  room_double_booked: 'The same room was assigned to two different courses in the same time slot.',
};

// Smart message for no_available_slot based on whether the instructor submitted anything
function getNoSlotExplanation(conflict) {
  if (conflict.conflict_type !== 'no_available_slot') return null;
  if (!conflict.instructor_name) {
    return 'Legacy conflict record — re-run the engine to see full details.';
  }
  if (conflict.details && conflict.details.includes('No available slots submitted')) {
    return `${conflict.instructor_name} has not submitted any availability for this semester. Ask them to log in and submit their availability slots before re-running the engine.`;
  }
  return `All availability slots submitted by ${conflict.instructor_name} were already taken by previously approved section schedules. Ask the instructor to log in and submit additional slots, then re-run the engine for this section.`;
}

export default function ConflictViewer() {
  const { proposalId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [resolutionText, setResolutionText] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const { data: conflicts = [], isLoading } = useQuery({
    queryKey: ['conflicts', proposalId],
    queryFn: () => api.get(`/proposals/${proposalId}/conflicts`).then(r => r.data),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ conflictId, resolution }) =>
      api.post(`/conflicts/${conflictId}/resolve`, { resolution }),
    onSuccess: (_, variables) => {
      toast.success('Conflict marked as resolved.');
      setResolutionText(prev => ({ ...prev, [variables.conflictId]: '' }));
      setExpandedId(null);
      queryClient.invalidateQueries(['conflicts', proposalId]);
    },
    onError: () => toast.error('Failed to resolve conflict.'),
  });

  const handleResolve = (conflictId) => {
    const text = resolutionText[conflictId]?.trim();
    if (!text) {
      toast.error('Please enter a resolution note before submitting.');
      return;
    }
    resolveMutation.mutate({ conflictId, resolution: text });
  };

  const openCount = conflicts.filter(c => !c.resolution).length;
  const resolvedCount = conflicts.filter(c => !!c.resolution).length;

  if (isLoading) return (
    <div className="min-h-screen bg-[#070d1a] flex items-center justify-center text-blue-400">
      Analysing conflicts...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070d1a] text-white p-8">

      {/* Header */}
      <div className="max-w-4xl mx-auto mb-10">
        <button
          onClick={() => navigate('/proposals')}
          className="text-xs text-blue-400 mb-4 block hover:underline"
        >
          ← Back to Proposal List
        </button>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black">Conflict Report</h1>
            <p className="text-white/40 text-sm">Proposal #{proposalId}</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-red-500/20 border border-red-500/30 px-4 py-2 rounded-xl text-center min-w-[80px]">
              <div className="text-2xl font-bold text-red-500">{openCount}</div>
              <div className="text-[9px] uppercase font-black text-red-500/60">Open</div>
            </div>
            {resolvedCount > 0 && (
              <div className="bg-green-500/20 border border-green-500/30 px-4 py-2 rounded-xl text-center min-w-[80px]">
                <div className="text-2xl font-bold text-green-500">{resolvedCount}</div>
                <div className="text-[9px] uppercase font-black text-green-500/60">Resolved</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conflict list */}
      <div className="max-w-4xl mx-auto space-y-4">
        {conflicts.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-[2rem] border border-dashed border-white/10">
            <span className="text-4xl mb-4 block">🎉</span>
            <p className="text-white/40">No conflicts detected. This schedule is valid!</p>
          </div>
        ) : (
          conflicts.map((conflict) => {
            const isResolved = !!conflict.resolution;
            const isExpanded = expandedId === conflict.id;
            const label = CONFLICT_LABELS[conflict.conflict_type] || conflict.conflict_type;
            const explanation = CONFLICT_EXPLANATIONS[conflict.conflict_type] || '';

            return (
              <div
                key={conflict.id}
                className={`bg-[#0a1628] border rounded-[2rem] p-6 shadow-xl transition-all ${
                  isResolved
                    ? 'border-green-500/20 opacity-70'
                    : 'border-red-500/20 hover:border-red-500/40'
                }`}
              >
                <div className="flex items-start gap-5">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${
                    isResolved
                      ? 'bg-green-500/10 border border-green-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    {isResolved ? '✅' : '⚠️'}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className={`font-bold text-lg ${isResolved ? 'text-green-400' : 'text-red-400'}`}>
                          {label}
                        </h3>
                        <p className="text-xs text-white/30 mt-0.5">
                          Detected: {new Date(conflict.detected_at).toLocaleString()}
                        </p>
                      </div>
                      <span className={`text-[10px] px-3 py-1 rounded-full border font-black uppercase tracking-widest flex-shrink-0 ml-4 ${
                        isResolved
                          ? 'bg-green-500/10 border-green-500/20 text-green-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}>
                        {isResolved ? 'Resolved' : 'Open'}
                      </span>
                    </div>

                    {/* Conflict details — who, what, where, when */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {conflict.instructor_name && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <p className="text-[9px] uppercase tracking-widest text-white/30 font-black mb-1">Instructor</p>
                          <p className="text-sm font-bold text-white capitalize">{conflict.instructor_name}</p>
                        </div>
                      )}
                      {conflict.subject_name && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <p className="text-[9px] uppercase tracking-widest text-white/30 font-black mb-1">Subject</p>
                          <p className="text-sm font-bold text-white">{conflict.subject_name}</p>
                        </div>
                      )}
                      {conflict.section_label && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <p className="text-[9px] uppercase tracking-widest text-white/30 font-black mb-1">Section</p>
                          <p className="text-sm font-bold text-white">{conflict.section_label}</p>
                        </div>
                      )}
                      {conflict.slot_label ? (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <p className="text-[9px] uppercase tracking-widest text-white/30 font-black mb-1">Time Slot</p>
                          <p className="text-sm font-bold text-white">{conflict.slot_label}</p>
                        </div>
                      ) : conflict.conflict_type === 'no_available_slot' && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <p className="text-[9px] uppercase tracking-widest text-white/30 font-black mb-1">Time Slot</p>
                          <p className="text-sm font-bold text-white/40 italic">Not assigned</p>
                        </div>
                      )}
                    </div>

                    {/* Explanation */}
{!isResolved && (() => {
  const msg = conflict.conflict_type === 'no_available_slot'
    ? getNoSlotExplanation(conflict)
    : CONFLICT_EXPLANATIONS[conflict.conflict_type];
  return msg ? (
    <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl px-4 py-3 mb-4">
      <p className="text-[11px] text-yellow-400/70 leading-relaxed">{msg}</p>
    </div>
  ) : null;
})()}

                    {/* Resolution display */}
                    {isResolved && (
                      <div className="bg-green-500/5 border border-green-500/10 rounded-xl px-4 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-green-400/60 font-black mb-1">Resolution</p>
                        <p className="text-sm text-green-400/80">{conflict.resolution}</p>
                      </div>
                    )}

                    {/* Resolve form */}
                    {!isResolved && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        {!isExpanded ? (
                          <button
                            onClick={() => setExpandedId(conflict.id)}
                            className="text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-blue-600 px-4 py-2 rounded-lg transition-all"
                          >
                            Mark as Resolved
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <textarea
                              value={resolutionText[conflict.id] || ''}
                              onChange={e => setResolutionText(prev => ({ ...prev, [conflict.id]: e.target.value }))}
                              placeholder="Describe how this conflict was resolved (e.g. instructor manually reassigned, re-run engine after updating availability)..."
                              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none resize-none h-24"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolve(conflict.id)}
                                disabled={resolveMutation.isPending}
                                className="text-[10px] font-black uppercase tracking-widest bg-green-600 hover:bg-green-500 disabled:opacity-30 px-4 py-2 rounded-lg transition-all"
                              >
                                {resolveMutation.isPending ? 'Saving...' : 'Confirm Resolution'}
                              </button>
                              <button
                                onClick={() => setExpandedId(null)}
                                className="text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-all text-white/40"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="max-w-4xl mx-auto mt-8 flex gap-4">
        <button
          onClick={() => navigate(`/schedule?proposalId=${proposalId}`)}
          className="text-xs bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl font-bold transition-all"
        >
          View & Edit Schedule
        </button>
        <button
          onClick={() => navigate('/proposals')}
          className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl font-bold transition-all text-white/50"
        >
          Back to Proposals
        </button>
      </div>

      <div className="max-w-4xl mx-auto mt-8">
        <Footer />
      </div>
    </div>
  );
}