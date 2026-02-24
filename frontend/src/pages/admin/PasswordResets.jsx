import { useState, useEffect } from 'react';
import API from '../../api/axios';

const PasswordResets = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [adminComment, setAdminComment] = useState({});

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await API.get('/admin/password-resets');
      setRequests(res.data);
    } catch (err) {
      console.error('Failed to fetch password resets');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, status) => {
    try {
      const res = await API.put(`/admin/password-resets/${id}`, {
        status,
        adminComment: adminComment[id] || '',
      });
      setMessage({
        type: 'success',
        text: status === 'approved'
          ? `Approved! New password: ${res.data.newPassword} — Share this with the organizer.`
          : 'Request rejected.',
      });
      fetchRequests();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to process request' });
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;

  const pending = requests.filter(r => r.status === 'pending');
  const processed = requests.filter(r => r.status !== 'pending');

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Password Reset Requests</h1>
      </div>

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Pending Requests */}
      <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>
        Pending Requests ({pending.length})
      </h2>

      {pending.length === 0 ? (
        <div className="card" style={{ marginBottom: '32px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No pending requests.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
          {pending.map(req => (
            <div key={req._id} className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ marginBottom: '4px' }}>
                    {req.organizer?.organizerName || req.clubName || 'Unknown'}
                  </h3>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    {req.organizer?.email} • Submitted {new Date(req.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="badge badge-warning">Pending</span>
              </div>

              <div style={{ margin: '12px 0', padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Reason:</strong>
                <p style={{ marginTop: '4px' }}>{req.reason}</p>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8125rem' }}>Admin Comment (optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={adminComment[req._id] || ''}
                  onChange={(e) => setAdminComment(prev => ({ ...prev, [req._id]: e.target.value }))}
                  placeholder="Note for the organizer..."
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-success" onClick={() => handleAction(req._id, 'approved')}>
                  ✓ Approve & Generate Password
                </button>
                <button className="btn btn-error" onClick={() => handleAction(req._id, 'rejected')}>
                  ✕ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Processed Requests */}
      {processed.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '12px' }}>History</h2>
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Organizer</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Admin Comment</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {processed.map(req => (
                    <tr key={req._id}>
                      <td>{req.organizer?.organizerName || req.clubName}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.reason}
                      </td>
                      <td>
                        <span className={`badge badge-${req.status === 'approved' ? 'success' : 'error'}`}>
                          {req.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.875rem' }}>{req.adminComment || '-'}</td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {new Date(req.updatedAt || req.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PasswordResets;
