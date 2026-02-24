import { useState, useEffect } from 'react';
import API from '../../api/axios';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await API.get('/admin/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
      </div>

      {/* System Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Participants</div>
          <div className="stat-value">{stats?.totalParticipants || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Organizers</div>
          <div className="stat-value">{stats?.totalOrganizers || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{stats?.totalEvents || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Registrations</div>
          <div className="stat-value">{stats?.totalRegistrations || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Events</div>
          <div className="stat-value">{stats?.activeEvents || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Resets</div>
          <div className="stat-value">{stats?.pendingPasswordResets || 0}</div>
        </div>
      </div>


    </div>
  );
};

export default AdminDashboard;
