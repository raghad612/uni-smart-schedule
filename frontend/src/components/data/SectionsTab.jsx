import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, FormField, inputClass, selectClass, getErrorMessage } from './shared';

export default function SectionsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ year_level: 1, language: 'ENGLISH', group_label: '', default_room_id: '' });

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/sections/').then(r => r.data),
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms/').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/sections/', data),
    onSuccess: () => { toast.success('Section created.'); qc.invalidateQueries(['sections']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/sections/${id}`, data),
    onSuccess: () => { toast.success('Section updated.'); qc.invalidateQueries(['sections']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openAdd = () => {
    setForm({ year_level: 1, language: 'ENGLISH', group_label: '', default_room_id: '' });
    setModal('add');
  };

  const openEdit = (s) => {
    setForm({
      year_level: s.year_level, language: s.language,
      group_label: s.group_label, default_room_id: s.default_room_id || ''
    });
    setModal(s);
  };

  const handleSubmit = () => {
    const payload = {
      ...form,
      year_level: parseInt(form.year_level),
      default_room_id: form.default_room_id ? parseInt(form.default_room_id) : null,
    };
    if (modal === 'add') createMutation.mutate(payload);
    else updateMutation.mutate({ id: modal.id, data: payload });
  };

  // Group sections by year for cleaner display
  const byYear = sections.reduce((acc, s) => {
    if (!acc[s.year_level]) acc[s.year_level] = [];
    acc[s.year_level].push(s);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{sections.length} sections registered</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">
          + Add Section
        </button>
      </div>

      <div className="space-y-6">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {Object.entries(byYear).sort(([a], [b]) => a - b).map(([year, secs]) => (
          <div key={year}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2 px-1">Year {year}</p>
            <div className="space-y-2">
              {secs.sort((a, b) => a.language.localeCompare(b.language)).map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div>
                    <p className="font-bold">{s.group_label}</p>
                    <p className="text-[11px] text-white/30 uppercase">{s.language}</p>
                  </div>
                  <button onClick={() => openEdit(s)} className="text-[11px] bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all">Edit</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Section' : 'Edit Section'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <FormField label="Year Level">
              <input type="number" className={inputClass} value={form.year_level}
                onChange={e => setForm(p => ({ ...p, year_level: e.target.value }))} min={1} max={5} />
            </FormField>
            <FormField label="Language">
              <select className={selectClass} value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}>
                <option value="ENGLISH">English</option>
                <option value="FRENCH">French</option>
              </select>
            </FormField>
            <FormField label="Group Label">
              <input className={inputClass} value={form.group_label}
                onChange={e => setForm(p => ({ ...p, group_label: e.target.value }))} placeholder="Year 1 - English" />
            </FormField>
            <FormField label="Default Room (optional)">
              <select className={selectClass} value={form.default_room_id} onChange={e => setForm(p => ({ ...p, default_room_id: e.target.value }))}>
                <option value="">— No default room —</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.room_name} (cap. {r.capacity})</option>
                ))}
              </select>
            </FormField>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2"
            >
              {modal === 'add' ? 'Create Section' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
