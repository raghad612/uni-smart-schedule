import { useNavigate } from 'react-router-dom';
import { removeToken } from '../utils/auth';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import AdminNavbar from '../components/admin/AdminNavbar';
import StatCard from '../components/admin/StatCard';
import AvailabilityModal from '../components/admin/AvailabilityModal';
import InstructorStatusPanel from '../components/admin/InstructorStatusPanel';
import TimetablePreview from '../components/admin/TimetablePreview';
import Footer from '../components/Footer';

export default function AdminDashboard() {
  const navigate = useNavigate();

  const {
    notes, setNotes,
    semester, setSemester,
    activeProposal,
    selectedInstructor, setSelectedInstructor,
    searchTerm, setSearchTerm,
    instructors,
    instructorsLoading,
    availabilityMap,
    filteredInstructors,
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
          <StatCard label="Instructors" value={instructors.length} sub="Total registered" color="#60a5fa" icon="👥" />
          <StatCard label="Responses" value={submittedCount} sub={`${instructors.length - submittedCount} pending`} color="#34d399" icon="✅" />
          <StatCard label="Conflicts" value={activeProposal ? conflicts.length : 0} sub="Issues to resolve" color="#f87171" icon="⚠️" />
          <StatCard label="Semester" value={semester} sub="Active period" color="#a78bfa" icon="📅" />
        </div>

        <div className="grid lg:grid-cols-12 gap-8">

          {/* Left panel */}
          <div className="lg:col-span-4 space-y-6">

            {/* Engine controls */}
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 shadow-xl">
              <h2 className="text-lg font-bold mb-4 text-white/90">Scheduling Engine</h2>
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
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none h-24 resize-none"
                  placeholder="Notes for this run..."
                />
                <button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-4 rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all text-sm"
                >
                  {runMutation.isPending ? 'Running Engine...' : '⚡ Generate New Schedule'}
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

            {/* Instructor status + search */}
            <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10">
              <div className="flex justify-between items-center mb-2">
                <span /> {/* spacer — panel has its own header internally */}
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