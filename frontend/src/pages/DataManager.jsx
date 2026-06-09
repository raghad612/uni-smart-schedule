// Each tab is an independent component in components/data/

import { useState } from 'react';
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

  return (
    <div className="min-h-screen bg-[#070d1a] text-white">
     <AdminNavbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tighter mb-1">Data Manager</h1>
          <p className="text-white/40 text-sm">
            Manage instructors, subjects, sections, rooms, and course assignments.
          </p>
        </div>

        {/* Tab navigation */}
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

        {/* Tab content */}
        <div className="bg-[#0a1628] rounded-[2rem] border border-white/10 p-8">
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
