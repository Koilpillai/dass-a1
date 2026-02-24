import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

// Auth pages
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';

// Participant pages
import ParticipantDashboard from './pages/participant/Dashboard';
import BrowseEvents from './pages/participant/BrowseEvents';
import EventDetails from './pages/participant/EventDetails';
import ParticipantProfile from './pages/participant/Profile';
import ClubsOrganizers from './pages/participant/ClubsOrganizers';
import OrganizerDetail from './pages/participant/OrganizerDetail';

// Organizer pages
import OrganizerDashboard from './pages/organizer/Dashboard';
import CreateEvent from './pages/organizer/CreateEvent';
import OrgEventDetail from './pages/organizer/EventDetail';
import OrganizerProfile from './pages/organizer/Profile';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import ManageOrganizers from './pages/admin/ManageOrganizers';
import PasswordResets from './pages/admin/PasswordResets';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Determine which dashboard to show based on role
  const getDashboard = () => {
    if (!user) return <Navigate to="/login" />;
    switch (user.role) {
      case 'participant': return <ParticipantDashboard />;
      case 'organizer': return <OrganizerDashboard />;
      case 'admin': return <AdminDashboard />;
      default: return <Navigate to="/login" />;
    }
  };

  const getProfile = () => {
    if (!user) return <Navigate to="/login" />;
    switch (user.role) {
      case 'participant': return <ParticipantProfile />;
      case 'organizer': return <OrganizerProfile />;
      default: return <Navigate to="/dashboard" />;
    }
  };

  return (
    <>
      {user && <Navbar />}
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />

        {/* Onboarding (participant only, after registration) */}
        <Route path="/onboarding" element={
          <ProtectedRoute roles={['participant']}>
            <Onboarding />
          </ProtectedRoute>
        } />

        {/* Dashboard (role-based) */}
        <Route path="/dashboard" element={
          <ProtectedRoute>{getDashboard()}</ProtectedRoute>
        } />

        {/* Profile (role-based) */}
        <Route path="/profile" element={
          <ProtectedRoute>{getProfile()}</ProtectedRoute>
        } />

        {/* Participant routes */}
        <Route path="/events" element={
          <ProtectedRoute roles={['participant', 'organizer']}>
            <BrowseEvents />
          </ProtectedRoute>
        } />
        <Route path="/events/:id" element={
          <ProtectedRoute roles={['participant', 'organizer']}>
            <EventDetails />
          </ProtectedRoute>
        } />
        <Route path="/clubs" element={
          <ProtectedRoute roles={['participant']}>
            <ClubsOrganizers />
          </ProtectedRoute>
        } />
        <Route path="/clubs/:id" element={
          <ProtectedRoute roles={['participant']}>
            <OrganizerDetail />
          </ProtectedRoute>
        } />

        {/* Organizer routes */}
        <Route path="/create-event" element={
          <ProtectedRoute roles={['organizer']}>
            <CreateEvent />
          </ProtectedRoute>
        } />
        <Route path="/organizer/event/:id" element={
          <ProtectedRoute roles={['organizer']}>
            <OrgEventDetail />
          </ProtectedRoute>
        } />
        <Route path="/organizer/event/:id/edit" element={
          <ProtectedRoute roles={['organizer']}>
            <CreateEvent />
          </ProtectedRoute>
        } />

        {/* Admin routes */}
        <Route path="/manage-organizers" element={
          <ProtectedRoute roles={['admin']}>
            <ManageOrganizers />
          </ProtectedRoute>
        } />
        <Route path="/password-resets" element={
          <ProtectedRoute roles={['admin']}>
            <PasswordResets />
          </ProtectedRoute>
        } />

        {/* Catch all */}
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </>
  );
}

export default App;
