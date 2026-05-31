import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, FormField, inputClass, selectClass, getErrorMessage } from './shared';

export default function RoomsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ room_name: '', capacity: 30, room_type: 'LECTURE', description: '' });

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms/').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/rooms/', data),
    onSuccess: () => { toast.success('Room created.'); qc.invalidateQueries(['rooms']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/rooms/${id}`, data),
    onSuccess: () => { toast.success('Room updated.'); qc.invalidateQueries(['rooms']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openAdd = () => {
    setForm({ room_name: '', capacity: 30, room_type: 'LECTURE', description: '' });
    setModal('add');
  };

  const openEdit = (r) => {
    setForm({ room_name: r.room_name, capacity: r.capacity, room_type: r.room_type, description: r.description || '' });
    setModal(r);
  };

  const handleSubmit = () => {
    const payload = { ...form, capacity: parseInt(form.capacity) };
    if (modal === 'add') createMutation.mutate(payload);
    else updateMutation.mutate({ id: modal.id, data: payload });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{rooms.length} rooms registered</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">
          + Add Room
        </button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {rooms.map(r => (
          <div key={r.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold">{r.room_name}</p>
              <p className="text-[11px] text-white/30 uppercase">{r.room_type} · capacity {r.capacity}</p>
              {r.description && <p className="text-[11px] text-white/20 italic">{r.description}</p>}
            </div>
            <button onClick={() => openEdit(r)} className="text-[11px] bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all">Edit</button>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Room' : 'Edit Room'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <FormField label="Room Name">
              <input className={inputClass} value={form.room_name}
                onChange={e => setForm(p => ({ ...p, room_name: e.target.value }))} placeholder="Amphi A" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Capacity">
                <input type="number" className={inputClass} value={form.capacity}
                  onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} min={1} />
              </FormField>
              <FormField label="Room Type">
                <select className={selectClass} value={form.room_type} onChange={e => setForm(p => ({ ...p, room_type: e.target.value }))}>
                  <option value="LECTURE">Lecture Hall</option>
                  <option value="LAB">Lab</option>
                  <option value="SEMINAR">Seminar</option>
                </select>
              </FormField>
            </div>
            <FormField label="Description (optional)">
              <input className={inputClass} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ground floor, building B" />
            </FormField>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2"
            >
              {modal === 'add' ? 'Create Room' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
