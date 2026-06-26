
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, FormField, inputClass, selectClass, getErrorMessage } from './shared';

export default function InstructorsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
   const [form, setForm] = useState({
    name: '', type: 'FULL_TIME', user_id: ''
  });

const { data: instructors = [], isLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });

  // Includes deactivated instructors too — needed to correctly grey out
  // user accounts that are already linked (even to an inactive profile),
  // since the DB only allows one instructor row per user_id.
  const { data: allInstructors = [] } = useQuery({
    queryKey: ['instructors', 'all'],
    queryFn: () => api.get('/instructors/?include_inactive=true').then(r => r.data),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/admin/users/').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/instructors/', data),
    onSuccess: () => { toast.success('Instructor created.'); qc.invalidateQueries(['instructors']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/instructors/${id}`, data),
    onSuccess: () => { toast.success('Instructor updated.'); qc.invalidateQueries(['instructors']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => api.delete(`/instructors/${id}`),
    onSuccess: () => { toast.success('Instructor deactivated.'); qc.invalidateQueries(['instructors']); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

 const openAdd = () => {
    setForm({ name: '', type: 'FULL_TIME', user_id: '' });
    setModal('add');
  };

const openEdit = (i) => {
    setForm({
      name: i.name, type: i.type,
      user_id: i.user_id || ''
    });
    setModal(i);
  };

const handleSubmit = () => {
    const payload = {
      name: form.name,
      type: form.type,
      user_id: form.user_id ? parseInt(form.user_id) : null,
    };
    if (modal === 'add') createMutation.mutate(payload);
    else updateMutation.mutate({ id: modal.id, data: payload });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{instructors.length} instructors registered</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">
          + Add Instructor
        </button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {instructors.map(i => (
          <div key={i.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
         <div>
              <p className="font-bold capitalize">{i.name}</p>
              <p className="text-[11px] text-white/30 uppercase">
                {i.type}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(i)} className="text-[11px] bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all">Edit</button>
              <button onClick={() => deactivateMutation.mutate(i.id)} className="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-all">Deactivate</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Instructor' : 'Edit Instructor'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <FormField label="Full Name">
              <input
                className={inputClass}
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Dr. John Smith"
              />
            </FormField>
            <FormField label="Type">
              <select className={selectClass} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
              </select>
            </FormField>
            
            <FormField label="Link to User Account (optional)">
              <select
                className={selectClass}
                value={form.user_id}
                onChange={e => setForm(p => ({ ...p, user_id: e.target.value }))}
              >
                <option value="">— Select user —</option>
           {users.filter(u => u.role === 'INSTRUCTOR').map(u => {
                  // Grey out accounts already linked to ANY instructor profile
                  // (active or deactivated) — the DB allows only one per user.
                  const linkedTo = allInstructors.find(
                    i => i.user_id === u.id && i.id !== (modal === 'add' ? null : modal?.id)
                  );
                  const alreadyLinked = !!linkedTo;
                  const label = linkedTo && !linkedTo.is_active
                    ? ' (linked to deactivated instructor)'
                    : alreadyLinked ? ' (already linked)' : '';
                  return (
                    <option key={u.id} value={u.id} disabled={alreadyLinked}>
                      {u.email}{label}
                    </option>
                  );
                })}
              </select>
            </FormField>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2"
            >
              {modal === 'add' ? 'Create Instructor' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
