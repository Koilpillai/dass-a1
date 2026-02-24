import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';

const AREAS_OF_INTEREST = [
  'Technology', 'Cultural', 'Sports', 'Music', 'Dance',
  'Art', 'Literary', 'Gaming', 'Robotics', 'Photography',
  'Film', 'Entrepreneurship', 'Social Service', 'Science', 'Quiz'
];

const Onboarding = () => {
  const [interests, setInterests] = useState([]);
  const [organizers, setOrganizers] = useState([]);
  const [followedOrgs, setFollowedOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrganizers();
  }, []);

  const fetchOrganizers = async () => {
    try {
      const res = await API.get('/users/organizers');
      setOrganizers(res.data);
    } catch (err) {
      console.error('Failed to fetch organizers');
    }
  };

  const toggleInterest = (area) => {
    setInterests(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  const toggleFollow = (orgId) => {
    setFollowedOrgs(prev =>
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await API.put('/users/preferences', {
        areasOfInterest: interests,
        followedOrganizers: followedOrgs,
      });
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    try {
      await API.put('/users/preferences', {
        areasOfInterest: [],
        followedOrganizers: [],
      });
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      navigate('/dashboard');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 24px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div className="card">
          <h1 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Welcome to Felicity! 🎉</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Let's personalize your experience. Select your interests and clubs to follow.
            You can always change these later in your profile.
          </p>

          {/* Areas of Interest */}
          <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>Areas of Interest</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
            {AREAS_OF_INTEREST.map(area => (
              <button
                key={area}
                onClick={() => toggleInterest(area)}
                className={`btn ${interests.includes(area) ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              >
                {area}
              </button>
            ))}
          </div>

          {/* Clubs to Follow */}
          {organizers.length > 0 && (
            <>
              <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>Clubs / Organizers to Follow</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
                {organizers.map(org => (
                  <button
                    key={org._id}
                    onClick={() => toggleFollow(org._id)}
                    className={`btn ${followedOrgs.includes(org._id) ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  >
                    {org.organizerName}
                    {org.category && ` (${Array.isArray(org.category) ? org.category.join(', ') : org.category})`}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button onClick={handleSkip} className="btn btn-secondary">
              Skip for now
            </button>
            <button onClick={handleSubmit} className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
