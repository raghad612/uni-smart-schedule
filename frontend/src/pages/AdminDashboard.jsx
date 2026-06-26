import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
// import { removeToken } from '../utils/auth';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import AdminNavbar from '../components/admin/AdminNavbar';
import StatCard from '../components/admin/StatCard';
import AvailabilityModal from '../components/admin/AvailabilityModal';
import InstructorStatusPanel from '../components/admin/InstructorStatusPanel';
import TimetablePreview from '../components/admin/TimetablePreview';
import LockedSummaryPanel from '../components/admin/LockedSummaryPanel';
import GenerateConfirmModal from '../components/admin/GenerateConfirmModal';
import Footer from '../components/Footer';
import api from '../utils/api';

const LANG_COLOR = {
  ENGLISH: { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)', text: '#60a5fa' },
  FRENCH:  { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', text: '#a78bfa' },
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const {
    notes, setNotes,
    semester,
    semesterYear, setSemesterYear,
    semesterPeriod, setSemesterPeriod,
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

 // const handleLogout = () => { removeToken(); navigate('/login'); };
  const selectedSection = sections.find(s => s.id === selectedSectionId);

  const sortedSections = sections
    .slice()
    .sort((a, b) => a.year_level - b.year_level || a.language.localeCompare(b.language));

  // ── Phase 3: locked-summary fetch + confirmation modal ────────────────────
  // Polls the backend for locks in the most recent draft for this semester.
  // Result is used in two places: (1) the LockedSummaryPanel above the
  // Generate button, and (2) the click handler below, which intercepts
  // Generate to show a confirmation modal when locks are present.
  const { data: lockedSummary } = useQuery({
    queryKey: ['locked-summary', semester],
    queryFn: () =>
      api.get(`/proposals/locked-summary?semester=${semester}`).then(r => r.data),
    enabled: !!semester,
    refetchOnWindowFocus: true,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleGenerateClick = () => {
    if (lockedSummary && lockedSummary.locked_count > 0) {
      setConfirmOpen(true);
    } else {
      runMutation.mutate();
    }
  };

  const handleConfirmGenerate = () => {
    setConfirmOpen(false);
    runMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
      <AdminNavbar  />

      {selectedInstructor && (
        <AvailabilityModal
          instructor={selectedInstructor}
          onClose={() => setSelectedInstructor(null)}
        />
      )}

      <GenerateConfirmModal
        open={confirmOpen}
        lockedCount={lockedSummary?.locked_count || 0}
        draftId={lockedSummary?.most_recent_draft_id}
        semester={semester}
        onConfirm={handleConfirmGenerate}
        onCancel={() => setConfirmOpen(false)}
        isPending={runMutation.isPending}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Instructors" value={relevantInstructors.length}
            sub={selectedSectionId ? 'In selected section' : 'Total registered'}
            color="#60a5fa" icon="👥" />
          <StatCard label="Responses" value={submittedCount}
            sub={`${relevantInstructors.length - submittedCount} pending`}
            color="#34d399" icon="✅" />
          <StatCard label="Conflicts" value={activeProposal ? conflicts.length : 0}
            sub="Issues to resolve" color="#f87171" icon="⚠️" />
          <StatCard label="Semester" value={semester}
            sub="Active period" color="#a78bfa" icon="📅" />
        </div>

        <div className="grid lg:grid-cols-12 gap-6 sm:gap-8">

          {/* ── Left panel ── */}
          <div className="lg:col-span-4 space-y-4 sm:space-y-6">

            {/* Step 1 — Section + Semester */}
            <div className="p-5 sm:p-6 rounded-[2rem] bg-white/5 border border-white/10 shadow-xl space-y-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/30">
                Step 1 — Select Section & Semester
              </h2>

              {/* Section dropdown */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/20 mb-1.5">
                  Section
                </label>
                <select
                  value={selectedSectionId ?? ''}
                  onChange={e => setSelectedSectionId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
                >
                  <option value="">🌐 All Sections (full semester)</option>
                  {sortedSections.map(s => (
                    <option key={s.id} value={s.id}>
                      Year {s.year_level} — {s.group_label} ({s.language})
                    </option>
                  ))}
                </select>
              </div>

              {/* Semester — year + period */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/20 mb-1.5">
                  Semester
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={semesterYear}
                    onChange={e => setSemesterYear(parseInt(e.target.value) || 2024)}
                    min={2020}
                    max={2099}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none"
                    placeholder="Year"
                  />
                  <select
                    value={semesterPeriod}
                    onChange={e => setSemesterPeriod(e.target.value)}
                    className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none cursor-pointer flex-shrink-0"
                  >
                    <option value="1">S1</option>
                    <option value="2">S2</option>
                  </select>
                </div>
                <p className="text-[9px] text-white/20 mt-1.5 px-1">
                  Current: <span className="text-white/40 font-bold">{semester}</span>
                </p>
              </div>

              {/* Selected section info */}
              {selectedSection && (
                <div className="px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
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
            </div>

            {/* Step 2 — Generate */}
            <div className="p-5 sm:p-6 rounded-[2rem] bg-white/5 border border-white/10 shadow-xl">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">
                Step 2 — Generate Schedule
              </h2>
             <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none h-16 resize-none"
                  placeholder="Optional notes..."
                />

                {/* Phase 3: lock carry-forward summary - hidden when zero locks */}
                <LockedSummaryPanel summary={lockedSummary} />

                <button
                  onClick={handleGenerateClick}
                  disabled={runMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-4 rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all text-sm"
                >
                  {runMutation.isPending ? 'Running Engine...' : '⚡ Generate Schedule'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate('/proposals')}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-[10px] text-white/40 hover:text-white uppercase tracking-widest transition-all"
                  >
                    🗂 History
                  </button>
                  <button
                    onClick={() => navigate('/data')}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-[10px] text-white/40 hover:text-white uppercase tracking-widest transition-all"
                  >
                    ⚙️ Manage Data
                  </button>
                </div>
              </div>
            </div>

            {/* Instructor status — no extra wrapper, InstructorStatusPanel provides its own */}
            <div className="rounded-[2rem] bg-white/5 border border-white/10">
              <div className="flex justify-between items-center px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
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

          {/* ── Right panel — timetable ── */}
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