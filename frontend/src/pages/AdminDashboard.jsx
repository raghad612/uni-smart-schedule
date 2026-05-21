import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SEMESTER = '2024-2';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SLOT_TIMES = {
  1: '08:00–09:30', 2: '09:45–11:15', 3: '11:30–13:00',
  4: '13:45–15:15', 5: '15:30–17:00',
};
const YEAR_LEVELS = [
  { value: 1, label: 'Year 1' }, { value: 2, label: 'Year 2' },
  { value: 3, label: 'Year 3' }, { value: 4, label: 'Master 1' },
];
const NAV_ITEMS = [
  { id: 'overview',     icon: '▦',  label: 'Overview' },
  { id: 'subjects',     icon: '📚', label: 'Subjects' },
  { id: 'rooms',        icon: '🚪', label: 'Rooms' },
  { id: 'sections',     icon: '📂', label: 'Sections' },
  { id: 'instructors',  icon: '👤', label: 'Instructors' },
  { id: 'courses',      icon: '📋', label: 'Course Instances' },
  { id: 'schedule',     icon: '⚙',  label: 'Run Schedule' },
  { id: 'proposals',    icon: '🗓',  label: 'Proposals' },
  { id: 'conflicts',    icon: '⚠',  label: 'Conflict Center' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const statusColors = {
  draft:     'bg-amber-900/40 text-amber-300 border-amber-700/40',
  proposed:  'bg-blue-900/40 text-blue-300 border-blue-700/40',
  approved:  'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  rejected:  'bg-red-900/40 text-red-300 border-red-700/40',
  FULL_TIME: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40',
  PART_TIME: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
  ENGLISH:   'bg-sky-900/40 text-sky-300 border-sky-700/40',
  FRENCH:    'bg-rose-900/40 text-rose-300 border-rose-700/40',
  lecture:   'bg-slate-700/40 text-slate-300 border-slate-600/40',
  lab:       'bg-cyan-900/40 text-cyan-300 border-cyan-700/40',
  td:        'bg-violet-900/40 text-violet-300 border-violet-700/40',
};

function Badge({ val }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${statusColors[val] || 'bg-white/10 text-white/50 border-white/10'}`}>
      {val}
    </span>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`bg-[#0d1b2e] border border-white/10 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-[#0d1b2e]">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── FORM FIELD ───────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-widest text-white/30 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition-all";
const selectCls = inputCls + " cursor-pointer";

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-bold text-white">{title}</h1>
      {action}
    </div>
  );
}

function AddBtn({ label, onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20">
      <span>+</span> {label}
    </button>
  );
}

// ─── TABLE ────────────────────────────────────────────────────────────────────
function Table({ cols, rows, empty = 'No data yet.' }) {
  return (
    <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl overflow-hidden">
      {rows.length === 0 ? (
        <div className="text-center py-16 text-white/20 text-sm">{empty}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {cols.map(c => (
                <th key={c} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-5 py-3 text-white/70">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── SUBJECTS SECTION ─────────────────────────────────────────────────────────
function SubjectsSection() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', credits: 3, sessions_per_week: 2, year_level: 1, language: 'ENGLISH' });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/courses/').then(r => {
      // We fetch subjects separately via a dedicated route if available,
      // otherwise we show a note. The backend has /courses/ for course instances.
      // Subjects need their own endpoint — we'll try to GET from a subjects endpoint
      // If not available, we handle gracefully.
      return [];
    }),
  });

  // Try to get subjects from the backend (if endpoint exists)
  const { data: subjectsData = [], refetch } = useQuery({
    queryKey: ['subjects-list'],
    queryFn: async () => {
      try {
        const r = await api.get('/subjects/');
        return r.data;
      } catch {
        return [];
      }
    },
  });

  const mut = useMutation({
    mutationFn: (data) => api.post('/subjects/', data),
    onSuccess: () => { toast.success('Subject created!'); refetch(); setShow(false); resetForm(); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed to create subject'),
  });

  const resetForm = () => setForm({ code: '', name: '', credits: 3, sessions_per_week: 2, year_level: 1, language: 'ENGLISH' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Map year_level to sessions_per_week label for display
  const yearLabel = (y) => YEAR_LEVELS.find(l => l.value === y)?.label || `Year ${y}`;

  return (
    <div>
      <SectionHeader title="Subjects" action={<AddBtn label="New Subject" onClick={() => setShow(true)} />} />

      <Table
        cols={['Code', 'Name', 'Credits', 'Sessions/Week', 'Year', 'Language']}
        rows={subjectsData.map(s => [
          <span className="font-mono text-blue-400 text-xs">{s.code}</span>,
          <span className="font-medium text-white/90">{s.name}</span>,
          s.credits,
          s.sessions_per_week,
          yearLabel(s.year_level || 1),
          <Badge val={s.language || 'ENGLISH'} />,
        ])}
        empty="No subjects yet. Add your first subject."
      />

      {show && (
        <Modal title="Add New Subject" onClose={() => { setShow(false); resetForm(); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Subject Code">
                <input value={form.code} onChange={e => set('code', e.target.value)} className={inputCls} placeholder="e.g. CS101" />
              </Field>
              <Field label="Credits">
                <input type="number" step="0.5" value={form.credits} onChange={e => set('credits', parseFloat(e.target.value))} className={inputCls} />
              </Field>
            </div>
            <Field label="Subject Name">
              <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="e.g. Introduction to Programming" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sessions per Week">
                <input type="number" step="0.5" min="0.5" max="5" value={form.sessions_per_week}
                  onChange={e => set('sessions_per_week', parseFloat(e.target.value))} className={inputCls} />
                <p className="text-[10px] text-white/20 mt-1">0.5 = every other week · 2 = twice/week · 3 = three times/week</p>
              </Field>
              <Field label="Year Level">
                <select value={form.year_level} onChange={e => set('year_level', parseInt(e.target.value))} className={selectCls}>
                  {YEAR_LEVELS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Language">
              <div className="flex gap-3">
                {['ENGLISH', 'FRENCH'].map(lang => (
                  <button key={lang} onClick={() => set('language', lang)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${form.language === lang ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-white/10 text-white/30 hover:border-white/20'}`}>
                    {lang === 'ENGLISH' ? '🇬🇧 English' : '🇫🇷 French'}
                  </button>
                ))}
              </div>
            </Field>
            <div className="bg-white/5 rounded-xl p-3 text-xs text-white/30 border border-white/5">
              <strong className="text-white/50">Note:</strong> sessions_per_week determines how often this subject appears per week.
              Use 2.0 for twice/week, 1.5 for 3 times every 2 weeks, 0.5 for once every other week.
            </div>
            <button onClick={() => mut.mutate({ code: form.code, name: form.name, credits: form.credits, sessions_per_week: form.sessions_per_week })}
              disabled={!form.code || !form.name || mut.isPending}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-all">
              {mut.isPending ? 'Creating...' : 'Create Subject'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ROOMS SECTION ────────────────────────────────────────────────────────────
function RoomsSection() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ room_name: '', capacity: 30, room_type: 'lecture', description: '' });

  const { data: rooms = [], refetch } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms/').then(r => r.data),
  });

  const mut = useMutation({
    mutationFn: (data) => api.post('/rooms/', data),
    onSuccess: () => { toast.success('Room added!'); refetch(); setShow(false); setForm({ room_name: '', capacity: 30, room_type: 'lecture', description: '' }); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <SectionHeader title="Rooms" action={<AddBtn label="New Room" onClick={() => setShow(true)} />} />
      <Table
        cols={['Room', 'Type', 'Capacity', 'Description']}
        rows={rooms.map(r => [
          <span className="font-bold text-white/90">{r.room_name}</span>,
          <Badge val={r.room_type} />,
          <span>{r.capacity} seats</span>,
          <span className="text-white/30 text-xs">{r.description || '—'}</span>,
        ])}
        empty="No rooms configured yet."
      />
      {show && (
        <Modal title="Add Room" onClose={() => setShow(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Room Name / Number">
                <input value={form.room_name} onChange={e => set('room_name', e.target.value)} className={inputCls} placeholder="e.g. A101" />
              </Field>
              <Field label="Capacity">
                <input type="number" value={form.capacity} onChange={e => set('capacity', parseInt(e.target.value))} className={inputCls} />
              </Field>
            </div>
            <Field label="Room Type">
              <select value={form.room_type} onChange={e => set('room_type', e.target.value)} className={selectCls}>
                <option value="lecture">Lecture Hall</option>
                <option value="lab">Lab</option>
                <option value="td">TD Room</option>
                <option value="seminar">Seminar Room</option>
              </select>
            </Field>
            <Field label="Description (optional)">
              <input value={form.description} onChange={e => set('description', e.target.value)} className={inputCls} placeholder="e.g. Ground floor, building A" />
            </Field>
            <button onClick={() => mut.mutate(form)} disabled={!form.room_name || mut.isPending}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-all">
              {mut.isPending ? 'Adding...' : 'Add Room'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SECTIONS SECTION ─────────────────────────────────────────────────────────
function SectionsSection() {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ year_level: 1, language: 'ENGLISH', group_label: '', default_room_id: '' });

  const { data: sections = [], refetch } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/sections/').then(r => r.data),
  });
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: () => api.get('/rooms/').then(r => r.data) });

  const mut = useMutation({
    mutationFn: (data) => api.post('/sections/', data),
    onSuccess: () => { toast.success('Section created!'); refetch(); setShow(false); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <SectionHeader title="Sections" action={<AddBtn label="New Section" onClick={() => setShow(true)} />} />
      <Table
        cols={['Year', 'Language', 'Group', 'Default Room']}
        rows={sections.map(s => [
          YEAR_LEVELS.find(y => y.value === s.year_level)?.label || `Year ${s.year_level}`,
          <Badge val={s.language} />,
          <span className="font-medium text-white/90">{s.group_label}</span>,
          <span className="text-white/40 text-xs">{s.default_room_id ? `Room #${s.default_room_id}` : '—'}</span>,
        ])}
        empty="No sections yet."
      />
      {show && (
        <Modal title="Add Section" onClose={() => setShow(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Year Level">
                <select value={form.year_level} onChange={e => set('year_level', parseInt(e.target.value))} className={selectCls}>
                  {YEAR_LEVELS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                </select>
              </Field>
              <Field label="Group Label">
                <input value={form.group_label} onChange={e => set('group_label', e.target.value)} className={inputCls} placeholder="e.g. G1, G2, A" />
              </Field>
            </div>
            <Field label="Language">
              <div className="flex gap-3">
                {['ENGLISH', 'FRENCH'].map(lang => (
                  <button key={lang} onClick={() => set('language', lang)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${form.language === lang ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-white/10 text-white/30 hover:border-white/20'}`}>
                    {lang === 'ENGLISH' ? '🇬🇧 English' : '🇫🇷 French'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Default Room (optional)">
              <select value={form.default_room_id} onChange={e => set('default_room_id', e.target.value ? parseInt(e.target.value) : null)} className={selectCls}>
                <option value="">— No default room —</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.room_name} ({r.room_type}, {r.capacity} seats)</option>)}
              </select>
            </Field>
            <button onClick={() => mut.mutate({ ...form, default_room_id: form.default_room_id || null })}
              disabled={!form.group_label || mut.isPending}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-all">
              {mut.isPending ? 'Creating...' : 'Create Section'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── INSTRUCTORS SECTION ──────────────────────────────────────────────────────
function InstructorsSection() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', type: 'FULL_TIME', required_sessions: 8, max_sessions_per_day: 3, phone: '' });

  const { data: instructors = [], refetch } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/admin/users/').then(r => r.data),
  });

  const mut = useMutation({
    mutationFn: async (data) => {
      const user = await api.post('/admin/users/', { email: data.email, password: data.password, role: 'INSTRUCTOR' });
      await api.post('/instructors/', {
        name: data.name, type: data.type,
        required_sessions: Number(data.required_sessions),
        max_sessions_per_day: Number(data.max_sessions_per_day),
        user_id: user.data.id,
      });
    },
    onSuccess: () => { toast.success('Instructor created!'); refetch(); qc.invalidateQueries(['users']); setShow(false); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const deactivate = useMutation({
    mutationFn: (id) => api.delete(`/instructors/${id}`),
    onSuccess: () => { toast.success('Deactivated'); refetch(); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Get email for each instructor by matching user_id
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return (
    <div>
      <SectionHeader title="Instructors" action={<AddBtn label="Add Instructor" onClick={() => setShow(true)} />} />
      <Table
        cols={['Name', 'Type', 'Req. Sessions', 'Max/Day', 'Email', 'Actions']}
        rows={instructors.map(i => {
          const u = userMap[i.user_id];
          return [
            <span className="font-medium text-white/90">{i.name}</span>,
            <Badge val={i.type} />,
            i.required_sessions,
            i.max_sessions_per_day,
            <span className="text-white/40 text-xs font-mono">{u?.email || '—'}</span>,
            <button onClick={() => { if (window.confirm(`Deactivate ${i.name}?`)) deactivate.mutate(i.id); }}
              className="text-red-400/60 hover:text-red-400 text-xs font-bold transition-colors">
              Deactivate
            </button>,
          ];
        })}
        empty="No instructors yet."
      />
      {show && (
        <Modal title="Add Instructor (Dr.)" onClose={() => setShow(false)} wide>
          <div className="space-y-4">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
              This creates both the user account (for login) and the instructor profile at once.
            </div>
            <Field label="Full Name">
              <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Dr. Firstname Lastname" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="University Email">
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="dr.name@university.dz" />
              </Field>
              <Field label="Temporary Password">
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} placeholder="Min. 8 characters" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Type">
                <select value={form.type} onChange={e => set('type', e.target.value)} className={selectCls}>
                  <option value="FULL_TIME">Full-time</option>
                  <option value="PART_TIME">Part-time</option>
                </select>
              </Field>
              <Field label="Required Sessions/Week">
                <input type="number" min="1" max="25" value={form.required_sessions} onChange={e => set('required_sessions', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Max Sessions/Day">
                <input type="number" min="1" max="5" value={form.max_sessions_per_day} onChange={e => set('max_sessions_per_day', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300">
              ⚡ <strong>Priority rule:</strong> Part-time instructors are scheduled first — they have fewer available slots and a tighter constraint.
            </div>
            <button onClick={() => mut.mutate(form)} disabled={!form.name || !form.email || !form.password || mut.isPending}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-all">
              {mut.isPending ? 'Creating...' : 'Create Instructor Account'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── COURSE INSTANCES SECTION ─────────────────────────────────────────────────
function CoursesSection() {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ subject_id: '', section_id: '', instructor_id: '', session_type: 'lecture', semester: SEMESTER });

  const { data: courses = [], refetch } = useQuery({
    queryKey: ['courses', SEMESTER],
    queryFn: () => api.get(`/courses/?semester=${SEMESTER}`).then(r => r.data),
  });
  const { data: instructors = [] } = useQuery({ queryKey: ['instructors'], queryFn: () => api.get('/instructors/').then(r => r.data) });
  const { data: sections = [] } = useQuery({ queryKey: ['sections'], queryFn: () => api.get('/sections/').then(r => r.data) });
  const { data: subjectsRaw = [] } = useQuery({
    queryKey: ['subjects-list'],
    queryFn: async () => { try { return await api.get('/subjects/').then(r => r.data); } catch { return []; } },
  });

  const mut = useMutation({
    mutationFn: (data) => api.post('/courses/', data),
    onSuccess: () => { toast.success('Course instance created!'); refetch(); setShow(false); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const del = useMutation({
    mutationFn: (id) => api.delete(`/courses/${id}`),
    onSuccess: () => { toast.success('Removed'); refetch(); },
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const instrMap = Object.fromEntries(instructors.map(i => [i.id, i]));
  const secMap = Object.fromEntries(sections.map(s => [s.id, s]));
  const subjMap = Object.fromEntries(subjectsRaw.map(s => [s.id, s]));

  return (
    <div>
      <SectionHeader title={`Course Instances — ${SEMESTER}`} action={<AddBtn label="Assign Course" onClick={() => setShow(true)} />} />
      <p className="text-white/30 text-xs mb-4">Each row = one class that needs to be scheduled. One course instance per teaching session.</p>
      <Table
        cols={['ID', 'Subject', 'Section', 'Instructor', 'Type', 'Actions']}
        rows={courses.map(c => [
          <span className="font-mono text-white/30 text-xs">#{c.id}</span>,
          <span className="text-white/80">{subjMap[c.subject_id]?.name || `Subject #${c.subject_id}`}</span>,
          <span className="text-white/60 text-xs">{secMap[c.section_id] ? `Y${secMap[c.section_id].year_level} ${secMap[c.section_id].group_label} (${secMap[c.section_id].language})` : `Section #${c.section_id}`}</span>,
          <span className="text-white/80">{instrMap[c.instructor_id]?.name || `Instructor #${c.instructor_id}`}</span>,
          <Badge val={c.session_type} />,
          <button onClick={() => { if (window.confirm('Remove this course instance?')) del.mutate(c.id); }}
            className="text-red-400/60 hover:text-red-400 text-xs font-bold">Remove</button>,
        ])}
        empty="No course instances for this semester."
      />
      {show && (
        <Modal title="Assign Course to Instructor" onClose={() => setShow(false)} wide>
          <div className="space-y-4">
            <p className="text-white/30 text-xs">This links a subject → section → instructor for a given semester. The engine schedules this instance into a time slot.</p>
            <Field label="Subject">
              <select value={form.subject_id} onChange={e => set('subject_id', parseInt(e.target.value))} className={selectCls}>
                <option value="">— Select subject —</option>
                {subjectsRaw.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name} ({s.sessions_per_week}×/week)</option>)}
              </select>
            </Field>
            <Field label="Section (Year / Group / Language)">
              <select value={form.section_id} onChange={e => set('section_id', parseInt(e.target.value))} className={selectCls}>
                <option value="">— Select section —</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>
                    {YEAR_LEVELS.find(y => y.value === s.year_level)?.label || `Year ${s.year_level}`} — Group {s.group_label} — {s.language}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Instructor (Dr.)">
              <select value={form.instructor_id} onChange={e => set('instructor_id', parseInt(e.target.value))} className={selectCls}>
                <option value="">— Select instructor —</option>
                {instructors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.type})</option>)}
              </select>
            </Field>
            <Field label="Session Type">
              <select value={form.session_type} onChange={e => set('session_type', e.target.value)} className={selectCls}>
                <option value="lecture">Lecture (Cours)</option>
                <option value="td">TD (Travaux Dirigés)</option>
                <option value="lab">Lab (TP)</option>
              </select>
            </Field>
            <button
              onClick={() => mut.mutate({ subject_id: form.subject_id, section_id: form.section_id, instructor_id: form.instructor_id, session_type: form.session_type, semester: SEMESTER })}
              disabled={!form.subject_id || !form.section_id || !form.instructor_id || mut.isPending}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-all">
              {mut.isPending ? 'Assigning...' : 'Create Course Instance'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SCHEDULE ENGINE SECTION ──────────────────────────────────────────────────
function ScheduleSection({ onProposalCreated }) {
  const [notes, setNotes] = useState('');
  const [simulation, setSimulation] = useState(false);

  const { data: instructors = [] } = useQuery({ queryKey: ['instructors'], queryFn: () => api.get('/instructors/').then(r => r.data) });

  const mut = useMutation({
    mutationFn: () => api.post('/scheduling/run', { semester: SEMESTER, notes: simulation ? `[SIMULATION] ${notes}` : notes, simulation }),
    onSuccess: (res) => {
      const d = res.data;
      if (d.validation_errors?.length) {
        toast.error(`⚠ ${d.validation_errors.length} instructor(s) have not submitted enough availability slots.`);
        return;
      }
      toast.success(`✓ Proposal #${d.proposal_id} created — ${d.assignments_count} assignments, ${d.conflicts_count} conflicts`);
      onProposalCreated(d.proposal_id);
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Engine failed'),
  });

  return (
    <div>
      <SectionHeader title="Run Scheduling Engine" />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-white/80 mb-1">Semester</h3>
            <div className="text-blue-400 font-mono font-bold text-lg">{SEMESTER}</div>
          </div>
          <Field label="Notes for this run">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className={inputCls + ' h-24 resize-none'} placeholder="Optional — e.g. Added Dr. Martin's constraints" />
          </Field>
          <div className="flex items-center justify-between p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <div>
              <div className="text-sm font-bold text-purple-300">Simulation Mode</div>
              <div className="text-xs text-white/30 mt-0.5">Creates a new proposal without affecting live schedule</div>
            </div>
            <button onClick={() => setSimulation(s => !s)}
              className={`relative w-12 h-6 rounded-full transition-colors ${simulation ? 'bg-purple-500' : 'bg-white/10'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${simulation ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className={`w-full py-4 text-white text-sm font-bold rounded-xl transition-all shadow-xl disabled:opacity-30 ${simulation ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'}`}>
            {mut.isPending ? '⚙ Running Algorithm...' : simulation ? '🧪 Run Simulation' : '⚡ Run Scheduling Engine'}
          </button>
        </div>

        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/25 mb-4">Algorithm Steps</h3>
          {[
            ['1', 'Load data', 'Instructors, course instances, availability for the semester'],
            ['2', 'Validate', 'Every instructor must have submitted ≥ required_sessions slots'],
            ['3', 'Sort by priority', 'PART_TIME first, then by required_sessions descending'],
            ['4', 'Greedy assignment', 'PREFERRED slots → AVAILABLE slots → conflict logged'],
            ['5', 'Conflict detection', 'Double bookings, room conflicts, parallel mismatches'],
            ['6', 'Gap scoring', 'Minimize idle time between sessions per instructor/day'],
            ['7', 'Optimise', 'Swap pairs if gap score improves without creating conflicts'],
            ['8', 'Save proposal', 'Creates draft proposal with all assignments and conflicts'],
          ].map(([n, title, desc]) => (
            <div key={n} className="flex gap-3 mb-3">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
              <div>
                <div className="text-xs font-bold text-white/70">{title}</div>
                <div className="text-[11px] text-white/25">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PROPOSALS SECTION ────────────────────────────────────────────────────────
function ProposalsSection({ highlightId, onView }) {
  const { data: proposals = [], refetch } = useQuery({
    queryKey: ['proposals', SEMESTER],
    queryFn: () => api.get(`/proposals/?semester=${SEMESTER}`).then(r => r.data),
  });

  return (
    <div>
      <SectionHeader title="Proposals" />
      <div className="space-y-3">
        {proposals.length === 0 && (
          <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-12 text-center text-white/20">
            No proposals yet. Run the scheduling engine first.
          </div>
        )}
        {proposals.map(p => (
          <div key={p.id}
            className={`bg-[#0d1b2e] border rounded-2xl p-5 flex items-center justify-between transition-all ${highlightId === p.id ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/10'}`}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center font-black text-white/50 text-sm">#{p.id}</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white/90">Semester {p.semester}</span>
                  <Badge val={p.status} />
                  {p.notes?.includes('[SIMULATION]') && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full">simulation</span>
                  )}
                </div>
                <div className="text-xs text-white/25 mt-0.5">{p.notes?.replace('[SIMULATION]', '').trim() || 'No notes'} · {new Date(p.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            <button onClick={() => onView(p.id)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-xs font-bold rounded-xl transition-all">
              Open →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PROPOSAL VIEWER ─────────────────────────────────────────────────────────
function ProposalViewer({ proposalId, onClose }) {
  const qc = useQueryClient();
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolution, setResolution] = useState('');

  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal-detail', proposalId],
    queryFn: () => api.get(`/proposals/${proposalId}`).then(r => r.data),
  });

  const approveMut = useMutation({
    mutationFn: () => api.post(`/proposals/${proposalId}/approve`),
    onSuccess: () => { toast.success('Proposal approved! This is now the live schedule.'); qc.invalidateQueries(['proposal-detail', proposalId]); qc.invalidateQueries(['proposals', SEMESTER]); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/proposals/${proposalId}/reject`),
    onSuccess: () => { toast.error('Proposal rejected.'); qc.invalidateQueries(['proposal-detail', proposalId]); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, resolution }) => api.post(`/conflicts/${id}/resolve`, { resolution }),
    onSuccess: () => { toast.success('Conflict resolved'); setResolveTarget(null); setResolution(''); qc.invalidateQueries(['proposal-detail', proposalId]); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  if (isLoading) return (
    <div className="fixed inset-0 z-50 bg-[#070d1a] flex items-center justify-center text-blue-400">
      <span className="animate-spin mr-2 text-2xl">⚙</span> Loading proposal...
    </div>
  );

  const { assignments = [], conflicts = [] } = proposal || {};
  const unresolvedCount = conflicts.filter(c => !c.resolution).length;

  const grid = {};
  DAYS.forEach(d => { grid[d] = {}; for (let s = 1; s <= 5; s++) grid[d][s] = []; });
  assignments.forEach(a => { if (grid[a.day]?.[a.slot_num]) grid[a.day][a.slot_num].push(a); });

  const rotColors = { ALWAYS: 'bg-slate-700/60 border-slate-600/40 text-slate-300', WEEK_A: 'bg-blue-900/60 border-blue-700/40 text-blue-300', WEEK_B: 'bg-teal-900/60 border-teal-700/40 text-teal-300' };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#070d1a]">
      <div className="bg-[#0a1628] border-b border-white/10 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl transition-colors">←</button>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-white">Proposal #{proposal?.id}</span>
              <Badge val={proposal?.status} />
              {unresolvedCount > 0 && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">{unresolvedCount} conflicts</span>}
            </div>
            <div className="text-xs text-white/25 mt-0.5">{proposal?.semester} · {assignments.length} assignments · {new Date(proposal?.created_at).toLocaleDateString()}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {proposal?.status !== 'approved' && proposal?.status !== 'rejected' && (
            <>
              <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending || unresolvedCount > 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-xs font-bold rounded-xl transition-all">
                ✓ Approve
              </button>
              <button onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}
                className="px-4 py-2 bg-red-600/40 hover:bg-red-600/60 border border-red-500/30 text-red-300 text-xs font-bold rounded-xl transition-all">
                ✕ Reject
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          {unresolvedCount > 0 && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              ⚠ Resolve all {unresolvedCount} conflict{unresolvedCount > 1 ? 's' : ''} before approving this proposal.
            </div>
          )}
          <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/20 w-28">Slot</th>
                  {DAYS.map(d => <th key={d} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/20 text-center border-l border-white/5">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(sn => (
                  <tr key={sn} className="border-b border-white/[0.04]">
                    <td className="px-3 py-2">
                      <div className="font-bold text-white/50">Slot {sn}</div>
                      <div className="text-white/20">{SLOT_TIMES[sn]}</div>
                    </td>
                    {DAYS.map(day => (
                      <td key={day} className="px-2 py-2 border-l border-white/5 align-top min-w-[110px]">
                        {grid[day][sn].map(a => (
                          <div key={a.id} className={`rounded-xl border px-2 py-1.5 mb-1 ${rotColors[a.week_rotation]}`}>
                            <div className="font-bold text-[10px]">CI#{a.course_instance_id}</div>
                            <div className="text-[9px] opacity-50">{a.week_rotation}</div>
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* conflicts panel */}
        <div className="w-80 border-l border-white/10 bg-[#0a1628] overflow-auto p-5 flex-shrink-0">
          <div className="text-xs font-bold uppercase tracking-widest text-white/25 mb-4">
            Conflicts
            {conflicts.length > 0 && <span className="ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full normal-case">{unresolvedCount}</span>}
          </div>
          {conflicts.length === 0 ? (
            <div className="text-center py-10 text-white/20">
              <div className="text-3xl mb-2">✓</div>
              <p className="text-xs">No conflicts detected</p>
            </div>
          ) : conflicts.map(c => (
            <div key={c.id} className={`rounded-xl border p-3 mb-3 text-xs ${c.resolution ? 'border-emerald-700/30 bg-emerald-900/20' : 'border-red-700/30 bg-red-900/20'}`}>
              <div className={`font-bold uppercase tracking-wide mb-1 ${c.resolution ? 'text-emerald-400' : 'text-red-400'}`}>
                {c.conflict_type.replace(/_/g, ' ')}
              </div>
              {c.slot_id && <div className="text-white/30">Slot #{c.slot_id}</div>}
              {c.resolution
                ? <div className="text-emerald-400/70 mt-1">✓ {c.resolution}</div>
                : <button onClick={() => { setResolveTarget(c); setResolution(''); }}
                    className="mt-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[10px] font-bold rounded-lg transition-all">
                    Resolve →
                  </button>
              }
            </div>
          ))}
        </div>
      </div>

      {resolveTarget && (
        <Modal title="Resolve Conflict" onClose={() => setResolveTarget(null)}>
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
            <div className="text-xs font-bold text-red-400 uppercase">{resolveTarget.conflict_type.replace(/_/g, ' ')}</div>
            {resolveTarget.slot_id && <div className="text-white/30 text-xs mt-1">Time slot #{resolveTarget.slot_id}</div>}
          </div>
          <Field label="Resolution Note">
            <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={3} className={inputCls + ' resize-none'}
              placeholder="Describe what you did to fix this (e.g. called Dr. Ali, moved his session to Thursday slot 3)" />
          </Field>
          <div className="flex gap-2 mt-4">
            <button onClick={() => resolveMut.mutate({ id: resolveTarget.id, resolution })}
              disabled={!resolution.trim() || resolveMut.isPending}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-sm font-bold rounded-xl">
              {resolveMut.isPending ? 'Saving...' : 'Mark as Resolved'}
            </button>
            <button onClick={() => setResolveTarget(null)}
              className="px-4 py-2.5 border border-white/10 rounded-xl text-white/40 text-sm hover:bg-white/5">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CONFLICT CENTER ──────────────────────────────────────────────────────────
function ConflictCenter() {
  const qc = useQueryClient();
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [resolution, setResolution] = useState('');

  const { data: proposals = [] } = useQuery({
    queryKey: ['proposals', SEMESTER],
    queryFn: () => api.get(`/proposals/?semester=${SEMESTER}`).then(r => r.data),
  });

  const activeProposal = proposals.find(p => p.status === 'draft' || p.status === 'proposed');

  const { data: proposal } = useQuery({
    queryKey: ['proposal-detail', activeProposal?.id],
    queryFn: () => api.get(`/proposals/${activeProposal.id}`).then(r => r.data),
    enabled: !!activeProposal,
  });

  const { data: instructors = [] } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/admin/users/').then(r => r.data),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, resolution }) => api.post(`/conflicts/${id}/resolve`, { resolution }),
    onSuccess: () => {
      toast.success('Conflict resolved!');
      setSelectedConflict(null);
      setResolution('');
      qc.invalidateQueries(['proposal-detail', activeProposal?.id]);
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
  });

  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  const conflicts = proposal?.conflicts || [];
  const unresolved = conflicts.filter(c => !c.resolution);

  // Find instructors involved in a conflict based on slot_id
  const getInvolvedInstructors = (conflict) => {
    if (!proposal || !conflict.slot_id) return [];
    const involvedAssignments = proposal.assignments?.filter(a => a.slot_id === conflict.slot_id) || [];
    return [...new Set(involvedAssignments.map(a => a.course_instance_id))];
  };

  const conflictDescriptions = {
    instructor_double_booked: 'Two courses assigned to the same instructor at the same time',
    room_double_booked: 'Two courses assigned to the same room at the same time',
    no_available_slot: 'No valid time slot was found for this course instance',
    availability_mismatch: 'Instructor was assigned to a slot they marked as BUSY',
    parallel_mismatch: 'Parallel group courses were not assigned to the same time slot',
    INSTRUCTOR_DOUBLE_BOOKED: 'Two courses assigned to the same instructor at the same time',
    ROOM_DOUBLE_BOOKED: 'Two courses assigned to the same room at the same time',
    AVAILABILITY_MISMATCH: 'Instructor was assigned to a slot they marked as BUSY',
    PARALLEL_MISMATCH: 'Parallel group courses were not assigned to the same time slot',
  };

  return (
    <div>
      <SectionHeader title="Conflict Resolution Center" />

      {!activeProposal ? (
        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-12 text-center text-white/20">
          No active proposal found. Run the scheduling engine first.
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* conflict list */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-white/30">Proposal #{activeProposal.id} · {SEMESTER}</span>
              {unresolved.length > 0
                ? <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">{unresolved.length} unresolved</span>
                : <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">✓ All resolved</span>
              }
            </div>
            {conflicts.length === 0 ? (
              <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-10 text-center text-white/20">
                <div className="text-3xl mb-3">✓</div>
                No conflicts in this proposal
              </div>
            ) : conflicts.map(c => (
              <div key={c.id}
                onClick={() => { setSelectedConflict(c); setResolution(''); }}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  selectedConflict?.id === c.id ? 'border-blue-500/40 bg-blue-500/10' :
                  c.resolution ? 'border-emerald-700/20 bg-emerald-900/10 hover:bg-emerald-900/20' :
                  'border-red-700/20 bg-red-900/10 hover:bg-red-900/20'
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${c.resolution ? 'text-emerald-400' : 'text-red-400'}`}>
                      {c.conflict_type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-white/30">{conflictDescriptions[c.conflict_type] || 'Scheduling conflict detected'}</div>
                    {c.slot_id && <div className="text-[11px] text-white/20 mt-1">Time slot #{c.slot_id} — {SLOT_TIMES[((c.slot_id - 1) % 5) + 1] || ''}</div>}
                    {c.resolution && <div className="text-xs text-emerald-400/70 mt-2">✓ {c.resolution}</div>}
                  </div>
                  {!c.resolution && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg font-bold flex-shrink-0">
                      Action needed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* resolution panel + instructor contacts */}
          <div className="lg:col-span-2 space-y-5">
            {selectedConflict && !selectedConflict.resolution && (
              <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">Resolve Conflict</h3>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                  <div className="text-xs font-bold text-red-400">{selectedConflict.conflict_type.replace(/_/g, ' ')}</div>
                  <div className="text-[11px] text-white/30 mt-1">{conflictDescriptions[selectedConflict.conflict_type]}</div>
                </div>
                <Field label="Resolution Note">
                  <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={3}
                    className={inputCls + ' resize-none'}
                    placeholder="Describe what action you took to resolve this conflict..." />
                </Field>
                <button onClick={() => resolveMut.mutate({ id: selectedConflict.id, resolution })}
                  disabled={!resolution.trim() || resolveMut.isPending}
                  className="w-full mt-3 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-sm font-bold rounded-xl transition-all">
                  {resolveMut.isPending ? 'Saving...' : 'Mark as Resolved'}
                </button>
              </div>
            )}

            {/* instructor contact cards */}
            <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">Instructor Contact Cards</h3>
              <p className="text-[11px] text-white/20 mb-4">Contact instructors directly to resolve scheduling conflicts.</p>
              <div className="space-y-3">
                {instructors.map(i => {
                  const u = userMap[i.user_id];
                  return (
                    <div key={i.id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i.type === 'PART_TIME' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {i.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white/80 truncate">{i.name}</div>
                        <div className="text-[10px] text-white/30 truncate">{u?.email || '—'}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge val={i.type} />
                          <span className="text-[9px] text-white/20">{i.required_sessions} sessions/week</span>
                        </div>
                      </div>
                      {u?.email && (
                        <a href={`mailto:${u.email}?subject=Schedule Conflict — ${SEMESTER}&body=Dear ${i.name},%0D%0A%0D%0AWe have detected a scheduling conflict for Semester ${SEMESTER}.%0D%0APlease contact us to resolve this issue.%0D%0A%0D%0AThank you.`}
                          className="flex-shrink-0 px-2 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-[10px] font-bold rounded-lg transition-all">
                          ✉ Email
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview({ onNavigate }) {
  const { data: instructors = [] } = useQuery({ queryKey: ['instructors'], queryFn: () => api.get('/instructors/').then(r => r.data) });
  const { data: proposals = [] } = useQuery({ queryKey: ['proposals', SEMESTER], queryFn: () => api.get(`/proposals/?semester=${SEMESTER}`).then(r => r.data) });
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: () => api.get('/rooms/').then(r => r.data) });
  const { data: courses = [] } = useQuery({ queryKey: ['courses', SEMESTER], queryFn: () => api.get(`/courses/?semester=${SEMESTER}`).then(r => r.data) });

  const approved = proposals.find(p => p.status === 'approved');
  const draft = proposals.filter(p => p.status === 'draft');

  const stats = [
    { label: 'Instructors', value: instructors.length, sub: `${instructors.filter(i => i.type === 'PART_TIME').length} part-time`, color: '#60a5fa', nav: 'instructors' },
    { label: 'Course Instances', value: courses.length, sub: `Semester ${SEMESTER}`, color: '#a78bfa', nav: 'courses' },
    { label: 'Rooms', value: rooms.length, sub: 'Available', color: '#34d399', nav: 'rooms' },
    { label: 'Proposals', value: proposals.length, sub: `${draft.length} draft · ${approved ? '1 live' : 'none live'}`, color: '#f59e0b', nav: 'proposals' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-white/30 text-sm mt-1">Semester {SEMESTER}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <button key={s.label} onClick={() => onNavigate(s.nav)}
            className="p-5 bg-[#0d1b2e] border border-white/10 rounded-2xl text-left hover:border-white/20 hover:bg-white/[0.03] transition-all group">
            <div className="text-2xl font-black text-white mb-1">{s.value}</div>
            <div className="text-xs font-bold text-white/60">{s.label}</div>
            <div className="text-[10px] text-white/25 mt-0.5">{s.sub}</div>
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/25 mb-5">Quick Setup Guide</h3>
          {[
            { n: '1', t: 'Add Rooms', d: 'Add university classrooms with capacity', nav: 'rooms' },
            { n: '2', t: 'Add Sections', d: 'Year 1–3 + Master 1, English + French groups', nav: 'sections' },
            { n: '3', t: 'Add Subjects', d: 'Code, name, credits, sessions/week', nav: 'subjects' },
            { n: '4', t: 'Add Instructors', d: 'Create login accounts for all Drs', nav: 'instructors' },
            { n: '5', t: 'Assign Courses', d: 'Link subject → section → instructor', nav: 'courses' },
            { n: '6', t: 'Run Engine', d: 'Generate schedule when all availability submitted', nav: 'schedule' },
          ].map(s => (
            <button key={s.n} onClick={() => onNavigate(s.nav)}
              className="w-full flex items-center gap-3 py-2.5 text-left hover:opacity-100 opacity-60 hover:opacity-90 transition-opacity">
              <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">{s.n}</span>
              <div>
                <span className="text-xs font-bold text-white/80">{s.t}</span>
                <span className="text-[11px] text-white/25 ml-2">{s.d}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/25 mb-5">Recent Proposals</h3>
          {proposals.length === 0 ? (
            <div className="text-center py-8 text-white/20 text-sm">No proposals yet.</div>
          ) : proposals.slice(0, 4).map(p => (
            <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-white/30 font-mono text-xs">#{p.id}</span>
                <Badge val={p.status} />
                {p.notes?.includes('[SIMULATION]') && <span className="text-[9px] text-purple-400">sim</span>}
              </div>
              <span className="text-[10px] text-white/20">{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [viewingProposal, setViewingProposal] = useState(null);
  const [highlightProposal, setHighlightProposal] = useState(null);

  const handleLogout = () => { removeToken(); navigate('/login'); };

  const handleProposalCreated = (id) => {
    setHighlightProposal(id);
    setTab('proposals');
  };

  if (viewingProposal) return <ProposalViewer proposalId={viewingProposal} onClose={() => setViewingProposal(null)} />;

  return (
    <div className="flex h-screen bg-[#070d1a] text-white overflow-hidden">
      {/* sidebar */}
      <aside className="w-52 bg-[#0a1628] border-r border-white/5 flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-black">S</div>
            <div>
              <div className="text-xs font-black text-white tracking-tight">SmartSchedule</div>
              <div className="text-[10px] text-blue-400">Admin</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {NAV_ITEMS.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all mb-0.5 ${
                tab === n.id ? 'bg-blue-500/20 text-blue-400' : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]'
              }`}>
              <span>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <div className="px-2 py-3 border-t border-white/5">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white/25 hover:text-red-400 hover:bg-red-500/5 transition-all">
            <span>↩</span> Sign Out
          </button>
        </div>
      </aside>

      {/* main */}
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-7">
          {tab === 'overview'    && <Overview onNavigate={setTab} />}
          {tab === 'subjects'    && <SubjectsSection />}
          {tab === 'rooms'       && <RoomsSection />}
          {tab === 'sections'    && <SectionsSection />}
          {tab === 'instructors' && <InstructorsSection />}
          {tab === 'courses'     && <CoursesSection />}
          {tab === 'schedule'    && <ScheduleSection onProposalCreated={handleProposalCreated} />}
          {tab === 'proposals'   && <ProposalsSection highlightId={highlightProposal} onView={setViewingProposal} />}
          {tab === 'conflicts'   && <ConflictCenter />}
        </div>
      </main>
    </div>
  );
}
