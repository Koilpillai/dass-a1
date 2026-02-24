import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';

const CATEGORIES = [
  'Technology', 'Cultural', 'Sports', 'Music', 'Dance',
  'Art', 'Literary', 'Gaming', 'Robotics', 'Photography',
  'Film', 'Entrepreneurship', 'Social Service', 'Science', 'Quiz'
];

const OrganizerProfile = () => {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [formData, setFormData] = useState({});

  // Password reset request
  const [showResetReq, setShowResetReq] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetHistory, setResetHistory] = useState([]);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    fetchProfile();
    fetchResetHistory();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await API.get('/users/profile');
      setProfile(res.data);
      setFormData({
        organizerName: res.data.organizerName || '',
        description: res.data.description || '',
        contactEmail: res.data.contactEmail || '',
        category: res.data.category || [],
        discordWebhook: res.data.discordWebhook || '',
        contactNumber: res.data.contactNumber || '',
      });
    } catch (err) {
      console.error('Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchResetHistory = async () => {
    try {
      const res = await API.get('/organizer/password-reset-history');
      setResetHistory(res.data);
    } catch (err) {
      // may not have any history
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await API.put('/users/profile', formData);
      await refreshUser();
      await fetchProfile();
      setEditing(false);
      setMessage({ type: 'success', text: 'Profile updated!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetRequest = async () => {
    try {
      await API.post('/organizer/password-reset', { reason: resetReason });
      setMessage({ type: 'success', text: 'Password reset request submitted. An admin will review it.' });
      setShowResetReq(false);
      setResetReason('');
      fetchResetHistory();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to submit request' });
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    try {
      await API.put('/users/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setMessage({ type: 'success', text: 'Password changed!' });
      setShowPasswordChange(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to change password' });
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Organizer Profile</h1>
      </div>

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Profile Info */}
        <div className="card">
          <div className="card-header">
            <h2>Club Information</h2>
            <button className="btn btn-sm btn-secondary" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {editing ? (
            <>
              <div className="form-group">
                <label>Club / Organizer Name</label>
                <input type="text" className="form-control" value={formData.organizerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, organizerName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Category</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {CATEGORIES.map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setFormData(prev => {
                        const cats = Array.isArray(prev.category) ? prev.category : (prev.category ? [prev.category] : []);
                        return {
                          ...prev,
                          category: cats.includes(cat) ? cats.filter(c => c !== cat) : [...cats, cat]
                        };
                      })}
                      className={`btn btn-sm ${(Array.isArray(formData.category) ? formData.category : [formData.category]).includes(cat) ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="form-control" rows={3} value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Contact Email</label>
                <input type="email" className="form-control" value={formData.contactEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Discord Webhook URL</label>
                <input type="url" className="form-control" value={formData.discordWebhook}
                  onChange={(e) => setFormData(prev => ({ ...prev, discordWebhook: e.target.value }))} placeholder="https://discord.com/api/webhooks/..." />
              </div>
              <div className="form-group">
                <label>Contact Number</label>
                <input type="tel" className="form-control" value={formData.contactNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactNumber: e.target.value }))} />
              </div>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <div>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'inline-block', width: '140px' }}>Name:</strong>
                {profile?.organizerName || 'Not set'}
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'inline-block', width: '140px' }}>Login Email:</strong>
                {profile?.email}
                <span className="badge badge-secondary" style={{ marginLeft: '8px' }}>Non-editable</span>
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'inline-block', width: '140px' }}>Category:</strong>
                {Array.isArray(profile?.category) ? profile.category.join(', ') : (profile?.category || 'Not set')}
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'inline-block', width: '140px' }}>Description:</strong>
                {profile?.description || 'Not set'}
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'inline-block', width: '140px' }}>Contact Email:</strong>
                {profile?.contactEmail || 'Not set'}
              </p>
              <p style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'inline-block', width: '140px' }}>Discord Webhook:</strong>
                {profile?.discordWebhook ? '✓ Configured' : 'Not configured'}
              </p>
              <p style={{ padding: '8px 0' }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'inline-block', width: '140px' }}>Contact:</strong>
                {profile?.contactNumber || 'Not set'}
              </p>
            </div>
          )}
        </div>

        {/* Security & Password Reset */}
        <div>
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginBottom: '12px' }}>Security</h2>
            {!showPasswordChange ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setShowPasswordChange(true)}>
                  Change Password
                </button>
                <button className="btn btn-warning" onClick={() => setShowResetReq(true)}>
                  Request Password Reset
                </button>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Current Password</label>
                  <input type="password" className="form-control" value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input type="password" className="form-control" value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input type="password" className="form-control" value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={handleChangePassword}>Change Password</button>
                  <button className="btn btn-secondary" onClick={() => setShowPasswordChange(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>

          {/* Password Reset History */}
          {resetHistory.length > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: '12px' }}>Password Reset History</h2>
              {resetHistory.map(req => (
                <div key={req._id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', fontSize: '0.875rem' }}>
                  <span className={`badge badge-${req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'error' : 'warning'}`}>
                    {req.status}
                  </span>
                  <span style={{ marginLeft: '8px', color: 'var(--text-secondary)' }}>
                    {new Date(req.createdAt).toLocaleDateString()}
                  </span>
                  {req.adminComment && <p style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>Admin: {req.adminComment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Password Reset Request Modal */}
      {showResetReq && (
        <div className="modal-overlay" onClick={() => setShowResetReq(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Request Password Reset</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.875rem' }}>
              Submit a request to the admin. They will review and reset your password if approved.
            </p>
            <div className="form-group">
              <label>Reason for Reset</label>
              <textarea className="form-control" value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="Explain why you need a password reset..."
                rows={3} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowResetReq(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResetRequest} disabled={!resetReason}>
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizerProfile;
