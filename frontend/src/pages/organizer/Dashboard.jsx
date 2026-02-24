import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';

const OrganizerDashboard = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [eventsRes, analyticsRes] = await Promise.all([
        API.get('/organizer/events'),
        API.get('/organizer/analytics'),
      ]);
      setEvents(eventsRes.data);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;

  const published = events.filter(e => ['published', 'ongoing', 'closed'].includes(e.status));
  const drafts = events.filter(e => e.status === 'draft');
  const completed = events.filter(e => e.status === 'completed');

  // Forum notification: check if events have new forum activity since last viewed
  const hasNewForum = (eventId, lastForumActivity) => {
    if (!lastForumActivity) return false;
    const lastViewed = localStorage.getItem(`forumViewed_${eventId}`);
    if (!lastViewed) return true; // Never viewed
    return new Date(lastForumActivity) > new Date(lastViewed);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Organizer Dashboard</h1>
        <Link to="/create-event" className="btn btn-primary">+ Create Event</Link>
      </div>

      {/* Analytics Summary */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{events.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Events</div>
          <div className="stat-value">{published.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Registrations</div>
          <div className="stat-value">{analytics?.summary?.totalRegistrations || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Attendances</div>
          <div className="stat-value">{analytics?.summary?.totalAttendance || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Rating</div>
          <div className="stat-value">
            {analytics?.averageRating ? analytics.averageRating.toFixed(1) + ' ⭐' : 'N/A'}
          </div>
        </div>
      </div>

      {/* Active Events Carousel */}
      {published.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>Active Events</h2>
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
            {published.map(event => (
              <Link
                to={`/organizer/event/${event._id}`}
                key={event._id}
                className="event-card"
                style={{ minWidth: '300px', textDecoration: 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3>{event.name}</h3>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {hasNewForum(event._id, event.lastForumActivity) && (
                      <span className="badge badge-error" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>💬 New</span>
                    )}
                    <span className={`badge badge-${event.status === 'ongoing' ? 'info' : event.status === 'closed' ? 'warning' : 'success'}`}>
                      {event.status}
                    </span>
                  </div>
                </div>
                <p className="event-info">{event.type} event</p>
                <div className="event-meta">
                  <span>{event.registrationCount} registrations</span>
                  {event.registrationLimit > 0 && (
                    <span> / {event.registrationLimit} limit</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '8px' }}>
                  Starts: {event.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBA'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>Drafts</h2>
          <div className="card-grid">
            {drafts.map(event => (
              <Link to={`/organizer/event/${event._id}`} key={event._id} style={{ textDecoration: 'none' }}>
                <div className="event-card" style={{ borderLeft: '3px solid var(--warning)' }}>
                  <h3>{event.name}</h3>
                  <p className="event-info">{event.type} event — draft</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-light)' }}>
                    Created {new Date(event.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Completed Events */}
      {completed.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>Past Events</h2>
          <div className="card-grid">
            {completed.map(event => (
              <Link to={`/organizer/event/${event._id}`} key={event._id} style={{ textDecoration: 'none' }}>
                <div className="event-card" style={{ opacity: 0.8 }}>
                  <h3>{event.name}</h3>
                  <div className="event-meta">
                    <span className="badge badge-secondary">Completed</span>
                    <span>{event.registrationCount} registrations</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {events.length === 0 && (
        <div className="empty-state">
          <h3>No events yet</h3>
          <p>Create your first event to get started!</p>
          <Link to="/create-event" className="btn btn-primary" style={{ marginTop: '16px' }}>
            Create Event
          </Link>
        </div>
      )}
    </div>
  );
};

export default OrganizerDashboard;
