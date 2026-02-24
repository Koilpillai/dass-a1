import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';

const ClubsOrganizers = () => {
  const { user, refreshUser } = useAuth();
  const [organizers, setOrganizers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followedIds, setFollowedIds] = useState([]);

  useEffect(() => {
    fetchOrganizers();
    fetchFollowed();
  }, []);

  const fetchOrganizers = async () => {
    try {
      const res = await API.get('/users/organizers');
      setOrganizers(res.data);
    } catch (err) {
      console.error('Failed to fetch organizers');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowed = async () => {
    try {
      const res = await API.get('/users/profile');
      setFollowedIds(res.data.followedOrganizers?.map(o => o._id || o) || []);
    } catch (err) {
      console.error('Failed to fetch followed');
    }
  };

  const handleFollow = async (orgId) => {
    try {
      const res = await API.post(`/users/organizers/${orgId}/follow`);
      if (res.data.following) {
        setFollowedIds(prev => [...prev, orgId]);
      } else {
        setFollowedIds(prev => prev.filter(id => id !== orgId));
      }
      refreshUser();
    } catch (err) {
      console.error('Failed to follow/unfollow');
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Clubs & Organizers</h1>
        <p>Discover and follow clubs organizing events at Felicity</p>
      </div>

      {organizers.length === 0 ? (
        <div className="empty-state">
          <h3>No organizers yet</h3>
          <p>Check back later for clubs and organizers.</p>
        </div>
      ) : (
        <div className="card-grid">
          {organizers.map(org => (
            <div key={org._id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ marginBottom: '4px' }}>{org.organizerName}</h3>
                <span className="badge badge-primary">{Array.isArray(org.category) ? org.category.join(', ') : org.category}</span>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  {org.description || 'No description available'}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <Link to={`/clubs/${org._id}`} className="btn btn-sm btn-secondary">View Details</Link>
                <button
                  onClick={() => handleFollow(org._id)}
                  className={`btn btn-sm ${followedIds.includes(org._id) ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {followedIds.includes(org._id) ? 'Following ✓' : 'Follow'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClubsOrganizers;
