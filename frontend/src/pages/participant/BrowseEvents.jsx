import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';

const BrowseEvents = () => {
  const { user, refreshUser } = useAuth();
  const [events, setEvents] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [followedOrgIds, setFollowedOrgIds] = useState([]);
  const [filters, setFilters] = useState({
    type: 'all',
    eligibility: 'all',
    dateFrom: '',
    dateTo: '',
    sort: '',
    followedClubs: false,
  });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  useEffect(() => {
    fetchTrending();
  }, []);

  // When followedClubs filter is toggled on, fetch fresh followed org IDs
  useEffect(() => {
    if (filters.followedClubs) {
      const fetchFollowed = async () => {
        try {
          const res = await API.get('/users/profile');
          const ids = res.data.followedOrganizers?.map(o => o._id || o) || [];
          setFollowedOrgIds(ids);
        } catch {
          setFollowedOrgIds([]);
        }
      };
      fetchFollowed();
    }
  }, [filters.followedClubs]);

  useEffect(() => {
    fetchEvents();
  }, [search, filters, pagination.page, followedOrgIds]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: 12,
        search: search || undefined,
        type: filters.type !== 'all' ? filters.type : undefined,
        eligibility: filters.eligibility !== 'all' ? filters.eligibility : undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        sort: filters.sort || undefined,
      };

      if (filters.followedClubs && followedOrgIds.length > 0) {
        params.followedClubs = followedOrgIds.join(',');
      }

      // If "Followed Clubs Only" is on but user follows no clubs, show empty results
      if (filters.followedClubs && followedOrgIds.length === 0) {
        setEvents([]);
        setPagination(prev => ({ ...prev, total: 0, pages: 0 }));
        setLoading(false);
        return;
      }

      const res = await API.get('/events', { params });
      let fetchedEvents = res.data.events;

      // Sort by user preferences: events whose organizer categories overlap with user's areas of interest come first
      if (user?.areasOfInterest?.length && !filters.sort) {
        fetchedEvents = [...fetchedEvents].sort((a, b) => {
          const aCats = Array.isArray(a.organizer?.category) ? a.organizer.category : (a.organizer?.category ? [a.organizer.category] : []);
          const bCats = Array.isArray(b.organizer?.category) ? b.organizer.category : (b.organizer?.category ? [b.organizer.category] : []);
          const aMatch = aCats.filter(c => user.areasOfInterest.includes(c)).length;
          const bMatch = bCats.filter(c => user.areasOfInterest.includes(c)).length;
          return bMatch - aMatch;
        });
      }

      setEvents(fetchedEvents);
      setPagination(prev => ({ ...prev, ...res.data.pagination }));
    } catch (err) {
      console.error('Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrending = async () => {
    try {
      const res = await API.get('/events/trending');
      setTrending(res.data);
    } catch (err) {
      console.error('Failed to fetch trending');
    }
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{user?.role === 'organizer' ? 'Ongoing Events' : 'Browse Events'}</h1>
        {user?.role !== 'organizer' && <p>Discover and register for upcoming events at Felicity</p>}
      </div>

      {/* Trending Section */}
      {trending.length > 0 && !search && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>🔥 Trending Events</h2>
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
            {trending.map(event => (
              <Link
                to={`/events/${event._id}`}
                key={event._id}
                className="event-card"
                style={{ minWidth: '280px', textDecoration: 'none' }}
              >
                <h3>{event.name}</h3>
                <p className="event-info">{event.organizer?.organizerName}</p>
                <div className="event-meta">
                  <span className="badge badge-primary">{event.type}</span>
                  <span className="badge badge-info">{event.views} views</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="search-bar">
        <div className="search-input" style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Search events by name, organizer..."
            value={search}
            onChange={handleSearch}
            className="form-control"
          />
        </div>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '140px' }}
          value={filters.type}
          onChange={(e) => handleFilterChange('type', e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="normal">Normal</option>
          <option value="merchandise">Merchandise</option>
        </select>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: '140px' }}
          value={filters.eligibility}
          onChange={(e) => handleFilterChange('eligibility', e.target.value)}
        >
          <option value="all">All Eligibility</option>
          <option value="iiit">IIIT Only</option>
          <option value="non-iiit">Non-IIIT Only</option>
        </select>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setSearch('');
            setFilters({ type: 'all', eligibility: 'all', dateFrom: '', dateTo: '', sort: '', followedClubs: false });
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
        >
          All Events
        </button>
      </div>

      {/* Date Range & Followed Clubs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="date"
          className="form-control"
          style={{ width: 'auto' }}
          value={filters.dateFrom}
          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          placeholder="From date"
        />
        <span style={{ color: 'var(--text-secondary)' }}>to</span>
        <input
          type="date"
          className="form-control"
          style={{ width: 'auto' }}
          value={filters.dateTo}
          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          placeholder="To date"
        />
        {user?.role === 'participant' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={filters.followedClubs}
              onChange={(e) => handleFilterChange('followedClubs', e.target.checked)}
            />
            Followed Clubs Only
          </label>
        )}
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <h3>No events found</h3>
          <p>Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          <div className="card-grid">
            {events.map(event => (
              <Link to={`/events/${event._id}`} key={event._id} style={{ textDecoration: 'none' }}>
                <div className="event-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3>{event.name}</h3>
                    <span className="badge badge-primary">{event.type}</span>
                  </div>
                  <p className="event-info">
                    By {event.organizer?.organizerName || 'Unknown'}
                    {event.organizer?.category && ` • ${Array.isArray(event.organizer.category) ? event.organizer.category.join(', ') : event.organizer.category}`}
                  </p>
                  <p className="event-description">{event.description}</p>
                  <div className="event-meta">
                    {event.eligibility !== 'all' && (
                      <span className="badge badge-warning">{event.eligibility} only</span>
                    )}
                    {event.registrationFee > 0 && (
                      <span className="badge badge-info">₹{event.registrationFee}</span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      {event.startDate ? new Date(event.startDate).toLocaleDateString() : 'Date TBA'}
                    </span>
                  </div>
                  {event.tags?.length > 0 && (
                    <div className="event-tags">
                      {event.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className="event-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BrowseEvents;
