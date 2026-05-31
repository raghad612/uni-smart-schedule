import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, FormField, inputClass, selectClass, getErrorMessage } from './shared';

export default function SubjectsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', credits: 1.5, sessions_per_week: 1 });

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/subjects/').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/subjects/', data),
    onSuccess: () => { toast.success('Subject created.'); qc.invalidateQueries(['subjects']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/subjects/${id}`, data),
    onSuccess: () => { toast.success('Subject updated.'); qc.invalidateQueries(['subjects']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openAdd = () => {
    setForm({ code: '', name: '', credits: 1.5, sessions_per_week: 1 });
    setModal('add');
  };

  const openEdit = (s) => {
    setForm({ code: s.code, name: s.name, credits: s.credits, sessions_per_week: s.sessions_per_week });
    setModal(s);
  };

  const handleSubmit = () => {
    const payload = {
      ...form,
      credits: parseFloat(form.credits),
      sessions_per_week: parseFloat(form.sessions_per_week),
    };
    if (modal === 'add') createMutation.mutate(payload);
    else updateMutation.mutate({ id: modal.id, data: payload });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{subjects.length} subjects registered</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">
          + Add Subject
        </button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {subjects.map(s => (
          <div key={s.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold">{s.name} <span className="text-blue-400 text-sm">({s.code})</span></p>
              <p className="text-[11px] text-white/30">{s.credits} credits · {s.sessions_per_week} sessions/week</p>
            </div>
            <button onClick={() => openEdit(s)} className="text-[11px] bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all">Edit</button>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Subject' : 'Edit Subject'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <FormField label="Subject Code">
              <input className={inputClass} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="CS101" />
            </FormField>
            <FormField label="Subject Name">
              <input className={inputClass} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Introduction to Programming" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Credits">
                <input type="number" step="0.5" className={inputClass} value={form.credits}
                  onChange={e => setForm(p => ({ ...p, credits: e.target.value }))} min={0.5} />
              </FormField>
              <FormField label="Sessions / Week">
                <input type="number" step="0.5" className={inputClass} value={form.sessions_per_week}
                  onChange={e => setForm(p => ({ ...p, sessions_per_week: e.target.value }))} min={0.5} />
              </FormField>
            </div>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2"
            >
              {modal === 'add' ? 'Create Subject' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
