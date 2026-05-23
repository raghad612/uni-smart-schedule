import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import InstructorPortal from './pages/InstructorPortal';
import ConflictViewer from './pages/ConflictViewer';
import ScheduleViewer from './pages/ScheduleViewer';
import ProposalList from './pages/ProposalList';
import DataManager from './pages/DataManager';
import { isLoggedIn, getUserRole } from './utils/auth';

const queryClient = new QueryClient();

function PrivateRoute({ children, requiredRole }) {
  if (!isLoggedIn()) return <Navigate to="/login" />;
  if (requiredRole && getUserRole() !== requiredRole) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={
            <PrivateRoute requiredRole="ADMIN">
              <AdminDashboard />
            </PrivateRoute>
          } />
          <Route path="/instructor" element={
            <PrivateRoute requiredRole="INSTRUCTOR">
              <InstructorPortal />
            </PrivateRoute>
          } />
          <Route path="/conflicts/:proposalId" element={
            <PrivateRoute requiredRole="ADMIN">
              <ConflictViewer />
            </PrivateRoute>
          } />
          <Route path="/schedule" element={
            <PrivateRoute requiredRole="ADMIN">
              <ScheduleViewer />
            </PrivateRoute>
          } />
          <Route path="/proposals" element={
            <PrivateRoute requiredRole="ADMIN">
              <ProposalList />
            </PrivateRoute>
          } />
          <Route path="/data" element={
            <PrivateRoute requiredRole="ADMIN">
              <DataManager />
            </PrivateRoute>
          } />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}