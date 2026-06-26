// GenerateConfirmModal
// ────────────────────
// Confirmation step shown when admin clicks "Generate Schedule" AND there
// are locked sessions in the most recent draft for the current semester.
// Explains what will carry over, gives them a chance to back out, and only
// fires the actual engine run when they confirm.
//
// Skipped entirely when there are no locks - the Generate button calls
// runMutation directly in that case.

import { Lock, AlertTriangle } from 'lucide-react';

export default function GenerateConfirmModal({
  open,
  lockedCount,
  draftId,
  semester,
  onConfirm,
  onCancel,
  isPending,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-[#0e1626] border border-amber-500/30 rounded-3xl shadow-2xl shadow-amber-500/10 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/5 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5 text-amber-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-white">
              Carry over {lockedCount} locked session{lockedCount !== 1 ? 's' : ''}?
            </h3>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300/80 mt-0.5">
              From Draft #{draftId} · Semester {semester}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3 text-sm text-white/70 leading-relaxed">
          <p>
            Draft #{draftId} has{' '}
            <span className="font-black text-white">{lockedCount}</span> locked
            session{lockedCount !== 1 ? 's' : ''}. They will be{' '}
            <span className="font-bold text-amber-300">preserved in their current positions</span>{' '}
            in the new proposal.
          </p>
          <p className="text-xs text-white/40">
            If you don't want this, click cancel, then unlock the relevant
            sessions in Draft #{draftId} before generating again.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-widest text-white/60 hover:text-white transition-all disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-black uppercase tracking-widest text-amber-200 transition-all disabled:opacity-30 inline-flex items-center gap-1.5"
          >
            <Lock className="w-3 h-3" />
            {isPending ? 'Generating...' : 'Generate with locks'}
          </button>
        </div>
      </div>
    </div>
  );
}