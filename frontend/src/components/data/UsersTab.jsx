
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, FormField, inputClass, selectClass, getErrorMessage } from './shared';

export default function UsersTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'INSTRUCTOR' });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/admin/users/').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/admin/users/', data),
    onSuccess: () => { toast.success('User account created.'); qc.invalidateQueries(['users']); setModal(false); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => api.put(`/admin/users/${id}/deactivate`),
    onSuccess: () => { toast.success('User deactivated.'); qc.invalidateQueries(['users']); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{users.length} user accounts</p>
        <button
          onClick={() => { setForm({ email: '', password: '', role: 'INSTRUCTOR' }); setModal(true); }}
          className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
        >
          + Add User
        </button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold">{u.email}</p>
              <p className="text-[11px] text-white/30 uppercase">
                {u.role} · {u.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
            {u.is_active && u.role !== 'ADMIN' && (
              <button
                onClick={() => deactivateMutation.mutate(u.id)}
                className="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-all"
              >
                Deactivate
              </button>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Create User Account" onClose={() => setModal(false)}>
          <div className="space-y-4">
            <FormField label="Email Address">
              <input type="email" className={inputClass} value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="instructor@university.edu" />
            </FormField>
            <FormField label="Password">
              <input type="password" className={inputClass} value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Temporary password" />
            </FormField>
            <FormField label="Role">
              <select className={selectClass} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <option value="INSTRUCTOR">Instructor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </FormField>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2"
            >
              Create Account
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
