import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../utils/api';

export function useAdminDashboard() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [semester, setSemester] = useState('2024-2');
  const [activeProposal, setActiveProposal] = useState(null);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ── Instructors ────────────────────────────────────────────────────────────
  const { data: instructors = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/instructors/').then(r => r.data),
  });

  const instructorIds = instructors.map(i => i.id);

  // ── Availability summary (submitted or not per instructor) ─────────────────
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

  // ── Active proposal ────────────────────────────────────────────────────────
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

  // ── Mutations ──────────────────────────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: () => api.post('/scheduling/run', { semester, notes, simulation: false }),
    onSuccess: (res) => {
      setActiveProposal(res.data.proposal_id);
      toast.success(`Schedule generated! ${res.data.assignments_count} classes placed.`);
      queryClient.invalidateQueries({ queryKey: ['all-availability'] });
    },
    onError: (e) => {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(d => d.msg).join(', ')
        : detail || 'Error during generation.';
      toast.error(msg);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/approve`),
    onSuccess: () => {
      toast.success('Proposal approved!');
      queryClient.invalidateQueries({ queryKey: ['proposal', activeProposal] });
    },
    onError: () => toast.error('Failed to approve proposal.'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/proposals/${activeProposal}/reject`),
    onSuccess: () => {
      toast.success('Proposal rejected.');
      queryClient.invalidateQueries({ queryKey: ['proposal', activeProposal] });
    },
    onError: () => toast.error('Failed to reject proposal.'),
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const filteredInstructors = instructors.filter(i =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const submittedCount = instructors.filter(i => availabilityMap[i.id]).length;

  return {
    // State
    notes, setNotes,
    semester, setSemester,
    activeProposal,
    selectedInstructor, setSelectedInstructor,
    searchTerm, setSearchTerm,
    // Data
    instructors,
    instructorsLoading,
    availabilityMap,
    filteredInstructors,
    submittedCount,
    proposal,
    conflicts,
    // Mutations
    runMutation,
    approveMutation,
    rejectMutation,
  };
}