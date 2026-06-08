
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, FormField, inputClass, selectClass, getErrorMessage } from './shared';

const SESSION_TYPES = ['lecture', 'td', 'tp'];
const SESSION_LABELS = { lecture: 'Lecture', td: 'TD', tp: 'TP' };

// Searchable subject combobox — type to filter existing subjects or create a new one
function SubjectCombobox({ search, setSearch, onSelect, onCreateNew, showDropdown, setShowDropdown, subjects }) {
  const filtered = subjects.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );
  const isNew = search.trim().length > 1 &&
    !subjects.some(s => s.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="relative">
      <input
        className={inputClass}
        value={search}
        onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search or type a new subject name..."
        autoComplete="off"
      />
      {showDropdown && search.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#0a1628] border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s.id}
              className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-all border-b border-white/5 last:border-0"
              onClick={() => { onSelect(s); setShowDropdown(false); }}
            >
              <span className="font-bold text-white">{s.name}</span>
              <span className="text-white/30 text-xs ml-2">({s.code})</span>
            </button>
          ))}
          {isNew && (
            <button
              className="w-full text-left px-4 py-3 text-sm hover:bg-blue-500/10 transition-all text-blue-400 font-bold"
              onClick={() => { onCreateNew(); setShowDropdown(false); }}
            >
              + Create new subject "{search.trim()}"
            </button>
          )}
          {filtered.length === 0 && !isNew && (
            <p className="px-4 py-3 text-xs text-white/30">No subjects found.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoursesTab() {
  const qc = useQueryClient();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedSection, setSelectedSection] = useState(null);
  const [activeSemester, setActiveSemester] = useState('1');

  // Add form state
  const [addForm, setAddForm] = useState({ subject_id: null, instructor_id: '', session_type: 'lecture' });
  const [addSearch, setAddSearch] = useState('');
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  // Edit modal state
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ subject_id: null, instructor_id: '', session_type: 'lecture' });
  const [editSearch, setEditSearch] = useState('');
  const [showEditDropdown, setShowEditDropdown] = useState(false);

  // New subject mini-popup state — 'add' | 'edit' | null
  const [newSubjectContext, setNewSubjectContext] = useState(null);
  const [newSubjectForm, setNewSubjectForm] = useState({ code: '', credits: 3, sessions_per_week: 2 });

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/sections/').then(r => r.data),
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/subjects/').then(r => r.data),
  });
  const { data: instructors = [] } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });
  const { data: allCourses = [], isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses/').then(r => r.data),
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const semester = activeSemester; // "1" or "2" — year-independent

  // Courses belonging to the selected section and semester
  const sectionCourses = allCourses.filter(
    c => c.section_id === selectedSection?.id && c.semester === semester
  );

  // Instructors already teaching in this section — shown first in dropdown
  const sectionInstructorIds = new Set(sectionCourses.map(c => c.instructor_id));
  const sectionInstructors = instructors.filter(i => sectionInstructorIds.has(i.id));
  const otherInstructors = instructors.filter(i => !sectionInstructorIds.has(i.id));

  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]));
  const instructorMap = Object.fromEntries(instructors.map(i => [i.id, i]));

  // Group sections by year for the left panel
  const sectionsByYear = sections.reduce((acc, s) => {
    if (!acc[s.year_level]) acc[s.year_level] = [];
    acc[s.year_level].push(s);
    return acc;
  }, {});

  // ── Mutations ─────────────────────────────────────────────────────────────

  // Create a brand-new subject inline, then auto-select it in the triggering form
  const createSubjectMutation = useMutation({
    mutationFn: (data) => api.post('/subjects/', data),
    onSuccess: (res) => {
      toast.success(`Subject "${res.data.name}" created.`);
      qc.invalidateQueries(['subjects']);
      if (newSubjectContext === 'add') {
        setAddForm(p => ({ ...p, subject_id: res.data.id }));
        setAddSearch(res.data.name);
      } else {
        setEditForm(p => ({ ...p, subject_id: res.data.id }));
        setEditSearch(res.data.name);
      }
      setNewSubjectContext(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const createCourseMutation = useMutation({
    mutationFn: (data) => api.post('/courses/', data),
    onSuccess: () => {
      toast.success('Course added.');
      qc.invalidateQueries(['courses']);
      // Reset add form but keep section selected
      setAddForm({ subject_id: null, instructor_id: '', session_type: 'lecture' });
      setAddSearch('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/courses/${id}`, data),
    onSuccess: () => {
      toast.success('Course updated.');
      qc.invalidateQueries(['courses']);
      setEditModal(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: (id) => api.delete(`/courses/${id}`),
    onSuccess: () => { toast.success('Course removed.'); qc.invalidateQueries(['courses']); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSectionSelect = (section) => {
    setSelectedSection(section);
    // Reset add form when switching sections
    setAddForm({ subject_id: null, instructor_id: '', session_type: 'lecture' });
    setAddSearch('');
  };

  const handleAddSubmit = () => {
    if (!addForm.subject_id) { toast.error('Select a subject.'); return; }
    if (!addForm.instructor_id) { toast.error('Select an instructor.'); return; }
    createCourseMutation.mutate({
      subject_id: addForm.subject_id,
      section_id: selectedSection.id,
      instructor_id: parseInt(addForm.instructor_id),
      semester,
      session_type: addForm.session_type,
    });
  };

  const openEdit = (course) => {
    const subj = subjectMap[course.subject_id];
    setEditForm({
      subject_id: course.subject_id,
      instructor_id: String(course.instructor_id),
      session_type: course.session_type,
    });
    setEditSearch(subj?.name || '');
    setEditModal(course);
  };

  const handleEditSubmit = () => {
    if (!editForm.subject_id) { toast.error('Select a subject.'); return; }
    if (!editForm.instructor_id) { toast.error('Select an instructor.'); return; }
    updateCourseMutation.mutate({
      id: editModal.id,
      data: {
        subject_id: editForm.subject_id,
        instructor_id: parseInt(editForm.instructor_id),
        session_type: editForm.session_type,
      },
    });
  };

  const handleNewSubjectSave = () => {
    if (!newSubjectForm.code.trim()) { toast.error('Subject code is required.'); return; }
    const name = newSubjectContext === 'add' ? addSearch.trim() : editSearch.trim();
    createSubjectMutation.mutate({
      name,
      code: newSubjectForm.code.trim().toUpperCase(),
      credits: parseFloat(newSubjectForm.credits),
      sessions_per_week: parseFloat(newSubjectForm.sessions_per_week),
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6">

      {/* ── Left panel: section picker ──────────────────────────────────── */}
      <div className="w-52 flex-shrink-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Section</p>

        {/* Semester toggle */}
        <div className="flex gap-1 mb-4 bg-white/5 p-1 rounded-xl border border-white/10">
          {['1', '2'].map(s => (
            <button
              key={s}
              onClick={() => setActiveSemester(s)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                activeSemester === s ? 'bg-blue-600 text-white' : 'text-white/30 hover:text-white'
              }`}
            >
              Sem {s}
            </button>
          ))}
        </div>

        {/* Year groups */}
        {Object.entries(sectionsByYear).sort(([a], [b]) => a - b).map(([year, secs]) => (
          <div key={year} className="mb-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1.5 px-1">Year {year}</p>
            {secs.sort((a, b) => a.language.localeCompare(b.language)).map(s => (
              <button
                key={s.id}
                onClick={() => handleSectionSelect(s)}
                className={`w-full text-left px-3 py-2 rounded-xl mb-1 border transition-all text-xs ${
                  selectedSection?.id === s.id
                    ? 'bg-blue-600/20 border-blue-500/40 text-white font-bold'
                    : 'bg-white/[0.02] border-white/5 text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {s.language === 'ENGLISH' ? '🇬🇧' : '🇫🇷'} {s.language === 'ENGLISH' ? 'English' : 'French'}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Right panel: course list + add form ────────────────────────── */}
      <div className="flex-1 min-w-0">
        {!selectedSection ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-64 opacity-20">
            <div className="text-4xl mb-3">👈</div>
            <p className="text-sm">Select a section to manage its courses.</p>
          </div>
        ) : (
          <>
            {/* Section header */}
            <div className="mb-5">
              <h3 className="font-bold text-white text-lg">
                {selectedSection.group_label}
              </h3>
              <p className="text-[10px] text-white/30 uppercase">
                Semester {activeSemester} · {sectionCourses.length} course{sectionCourses.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Existing course instances */}
            <div className="space-y-2 mb-6">
              {isLoading && <p className="text-white/30 text-xs animate-pulse">Loading...</p>}
              {sectionCourses.length === 0 && !isLoading && (
                <p className="text-white/20 text-xs py-6 text-center border border-dashed border-white/10 rounded-2xl">
                  No courses yet for this section and semester.
                </p>
              )}
              {sectionCourses.map(c => {
                const subj = subjectMap[c.subject_id];
                const instr = instructorMap[c.instructor_id];
                return (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                    <div>
                      <p className="font-bold text-sm">{subj?.name || `Subject #${c.subject_id}`}</p>
                      <p className="text-[10px] text-white/30 capitalize">
                        {instr?.name || `Instructor #${c.instructor_id}`} · {SESSION_LABELS[c.session_type] || c.session_type}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-[10px] bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteCourseMutation.mutate(c.id)}
                        className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inline add form */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">Add Course</p>
              <div className="space-y-3">

                {/* Subject combobox */}
                <FormField label="Subject">
                  <SubjectCombobox
                    search={addSearch}
                    setSearch={(v) => { setAddSearch(v); setAddForm(p => ({ ...p, subject_id: null })); }}
                    onSelect={(s) => { setAddForm(p => ({ ...p, subject_id: s.id })); setAddSearch(s.name); }}
                    onCreateNew={() => { setNewSubjectContext('add'); setNewSubjectForm({ code: '', credits: 3, sessions_per_week: 2 }); }}
                    showDropdown={showAddDropdown}
                    setShowDropdown={setShowAddDropdown}
                    subjects={subjects}
                  />
                  {addForm.subject_id && (
                    <p className="text-[9px] text-green-400 mt-1">✓ {subjectMap[addForm.subject_id]?.name}</p>
                  )}
                </FormField>

                {/* Instructor dropdown — section instructors first */}
                <FormField label="Instructor">
                  <select
                    className={selectClass}
                    value={addForm.instructor_id}
                    onChange={e => setAddForm(p => ({ ...p, instructor_id: e.target.value }))}
                  >
                    <option value="">— Select instructor —</option>
                    {sectionInstructors.length > 0 && (
                      <optgroup label="Already teaching this section">
                        {sectionInstructors.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.type})</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All instructors">
                      {otherInstructors.map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.type})</option>
                      ))}
                    </optgroup>
                  </select>
                </FormField>

                {/* Session type toggle */}
                <FormField label="Session Type">
                  <div className="flex gap-2">
                    {SESSION_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setAddForm(p => ({ ...p, session_type: t }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
                          addForm.session_type === t
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-white/5 border-white/10 text-white/30 hover:text-white'
                        }`}
                      >
                        {SESSION_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </FormField>

                <button
                  onClick={handleAddSubmit}
                  disabled={createCourseMutation.isPending || !addForm.subject_id || !addForm.instructor_id}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold text-sm transition-all"
                >
                  {createCourseMutation.isPending ? 'Adding...' : '+ Add Course'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Edit modal ───────────────────────────────────────────────────── */}
      {editModal && (
        <Modal title="Edit Course" onClose={() => setEditModal(null)}>
          <div className="space-y-4">
            <FormField label="Subject">
              <SubjectCombobox
                search={editSearch}
                setSearch={(v) => { setEditSearch(v); setEditForm(p => ({ ...p, subject_id: null })); }}
                onSelect={(s) => { setEditForm(p => ({ ...p, subject_id: s.id })); setEditSearch(s.name); }}
                onCreateNew={() => { setNewSubjectContext('edit'); setNewSubjectForm({ code: '', credits: 3, sessions_per_week: 2 }); }}
                showDropdown={showEditDropdown}
                setShowDropdown={setShowEditDropdown}
                subjects={subjects}
              />
              {editForm.subject_id && (
                <p className="text-[9px] text-green-400 mt-1">✓ {subjectMap[editForm.subject_id]?.name}</p>
              )}
            </FormField>

            <FormField label="Instructor">
              <select
                className={selectClass}
                value={editForm.instructor_id}
                onChange={e => setEditForm(p => ({ ...p, instructor_id: e.target.value }))}
              >
                <option value="">— Select instructor —</option>
                {sectionInstructors.length > 0 && (
                  <optgroup label="Already teaching this section">
                    {sectionInstructors.map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.type})</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All instructors">
                  {otherInstructors.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.type})</option>
                  ))}
                </optgroup>
              </select>
            </FormField>

            <FormField label="Session Type">
              <div className="flex gap-2">
                {SESSION_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setEditForm(p => ({ ...p, session_type: t }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
                      editForm.session_type === t
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-white/5 border-white/10 text-white/30 hover:text-white'
                    }`}
                  >
                    {SESSION_LABELS[t]}
                  </button>
                ))}
              </div>
            </FormField>

            <button
              onClick={handleEditSubmit}
              disabled={updateCourseMutation.isPending || !editForm.subject_id || !editForm.instructor_id}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all"
            >
              {updateCourseMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── New subject mini-popup ───────────────────────────────────────── */}
      {newSubjectContext && (
        <Modal
          title={`Create subject "${newSubjectContext === 'add' ? addSearch.trim() : editSearch.trim()}"`}
          onClose={() => setNewSubjectContext(null)}
        >
          <div className="space-y-4">
            <FormField label="Subject Code (e.g. CS101)">
              <input
                className={inputClass}
                value={newSubjectForm.code}
                onChange={e => setNewSubjectForm(p => ({ ...p, code: e.target.value }))}
                placeholder="CS101"
                autoFocus
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Credits">
                <input
                  type="number" step="0.5" min="0.5"
                  className={inputClass}
                  value={newSubjectForm.credits}
                  onChange={e => setNewSubjectForm(p => ({ ...p, credits: e.target.value }))}
                />
              </FormField>
              <FormField label="Sessions / Week">
                <input
                  type="number" step="0.5" min="0.5"
                  className={inputClass}
                  value={newSubjectForm.sessions_per_week}
                  onChange={e => setNewSubjectForm(p => ({ ...p, sessions_per_week: e.target.value }))}
                />
              </FormField>
            </div>
            <button
              onClick={handleNewSubjectSave}
              disabled={createSubjectMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 py-3 rounded-xl font-bold transition-all"
            >
              {createSubjectMutation.isPending ? 'Creating...' : 'Create Subject & Select'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
