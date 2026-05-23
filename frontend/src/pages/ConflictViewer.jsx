import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';

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

  if (isLoading) return (
    <div className="min-h-screen bg-[#070d1a] flex items-center justify-center text-blue-400">
      Analysing conflicts...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070d1a] text-white p-8">

      <div className="max-w-4xl mx-auto mb-10 flex justify-between items-end">
        <div>
          <button
            onClick={() => navigate('/proposals')}
            className="text-xs text-blue-400 mb-4 block hover:underline"
          >
            ← Back to Proposal List
          </button>
          <h1 className="text-3xl font-black">Conflict Report</h1>
          <p className="text-white/40 text-sm">Proposal #{proposalId}</p>
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
          conflicts.map((conflict) => {
            const isResolved = !!conflict.resolution;
            const isExpanded = expandedId === conflict.id;

            return (
              <div
                key={conflict.id}
                className={`bg-[#0a1628] border rounded-[2rem] p-6 shadow-xl transition-all ${
                  isResolved ? 'border-green-500/20 opacity-60' : 'border-white/5 hover:border-red-500/30'
                }`}
              >
                <div className="flex items-start gap-5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner flex-shrink-0 ${
                    isResolved ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    {isResolved ? '✅' : '⚠️'}
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className={`font-bold text-lg transition-colors ${isResolved ? 'text-green-400' : 'text-white'}`}>
                          {conflict.conflict_type === 'INSTRUCTOR_DOUBLE_BOOKED'
                            ? 'Instructor Double-Booked'
                            : conflict.conflict_type === 'ROOM_DOUBLE_BOOKED'
                            ? 'Room Double-Booked'
                            : conflict.conflict_type}
                        </h3>
                        <p className="text-xs font-mono text-white/30 uppercase tracking-widest">
                          Slot ID: {conflict.slot_id} • Detected: {new Date(conflict.detected_at).toLocaleString()}
                        </p>
                      </div>
                      <span className={`text-[10px] px-3 py-1 rounded-full border font-black uppercase tracking-widest ${
                        isResolved
                          ? 'bg-green-500/10 border-green-500/20 text-green-400'
                          : 'bg-white/5 border-white/10 text-white/40'
                      }`}>
                        {isResolved ? 'Resolved' : 'Open'}
                      </span>
                    </div>

                    {isResolved && (
                      <div className="bg-green-500/5 border border-green-500/10 rounded-2xl p-4 mt-3">
                        <p className="text-xs text-green-400/80">
                          <strong>Resolution:</strong> {conflict.resolution}
                        </p>
                      </div>
                    )}

                    {!isResolved && (
                      <div className="mt-4 pt-4 border-t border-white/5">
                        {!isExpanded ? (
                          <button
                            onClick={() => setExpandedId(conflict.id)}
                            className="text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-blue-600 px-4 py-2 rounded-lg transition-all"
                          >
                            Resolve This Conflict
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <textarea
                              value={resolutionText[conflict.id] || ''}
                              onChange={(e) => setResolutionText(prev => ({ ...prev, [conflict.id]: e.target.value }))}
                              placeholder="Describe how this conflict was resolved..."
                              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none resize-none h-20"
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

      <div className="max-w-4xl mx-auto mt-12 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
        <p className="text-[11px] text-blue-400/60 leading-relaxed italic text-center">
          Note: Conflicts are caused by hard constraints (instructor unavailability or room overlaps).
          Resolve each conflict by noting the corrective action taken, then re-run the engine if needed.
        </p>
      </div>
    </div>
  );
}