// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { Toaster } from 'react-hot-toast';
// import LoginPage from './pages/LoginPage';
// import AdminDashboard from './pages/AdminDashboard';
// import InstructorPortal from './pages/InstructorPortal';
// import ConflictViewer from './pages/ConflictViewer';
// import ScheduleViewer from './pages/ScheduleViewer';
// import ProposalList from './pages/ProposalList';
// import { isLoggedIn, getUserRole } from './utils/auth';

// const queryClient = new QueryClient();

// function PrivateRoute({ children, requiredRole }) {
//   if (!isLoggedIn()) return <Navigate to="/login" />;
//   if (requiredRole && getUserRole() !== requiredRole) return <Navigate to="/login" />;
//   return children;
// }

// export default function App() {
//   return (
//     <QueryClientProvider client={queryClient}>
//       <BrowserRouter>
//         <Toaster position="top-right" />
//         <Routes>
//           <Route path="/login" element={<LoginPage />} />
//           <Route path="/admin" element={
//             <PrivateRoute requiredRole="ADMIN">
//               <AdminDashboard />
//             </PrivateRoute>
//           } />
//           <Route path="/instructor" element={
//             <PrivateRoute requiredRole="INSTRUCTOR">
//               <InstructorPortal />
//             </PrivateRoute>
//           } />
//           <Route path="/conflicts/:proposalId" element={
//             <PrivateRoute requiredRole="ADMIN">
//               <ConflictViewer />
//             </PrivateRoute>
//           } />
//           <Route path="/schedule" element={
//             <PrivateRoute requiredRole="ADMIN">
//               <ScheduleViewer />
//             </PrivateRoute>
//           } />
//           <Route path="/proposals" element={
//             <PrivateRoute requiredRole="ADMIN">
//               <ProposalList />
//             </PrivateRoute>
//           } />
//           <Route path="*" element={<Navigate to="/login" />} />
//         </Routes>
//       </BrowserRouter>
//     </QueryClientProvider>
//   );
// }

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import InstructorPortal from './pages/InstructorPortal';
import { isLoggedIn, getUserRole } from './utils/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function PrivateRoute({ children, requiredRole }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (requiredRole && getUserRole() !== requiredRole) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0d1b2e',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#34d399', secondary: '#0d1b2e' } },
            error:   { iconTheme: { primary: '#f87171', secondary: '#0d1b2e' } },
          }}
        />
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
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
