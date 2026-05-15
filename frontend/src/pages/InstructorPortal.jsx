import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { removeToken } from '../utils/auth';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const slotTimes = { 
  1: '08:00–09:30', 2: '09:45–11:15', 3: '11:30–13:00', 
  4: '13:45–15:15', 5: '15:30–17:00' 
};

const prefConfig = {
  PREFERRED: { label: 'Preferred', short: 'P', color: '#34d399', bg: 'rgba(52,211,153,0.13)', border: 'rgba(52,211,153,0.35)' },
  AVAILABLE: { label: 'Available', short: 'A', color: '#60a5fa', bg: 'rgba(96,165,250,0.13)', border: 'rgba(96,165,250,0.35)' },
  BUSY:      { label: 'Busy',      short: 'B', color: '#f87171', bg: 'rgba(248,113,113,0.13)', border: 'rgba(248,113,113,0.35)' },
  NONE:      { label: 'Unset',     short: '',  color: 'rgba(255,255,255,0.12)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)' },
};
const ORDER = ['NONE', 'AVAILABLE', 'PREFERRED', 'BUSY'];

export default function InstructorPortal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [slots, setSlots] = useState({});
  const semester = '2026-2';

  // 1. Récupération des données existantes
  const { isLoading } = useQuery({
    queryKey: ['availability'],
    queryFn: () => api.get('/availability/me').then(r => {
      const map = {};
      r.data.forEach(s => { map[s.slot_id] = s.preference; });
      setSlots(map);
      return r.data;
    }),
  });

  // 2. Mutation pour sauvegarder
  const submitMutation = useMutation({
    mutationFn: (payload) => api.post('/availability/', { semester, slots: payload }),
    onSuccess: () => {
      toast.success('Availability saved! Admin can now schedule your classes.');
      queryClient.invalidateQueries(['availability']);
    },
    onError: () => toast.error('Submission failed.')
  });

  // --- LOGIQUE DES PRESETS (FREE PASS POUR L'ADMIN) ---

  const applyMorningFreePass = () => {
    const newSlots = {};
    for (let di = 0; di < 5; di++) {
      for (let s = 1; s <= 5; s++) {
        const id = di * 5 + s;
        // Le Dr dit: "Je suis libre le matin, l'admin choisit"
        newSlots[id] = s <= 3 ? 'AVAILABLE' : 'BUSY';
      }
    }
    setSlots(newSlots);
    toast.success("Morning slots opened for Admin");
  };

  const applyAfternoonFreePass = () => {
    const newSlots = {};
    for (let di = 0; di < 5; di++) {
      for (let s = 1; s <= 5; s++) {
        const id = di * 5 + s;
        // Le Dr dit: "Je suis libre l'après-midi, l'admin choisit"
        newSlots[id] = s >= 4 ? 'AVAILABLE' : 'BUSY';
      }
    }
    setSlots(newSlots);
    toast.success("Afternoon slots opened for Admin");
  };

  const cyclePreference = (slotId) => {
    const current = slots[slotId] || 'NONE';
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    setSlots(prev => ({ ...prev, [slotId]: next }));
  };

  const totalSet = Object.values(slots).filter(p => p !== 'NONE').length;

  if (isLoading) return <div className="min-h-screen bg-[#070d1a] flex items-center justify-center text-blue-400">Loading your profile...</div>;

  return (
    <div className="min-h-screen bg-[#070d1a] text-white font-sans">
      {/* Navbar */}
      <nav className="flex justify-between items-center px-8 py-4 border-b border-white/5 bg-[#0a1628]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          <span className="font-bold tracking-tight">UniSchedule <span className="text-blue-400">Instructor</span></span>
        </div>
        <button onClick={() => { removeToken(); navigate('/login'); }} className="text-xs text-white/40 hover:text-white transition-colors">Sign out</button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        
        {/* Header & Quick Presets */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Availability Grid</h1>
            <p className="text-white/40 text-sm">Select your free time. Use presets to quickly allow Admin to choose your shifts.</p>
          </div>

          <div className="flex gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10">
            <button onClick={applyMorningFreePass} className="px-4 py-2 text-[10px] font-bold uppercase rounded-xl hover:bg-white/10 transition-all text-orange-400">
              ☀️ Morning Shift
            </button>
            <button onClick={applyAfternoonFreePass} className="px-4 py-2 text-[10px] font-bold uppercase rounded-xl hover:bg-white/10 transition-all text-blue-400">
              🌙 Afternoon Shift
            </button>
            <button onClick={() => setSlots({})} className="px-4 py-2 text-[10px] font-bold uppercase rounded-xl hover:bg-red-500/10 transition-all text-white/20">
              Reset
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-6 mb-6 px-2">
          {Object.entries(prefConfig).filter(([k]) => k !== 'NONE').map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }} />
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-40">{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div className="bg-[#0a1628] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
          <div className="grid grid-cols-[140px_1fr_1fr_1fr_1fr_1fr] gap-4">
            
            {/* Header row */}
            <div />
            {days.map(d => (
              <div key={d} className="text-center text-[10px] font-black uppercase tracking-[0.2em] opacity-20 mb-4">{d}</div>
            ))}

            {/* Slots rows */}
            {[1, 2, 3, 4, 5].map(slot => (
              <div key={slot} className="contents">
                {/* Time Label */}
                <div className="flex flex-col justify-center pr-6 border-r border-white/5">
                  <span className="text-xs font-bold">Slot {slot}</span>
                  <span className="text-[10px] opacity-30 mt-0.5">{slotTimes[slot]}</span>
                  <span className={`mt-2 text-[8px] font-black px-2 py-0.5 rounded-md w-fit 
                    ${slot <= 3 ? 'bg-orange-500/10 text-orange-500/70' : 'bg-blue-500/10 text-blue-500/70'}`}>
                    {slot <= 3 ? 'MORNING' : 'AFTERNOON'}
                  </span>
                </div>

                {/* Day buttons */}
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
                      
                      {/* Hover Effect */}
                      <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-10 flex justify-between items-center">
          <div className="text-sm text-white/30 italic">
            * Note: "Available" means you allow the Admin to choose any course for this slot.
          </div>
          
          <button
            onClick={() => {
              const payload = Object.entries(slots)
                .filter(([, pref]) => pref !== 'NONE')
                .map(([id, p]) => ({ slot_id: parseInt(id), preference: p }));
              submitMutation.mutate(payload);
            }}
            disabled={totalSet === 0 || submitMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-20 px-10 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl shadow-blue-600/20 active:translate-y-1"
          >
            {submitMutation.isPending ? 'Saving...' : `Confirm & Submit (${totalSet} Slots) →`}
          </button>
        </div>

      </main>
    </div>
  );
}