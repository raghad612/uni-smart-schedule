import { useNavigate } from 'react-router-dom';
import { removeToken } from '../utils/auth';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import AdminNavbar from '../components/admin/AdminNavbar';
import StatCard from '../components/admin/StatCard';
import AvailabilityModal from '../components/admin/AvailabilityModal';
import InstructorStatusPanel from '../components/admin/InstructorStatusPanel';
import TimetablePreview from '../components/admin/TimetablePreview';
import Footer from '../components/Footer';

const LANG_COLOR = {
  ENGLISH: { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)', text: '#60a5fa' },
  FRENCH:  { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', text: '#a78bfa' },
};

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const {
    notes, setNotes,
    semester, setSemester,
    sections,
    selectedSectionId, setSelectedSectionId,
    activeProposal,
    selectedInstructor, setSelectedInstructor,
    searchTerm, setSearchTerm,
    instructors,
    instructorsLoading,
    availabilityMap,
    filteredInstructors,
    relevantInstructors,
    submittedCount,
    proposal,
    conflicts,
    runMutation,
    approveMutation,
    rejectMutation,
  } = useAdminDashboard();

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  const selectedSection = sections.find(s => s.id === selectedSectionId);

  // Group sections by year for display
  const sectionsByYear = sections.reduce((acc, s) => {
    const y = s.year_level;
    if (!acc[y]) acc[y] = [];
    acc[y].push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
      <AdminNavbar onLogout={handleLogout} />

      {selectedInstructor && (
        <AvailabilityModal
          instructor={selectedInstructor}
          onClose={() => setSelectedInstructor(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Instructors" value={relevantInstructors.length}
            sub={selectedSectionId ? "In selected section" : "Total registered"}
            color="#60a5fa" icon="👥" />
          <StatCard label="Responses" value={submittedCount}
            sub={`${relevantInstructors.length - submittedCount} pending`}
            color="#34d399" icon="✅" />
          <StatCard label="Conflicts" value={activeProposal ? conflicts.length : 0}
            sub="Issues to resolve" color="#f87171" icon="⚠️" />
          <StatCard label="Semester" value={semester}
            sub="Active period" color="#a78bfa" icon="📅" />
        </div>

        <div className="grid lg:grid-cols-12 gap-8">

          {/* Left panel */}
          <div className="lg:col-span-4 space-y-6">

            {/* Section picker */}
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">
                Step 1 — Select Section
              </h2>

              {/* All sections option */}
              <button
                onClick={() => setSelectedSectionId(null)}
                className={`w-full text-left px-4 py-3 rounded-xl mb-3 border transition-all text-sm font-bold ${
                  selectedSectionId === null
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'bg-white/[0.02] border-white/5 text-white/30 hover:text-white hover:bg-white/5'
                }`}
              >
                🌐 All Sections (full semester)
              </button>

              {Object.entries(sectionsByYear).sort(([a], [b]) => a - b).map(([year, secs]) => (
                <div key={year} className="mb-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2 px-1">
                    {ordinal(parseInt(year))} Year
                  </p>
                  <div className="space-y-2">
                    {secs.map(s => {
                      const lc = LANG_COLOR[s.language] || LANG_COLOR.ENGLISH;
                      const isSelected = selectedSectionId === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSectionId(s.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-white/10 border-white/30'
                              : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-bold text-white">
                                {s.group_label}
                              </span>
                              <span
                                className="ml-2 text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                                style={{ background: lc.bg, color: lc.text, border: `1px solid ${lc.border}` }}
                              >
                                {s.language}
                              </span>
                            </div>
                            {isSelected && (
                              <span className="text-[9px] text-blue-400 font-black">✓ Selected</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Engine controls */}
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">
                Step 2 — Generate Schedule
              </h2>

              {selectedSection && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">
                    Generating for:
                  </p>
                  <p className="text-sm font-bold text-white">
                    Year {selectedSection.year_level} · {selectedSection.language} · {selectedSection.group_label}
                  </p>
                  <p className="text-[10px] text-white/30 mt-1">
                    {relevantInstructors.length} instructor{relevantInstructors.length !== 1 ? 's' : ''} · {submittedCount} submitted availability
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <input
                  value={semester}
                  onChange={e => setSemester(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none"
                  placeholder="Semester (ex: 2024-2)"
                />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none h-20 resize-none"
                  placeholder="Optional notes..."
                />
                <button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-4 rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all text-sm"
                >
                  {runMutation.isPending ? 'Running Engine...' : '⚡ Generate Schedule'}
                </button>
                <button
                  onClick={() => navigate('/proposals')}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-[10px] text-white/40 hover:text-white uppercase tracking-widest transition-all"
                >
                  🗂 View History & Archives
                </button>
                <button
                  onClick={() => navigate('/data')}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-[10px] text-white/40 hover:text-white uppercase tracking-widest transition-all"
                >
                  ⚙️ Manage Data
                </button>
              </div>
            </div>

            {/* Instructor status */}
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-black uppercase tracking-widest text-white/30">
                  {selectedSectionId ? 'Section Instructors' : 'All Instructors'}
                </p>
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none w-24"
                />
              </div>
              <InstructorStatusPanel
                instructors={filteredInstructors}
                availabilityMap={availabilityMap}
                isLoading={instructorsLoading}
                onSelectInstructor={setSelectedInstructor}
              />
            </div>
          </div>

          {/* Right panel — timetable */}
          <TimetablePreview
            proposal={proposal}
            conflicts={conflicts}
            activeProposal={activeProposal}
            onApprove={() => approveMutation.mutate()}
            onReject={() => rejectMutation.mutate()}
            isApprovePending={approveMutation.isPending}
            isRejectPending={rejectMutation.isPending}
          />
        </div>
      </div>
      <Footer />
    </div>
  );
}