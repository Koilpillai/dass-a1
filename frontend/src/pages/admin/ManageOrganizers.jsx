import { useState, useEffect } from 'react';
import API from '../../api/axios';

const CATEGORIES = [
  'Technology', 'Cultural', 'Sports', 'Music', 'Dance',
  'Art', 'Literary', 'Gaming', 'Robotics', 'Photography',
  'Film', 'Entrepreneurship', 'Social Service', 'Science', 'Quiz'
];

const ManageOrganizers = () => {
  const [organizers, setOrganizers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [newOrg, setNewOrg] = useState({
    organizerName: '',
    category: [],
    description: '',
    contactEmail: '',
  });

  useEffect(() => {
    fetchOrganizers();
  }, []);

  const fetchOrganizers = async () => {
    try {
      const res = await API.get('/admin/organizers');
      setOrganizers(res.data);
    } catch (err) {
      console.error('Failed to fetch organizers');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const res = await API.post('/admin/organizers', newOrg);
      setMessage({
        type: 'success',
        text: `Organizer created! Login email: ${res.data.credentials.email} | Password: ${res.data.credentials.password} — Please save and share these credentials securely. The password will NOT be shown again.`,
      });
      setShowCreateModal(false);
      setNewOrg({ organizerName: '', category: [], description: '', contactEmail: '' });
      fetchOrganizers();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to create organizer' });
    }
  };

  const handleUpdate = async () => {
    try {
      await API.put(`/admin/organizers/${selectedOrg._id}`, {
        organizerName: selectedOrg.organizerName,
        category: selectedOrg.category,
        description: selectedOrg.description,
        contactEmail: selectedOrg.contactEmail,
        isActive: selectedOrg.isActive,
      });
      setMessage({ type: 'success', text: 'Organizer updated!' });
      setShowEditModal(false);
      fetchOrganizers();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update' });
    }
  };

  const handleToggleActive = async (org) => {
    try {
      await API.put(`/admin/organizers/${org._id}`, { isActive: !org.isActive });
      fetchOrganizers();
      setMessage({ type: 'success', text: `Organizer ${!org.isActive ? 'enabled' : 'disabled'}.` });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update status' });
    }
  };

  const openDeleteModal = (org) => {
    setDeleteTarget(org);
    setShowDeleteModal(true);
  };

  const handleDelete = async (action) => {
    if (!deleteTarget) return;
    try {
      await API.delete(`/admin/organizers/${deleteTarget._id}?action=${action}`);
      fetchOrganizers();
      setMessage({
        type: 'success',
        text: action === 'delete'
          ? `"${deleteTarget.organizerName}" has been permanently deleted.`
          : `"${deleteTarget.organizerName}" has been archived (disabled).`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to remove organizer' });
    } finally {
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Manage Clubs & Organizers</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>+ Create Organizer</button>
      </div>

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="card">
        {organizers.length === 0 ? (
          <div className="empty-state">
            <h3>No organizers yet</h3>
            <p>Create the first organizer account to get started.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Club Name</th>
                  <th>Category</th>
                  <th>Login Email</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {organizers.map(org => (
                  <tr key={org._id} style={{ opacity: org.isActive ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 500 }}>{org.organizerName || `${org.firstName} ${org.lastName}`}</td>
                    <td><span className="badge badge-primary">{Array.isArray(org.category) ? org.category.join(', ') : (org.category || '-')}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{org.email}</td>
                    <td>{org.contactEmail || '-'}</td>
                    <td>
                      <span className={`badge badge-${org.isActive ? 'success' : 'error'}`}>
                        {org.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedOrg({ ...org }); setShowEditModal(true); }}>
                          Edit
                        </button>
                        <button className={`btn btn-sm ${org.isActive ? 'btn-warning' : 'btn-success'}`}
                          onClick={() => handleToggleActive(org)}>
                          {org.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-sm btn-error" onClick={() => openDeleteModal(org)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Create New Organizer</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              A login email and password will be auto-generated. Share the credentials with the organizer.
            </p>
            <div className="form-group">
              <label>Club / Organizer Name *</label>
              <input type="text" className="form-control" value={newOrg.organizerName}
                onChange={(e) => setNewOrg(prev => ({ ...prev, organizerName: e.target.value }))}
                placeholder="e.g., Robotics Club" />
            </div>
            <div className="form-group">
              <label>Category *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} type="button"
                    onClick={() => setNewOrg(prev => ({
                      ...prev,
                      category: prev.category.includes(cat)
                        ? prev.category.filter(c => c !== cat)
                        : [...prev.category, cat]
                    }))}
                    className={`btn btn-sm ${newOrg.category.includes(cat) ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" rows={3} value={newOrg.description}
                onChange={(e) => setNewOrg(prev => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Contact Email</label>
              <input type="email" className="form-control" value={newOrg.contactEmail}
                onChange={(e) => setNewOrg(prev => ({ ...prev, contactEmail: e.target.value }))}
                placeholder="club@example.com" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}
                disabled={!newOrg.organizerName || !newOrg.category.length}>
                Create Organizer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedOrg && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Edit Organizer</h2>
            <div className="form-group">
              <label>Club Name</label>
              <input type="text" className="form-control" value={selectedOrg.organizerName}
                onChange={(e) => setSelectedOrg(prev => ({ ...prev, organizerName: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} type="button"
                    onClick={() => setSelectedOrg(prev => {
                      const cats = Array.isArray(prev.category) ? prev.category : (prev.category ? [prev.category] : []);
                      return {
                        ...prev,
                        category: cats.includes(cat) ? cats.filter(c => c !== cat) : [...cats, cat]
                      };
                    })}
                    className={`btn btn-sm ${(Array.isArray(selectedOrg.category) ? selectedOrg.category : [selectedOrg.category]).includes(cat) ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" rows={3} value={selectedOrg.description}
                onChange={(e) => setSelectedOrg(prev => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Contact Email</label>
              <input type="email" className="form-control" value={selectedOrg.contactEmail}
                onChange={(e) => setSelectedOrg(prev => ({ ...prev, contactEmail: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedOrg.isActive}
                onChange={(e) => setSelectedOrg(prev => ({ ...prev, isActive: e.target.checked }))} />
              Active
            </label>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdate}>Update Organizer</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Remove Organizer</h2>
            <p style={{ marginBottom: '16px' }}>
              How would you like to remove <strong>{deleteTarget.organizerName}</strong>?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button className="btn btn-warning" onClick={() => handleDelete('archive')}>
                📦 Archive (Disable)
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, marginTop: '4px' }}>
                  The organizer account will be disabled but all data (events, registrations) is kept.
                  You can re-enable it later.
                </span>
              </button>
              <button className="btn btn-error" onClick={() => handleDelete('delete')}>
                🗑️ Permanently Delete
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, marginTop: '4px' }}>
                  The organizer account will be removed forever. This action cannot be undone.
                </span>
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageOrganizers;
