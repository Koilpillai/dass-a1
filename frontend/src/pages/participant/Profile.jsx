import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';

const AREAS_OF_INTEREST = [
  'Technology', 'Cultural', 'Sports', 'Music', 'Dance',
  'Art', 'Literary', 'Gaming', 'Robotics', 'Photography',
  'Film', 'Entrepreneurship', 'Social Service', 'Science', 'Quiz'
];

const Profile = () => {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [formData, setFormData] = useState({});

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await API.get('/users/profile');
      setProfile(res.data);
      setFormData({
        firstName: res.data.firstName,
        lastName: res.data.lastName,
        contactNumber: res.data.contactNumber || '',
        collegeName: res.data.collegeName || '',
        areasOfInterest: res.data.areasOfInterest || [],
      });
    } catch (err) {
      console.error('Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await API.put('/users/profile', formData);
      await refreshUser();
      await fetchProfile();
      setEditing(false);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    try {
      await API.put('/users/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setShowPasswordChange(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to change password' });
    }
  };

  const toggleInterest = (area) => {
    setFormData(prev => ({
      ...prev,
      areasOfInterest: prev.areasOfInterest.includes(area)
        ? prev.areasOfInterest.filter(a => a !== area)
        : [...prev.areasOfInterest, area]
    }));
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>My Profile</h1>
      </div>

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Profile Info */}
        <div className="card">
          <div className="card-header">
            <h2>Personal Information</h2>
            <button className="btn btn-sm btn-secondary" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {editing ? (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input type="text" className="form-control" value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input type="text" className="form-control" value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Contact Number</label>
                <input type="tel" className="form-control" value={formData.contactNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactNumber: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>College / Organization</label>
                <input type="text" className="form-control" value={formData.collegeName}
                  onChange={(e) => setFormData(prev => ({ ...prev, collegeName: e.target.value }))}
                />
              </div>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <div>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', width: '140px', display: 'inline-block' }}>Name:</strong>
                {profile?.firstName} {profile?.lastName}
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', width: '140px', display: 'inline-block' }}>Email:</strong>
                {profile?.email}
                <span className="badge badge-secondary" style={{ marginLeft: '8px' }}>Non-editable</span>
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', width: '140px', display: 'inline-block' }}>Type:</strong>
                <span className="badge badge-primary" style={{ textTransform: 'uppercase' }}>{profile?.participantType}</span>
                <span className="badge badge-secondary" style={{ marginLeft: '8px' }}>Non-editable</span>
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', width: '140px', display: 'inline-block' }}>Contact:</strong>
                {profile?.contactNumber || 'Not set'}
              </p>
              <p style={{ padding: '8px 0' }}>
                <strong style={{ color: 'var(--text-secondary)', width: '140px', display: 'inline-block' }}>College:</strong>
                {profile?.collegeName || 'Not set'}
              </p>
            </div>
          )}
        </div>

        {/* Interests & Followed Clubs */}
        <div>
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginBottom: '12px' }}>Areas of Interest</h2>
            {editing ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {AREAS_OF_INTEREST.map(area => (
                  <button key={area} onClick={() => toggleInterest(area)}
                    className={`btn btn-sm ${formData.areasOfInterest?.includes(area) ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {profile?.areasOfInterest?.length > 0
                  ? profile.areasOfInterest.map((a, i) => <span key={i} className="badge badge-primary">{a}</span>)
                  : <p style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>No interests selected</p>}
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginBottom: '12px' }}>Followed Clubs</h2>
            {profile?.followedOrganizers?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {profile.followedOrganizers.map(org => (
                  <span key={org._id} className="badge badge-info">{org.organizerName || org.firstName}</span>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>Not following any clubs</p>
            )}
          </div>

          {/* Security Settings */}
          <div className="card">
            <h2 style={{ marginBottom: '12px' }}>Security Settings</h2>
            {!showPasswordChange ? (
              <button className="btn btn-secondary" onClick={() => setShowPasswordChange(true)}>
                Change Password
              </button>
            ) : (
              <>
                <div className="form-group">
                  <label>Current Password</label>
                  <input type="password" className="form-control" value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input type="password" className="form-control" value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input type="password" className="form-control" value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={handleChangePassword}>Change Password</button>
                  <button className="btn btn-secondary" onClick={() => setShowPasswordChange(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
