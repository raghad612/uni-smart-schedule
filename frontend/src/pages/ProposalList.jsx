import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import Footer from '../components/Footer';
import AdminNavbar from '../components/admin/AdminNavbar';

export default function ProposalList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['proposals'],
    queryFn: () => api.get('/proposals/').then(r => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/proposals/${id}/approve`),
    onSuccess: () => {
      toast.success('Proposal approved. All others for this semester rejected.');
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
    onError: (e) => {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to approve proposal.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => api.post(`/proposals/${id}/reject`),
    onSuccess: () => {
      toast.success('Proposal rejected.');
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
    onError: (e) => {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to reject proposal.');
    },
  });

  const statusStyle = (status) => {
    if (status === 'approved') return { bg: 'rgba(52,211,153,0.1)', color: '#34d399' };
    if (status === 'rejected') return { bg: 'rgba(248,113,113,0.1)', color: '#f87171' };
    return { bg: 'rgba(96,165,250,0.1)', color: '#60a5fa' };
  };

  return (
    <div className="min-h-screen" style={{ background: '#070d1a', color: 'white' }}>
      <AdminNavbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Page header — stacks vertically on phone */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 sm:mb-10">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter mb-1">Schedule History</h1>
            <p className="text-xs sm:text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Manage and review all generated schedule versions.
            </p>
          </div>
          <button
            onClick={() => navigate('/admin')}
            className="text-xs px-5 py-2.5 rounded-xl font-bold transition-all w-full sm:w-auto"
            style={{ background: '#3b82f6', color: 'white', cursor: 'pointer' }}
          >
            + New Generation
          </button>
        </div>

        <div className="grid gap-4">
          {isLoading && (
            <p className="text-center py-20 opacity-30 animate-pulse uppercase tracking-widest text-xs">
              Loading database...
            </p>
          )}

          {!isLoading && proposals.length === 0 && (
            <div
              className="text-center py-20 rounded-[2.5rem]"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-sm text-white/30">No proposals found. Start by generating one from the dashboard.</p>
            </div>
          )}

          {proposals.map((p) => {
            const { bg, color } = statusStyle(p.status);
            const isPending = approveMutation.isPending || rejectMutation.isPending;

            return (
              <div
                key={p.id}
                className="p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] transition-all hover:bg-white/[0.02]"
                style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                {/* Top section: ID + info + status badge.
                    Phone: stacks (ID row → text → badge).
                    Desktop: ID left, info middle, status right. */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 mb-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-mono font-bold text-blue-400 flex-shrink-0 text-sm"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      #{p.id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base sm:text-lg text-white">Semester {p.semester}</h3>
                      <p className="text-[10px] uppercase font-black tracking-widest text-white/20 break-words">
                        Created: {new Date(p.created_at).toLocaleDateString()}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </p>
                    </div>
                  </div>

                  <span
                    className="text-xs uppercase font-black tracking-widest px-3 py-1 rounded-full w-fit"
                    style={{ background: bg, color }}
                  >
                    {p.status}
                  </span>
                </div>

                {/* Action buttons — 2x2 grid on phone, single row on desktop */}
                <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 pt-4 border-t border-white/5">
                  <button
                    onClick={() => navigate(`/schedule?proposalId=${p.id}`)}
                    className="text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl transition-all"
                  >
                    View Schedule
                  </button>
                  <button
                    onClick={() => navigate(`/conflicts/${p.id}`)}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                  >
                    View Conflicts
                  </button>

                  {p.status !== 'approved' && (
                    <button
                      onClick={() => approveMutation.mutate(p.id)}
                      disabled={isPending}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                      style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}
                    >
                      Approve
                    </button>
                  )}

                  {p.status !== 'rejected' && (
                    <button
                      onClick={() => rejectMutation.mutate(p.id)}
                      disabled={isPending}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                      style={{ background: 'rgba(248,113,113,0.05)', color: '#f87171', border: '1px solid rgba(248,113,113,0.15)' }}
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Footer />
    </div>
  );
}