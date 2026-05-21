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
const PREF_CONFIG = {
  PREFERRED: { label: 'Preferred', short: 'P', color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.35)' },
  AVAILABLE: { label: 'Available', short: 'A', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.35)' },
  BUSY:      { label: 'Busy',      short: 'B', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)' },
  NONE:      { label: 'Unset',     short: '',  color: 'rgba(255,255,255,0.1)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)' },
};
const PREF_CYCLE = ['NONE', 'AVAILABLE', 'PREFERRED', 'BUSY'];

const ROT_STYLE = {
  ALWAYS: 'bg-slate-700/60 border-slate-600/40 text-slate-300',
  WEEK_A: 'bg-blue-900/60 border-blue-700/40 text-blue-300',
  WEEK_B: 'bg-teal-900/60 border-teal-700/40 text-teal-300',
};

const getSlotId = (dayIndex, slotNum) => dayIndex * 5 + slotNum;

const TABS = [
  { id: 'availability', label: '📅 Availability' },
  { id: 'preferences',  label: '⚙ My Preferences' },
  { id: 'schedule',     label: '🗓 My Schedule' },
];

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-widest text-white/30 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-white/20 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-all";
const selectCls = inputCls + " cursor-pointer";

// ─── AVAILABILITY TAB ─────────────────────────────────────────────────────────
function AvailabilityTab() {
  const qc = useQueryClient();
  const [slots, setSlots] = useState({});
  const [dayPeriod, setDayPeriod] = useState({});

  useQuery({
    queryKey: ['availability-me'],
    queryFn: () => api.get('/availability/me').then(r => {
      const map = {};
      r.data.forEach(s => { map[s.slot_id] = s.preference; });
      setSlots(map);
      return r.data;
    }),
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const groups = { PREFERRED: [], AVAILABLE: [], BUSY: [] };
      Object.entries(slots).forEach(([id, pref]) => {
        if (groups[pref]) groups[pref].push(parseInt(id));
      });
      const calls = Object.entries(groups)
        .filter(([, ids]) => ids.length > 0)
        .map(([pref, ids]) => api.post('/availability/', { slot_ids: ids, preference: pref, semester: SEMESTER }));
      return Promise.all(calls);
    },
    onSuccess: () => { toast.success('Availability saved!'); qc.invalidateQueries(['availability-me']); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Submission failed'),
  });

  const cycleCell = (dayIndex, slotNum) => {
    const id = getSlotId(dayIndex, slotNum);
    const cur = slots[id] || 'NONE';
    const next = PREF_CYCLE[(PREF_CYCLE.indexOf(cur) + 1) % PREF_CYCLE.length];
    setSlots(prev => {
      if (next === 'NONE') { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: next };
    });
  };

  const applyDayPeriod = (dayIndex, period) => {
    setDayPeriod(prev => ({ ...prev, [dayIndex]: period }));
    setSlots(prev => {
      const next = { ...prev };
      for (let s = 1; s <= 5; s++) {
        const id = getSlotId(dayIndex, s);
        const isMorning = s <= 3;
        if (period === 'AM')   next[id] = isMorning ? 'AVAILABLE' : 'BUSY';
        if (period === 'PM')   next[id] = isMorning ? 'BUSY' : 'AVAILABLE';
        if (period === 'BOTH') next[id] = 'AVAILABLE';
        if (period === 'OFF')  delete next[id];
      }
      return next;
    });
  };

  const totalSet = Object.keys(slots).length;
  const counts = { P: 0, A: 0, B: 0 };
  Object.values(slots).forEach(v => { if (v === 'PREFERRED') counts.P++; else if (v === 'AVAILABLE') counts.A++; else if (v === 'BUSY') counts.B++; });

  return (
    <div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-white">Availability Grid</h2>
          <p className="text-white/30 text-sm mt-1">
            Click a cell to cycle: Unset → Available → Preferred → Busy.<br />
            Use the day shortcuts below each column for quick AM/PM fill.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSlots({}); setDayPeriod({}); }}
            className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-white/10 rounded-xl text-white/25 hover:text-white/50 hover:bg-white/5 transition-all">
            Reset
          </button>
          <button onClick={() => submitMut.mutate()} disabled={totalSet === 0 || submitMut.isPending}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20">
            {submitMut.isPending ? 'Saving...' : `Submit (${totalSet} slots) →`}
          </button>
        </div>
      </div>

      <div className="flex gap-5 mb-5 px-1">
        {Object.entries(PREF_CONFIG).filter(([k]) => k !== 'NONE').map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.color, opacity: 0.7 }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      <div className="bg-[#0a1628] border border-white/10 rounded-[2rem] p-6 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1.5" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th className="w-32" />
              {DAYS.map((day, di) => (
                <th key={day} className="text-center pb-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-2">{day.slice(0, 3)}</div>
                  <div className="flex gap-1 justify-center flex-wrap">
                    {[['AM', '☀'], ['PM', '🌙'], ['BOTH', '✓'], ['OFF', '✕']].map(([p, icon]) => (
                      <button key={p} onClick={() => applyDayPeriod(di, p)}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-black transition-all border ${dayPeriod[di] === p ? 'bg-blue-500/30 border-blue-500/40 text-blue-300' : 'border-white/10 text-white/20 hover:text-white/40'}`}>
                        {icon} {p}
                      </button>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(slotNum => (
              <tr key={slotNum}>
                <td className="pr-4 py-1">
                  <div className="text-xs font-bold text-white/40">Slot {slotNum}</div>
                  <div className="text-[10px] text-white/20">{SLOT_TIMES[slotNum]}</div>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded mt-1 inline-block ${slotNum <= 3 ? 'bg-orange-500/10 text-orange-500/60' : 'bg-blue-500/10 text-blue-500/60'}`}>
                    {slotNum <= 3 ? 'AM' : 'PM'}
                  </span>
                </td>
                {DAYS.map((_, di) => {
                  const slotId = getSlotId(di, slotNum);
                  const pref = slots[slotId] || 'NONE';
                  const cfg = PREF_CONFIG[pref];
                  return (
                    <td key={di} className="p-0">
                      <button onClick={() => cycleCell(di, slotNum)}
                        className="group w-full h-16 rounded-2xl border-2 transition-all duration-200 flex flex-col items-center justify-center relative overflow-hidden active:scale-95"
                        style={{ background: cfg.bg, borderColor: cfg.border }}>
                        {cfg.short && <span className="text-base font-black" style={{ color: cfg.color }}>{cfg.short}</span>}
                        <span className="text-[8px] font-bold opacity-40" style={{ color: cfg.color }}>{cfg.label}</span>
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-5 px-1">
        <div className="flex gap-5 text-sm text-white/30">
          {counts.P > 0 && <span><span className="font-bold text-emerald-400">{counts.P}</span> Preferred</span>}
          {counts.A > 0 && <span><span className="font-bold text-blue-400">{counts.A}</span> Available</span>}
          {counts.B > 0 && <span><span className="font-bold text-red-400">{counts.B}</span> Busy</span>}
          {totalSet === 0 && <span className="text-white/20 italic">No slots selected yet</span>}
        </div>
        <p className="text-[10px] text-white/20 italic">Preferred = your first choice · Available = Admin can assign freely</p>
      </div>
    </div>
  );
}

// ─── PREFERENCES TAB ─────────────────────────────────────────────────────────
function PreferencesTab() {
  const [desiredHours, setDesiredHours] = useState('');
  const [sessionPattern, setSessionPattern] = useState('regular');
  const [preferAM, setPreferAM] = useState(false);
  const [preferPM, setPreferPM] = useState(false);
  const [preferredDays, setPreferredDays] = useState([]);
  const [notes, setNotes] = useState('');

  const { data: allCourses = [] } = useQuery({
    queryKey: ['courses-semester', SEMESTER],
    queryFn: () => api.get(`/courses/?semester=${SEMESTER}`).then(r => r.data),
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects-list'],
    queryFn: async () => { try { return await api.get('/subjects/').then(r => r.data); } catch { return []; } },
  });
  const subjMap = Object.fromEntries(subjects.map(s => [s.id, s]));

  const toggleDay = (d) => setPreferredDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSave = () => {
    toast.success('Preferences saved!');
    const summary = [];
    if (desiredHours) summary.push(`${desiredHours}h/week`);
    if (preferAM) summary.push('Morning preferred');
    if (preferPM) summary.push('Afternoon preferred');
    if (preferredDays.length) summary.push(preferredDays.map(d => d.slice(0, 3)).join(', '));
    if (notes) summary.push('Notes added');
    if (summary.length) toast(`📋 ${summary.join(' · ')}`, { duration: 4000 });
  };

  const SESSION_PATTERNS = [
    { id: 'regular',   label: 'Regular',    desc: '2 sessions/week — standard rhythm' },
    { id: 'intensive', label: 'Intensive',   desc: '3 sessions/week — higher frequency' },
    { id: 'spread',    label: 'Spread out',  desc: '1 session every other week' },
  ];

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-white mb-2">Teaching Preferences</h2>
      <p className="text-white/30 text-sm mb-8">
        Tell the admin your constraints. The engine uses your Availability grid to schedule you,
        but these notes help the admin make manual adjustments if needed.
      </p>

      <div className="space-y-5">

        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/25 mb-4">Weekly Teaching Load</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Desired hours per week" hint="Each session = 1h30. e.g. 4h30 = 3 sessions">
              <input type="number" min="1" max="30" value={desiredHours}
                onChange={e => setDesiredHours(e.target.value)} className={inputCls} placeholder="e.g. 9" />
            </Field>
            <Field label="Frequency pattern">
              <select value={sessionPattern} onChange={e => setSessionPattern(e.target.value)} className={selectCls}>
                {SESSION_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
          </div>
          <p className="text-[11px] text-white/20 mt-3 italic">{SESSION_PATTERNS.find(p => p.id === sessionPattern)?.desc}</p>
          <div className="mt-3 p-3 bg-white/3 border border-white/5 rounded-xl text-[11px] text-white/20">
            Some courses run 2× one week and 3× the next (sessions_per_week = 2.5).
            The engine handles this automatically via the WEEK_A / WEEK_B rotation.
          </div>
        </div>

        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/25 mb-4">Time of Day Preference</h3>
          <div className="flex gap-3">
            {[
              { label: '☀ Morning', desc: 'Slots 1–3 (08:00–13:00)', active: preferAM, toggle: () => { setPreferAM(v => !v); setPreferPM(false); } },
              { label: '🌙 Afternoon', desc: 'Slots 4–5 (13:45–17:00)', active: preferPM, toggle: () => { setPreferPM(v => !v); setPreferAM(false); } },
              { label: '↕ No Preference', desc: 'Any time', active: !preferAM && !preferPM, toggle: () => { setPreferAM(false); setPreferPM(false); } },
            ].map((opt, i) => (
              <button key={i} onClick={opt.toggle}
                className={`flex-1 p-3 rounded-xl border text-left transition-all ${opt.active ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/10 hover:border-white/20'}`}>
                <div className={`text-sm font-bold mb-1 ${opt.active ? 'text-blue-300' : 'text-white/50'}`}>{opt.label}</div>
                <div className="text-[10px] text-white/25">{opt.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/20 mt-3 italic">
            Reflect this in your Availability grid by marking those slots as "Preferred" instead of "Available".
          </p>
        </div>

        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/25 mb-4">Preferred Teaching Days</h3>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(d => (
              <button key={d} onClick={() => toggleDay(d)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${preferredDays.includes(d) ? 'border-blue-500/40 bg-blue-500/15 text-blue-300' : 'border-white/10 text-white/30 hover:border-white/20'}`}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          {preferredDays.length > 0 && (
            <p className="text-[11px] text-white/30 mt-3">Mark these days as <span className="text-emerald-400">Preferred</span> in your Availability grid.</p>
          )}
        </div>

        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-5">
          <Field label="Notes for Admin">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className={inputCls + ' resize-none'}
              placeholder="e.g. I cannot teach on Friday afternoons. Available for extra sessions if needed." />
          </Field>
        </div>

        {/* courses assigned this semester */}
        <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/25 mb-4">My Assigned Courses — {SEMESTER}</h3>
          {allCourses.length === 0 ? (
            <p className="text-white/20 text-sm">No courses assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {allCourses.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                  <div>
                    <div className="text-xs font-bold text-white/70">{subjMap[c.subject_id]?.name || `Subject #${c.subject_id}`}</div>
                    <div className="text-[10px] text-white/25 mt-0.5">
                      {subjMap[c.subject_id]?.sessions_per_week || '?'}× per week · {c.session_type} · CI#{c.id}
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                    c.session_type === 'lab' ? 'bg-cyan-900/40 text-cyan-300 border-cyan-700/40' :
                    c.session_type === 'td'  ? 'bg-violet-900/40 text-violet-300 border-violet-700/40' :
                    'bg-slate-700/40 text-slate-300 border-slate-600/40'
                  }`}>{c.session_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleSave}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-xl shadow-blue-600/20">
          Save Preferences
        </button>
      </div>
    </div>
  );
}

// ─── SCHEDULE TAB ─────────────────────────────────────────────────────────────
function ScheduleTab() {
  const { data: proposals = [] } = useQuery({
    queryKey: ['proposals-instructor', SEMESTER],
    queryFn: () => api.get(`/proposals/?semester=${SEMESTER}`).then(r => r.data),
  });

  const activeProposal = proposals.find(p => p.status === 'proposed' || p.status === 'approved');

  const { data: proposal } = useQuery({
    queryKey: ['proposal-detail-instructor', activeProposal?.id],
    queryFn: () => api.get(`/proposals/${activeProposal.id}`).then(r => r.data),
    enabled: !!activeProposal,
  });

  if (!activeProposal) return (
    <div className="flex flex-col items-center justify-center py-20 text-white/20 text-center border-2 border-dashed border-white/10 rounded-3xl">
      <div className="text-5xl mb-4">🗓</div>
      <p className="font-bold text-sm">No schedule available yet</p>
      <p className="text-xs mt-2">Your timetable will appear here once the admin publishes a proposal.</p>
    </div>
  );

  if (!proposal) return (
    <div className="flex items-center justify-center py-20 text-blue-400 text-sm">
      <span className="animate-spin mr-2">⚙</span> Loading schedule...
    </div>
  );

  const { assignments = [] } = proposal;
  const grid = {};
  DAYS.forEach(d => { grid[d] = {}; for (let s = 1; s <= 5; s++) grid[d][s] = []; });
  assignments.forEach(a => { if (grid[a.day]?.[a.slot_num]) grid[a.day][a.slot_num].push(a); });

  const statusBadge = {
    proposed: 'bg-amber-900/40 text-amber-300 border-amber-700/40',
    approved: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Your Timetable</h2>
          <p className="text-white/30 text-sm mt-1">Semester {SEMESTER} · Proposal #{activeProposal.id} · {assignments.length} sessions</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border uppercase ${statusBadge[activeProposal.status] || 'bg-white/10 text-white/50 border-white/10'}`}>
          {activeProposal.status}
        </span>
      </div>

      <div className="bg-[#0d1b2e] border border-white/10 rounded-[2rem] p-6 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1.5" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th className="w-32" />
              {DAYS.map(d => (
                <th key={d} className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/20 pb-3">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(slotNum => (
              <tr key={slotNum}>
                <td className="pr-4 py-1">
                  <div className="text-xs font-bold text-white/40">Slot {slotNum}</div>
                  <div className="text-[10px] text-white/20">{SLOT_TIMES[slotNum]}</div>
                </td>
                {DAYS.map(day => (
                  <td key={day}>
                    {grid[day][slotNum].length === 0 ? (
                      <div className="h-16 rounded-2xl bg-white/[0.015] border border-white/[0.04] flex items-center justify-center">
                        <span className="text-[8px] text-white/10 uppercase tracking-widest font-black italic">Free</span>
                      </div>
                    ) : grid[day][slotNum].map(a => (
                      <div key={a.id} className={`h-16 rounded-2xl border px-2 py-1.5 flex flex-col justify-center ${ROT_STYLE[a.week_rotation]}`}>
                        <div className="text-[10px] font-black">CI#{a.course_instance_id}</div>
                        <div className="text-[8px] opacity-50">{a.week_rotation}</div>
                        {a.room_id && <div className="text-[8px] opacity-40">Room #{a.room_id}</div>}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-5 mt-4 text-[10px] text-white/30">
        {Object.entries(ROT_STYLE).map(([k]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded border ${ROT_STYLE[k]}`} /> {k}
          </span>
        ))}
      </div>

      {activeProposal.status === 'approved' && (
        <div className="mt-5 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <p className="text-emerald-300 text-sm font-bold">✓ Official Schedule — Semester {SEMESTER}</p>
          <p className="text-emerald-300/50 text-xs mt-1">This proposal is approved. Your timetable is confirmed.</p>
        </div>
      )}
      {activeProposal.status === 'proposed' && (
        <div className="mt-5 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
          <p className="text-amber-300 text-sm font-bold">⏳ Pending Admin Approval</p>
          <p className="text-amber-300/50 text-xs mt-1">Contact your department if you have concerns about your assigned slots.</p>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function InstructorPortal() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('availability');

  const { data: instructors = [] } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });
  const currentInstructor = instructors[0];

  return (
    <div className="min-h-screen bg-[#070d1a] text-white font-sans">
      <nav className="flex justify-between items-center px-8 py-4 border-b border-white/5 bg-[#0a1628] sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-black">S</div>
          <span className="font-black text-white tracking-tight text-sm">SmartSchedule <span className="text-blue-400">Instructor</span></span>
        </div>
        <div className="flex items-center gap-4">
          {currentInstructor && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">{currentInstructor.name}</span>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${currentInstructor.type === 'PART_TIME' ? 'bg-purple-900/40 text-purple-300 border-purple-700/40' : 'bg-blue-900/40 text-blue-300 border-blue-700/40'}`}>
                {currentInstructor.type === 'PART_TIME' ? 'Part-time ⚡' : 'Full-time'}
              </span>
            </div>
          )}
          <button onClick={() => { removeToken(); navigate('/login'); }} className="text-xs text-white/25 hover:text-white/60 transition-colors">Sign out</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-1 p-1.5 bg-[#0a1628] border border-white/10 rounded-2xl w-fit mb-8">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${tab === t.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.03]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {currentInstructor?.type === 'PART_TIME' && (
          <div className="mb-6 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-3">
            <span>⚡</span>
            <p className="text-xs text-purple-300">
              <strong>Priority scheduling:</strong> As a part-time instructor, the engine assigns your slots first — your constraints are always respected before full-time instructors.
            </p>
          </div>
        )}

        <div className="bg-[#0a1628] border border-white/10 rounded-[2rem] p-8 shadow-2xl">
          {tab === 'availability' && <AvailabilityTab />}
          {tab === 'preferences'  && <PreferencesTab />}
          {tab === 'schedule'     && <ScheduleTab />}
        </div>
      </main>
    </div>
  );
}
