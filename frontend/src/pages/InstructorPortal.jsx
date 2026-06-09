import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';
import Footer from '../components/Footer';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const slotTimes = {
  1: '08:00–09:40', 2: '09:55–11:35', 3: '12:00–13:40',
  4: '14:00–15:40', 5: '16:00–17:40'
};
const prefConfig = {
  PREFERRED: { label: 'Preferred', short: 'P', color: '#34d399', bg: 'rgba(52,211,153,0.13)', border: 'rgba(52,211,153,0.35)' },
  AVAILABLE: { label: 'Available', short: 'A', color: '#60a5fa', bg: 'rgba(96,165,250,0.13)', border: 'rgba(96,165,250,0.35)' },
  BUSY:      { label: 'Busy',      short: 'B', color: '#f87171', bg: 'rgba(248,113,113,0.13)', border: 'rgba(248,113,113,0.35)' },
  NONE:      { label: 'Unset',     short: '',  color: 'rgba(255,255,255,0.12)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)' },
};
const ORDER = ['NONE', 'AVAILABLE', 'PREFERRED', 'BUSY'];

// ── My Schedule tab ────────────────────────────────────────────────────────
function MyScheduleTab({ instructorProfile, semester }) {
  const { data: proposalDetail } = useQuery({
    queryKey: ['proposal-approved-detail', semester],
    queryFn: () => api.get(`/proposals/approved?semester=${semester}`).then(r => r.data),
  });

  const approvedProposal = proposalDetail;
  if (!approvedProposal) {
    return (
      <div className="flex flex-col items-center justify-center py-24 opacity-30">
        <div className="text-5xl mb-4">📅</div>
        <p className="text-sm font-medium">No approved schedule for {semester}.</p>
        <p className="text-xs mt-2 text-white/40">Check back after the admin finalises the schedule.</p>
      </div>
    );
  }

  if (!proposalDetail) {
    return <p className="text-center py-20 text-white/30 text-sm animate-pulse">Loading schedule...</p>;
  }

  // Filter by instructor_id using the profile — not name string comparison
  const myAssignments = proposalDetail.assignments?.filter(
    a => a.instructor_id === instructorProfile?.id
  ) ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <span className="text-[10px] font-black uppercase tracking-widest text-green-400">
            ✓ Schedule Approved
          </span>
        </div>
        <span className="text-xs text-white/30">
          {myAssignments.length} session{myAssignments.length !== 1 ? 's' : ''} assigned · Semester {semester}
        </span>
      </div>

      {myAssignments.length === 0 ? (
        <div className="text-center py-16 opacity-30">
          <p className="text-sm">No sessions assigned to you in the approved schedule.</p>
        </div>
      ) : (
        <div className="bg-[#0a1628] border border-white/10 rounded-[2.5rem] p-4 sm:p-8 shadow-2xl">
          <div className="overflow-x-auto">
          <div className="grid grid-cols-[110px_repeat(5,minmax(90px,1fr))] sm:grid-cols-[140px_1fr_1fr_1fr_1fr_1fr] gap-3 sm:gap-4 min-w-[640px]">
            <div />
            {days.map(d => (
              <div key={d} className="text-center text-[10px] font-black uppercase tracking-[0.2em] opacity-20 mb-4">{d}</div>
            ))}
            {[1, 2, 3, 4, 5].map(slot => (
              <div key={slot} className="contents">
                <div className="flex flex-col justify-center pr-6 border-r border-white/5">
                  <span className="text-xs font-bold">Session {slot}</span>
                  <span className="text-[10px] opacity-30 mt-0.5">{slotTimes[slot]}</span>
                </div>
                {days.map((_, di) => {
                  const slotId = di * 5 + slot;
                  const assignment = myAssignments.find(a => a.slot_id === slotId);
                  return (
                    <div key={slotId}>
                      {assignment ? (
                        <div className="h-20 rounded-2xl bg-green-500/10 border-2 border-green-500/30 flex flex-col items-center justify-center p-2 text-center">
                          <span className="text-[9px] font-black text-green-400 uppercase tracking-tighter truncate w-full text-center">
                            {assignment.subject_code || assignment.subject_name}
                          </span>
                          <span className="text-[8px] text-white/40 mt-1 uppercase">
                            Rm: {assignment.room_name}
                          </span>
                        </div>
                      ) : (
                        <div className="h-20 rounded-2xl bg-white/[0.01] border border-white/[0.04] flex items-center justify-center">
                          <span className="text-[7px] text-white/10 uppercase tracking-widest">—</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main portal ────────────────────────────────────────────────────────────
export default function InstructorPortal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [slots, setSlots] = useState({});
  const [activeTab, setActiveTab] = useState('availability');
  const [semesterYear, setSemesterYear] = useState(new Date().getFullYear());
  const [semesterPeriod, setSemesterPeriod] = useState('2');
  const semester = `${semesterYear}-${semesterPeriod}`;

  const { data: instructorProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['instructor-profile'],
    queryFn: () => api.get('/instructors/me').then(r => r.data),
    retry: false,
  });

  // Reload availability grid when semester changes
  const { isLoading: availLoading } = useQuery({
    queryKey: ['availability', semester],
    queryFn: () => api.get(`/availability/me?semester=${semester}`).then(r => {
      const map = {};
      r.data.forEach(s => { map[s.slot_id] = s.preference; });
      setSlots(map);
      return r.data;
    }),
  });

  const submitMutation = useMutation({
    mutationFn: async (payload) => {
      const preferred = payload.filter(s => s.preference === 'PREFERRED').map(s => s.slot_id);
      const available = payload.filter(s => s.preference === 'AVAILABLE').map(s => s.slot_id);
      const busy = payload.filter(s => s.preference === 'BUSY').map(s => s.slot_id);

      const calls = [];
      if (preferred.length) calls.push(api.post('/availability/', { slot_ids: preferred, preference: 'PREFERRED', semester }));
      if (available.length) calls.push(api.post('/availability/', { slot_ids: available, preference: 'AVAILABLE', semester }));
      if (busy.length) calls.push(api.post('/availability/', { slot_ids: busy, preference: 'BUSY', semester }));
      if (!preferred.length) calls.push(api.post('/availability/', { slot_ids: [], preference: 'PREFERRED', semester }));
      if (!available.length) calls.push(api.post('/availability/', { slot_ids: [], preference: 'AVAILABLE', semester }));
      if (!busy.length) calls.push(api.post('/availability/', { slot_ids: [], preference: 'BUSY', semester }));

      return Promise.all(calls);
    },
    onSuccess: () => {
      toast.success('Availability saved! Admin can now schedule your classes.');
      queryClient.invalidateQueries({ queryKey: ['availability', semester] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Submission failed.');
    }
  });

  const applyMorningFreePass = () => {
    const newSlots = {};
    for (let di = 0; di < 5; di++)
      for (let s = 1; s <= 5; s++)
        newSlots[di * 5 + s] = s <= 3 ? 'AVAILABLE' : 'BUSY';
    setSlots(newSlots);
    toast.success('Morning slots opened');
  };

  const applyAfternoonFreePass = () => {
    const newSlots = {};
    for (let di = 0; di < 5; di++)
      for (let s = 1; s <= 5; s++)
        newSlots[di * 5 + s] = s >= 4 ? 'AVAILABLE' : 'BUSY';
    setSlots(newSlots);
    toast.success('Afternoon slots opened');
  };

  const cyclePreference = (slotId) => {
    const current = slots[slotId] || 'NONE';
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    setSlots(prev => ({ ...prev, [slotId]: next }));
  };

  const availableCount = Object.values(slots).filter(p => p === 'PREFERRED' || p === 'AVAILABLE').length;
  const requiredSessions = instructorProfile?.required_sessions;

  const handleSubmit = () => {
    const payload = Object.entries(slots)
      .filter(([, pref]) => pref !== 'NONE')
      .map(([id, p]) => ({ slot_id: parseInt(id), preference: p }));

    if (availableCount === 0) {
      toast.error('Please select at least one Available or Preferred slot.');
      return;
    }
    if (requiredSessions && availableCount < requiredSessions) {
      toast.error(
        `You marked ${availableCount} slot${availableCount !== 1 ? 's' : ''} as Available or Preferred, but at least ${requiredSessions} are required.`,
        { duration: 6000 }
      );
      return;
    }
    submitMutation.mutate(payload);
  };

  if (profileLoading || availLoading) return (
    <div className="min-h-screen bg-[#070d1a] flex items-center justify-center text-blue-400">
      Loading your profile...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070d1a] text-white font-sans">
      <nav className="flex justify-between items-center px-8 py-4 border-b border-white/5 bg-[#0a1628]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          <span className="font-bold tracking-tight">UniSchedule <span className="text-blue-400">Instructor</span></span>
          {instructorProfile && (
            <span className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 capitalize">
              {instructorProfile.name}
            </span>
          )}
        </div>
        <button onClick={() => { removeToken(); navigate('/login'); }} className="text-xs text-white/40 hover:text-white transition-colors">
          Sign out
        </button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Semester selector */}
        <div className="flex items-center gap-3 mb-8 p-4 rounded-2xl bg-white/5 border border-white/10 w-fit">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Semester</span>
          <input
            type="number"
            value={semesterYear}
            onChange={e => setSemesterYear(parseInt(e.target.value) || new Date().getFullYear())}
            min={2020}
            max={2099}
            className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center outline-none focus:border-blue-500"
          />
          <div className="flex gap-1 bg-black/20 p-1 rounded-lg border border-white/10">
            {['1', '2'].map(p => (
              <button
                key={p}
                onClick={() => setSemesterPeriod(p)}
                className={`px-3 py-1 rounded-md text-xs font-black uppercase transition-all ${
                  semesterPeriod === p
                    ? 'bg-blue-600 text-white'
                    : 'text-white/30 hover:text-white'
                }`}
              >
                S{p}
              </button>
            ))}
          </div>
          <span className="text-xs text-white/40 font-bold">{semester}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-white/5 p-1.5 rounded-2xl border border-white/10 w-fit">
          <button
            onClick={() => setActiveTab('availability')}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === 'availability'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-white/30 hover:text-white'
            }`}
          >
            📋 Availability
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === 'schedule'
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                : 'text-white/30 hover:text-white'
            }`}
          >
            📅 My Schedule
          </button>
        </div>

        {/* Availability tab */}
        {activeTab === 'availability' && (
          <>
            <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Availability Grid</h1>
                <p className="text-white/40 text-sm">Click each cell to cycle through your preference. Submit when done.</p>
                <p className="text-white/20 text-xs mt-1">Semester: {semester}</p>
                {requiredSessions && (
                  <p className="text-xs mt-2">
                    <span className={`font-bold ${availableCount >= requiredSessions ? 'text-green-400' : 'text-orange-400'}`}>
                      {availableCount} / {requiredSessions} required slots marked
                    </span>
                  </p>
                )}
              </div>
              <div className="flex gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10">
                <button onClick={applyMorningFreePass} className="px-4 py-2 text-[10px] font-bold uppercase rounded-xl hover:bg-white/10 transition-all text-orange-400">☀️ Morning</button>
                <button onClick={applyAfternoonFreePass} className="px-4 py-2 text-[10px] font-bold uppercase rounded-xl hover:bg-white/10 transition-all text-blue-400">🌙 Afternoon</button>
                <button onClick={() => setSlots({})} className="px-4 py-2 text-[10px] font-bold uppercase rounded-xl hover:bg-red-500/10 transition-all text-white/20">Reset</button>
              </div>
            </div>

            <div className="mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] uppercase font-black tracking-widest text-white/20 mb-3">Legend</p>
              <div className="flex flex-wrap gap-6">
                {Object.entries(prefConfig).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm"
                      style={{ background: cfg.bg, border: `2px solid ${cfg.border}`, color: cfg.color }}>
                      {cfg.short}
                    </div>
                    <div>
                      <p className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0a1628] border border-white/10 rounded-[2.5rem] p-4 sm:p-8 shadow-2xl">
              <div className="overflow-x-auto">
              <div className="grid grid-cols-[110px_repeat(5,minmax(90px,1fr))] sm:grid-cols-[140px_1fr_1fr_1fr_1fr_1fr] gap-3 sm:gap-4 min-w-[640px]">
                <div />
                {days.map(d => (
                  <div key={d} className="text-center text-[10px] font-black uppercase tracking-[0.2em] opacity-20 mb-4">{d}</div>
                ))}
                {[1, 2, 3, 4, 5].map(slot => (
                  <div key={slot} className="contents">
                    <div className="flex flex-col justify-center pr-6 border-r border-white/5">
                      <span className="text-xs font-bold">Session {slot}</span>
                      <span className="text-[10px] opacity-30 mt-0.5">{slotTimes[slot]}</span>
                      <span className={`mt-2 text-[8px] font-black px-2 py-0.5 rounded-md w-fit ${slot <= 3 ? 'bg-orange-500/10 text-orange-500/70' : 'bg-blue-500/10 text-blue-500/70'}`}>
                        {slot <= 3 ? 'MORNING' : 'AFTERNOON'}
                      </span>
                    </div>
                    {days.map((_, di) => {
                      const slotId = di * 5 + slot;
                      const pref = slots[slotId] || 'NONE';
                      const cfg = prefConfig[pref];
                      return (
                        <button
                          key={slotId}
                          onClick={() => cyclePreference(slotId)}
                          className="group relative h-20 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center overflow-hidden active:scale-95"
                          style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}
                        >
                          <span className="text-lg font-black">{cfg.short}</span>
                          <span className="text-[8px] font-bold opacity-30 uppercase">{cfg.label}</span>
                          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              </div>
            </div>

            <div className="mt-10 flex justify-between items-center">
              <div className="text-sm text-white/30 italic">
                * Click any cell to cycle: Unset → Available → Preferred → Busy → Unset
              </div>
              <button
                onClick={handleSubmit}
                disabled={availableCount === 0 || submitMutation.isPending}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-20 px-10 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl shadow-blue-600/20 active:translate-y-1"
              >
                {submitMutation.isPending ? 'Saving...' : `Confirm & Submit (${availableCount} slots) →`}
              </button>
            </div>
          </>
        )}

        {activeTab === 'schedule' && (
          <MyScheduleTab instructorProfile={instructorProfile} semester={semester} />
        )}
      </main>
      <Footer />
    </div>
  );
}