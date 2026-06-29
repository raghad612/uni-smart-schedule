// Each tab is an independent component in components/data/
import { useState, useEffect } from 'react';
import AdminNavbar from '../components/admin/AdminNavbar';
import Footer from '../components/Footer';
import InstructorsTab from '../components/data/InstructorsTab';
import SubjectsTab from '../components/data/SubjectsTab';
import SectionsTab from '../components/data/SectionsTab';
import RoomsTab from '../components/data/RoomsTab';
import CoursesTab from '../components/data/CoursesTab';
import UsersTab from '../components/data/UsersTab';

const TABS = ['Instructors', 'Subjects', 'Sections', 'Rooms', 'Courses', 'Users'];

export default function DataManager() {
  const [activeTab, setActiveTab] = useState('Instructors');
  const [tabMenuOpen, setTabMenuOpen] = useState(false);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = tabMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [tabMenuOpen]);

  const pickTab = (tab) => {
    setActiveTab(tab);
    setTabMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
      <AdminNavbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tighter mb-1">Data Manager</h1>
          <p className="text-white/40 text-xs sm:text-sm">
            Manage instructors, subjects, sections, rooms, and course assignments.
          </p>
        </div>

        {/* ── Tab navigation ─────────────────────────────────────── */}

        {/* Desktop / tablet: original horizontal pill bar */}
        <div className="hidden sm:flex gap-2 mb-8 bg-white/5 p-1.5 rounded-2xl border border-white/10 w-fit">
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

        {/* Mobile: hamburger trigger that shows current tab */}
        <div className="sm:hidden mb-6">
          <button
            onClick={() => setTabMenuOpen(true)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-left"
          >
            <span className="flex items-center gap-3">
              <span className="flex flex-col gap-1">
                <span className="block w-4 h-0.5 bg-white/60 rounded" />
                <span className="block w-4 h-0.5 bg-white/60 rounded" />
                <span className="block w-4 h-0.5 bg-white/60 rounded" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Section</span>
              <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">{activeTab}</span>
            </span>
            <span className="text-white/40 text-lg">›</span>
          </button>
        </div>

        {/* Mobile drawer */}
        {tabMenuOpen && (
          <div
            className="sm:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setTabMenuOpen(false)}
          >
            <div
              className="absolute top-0 right-0 h-full w-72 max-w-[85vw] bg-[#0a1628] border-l border-white/10 shadow-2xl p-5 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <p className="text-white font-bold text-sm">Choose section</p>
                <button
                  onClick={() => setTabMenuOpen(false)}
                  aria-label="Close menu"
                  className="w-8 h-8 rounded-lg border border-white/10 text-white/60 hover:text-white text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {TABS.map(tab => {
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => pickTab(tab)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all ${
                        isActive
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          : 'text-white/60 hover:text-white bg-white/[0.03] border border-white/5'
                      }`}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab content */}
        <div className="bg-[#0a1628] rounded-2xl sm:rounded-[2rem] border border-white/10 p-4 sm:p-8">
          {activeTab === 'Instructors' && <InstructorsTab />}
          {activeTab === 'Subjects'    && <SubjectsTab />}
          {activeTab === 'Sections'    && <SectionsTab />}
          {activeTab === 'Rooms'       && <RoomsTab />}
          {activeTab === 'Courses'     && <CoursesTab />}
          {activeTab === 'Users'       && <UsersTab />}
        </div>
      </div>
      <Footer />
    </div>
  );
}