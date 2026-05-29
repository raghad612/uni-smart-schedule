import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';
import Footer from '../components/Footer';

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

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  const statusStyle = (status) => {
    if (status === 'approved') return { bg: 'rgba(52,211,153,0.1)', color: '#34d399' };
    if (status === 'rejected') return { bg: 'rgba(248,113,113,0.1)', color: '#f87171' };
    return { bg: 'rgba(96,165,250,0.1)', color: '#60a5fa' };
  };

  return (
    <div className="min-h-screen" style={{ background: '#070d1a', color: 'white' }}>
      <nav
        className="flex items-center justify-between px-6 py-4"
        style={{ background: '#0a1628', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-white font-semibold text-sm cursor-pointer"
            onClick={() => navigate('/admin')}
          >
            UniSchedule
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
          >
            History
          </span>
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate('/admin')} className="text-xs text-white/50 hover:text-white transition-colors">
            Dashboard
          </button>
          <button onClick={handleLogout} className="text-xs text-red-400/70 hover:text-red-400 transition-colors">
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter mb-1">Schedule History</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Manage and review all generated schedule versions.
            </p>
          </div>
          <button
            onClick={() => navigate('/admin')}
            className="text-xs px-5 py-2.5 rounded-xl font-bold transition-all"
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
                className="p-6 rounded-[2rem] transition-all hover:bg-white/[0.02]"
                style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                {/* Top row — ID, semester, date, status badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-6">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-mono font-bold text-blue-400 flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      #{p.id}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">Semester {p.semester}</h3>
                      <p className="text-[10px] uppercase font-black tracking-widest text-white/20">
                        Created: {new Date(p.created_at).toLocaleDateString()}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </p>
                    </div>
                  </div>

                  <span
                    className="text-xs uppercase font-black tracking-widest px-3 py-1 rounded-full"
                    style={{ background: bg, color }}
                  >
                    {p.status}
                  </span>
                </div>

                {/* Bottom row — action buttons */}
                <div className="flex items-center gap-2 pt-4 border-t border-white/5">
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

                  {/* Approve — only show if not already approved */}
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

                  {/* Reject — only show if not already rejected */}
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