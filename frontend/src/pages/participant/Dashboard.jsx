import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';

const Dashboard = () => {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const fetchRegistrations = async () => {
    try {
      const res = await API.get('/registrations/my');
      setRegistrations(res.data);
    } catch (err) {
      console.error('Failed to fetch registrations');
    } finally {
      setLoading(false);
    }
  };

  // Filter registrations by tab
  const getFiltered = () => {
    const now = new Date();
    switch (activeTab) {
      case 'upcoming':
        return registrations.filter(r =>
          r.event && new Date(r.event.startDate) >= now &&
          ['registered', 'pending_approval'].includes(r.status)
        );
      case 'normal':
        return registrations.filter(r => r.event && r.event.type === 'normal');
      case 'merchandise':
        return registrations.filter(r => r.event && r.event.type === 'merchandise');
      case 'completed':
        return registrations.filter(r =>
          r.status === 'completed' ||
          (r.event && r.event.status === 'completed' && ['registered', 'completed'].includes(r.status))
        );
      case 'cancelled':
        return registrations.filter(r => ['cancelled', 'rejected'].includes(r.status));
      default:
        return registrations;
    }
  };

  const getStatusBadge = (reg) => {
    if (reg.paymentStatus === 'pending') return <span className="badge badge-warning">Payment Pending</span>;
    if (reg.paymentStatus === 'rejected') return <span className="badge badge-error">Payment Rejected</span>;
    if (reg.status === 'registered') return <span className="badge badge-success">Registered</span>;
    if (reg.status === 'completed') return <span className="badge badge-info">Completed</span>;
    if (reg.status === 'cancelled') return <span className="badge badge-error">Cancelled</span>;
    if (reg.status === 'pending_approval') return <span className="badge badge-warning">Pending Approval</span>;
    return <span className="badge badge-secondary">{reg.status}</span>;
  };

  const filtered = getFiltered();

  // Forum notification: check if event has new forum activity since last viewed
  const hasNewForum = (eventId, lastForumActivity) => {
    if (!lastForumActivity) return false;
    const lastViewed = localStorage.getItem(`forumViewed_${eventId}`);
    if (!lastViewed) return true;
    return new Date(lastForumActivity) > new Date(lastViewed);
  };

  // Announcement notification: check if event has new announcement since last viewed
  const hasNewAnnouncement = (eventId, lastAnnouncementAt) => {
    if (!lastAnnouncementAt) return false;
    const lastViewed = localStorage.getItem(`announcementViewed_${eventId}`);
    if (!lastViewed) return true;
    return new Date(lastAnnouncementAt) > new Date(lastViewed);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Welcome back, {user?.firstName}! 👋</h1>
        <p>Here's an overview of your events and registrations.</p>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Registrations</div>
          <div className="stat-value">{registrations.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Upcoming Events</div>
          <div className="stat-value">
            {registrations.filter(r => r.event && new Date(r.event.startDate) >= new Date() && r.status === 'registered').length}
          </div>
        </div>
      </div>

      {/* Participation History */}
      <div className="card">
        <h2 style={{ marginBottom: '16px' }}>My Events</h2>

        <div className="tabs">
          {['upcoming', 'normal', 'merchandise', 'completed', 'cancelled'].map(tab => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading"><div className="spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No events found</h3>
            <p>
              {activeTab === 'upcoming'
                ? "You don't have any upcoming events."
                : 'No events in this category.'}
            </p>
            <Link to="/events" className="btn btn-primary" style={{ marginTop: '16px' }}>
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Event Name</th>
                  <th>Type</th>
                  <th>Organizer</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(reg => (
                  <tr key={reg._id}>
                    <td>
                      <Link to={`/events/${reg.event?._id}`} style={{ fontWeight: 500 }}>
                        {reg.event?.name || 'Unknown Event'}
                      </Link>
                      {hasNewAnnouncement(reg.event?._id, reg.event?.lastAnnouncementAt) && (
                        <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '1px 5px' }}>📢 New</span>
                      )}
                      {hasNewForum(reg.event?._id, reg.event?.lastForumActivity) && (
                        <span className="badge badge-error" style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '1px 5px' }}>💬 New</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-primary">{reg.event?.type}</span>
                    </td>
                    <td>{reg.event?.organizer?.organizerName || '-'}</td>
                    <td>
                      {reg.event?.startDate
                        ? new Date(reg.event.startDate).toLocaleDateString()
                        : 'TBA'}
                    </td>
                    <td>{getStatusBadge(reg)}</td>
                    <td>
                      {reg.ticketId && reg.status === 'registered' && reg.paymentStatus !== 'pending' && (
                        <Link to={`/events/${reg.event?._id}?ticket=${reg._id}`} className="btn btn-sm btn-secondary">
                          View Ticket
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
