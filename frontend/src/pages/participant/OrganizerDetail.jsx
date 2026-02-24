import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../../api/axios';

const OrganizerDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganizerDetail();
  }, [id]);

  const fetchOrganizerDetail = async () => {
    try {
      const res = await API.get(`/users/organizers/${id}`);
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch organizer');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;
  if (!data) return <div className="page-container"><div className="alert alert-error">Organizer not found</div></div>;

  const { organizer, upcomingEvents, pastEvents } = data;

  return (
    <div className="page-container">
      {/* Organizer Info */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{organizer.organizerName}</h1>
        <span className="badge badge-primary">{Array.isArray(organizer.category) ? organizer.category.join(', ') : organizer.category}</span>
        <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>
          {organizer.description || 'No description available'}
        </p>
        {organizer.contactEmail && (
          <p style={{ marginTop: '8px', fontSize: '0.875rem' }}>
            📧 {organizer.contactEmail}
          </p>
        )}
      </div>

      {/* Upcoming Events */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Upcoming Events</h2>
      {upcomingEvents.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>No upcoming events</p>
      ) : (
        <div className="card-grid" style={{ marginBottom: '32px' }}>
          {upcomingEvents.map(event => (
            <Link to={`/events/${event._id}`} key={event._id} style={{ textDecoration: 'none' }}>
              <div className="event-card">
                <h3>{event.name}</h3>
                <p className="event-description">{event.description}</p>
                <div className="event-meta">
                  <span className="badge badge-primary">{event.type}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                    {event.startDate ? new Date(event.startDate).toLocaleDateString() : 'Date TBA'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Past Events */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Past Events</h2>
      {pastEvents.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No past events</p>
      ) : (
        <div className="card-grid">
          {pastEvents.map(event => (
            <div key={event._id} className="event-card" style={{ opacity: 0.8 }}>
              <h3>{event.name}</h3>
              <p className="event-description">{event.description}</p>
              <div className="event-meta">
                <span className="badge badge-secondary">{event.type}</span>
                <span className="badge badge-secondary">Closed</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrganizerDetail;
