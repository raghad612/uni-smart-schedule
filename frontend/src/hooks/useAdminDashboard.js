import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';

export function useAdminDashboard() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [semester, setSemester] = useState('2024-2');
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [activeProposal, setActiveProposal] = useState(null);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ── Sections ───────────────────────────────────────────────────────────────
  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/sections/').then(r => r.data),
  });

  // ── Instructors ────────────────────────────────────────────────────────────
  const { data: instructors = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });

  // ── Course instances for selected section (to know which instructors matter)
  const { data: allCourses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/courses/').then(r => r.data),
  });

  // Instructor IDs that teach in the selected section this semester
  const relevantInstructorIds = selectedSectionId
    ? [...new Set(
        allCourses
          .filter(ci => ci.section_id === selectedSectionId && ci.semester === semester)
          .map(ci => ci.instructor_id)
      )]
    : instructors.map(i => i.id);

  const relevantInstructors = instructors.filter(i => relevantInstructorIds.includes(i.id));

  // ── Availability summary ───────────────────────────────────────────────────
  const instructorIds = instructors.map(i => i.id);

  const { data: allAvailability = [] } = useQuery({
    queryKey: ['all-availability', instructorIds],
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

  // ── Auto-load latest proposal on mount ────────────────────────────────────
  const { data: proposalsList = [] } = useQuery({
    queryKey: ['proposals-list', semester],
    queryFn: () => api.get(`/proposals/?semester=${semester}`).then(r => r.data),
  });

  useEffect(() => {
    if (proposalsList.length > 0 && activeProposal === null) {
      setActiveProposal(proposalsList[0].id);
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
      const { proposal_id, assignments_count, conflicts_count, validation_errors, section_label } = res.data;
      setActiveProposal(proposal_id);
      queryClient.invalidateQueries({ queryKey: ['proposals-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-availability'] });

      const sectionNote = section_label ? ` for ${section_label}` : '';
      const conflictNote = conflicts_count > 0 ? ` · ${conflicts_count} conflict${conflicts_count > 1 ? 's' : ''} logged` : '';
      const warningNote = validation_errors?.length
        ? ` · ${validation_errors.length} instructor${validation_errors.length > 1 ? 's' : ''} had missing availability`
        : '';

      if (assignments_count === 0) {
        toast.error(`Engine ran but placed 0 classes${sectionNote}. Check that instructors submitted availability.`, { duration: 7000 });
      } else {
        toast.success(`${assignments_count} classes placed${sectionNote}${conflictNote}${warningNote}.`, { duration: 5000 });
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
    semester, setSemester,
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