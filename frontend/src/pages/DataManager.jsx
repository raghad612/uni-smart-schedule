import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';
import Footer from '../components/Footer';

const TABS = ['Instructors', 'Subjects', 'Sections', 'Rooms', 'Courses', 'Users'];

const inputClass = "w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none text-white";
const selectClass = "w-full bg-[#0a1628] border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none text-white";
const labelClass = "block text-[11px] uppercase tracking-widest text-white/40 mb-1";

const getErrorMessage = (e) => {
  const detail = e.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg).join(', ');
  if (typeof detail === 'string') return detail;
  return 'An error occurred.';
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a1628] border border-white/10 rounded-[2rem] p-8 w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

// ── INSTRUCTORS TAB ──────────────────────────────────────────────
function InstructorsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'FULL_TIME', required_sessions: 1, max_sessions_per_day: 2, user_id: '' });

  const { data: instructors = [], isLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
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
    setForm({ name: '', type: 'FULL_TIME', required_sessions: 1, max_sessions_per_day: 2, user_id: '' });
    setModal('add');
  };

  const openEdit = (i) => {
    setForm({ name: i.name, type: i.type, required_sessions: i.required_sessions, max_sessions_per_day: i.max_sessions_per_day, user_id: i.user_id });
    setModal(i);
  };

  const handleSubmit = () => {
    const payload = {
      name: form.name,
      type: form.type,
      required_sessions: parseInt(form.required_sessions),
      max_sessions_per_day: parseInt(form.max_sessions_per_day),
      user_id: form.user_id ? parseInt(form.user_id) : null,
    };
    if (modal === 'add') createMutation.mutate(payload);
    else updateMutation.mutate({ id: modal.id, data: payload });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{instructors.length} instructors registered</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">+ Add Instructor</button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {instructors.map(i => (
          <div key={i.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold">{i.name}</p>
              <p className="text-[11px] text-white/30 uppercase">{i.type} · {i.required_sessions} sessions/week · max {i.max_sessions_per_day}/day</p>
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
              <input className={inputClass} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Dr. John Smith" />
            </FormField>
            <FormField label="Type">
              <select className={selectClass} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Required Sessions / Week">
                <input type="number" className={inputClass} value={form.required_sessions} onChange={e => setForm(p => ({ ...p, required_sessions: e.target.value }))} min={1} />
              </FormField>
              <FormField label="Max Sessions / Day">
                <input type="number" className={inputClass} value={form.max_sessions_per_day} onChange={e => setForm(p => ({ ...p, max_sessions_per_day: e.target.value }))} min={1} />
              </FormField>
            </div>
            <FormField label="Link to User Account (optional)">
              <select className={selectClass} value={form.user_id} onChange={e => setForm(p => ({ ...p, user_id: e.target.value }))}>
                <option value="">— Select user —</option>
                {users.filter(u => u.role === 'INSTRUCTOR').map(u => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </FormField>
            <button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2">
              {modal === 'add' ? 'Create Instructor' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── SUBJECTS TAB ─────────────────────────────────────────────────
function SubjectsTab() {
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
    const payload = { ...form, credits: parseFloat(form.credits), sessions_per_week: parseFloat(form.sessions_per_week) };
    if (modal === 'add') createMutation.mutate(payload);
    else updateMutation.mutate({ id: modal.id, data: payload });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{subjects.length} subjects registered</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">+ Add Subject</button>
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
                <input type="number" step="0.5" className={inputClass} value={form.credits} onChange={e => setForm(p => ({ ...p, credits: e.target.value }))} min={0.5} />
              </FormField>
              <FormField label="Sessions / Week">
                <input type="number" step="0.5" className={inputClass} value={form.sessions_per_week} onChange={e => setForm(p => ({ ...p, sessions_per_week: e.target.value }))} min={0.5} />
              </FormField>
            </div>
            <button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2">
              {modal === 'add' ? 'Create Subject' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── SECTIONS TAB ─────────────────────────────────────────────────
function SectionsTab() {
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
    setForm({ year_level: s.year_level, language: s.language, group_label: s.group_label, default_room_id: s.default_room_id || '' });
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{sections.length} sections registered</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">+ Add Section</button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {sections.map(s => (
          <div key={s.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold">Year {s.year_level} · {s.group_label}</p>
              <p className="text-[11px] text-white/30 uppercase">{s.language}</p>
            </div>
            <button onClick={() => openEdit(s)} className="text-[11px] bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all">Edit</button>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Section' : 'Edit Section'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <FormField label="Year Level">
              <input type="number" className={inputClass} value={form.year_level} onChange={e => setForm(p => ({ ...p, year_level: e.target.value }))} min={1} max={5} />
            </FormField>
            <FormField label="Language">
              <select className={selectClass} value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}>
                <option value="ENGLISH">English</option>
                <option value="FRENCH">French</option>
              </select>
            </FormField>
            <FormField label="Group Label">
              <input className={inputClass} value={form.group_label} onChange={e => setForm(p => ({ ...p, group_label: e.target.value }))} placeholder="G1" />
            </FormField>
            <FormField label="Default Room (optional)">
              <select className={selectClass} value={form.default_room_id} onChange={e => setForm(p => ({ ...p, default_room_id: e.target.value }))}>
                <option value="">— No default room —</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.room_name} (cap. {r.capacity})</option>
                ))}
              </select>
            </FormField>
            <button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2">
              {modal === 'add' ? 'Create Section' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── ROOMS TAB ────────────────────────────────────────────────────
function RoomsTab() {
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
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">+ Add Room</button>
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
              <input className={inputClass} value={form.room_name} onChange={e => setForm(p => ({ ...p, room_name: e.target.value }))} placeholder="Amphi A" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Capacity">
                <input type="number" className={inputClass} value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} min={1} />
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
              <input className={inputClass} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ground floor, building B" />
            </FormField>
            <button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2">
              {modal === 'add' ? 'Create Room' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── COURSES TAB ──────────────────────────────────────────────────
function CoursesTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ subject_id: '', section_id: '', instructor_id: '', parallel_group_id: '', semester: '2024-2', session_type: 'lecture' });

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses/').then(r => r.data),
  });

  const { data: subjects = [] } = useQuery({ queryKey: ['subjects'], queryFn: () => api.get('/subjects/').then(r => r.data) });
  const { data: sections = [] } = useQuery({ queryKey: ['sections'], queryFn: () => api.get('/sections/').then(r => r.data) });
  const { data: instructors = [] } = useQuery({ queryKey: ['instructors'], queryFn: () => api.get('/instructors/').then(r => r.data) });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/courses/', data),
    onSuccess: () => { toast.success('Course instance created.'); qc.invalidateQueries(['courses']); setModal(null); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/courses/${id}`),
    onSuccess: () => { toast.success('Course removed.'); qc.invalidateQueries(['courses']); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openAdd = () => {
    setForm({ subject_id: '', section_id: '', instructor_id: '', parallel_group_id: '', semester: '2024-2', session_type: 'lecture' });
    setModal('add');
  };

  const handleSubmit = () => {
    const payload = {
      subject_id: parseInt(form.subject_id),
      section_id: parseInt(form.section_id),
      instructor_id: parseInt(form.instructor_id),
      parallel_group_id: form.parallel_group_id ? parseInt(form.parallel_group_id) : null,
      semester: form.semester,
      session_type: form.session_type,
    };
    createMutation.mutate(payload);
  };

  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s.name]));
  const sectionMap = Object.fromEntries(sections.map(s => [s.id, `Year ${s.year_level} · ${s.group_label} (${s.language})`]));
  const instructorMap = Object.fromEntries(instructors.map(i => [i.id, i.name]));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/40 text-sm">{courses.length} course instances</p>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">+ Add Course Instance</button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {courses.map(c => (
          <div key={c.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold">{subjectMap[c.subject_id] || `Subject #${c.subject_id}`}</p>
              <p className="text-[11px] text-white/30">
                {instructorMap[c.instructor_id] || `Instructor #${c.instructor_id}`} · {sectionMap[c.section_id] || `Section #${c.section_id}`} · {c.semester}
              </p>
            </div>
            <button onClick={() => deleteMutation.mutate(c.id)} className="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-all">Remove</button>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Add Course Instance" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <FormField label="Subject">
              <select className={selectClass} value={form.subject_id} onChange={e => setForm(p => ({ ...p, subject_id: e.target.value }))}>
                <option value="">— Select subject —</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </FormField>
            <FormField label="Section">
              <select className={selectClass} value={form.section_id} onChange={e => setForm(p => ({ ...p, section_id: e.target.value }))}>
                <option value="">— Select section —</option>
                {sections.map(s => <option key={s.id} value={s.id}>Year {s.year_level} · {s.group_label} ({s.language})</option>)}
              </select>
            </FormField>
            <FormField label="Instructor">
              <select className={selectClass} value={form.instructor_id} onChange={e => setForm(p => ({ ...p, instructor_id: e.target.value }))}>
                <option value="">— Select instructor —</option>
                {instructors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.type})</option>)}
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Semester">
                <input className={inputClass} value={form.semester} onChange={e => setForm(p => ({ ...p, semester: e.target.value }))} placeholder="2024-2" />
              </FormField>
              <FormField label="Session Type">
                <select className={selectClass} value={form.session_type} onChange={e => setForm(p => ({ ...p, session_type: e.target.value }))}>
                  <option value="lecture">Lecture</option>
                  <option value="td">TD</option>
                  <option value="tp">TP</option>
                </select>
              </FormField>
            </div>
            <button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2">
              Create Course Instance
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── USERS TAB ────────────────────────────────────────────────────
function UsersTab() {
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
        <button onClick={() => { setForm({ email: '', password: '', role: 'INSTRUCTOR' }); setModal(true); }} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">+ Add User</button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-white/30 text-sm animate-pulse">Loading...</p>}
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold">{u.email}</p>
              <p className="text-[11px] text-white/30 uppercase">{u.role} · {u.is_active ? 'Active' : 'Inactive'}</p>
            </div>
            {u.is_active && u.role !== 'ADMIN' && (
              <button onClick={() => deactivateMutation.mutate(u.id)} className="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-all">Deactivate</button>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Create User Account" onClose={() => setModal(false)}>
          <div className="space-y-4">
            <FormField label="Email Address">
              <input type="email" className={inputClass} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="instructor@university.edu" />
            </FormField>
            <FormField label="Password">
              <input type="password" className={inputClass} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Temporary password" />
            </FormField>
            <FormField label="Role">
              <select className={selectClass} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <option value="INSTRUCTOR">Instructor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </FormField>
            <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all mt-2">
              Create Account
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────
export default function DataManager() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Instructors');

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
      <nav className="flex items-center justify-between px-6 py-4 bg-[#0a1628] border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm cursor-pointer" onClick={() => navigate('/admin')}>
            UniSchedule
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
            Data Manager
          </span>
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate('/admin')} className="text-xs text-white/50 hover:text-white transition-colors">Dashboard</button>
          <button onClick={() => { removeToken(); navigate('/login'); }} className="text-xs text-red-400/70 hover:text-red-400 transition-colors">Sign out</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tighter mb-1">Data Manager</h1>
          <p className="text-white/40 text-sm">Manage instructors, subjects, sections, rooms, and course assignments.</p>
        </div>

        <div className="flex gap-2 mb-8 bg-white/5 p-1.5 rounded-2xl border border-white/10 w-fit">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-white/30 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="bg-[#0a1628] rounded-[2rem] border border-white/10 p-8">
          {activeTab === 'Instructors' && <InstructorsTab />}
          {activeTab === 'Subjects' && <SubjectsTab />}
          {activeTab === 'Sections' && <SectionsTab />}
          {activeTab === 'Rooms' && <RoomsTab />}
          {activeTab === 'Courses' && <CoursesTab />}
          {activeTab === 'Users' && <UsersTab />}
        </div>
      </div>
      <Footer />
    </div>
  );
}