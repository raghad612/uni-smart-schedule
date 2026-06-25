import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';

export function useAdminDashboard() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  // ── Persist semester + section across navigation ───────────────────────────
  const [semesterYear, setSemesterYear] = useState(() => {
    const saved = sessionStorage.getItem('dash_semesterYear');
    return saved ? parseInt(saved) : 2024;
  });
  const [semesterPeriod, setSemesterPeriod] = useState(() => {
    return sessionStorage.getItem('dash_semesterPeriod') || '2';
  });
  const [selectedSectionId, setSelectedSectionId] = useState(() => {
    const saved = sessionStorage.getItem('dash_sectionId');
    return saved ? parseInt(saved) : null;
  });

  useEffect(() => {
    sessionStorage.setItem('dash_semesterYear', semesterYear);
  }, [semesterYear]);

  useEffect(() => {
    sessionStorage.setItem('dash_semesterPeriod', semesterPeriod);
  }, [semesterPeriod]);

  useEffect(() => {
    if (selectedSectionId === null) {
      sessionStorage.removeItem('dash_sectionId');
    } else {
      sessionStorage.setItem('dash_sectionId', selectedSectionId);
    }
  }, [selectedSectionId]);

  const semester = `${semesterYear}-${semesterPeriod}`;
  const period = semesterPeriod;

  const [activeProposal, setActiveProposal] = useState(null);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ── Sections ───────────────────────────────────────────────────────────────
  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/sections/').then(r => r.data),
  });

// ── Instructors ────────────────────────────────────────────────────────────
  const { data: rawInstructors = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['instructors', period],
    queryFn: () => api.get(`/instructors/?period=${period}`).then(r => r.data),
  });

  const instructors = rawInstructors.filter(i => i.is_active !== false);

  // ── Course instances ───────────────────────────────────────────────────────
  const { data: allCourses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses/').then(r => r.data),
  });

  const relevantInstructorIds = selectedSectionId
    ? [...new Set(
        allCourses
          .filter(ci => ci.section_id === selectedSectionId && ci.semester === period)
          .map(ci => ci.instructor_id)
      )]
    : instructors.map(i => i.id);

  const relevantInstructors = instructors.filter(i => relevantInstructorIds.includes(i.id));

  // ── Availability summary ───────────────────────────────────────────────────
  const instructorIds = instructors.map(i => i.id);
  const instructorIdsKey = instructorIds.join(',');

  const { data: allAvailability = [] } = useQuery({
    queryKey: ['all-availability', instructorIdsKey],
    queryFn: async () => {
      const results = await Promise.all(
        instructorIds.map(id =>
          api.get(`/availability/${id}`)
            .then(r => ({ instructor_id: id, count: r.data.length }))
            .catch(() => ({ instructor_id: id, count: 0 }))
        )
      );
      return results;
    },
    enabled: instructorIds.length > 0,
  });

  const availabilityMap = Object.fromEntries(
    allAvailability.map(a => [a.instructor_id, a.count > 0])
  );

  // ── Auto-load latest proposal for current semester ─────────────────────────
  const { data: proposalsList = [] } = useQuery({
    queryKey: ['proposals-list', semester],
    queryFn: () => api.get(`/proposals/?semester=${semester}`).then(r => r.data),
  });

  useEffect(() => {
    if (proposalsList.length > 0) {
      setActiveProposal(proposalsList[0].id);
    } else {
      setActiveProposal(null);
    }
  }, [proposalsList]);

  // ── Active proposal detail ─────────────────────────────────────────────────
  const { data: proposal } = useQuery({
    queryKey: ['proposal', activeProposal],
    queryFn: () => api.get(`/proposals/${activeProposal}`).then(r => r.data),
    enabled: !!activeProposal,
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ['conflicts', activeProposal],
    queryFn: () => api.get(`/proposals/${activeProposal}/conflicts`).then(r => r.data),
    enabled: !!activeProposal,
  });

  // ── Run mutation ───────────────────────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: () => api.post('/scheduling/run', {
      semester,
      notes,
      simulation: false,
      section_id: selectedSectionId,
    }),
    onSuccess: (res) => {
      const {
        proposal_id, assignments_count, conflicts_count,
        validation_errors, section_label,
        inherited_locks_count, inherited_locks_invalid_count,
      } = res.data;
      setActiveProposal(proposal_id);
      queryClient.invalidateQueries({ queryKey: ['proposals-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-availability'] });
      // Phase 3: locked-summary cache is stale now because the previous
      // draft just got superseded by a new one. Refetch so the panel
      // updates immediately.
      queryClient.invalidateQueries({ queryKey: ['locked-summary'] });

      const sectionNote = section_label ? ` for ${section_label}` : '';
      const conflictNote = conflicts_count > 0 ? ` · ${conflicts_count} conflict${conflicts_count > 1 ? 's' : ''} logged` : '';
      const warningNote = validation_errors?.length
        ? ` · ${validation_errors.length} instructor${validation_errors.length > 1 ? 's' : ''} had missing availability`
        : '';
      // Phase 3: surface inheritance result so admin knows their locked
      // work carried over (and whether any locks had to be dropped).
      const lockNote = inherited_locks_count > 0
        ? ` · ${inherited_locks_count} lock${inherited_locks_count > 1 ? 's' : ''} carried forward`
        : '';
      const invalidLockNote = inherited_locks_invalid_count > 0
        ? ` · ${inherited_locks_invalid_count} lock${inherited_locks_invalid_count > 1 ? 's' : ''} couldn't be carried (see conflicts)`
        : '';

      if (assignments_count === 0) {
        toast.error(`Engine ran but placed 0 classes${sectionNote}. Check that instructors submitted availability.`, { duration: 7000 });
      } else {
        toast.success(`${assignments_count} classes placed${sectionNote}${lockNote}${invalidLockNote}${conflictNote}${warningNote}.`, { duration: 6000 });
      }
    },
    onError: (e) => {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : detail || 'Error during generation.';
      toast.error(msg);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/approve`),
    onSuccess: () => {
      toast.success('Proposal approved!');
      queryClient.invalidateQueries({ queryKey: ['proposal', activeProposal] });
      queryClient.invalidateQueries({ queryKey: ['proposals-list'] });
    },
    onError: () => toast.error('Failed to approve proposal.'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/reject`),
    onSuccess: () => {
      toast.success('Proposal rejected.');
      queryClient.invalidateQueries({ queryKey: ['proposal', activeProposal] });
      queryClient.invalidateQueries({ queryKey: ['proposals-list'] });
    },
    onError: () => toast.error('Failed to reject proposal.'),
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const displayInstructors = searchTerm
    ? relevantInstructors.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : relevantInstructors;

  const submittedCount = relevantInstructors.filter(i => availabilityMap[i.id]).length;

  return {
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
    filteredInstructors: displayInstructors,
    relevantInstructors,
    submittedCount,
    proposal,
    conflicts,
    runMutation,
    approveMutation,
    rejectMutation,
  };
}