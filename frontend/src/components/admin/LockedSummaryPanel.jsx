// LockedSummaryPanel
// ──────────────────
// Shown on the AdminDashboard above the "Generate Schedule" button.
// Tells the admin which draft holds the locks that will carry over on the
// next engine run, and how many. Hidden entirely when there are no locks
// to carry, so the dashboard stays clean for fresh-start workflows.
//
// Pure presentational: the data fetch lives in AdminDashboard so the
// Generate-click handler can branch on the count without re-fetching.

import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

export default function LockedSummaryPanel({ summary }) {
  const navigate = useNavigate();

  if (!summary || summary.locked_count === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
          <Lock className="w-4 h-4 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-300 mb-1">
            Locked sessions will carry over
          </p>
          <p className="text-xs text-white/70 leading-relaxed mb-2">
            Draft #{summary.most_recent_draft_id} has{' '}
            <span className="font-black text-white">{summary.locked_count}</span>{' '}
            locked session{summary.locked_count !== 1 ? 's' : ''} for semester{' '}
            <span className="font-mono text-white/90">{summary.semester}</span>.
            They will be preserved in the new proposal when you generate.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/schedule?proposalId=${summary.most_recent_draft_id}`)}
            className="text-[10px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200 transition-colors"
          >
            View Draft #{summary.most_recent_draft_id} →
          </button>
        </div>
      </div>
    </div>
  );
}