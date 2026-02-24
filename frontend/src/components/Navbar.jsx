import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const handleLogout = () => {
    logout();
  };

  // Participant navigation
  const ParticipantNav = () => (
    <>
      <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
      <Link to="/events" className={isActive('/events')}>Browse Events</Link>
      <Link to="/clubs" className={isActive('/clubs')}>Clubs/Organizers</Link>
      <Link to="/profile" className={isActive('/profile')}>Profile</Link>
    </>
  );

  // Organizer navigation
  const OrganizerNav = () => (
    <>
      <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
      <Link to="/create-event" className={isActive('/create-event')}>Create Event</Link>
      <Link to="/profile" className={isActive('/profile')}>Profile</Link>
      <Link to="/events" className={isActive('/events')}>Ongoing Events</Link>
    </>
  );

  // Admin navigation
  const AdminNav = () => (
    <>
      <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
      <Link to="/manage-organizers" className={isActive('/manage-organizers')}>Manage Clubs/Organizers</Link>
      <Link to="/password-resets" className={isActive('/password-resets')}>Password Reset Requests</Link>
    </>
  );

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-brand">
        🎉 Felicity
      </Link>
      <ul className="navbar-nav">
        {user?.role === 'participant' && <ParticipantNav />}
        {user?.role === 'organizer' && <OrganizerNav />}
        {user?.role === 'admin' && <AdminNav />}
        <button onClick={handleLogout} style={{ color: 'var(--error)' }}>Logout</button>
      </ul>
    </nav>
  );
};

export default Navbar;
