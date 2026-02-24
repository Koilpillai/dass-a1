import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import { io } from 'socket.io-client';
import { Html5Qrcode } from 'html5-qrcode';

const OrganizerEventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [stats, setStats] = useState({});
  const [feedback, setFeedback] = useState([]);
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Forum state
  const [forumMessages, setForumMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showForum, setShowForum] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState('');
  const [threadPopup, setThreadPopup] = useState(null);
  const socketRef = useRef(null);

  // Attendance state
  const [attendanceTicketId, setAttendanceTicketId] = useState('');
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef(null);
  const scannerContainerRef = useRef(null);

  // Detail popup state (for clicking ticket IDs)
  const [detailPopup, setDetailPopup] = useState(null); // registration object

  useEffect(() => {
    fetchData();
  }, [id]);

  // Mark event as viewed for forum notifications
  useEffect(() => {
    if (id) {
      localStorage.setItem(`forumViewed_${id}`, new Date().toISOString());
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'forum') {
      fetchForumMessages();
      setupSocket();
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const eventRes = await API.get(`/organizer/event/${id}`);
      const { event: eventData, registrations: regsData, stats: statsData } = eventRes.data;
      setEvent(eventData);
      setRegistrations(regsData);
      setStats(statsData);

      try {
        const fbRes = await API.get(`/feedback/event/${id}`);
        setFeedback(fbRes.data);
        const statsRes = await API.get(`/feedback/event/${id}/stats`);
        setFeedbackStats(statsRes.data);
      } catch (e) { /* no feedback yet */ }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load event details' });
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedbackFiltered = async (rating) => {
    try {
      const params = rating ? `?rating=${rating}` : '';
      const fbRes = await API.get(`/feedback/event/${id}${params}`);
      setFeedback(fbRes.data);
    } catch (e) {
      console.error('Failed to fetch filtered feedback');
    }
  };

  const handleFeedbackFilterChange = (rating) => {
    setFeedbackFilter(rating);
    fetchFeedbackFiltered(rating);
  };

  const handleExportFeedback = () => {
    if (!feedbackStats || !feedback) return;
    const lines = [];
    lines.push('Feedback Statistics Report');
    lines.push(`Event: ${event.name}`);
    lines.push(`Export Date: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push(`Total Responses: ${feedbackStats.totalFeedbacks || 0}`);
    lines.push(`Average Rating: ${feedbackStats.averageRating ? Number(feedbackStats.averageRating).toFixed(1) : 'N/A'}`);
    lines.push('');
    lines.push('Rating Distribution:');
    if (feedbackStats.ratingDistribution) {
      for (let i = 5; i >= 1; i--) {
        lines.push(`  ${i} Star: ${feedbackStats.ratingDistribution[i] || 0} responses`);
      }
    }
    lines.push('');
    lines.push('Individual Responses:');
    lines.push('Rating,Comment,Date');
    feedback.forEach(fb => {
      const comment = (fb.comment || '').replace(/"/g, '""');
      lines.push(`${fb.rating},"${comment}","${new Date(fb.createdAt).toLocaleDateString()}"`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.name}_feedback_report.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const setupSocket = () => {
    if (socketRef.current) return;
    const socketURL = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    socketRef.current = io(socketURL);
    socketRef.current.emit('joinForum', id);
    socketRef.current.on('messageReceived', (msg) => {
      setForumMessages(prev => {
        if (prev.some(m => m._id === msg._id)) return prev;
        if (msg.isAnnouncement) return [msg, ...prev];
        const firstRegularIdx = prev.findIndex(m => !m.isAnnouncement && !m.isPinned);
        if (firstRegularIdx === -1) return [...prev, msg];
        return [...prev.slice(0, firstRegularIdx), msg, ...prev.slice(firstRegularIdx)];
      });
    });
  };

  const fetchForumMessages = async () => {
    try {
      const res = await API.get(`/forum/${id}`);
      setForumMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch forum messages');
    }
  };

  const handlePublish = async () => {
    try {
      await API.put(`/events/${id}/publish`);
      fetchData();
      setMessage({ type: 'success', text: 'Event published!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to publish' });
    }
  };

  const handleClose = async () => {
    if (!window.confirm('Are you sure you want to close this event?')) return;
    try {
      await API.put(`/events/${id}/close`);
      fetchData();
      setMessage({ type: 'success', text: 'Event closed.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to close event' });
    }
  };

  const handleDeleteEvent = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this draft event? This action cannot be undone.')) return;
    try {
      await API.delete(`/events/${id}`);
      navigate('/dashboard');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete event' });
    }
  };

  const handlePaymentStatus = async (regId, status) => {
    try {
      const res = await API.put(`/registrations/${regId}/payment-status`, { status });
      // Refresh full data to get updated registration with ticket ID, etc.
      fetchData();
      setMessage({ type: 'success', text: `Payment ${status}!` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update payment status' });
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await API.get(`/registrations/event/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${event.name}_registrations.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to export CSV' });
    }
  };

  // Forum handlers
  const handlePostMessage = async (overrideReplyTo) => {
    if (!newMessage.trim()) return;
    try {
      const payload = { content: newMessage };
      const effectiveReply = overrideReplyTo || replyTo;
      if (effectiveReply) payload.parentMessage = effectiveReply._id;
      if (isAnnouncement) payload.isAnnouncement = true;
      const res = await API.post(`/forum/${id}`, payload);
      socketRef.current?.emit('newMessage', { eventId: id, message: res.data });
      setForumMessages(prev => {
        if (prev.some(m => m._id === res.data._id)) return prev;
        if (res.data.isAnnouncement) return [res.data, ...prev];
        const firstRegularIdx = prev.findIndex(m => !m.isAnnouncement && !m.isPinned);
        if (firstRegularIdx === -1) return [...prev, res.data];
        return [...prev.slice(0, firstRegularIdx), res.data, ...prev.slice(firstRegularIdx)];
      });
      setNewMessage('');
      setReplyTo(null);
      setIsAnnouncement(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to post message' });
    }
  };

  const handlePinMessage = async (msgId) => {
    try {
      await API.put(`/forum/${msgId}/pin`);
      fetchForumMessages();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to pin/unpin message' });
    }
  };

  const handleDeleteMessage = async (msgId) => {
    try {
      await API.delete(`/forum/${msgId}`);
      fetchForumMessages();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete message' });
    }
  };

  const handleReact = async (msgId) => {
    try {
      await API.post(`/forum/${msgId}/react`, { type: '👍' });
      fetchForumMessages();
    } catch (err) {
      console.error('Failed to react');
    }
  };

  // Mark attendance via ticket ID
  const handleMarkAttendance = async (ticketIdOverride) => {
    const tid = ticketIdOverride || attendanceTicketId.trim();
    if (!tid) return;
    setAttendanceResult(null);
    try {
      const res = await API.post('/registrations/mark-attendance', {
        ticketId: tid,
        eventId: id,
      });
      setAttendanceResult({ type: 'success', text: res.data.message, registration: res.data.registration });
      setAttendanceTicketId('');
      fetchData(); // Refresh data
    } catch (err) {
      setAttendanceResult({ type: 'error', text: err.response?.data?.message || 'Failed to mark attendance' });
    }
  };

  // Extract ticket ID from QR code data (the QR contains JSON with ticketId)
  const extractTicketId = (qrText) => {
    try {
      const data = JSON.parse(qrText);
      return data.ticketId || null;
    } catch {
      // If it's not JSON, check if it looks like a ticket ID directly
      if (qrText.startsWith('FEL-')) return qrText;
      return null;
    }
  };

  // Start camera scanner
  const startScanner = async () => {
    if (scannerRef.current) return;
    setScannerActive(true);
    try {
      const html5QrCode = new Html5Qrcode('qr-scanner-container');
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const ticketId = extractTicketId(decodedText);
          if (ticketId) {
            stopScanner();
            handleMarkAttendance(ticketId);
          } else {
            setAttendanceResult({ type: 'error', text: 'QR code does not contain a valid ticket ID' });
          }
        },
        () => {} // ignore errors during scanning
      );
    } catch (err) {
      setScannerActive(false);
      setAttendanceResult({ type: 'error', text: 'Failed to start camera. Please ensure camera permissions are granted.' });
    }
  };

  // Stop camera scanner
  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  };

  // Handle QR image upload
  const handleQRImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const html5QrCode = new Html5Qrcode('qr-image-temp');
      const result = await html5QrCode.scanFile(file, true);
      const ticketId = extractTicketId(result);
      if (ticketId) {
        handleMarkAttendance(ticketId);
      } else {
        setAttendanceResult({ type: 'error', text: 'QR code does not contain a valid ticket ID' });
      }
      html5QrCode.clear();
    } catch (err) {
      setAttendanceResult({ type: 'error', text: 'Could not read QR code from the uploaded image' });
    }
    e.target.value = ''; // reset file input
  };

  // Cleanup scanner on unmount or tab change
  useEffect(() => {
    return () => { stopScanner(); };
  }, [activeTab]);

  // Fuzzy match helper: checks if chars of pattern appear in str in order, allowing gaps
  const fuzzyMatch = (str, pattern) => {
    if (!str || !pattern) return false;
    str = str.toLowerCase();
    pattern = pattern.toLowerCase();
    // Quick check: if pattern is a substring, it's a match
    if (str.includes(pattern)) return true;
    // Fuzzy: chars of pattern must appear in order in str, allowing skipped chars
    let pi = 0;
    for (let si = 0; si < str.length && pi < pattern.length; si++) {
      if (str[si] === pattern[pi]) pi++;
    }
    return pi === pattern.length;
  };

  // Filter registrations with fuzzy + partial (multi-word) search
  const filteredRegs = registrations.filter(r => {
    if (statusFilter && r.status !== statusFilter && r.paymentStatus !== statusFilter) return false;
    if (!searchTerm) return true;
    const words = searchTerm.trim().split(/\s+/).filter(w => w.length > 0);
    const fields = [
      r.participant?.firstName || '',
      r.participant?.lastName || '',
      r.participant?.email || '',
      r.ticketId || '',
      `${r.participant?.firstName || ''} ${r.participant?.lastName || ''}` // combined name
    ];
    // Every word must fuzzy-match at least one field
    return words.every(word =>
      fields.some(field => fuzzyMatch(field, word))
    );
  });

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;
  if (!event) return <div className="page-container"><div className="alert alert-error">Event not found</div></div>;

  // Determine which tabs to show
  const tabs = ['overview', 'analytics', 'participants', 'attendance', 'forum', 'feedback'];

  // Determine editable status
  const canEdit = ['draft', 'published'].includes(event.status);

  return (
    <div className="page-container">
      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Event Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '24px', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem' }}>{event.name}</h1>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span className={`badge badge-${event.status === 'published' ? 'success' : event.status === 'draft' ? 'warning' : event.status === 'ongoing' ? 'info' : event.status === 'closed' ? 'warning' : 'secondary'}`}>
              {event.status}
            </span>
            <span className="badge badge-primary">{event.type === 'normal' ? 'Normal Event' : 'Merchandise'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canEdit && (
            <Link to={`/organizer/event/${id}/edit`} className="btn btn-secondary">
              ✏️ Edit Event
            </Link>
          )}
          {event.status === 'draft' && (
            <button className="btn btn-primary" onClick={handlePublish}>Publish Event</button>
          )}
          {event.status === 'draft' && (
            <button className="btn btn-error" onClick={handleDeleteEvent}>🗑️ Delete Event</button>
          )}
          {event.status === 'published' && (
            <button className="btn btn-error" onClick={handleClose}>Close Event</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '24px' }}>
        {tabs.map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ========== OVERVIEW TAB ========== */}
      {activeTab === 'overview' && (
        <div>
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '12px' }}>Event Details</h3>
            {event.description && (
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: '16px', color: 'var(--text-secondary)' }}>{event.description}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
              <div>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Start Date</strong>
                <p>{event.startDate ? new Date(event.startDate).toLocaleString() : 'Not set'}</p>
              </div>
              <div>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>End Date</strong>
                <p>{event.endDate ? new Date(event.endDate).toLocaleString() : 'Not set'}</p>
              </div>
              <div>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Registration Deadline</strong>
                <p>{event.registrationDeadline ? new Date(event.registrationDeadline).toLocaleString() : 'No deadline'}</p>
              </div>
              <div>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Eligibility</strong>
                <p style={{ textTransform: 'capitalize' }}>{event.eligibility === 'all' ? 'Everyone' : event.eligibility + ' students only'}</p>
              </div>
              <div>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Registration Limit</strong>
                <p>{event.registrationLimit > 0 ? event.registrationLimit : 'Unlimited'}</p>
              </div>
              <div>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Registration Fee</strong>
                <p>{event.registrationFee > 0 ? `₹${event.registrationFee}` : 'Free'}</p>
              </div>
            </div>
            {event.tags?.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Tags</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {event.tags.map((tag, i) => <span key={i} className="event-tag">{tag}</span>)}
                </div>
              </div>
            )}
          </div>

          {/* Custom Form Fields (Normal Event) */}
          {event.type === 'normal' && event.customForm?.length > 0 && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '12px' }}>Custom Registration Form {event.formLocked && <span className="badge badge-warning" style={{ marginLeft: '8px' }}>Locked</span>}</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Field Name</th>
                      <th>Type</th>
                      <th>Required</th>
                      <th>Options</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.customForm.sort((a, b) => a.order - b.order).map((field, idx) => (
                      <tr key={field._id || idx}>
                        <td>{idx + 1}</td>
                        <td>{field.fieldName}</td>
                        <td><span className="badge badge-secondary">{field.fieldType}</span></td>
                        <td>{field.required ? '✓' : '—'}</td>
                        <td>{field.options?.length > 0 ? field.options.join(', ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Merchandise Items */}
          {event.type === 'merchandise' && event.merchandiseItems?.length > 0 && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '12px' }}>Merchandise Items</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Sizes</th>
                      <th>Colors</th>
                      <th>Variants</th>
                      <th>Limit/Person</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.merchandiseItems.map((item, idx) => (
                      <tr key={item._id || idx}>
                        <td>
                          <strong>{item.name}</strong>
                          {item.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', margin: 0 }}>{item.description}</p>}
                        </td>
                        <td>₹{item.price}</td>
                        <td>
                          <span className={`badge badge-${item.stock > 0 ? 'success' : 'error'}`}>
                            {item.stock}
                          </span>
                        </td>
                        <td>{item.sizes?.join(', ') || '—'}</td>
                        <td>{item.colors?.join(', ') || '—'}</td>
                        <td>{item.variants?.join(', ') || '—'}</td>
                        <td>{item.purchaseLimit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== ANALYTICS TAB ========== */}
      {activeTab === 'analytics' && (
        <div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Registrations</div>
              <div className="stat-value">{stats.totalRegistrations || event.registrationCount || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Views</div>
              <div className="stat-value">{event.views || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Revenue</div>
              <div className="stat-value">₹{stats.revenue || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Rating</div>
              <div className="stat-value">{feedbackStats?.averageRating ? Number(feedbackStats.averageRating).toFixed(1) : 'N/A'}</div>
            </div>
            {(event.type === 'merchandise' || (event.type === 'normal' && event.registrationFee > 0)) && (
              <div className="stat-card">
                <div className="stat-label">Pending Payments</div>
                <div className="stat-value">{stats.pendingPayments || 0}</div>
              </div>
            )}
          </div>

          {/* Registration timeline - simple breakdown */}
          <div className="card" style={{ marginTop: '20px' }}>
            <h3 style={{ marginBottom: '12px' }}>Registration Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>
                  {registrations.filter(r => ['registered', 'completed'].includes(r.status)).length}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Registered</div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--warning)' }}>
                  {registrations.filter(r => r.status === 'pending_approval').length}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Pending</div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--error)' }}>
                  {registrations.filter(r => ['cancelled', 'rejected'].includes(r.status)).length}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Cancelled/Rejected</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== PARTICIPANTS TAB ========== */}
      {activeTab === 'participants' && (
        <div className="card">
          <div className="card-header">
            <h2>Participants ({registrations.length})</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="text" className="form-control" style={{ width: '200px' }}
                placeholder="Search name/email/ticket..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <select className="form-control" style={{ width: 'auto' }} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="registered">Registered</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button className="btn btn-sm btn-secondary" onClick={handleExportCSV}>Export CSV</button>
            </div>
          </div>

          {filteredRegs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>No participants found.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Reg Date</th>
                    <th>Ticket ID</th>
                    {event.type === 'merchandise' && <th>Items Ordered</th>}
                    <th>Status</th>
                    {(event.type === 'merchandise' || (event.type === 'normal' && event.registrationFee > 0)) && <th>Payment</th>}
                    {(event.type === 'merchandise' || (event.type === 'normal' && event.registrationFee > 0)) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRegs.map(reg => (
                    <tr key={reg._id}>
                      <td>{reg.participant?.firstName} {reg.participant?.lastName}</td>
                      <td style={{ fontSize: '0.8125rem' }}>{reg.participant?.email}</td>
                      <td style={{ fontSize: '0.8125rem' }}>{new Date(reg.createdAt).toLocaleDateString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {reg.ticketId ? (
                          <button
                            onClick={() => setDetailPopup(reg)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.8125rem', textDecoration: 'underline', padding: 0 }}
                          >
                            {reg.ticketId}
                          </button>
                        ) : '—'}
                      </td>
                      {event.type === 'merchandise' && (
                        <td style={{ fontSize: '0.8125rem' }}>
                          {reg.merchandiseSelections?.length > 0 ? (
                            <div>
                              {reg.merchandiseSelections.map((sel, i) => (
                                <div key={i} style={{ marginBottom: '2px' }}>
                                  {sel.name} × {sel.quantity}
                                </div>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                      )}
                      <td>
                        <span className={`badge badge-${reg.status === 'registered' ? 'success' : reg.status === 'pending_approval' ? 'warning' : 'secondary'}`}>
                          {reg.status}
                        </span>
                      </td>
                      {(event.type === 'merchandise' || (event.type === 'normal' && event.registrationFee > 0)) && (
                        <td>
                          <span className={`badge badge-${reg.paymentStatus === 'approved' ? 'success' : reg.paymentStatus === 'rejected' ? 'error' : 'warning'}`}>
                            {reg.paymentStatus}
                          </span>
                          {reg.totalAmount > 0 && <span style={{ fontSize: '0.8125rem', marginLeft: '4px' }}> ₹{reg.totalAmount}</span>}
                        </td>
                      )}
                      {(event.type === 'merchandise' || (event.type === 'normal' && event.registrationFee > 0)) && (
                        <td>
                          {reg.paymentProof && reg.paymentStatus === 'pending' && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-sm btn-success" onClick={() => handlePaymentStatus(reg._id, 'approved')}>Approve</button>
                              <button className="btn btn-sm btn-error" onClick={() => handlePaymentStatus(reg._id, 'rejected')}>Reject</button>
                            </div>
                          )}
                          {reg.paymentProof && (
                            <a href={reg.paymentProof.startsWith('http') ? reg.paymentProof : `${import.meta.env.VITE_BACKEND_URL || ''}${reg.paymentProof.startsWith('uploads/') ? `/${reg.paymentProof}` : `/uploads/${reg.paymentProof}`}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{ marginTop: '4px' }}>
                              View Proof
                            </a>
                          )}
                          {!reg.paymentProof && reg.status === 'pending_approval' && (
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-light)' }}>Awaiting proof upload</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== ATTENDANCE TAB ========== */}
      {activeTab === 'attendance' && (
        <div>
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2 style={{ marginBottom: '16px' }}>📱 Mark Attendance</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.875rem' }}>
              Scan a QR code with camera, upload a QR image, or enter the Ticket ID manually.
            </p>

            {/* Method 1: Manual Ticket ID */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>Enter Ticket ID</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter Ticket ID (e.g., FEL-A1B2C3D4)"
                  value={attendanceTicketId}
                  onChange={(e) => setAttendanceTicketId(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleMarkAttendance()}
                  style={{ maxWidth: '400px' }}
                />
                <button className="btn btn-primary" onClick={() => handleMarkAttendance()}>
                  Mark Present
                </button>
              </div>
            </div>

            {/* Method 2: Camera Scan */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>Scan QR Code with Camera</label>
              {!scannerActive ? (
                <button className="btn btn-secondary" onClick={startScanner}>
                  📷 Start Camera Scanner
                </button>
              ) : (
                <button className="btn btn-error" onClick={stopScanner}>
                  Stop Camera
                </button>
              )}
              <div id="qr-scanner-container" ref={scannerContainerRef}
                style={{ maxWidth: '400px', marginTop: '12px', display: scannerActive ? 'block' : 'none' }} />
            </div>

            {/* Method 3: Upload QR Image */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>Upload QR Code Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleQRImageUpload}
                className="form-control"
                style={{ maxWidth: '400px' }}
              />
              <div id="qr-image-temp" style={{ display: 'none' }} />
            </div>

            {attendanceResult && (
              <div className={`alert alert-${attendanceResult.type}`} style={{ marginTop: '12px' }}>
                {attendanceResult.text}
                {attendanceResult.type === 'success' && attendanceResult.registration?.merchandiseSelections?.length > 0 && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '10px' }}>
                    <strong>🛒 Items Ordered:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                      {attendanceResult.registration.merchandiseSelections.map((sel, i) => (
                        <li key={i}>
                          {sel.name} × {sel.quantity}
                          {sel.size && ` — Size: ${sel.size}`}
                          {sel.color && ` — Color: ${sel.color}`}
                          {sel.variant && ` — Variant: ${sel.variant}`}
                          {sel.price != null && ` — ₹${sel.price}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attendance Summary */}
          <div className="stats-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-label">Total Registered</div>
              <div className="stat-value">{registrations.filter(r => ['registered', 'completed'].includes(r.status)).length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Present</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {registrations.filter(r => r.attendance).length}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Absent</div>
              <div className="stat-value" style={{ color: 'var(--error)' }}>
                {registrations.filter(r => ['registered', 'completed'].includes(r.status) && !r.attendance).length}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Attendance Rate</div>
              <div className="stat-value">
                {registrations.filter(r => ['registered', 'completed'].includes(r.status)).length > 0
                  ? `${Math.round((registrations.filter(r => r.attendance).length / registrations.filter(r => ['registered', 'completed'].includes(r.status)).length) * 100)}%`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Attendance List */}
          <div className="card">
            <h3 style={{ marginBottom: '12px' }}>Attendance Record</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Ticket ID</th>
                    <th>Status</th>
                    <th>Marked At</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.filter(r => ['registered', 'completed'].includes(r.status)).map(reg => (
                    <tr key={reg._id}>
                      <td>{reg.participant?.firstName} {reg.participant?.lastName}</td>
                      <td style={{ fontSize: '0.8125rem' }}>{reg.participant?.email}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{reg.ticketId}</td>
                      <td>
                        {reg.attendance
                          ? <span className="badge badge-success">Present</span>
                          : <span className="badge badge-secondary">Absent</span>}
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>
                        {reg.attendanceMarkedAt ? new Date(reg.attendanceMarkedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========== FORUM TAB ========== */}
      {activeTab === 'forum' && (
        <div className="card">
          <h2 style={{ marginBottom: '16px' }}>💬 Discussion Forum</h2>
          <div className="forum-container">
            {forumMessages.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '20px' }}>
                No messages yet. Start the discussion!
              </p>
            ) : (
              // Show only top-level messages, each with a "Thread" button
              (() => {
                const topLevel = forumMessages.filter(m => !m.parentMessage);
                const replies = forumMessages.filter(m => m.parentMessage);
                const getRepliesCount = (parentId) => replies.filter(r => (r.parentMessage?._id || r.parentMessage) === parentId).length;

                return topLevel.map(msg => (
                  <div key={msg._id} className={`forum-message ${msg.isPinned ? 'pinned' : ''} ${msg.isAnnouncement ? 'announcement' : ''}`}
                    style={msg.isAnnouncement ? { borderLeft: '3px solid var(--warning)', background: 'rgba(255,193,7,0.08)' } : {}}>
                    <div className="message-header">
                      <span className={`author ${msg.author?.role === 'organizer' ? 'organizer' : ''}`}>
                        {msg.isAnnouncement && '📢 '}
                        {msg.isPinned && !msg.isAnnouncement && '📌 '}
                        {msg.author?.role === 'organizer' ? (msg.author?.organizerName || msg.author?.firstName) : `${msg.author?.firstName} ${msg.author?.lastName}`}
                        {msg.author?.role === 'organizer' && ' (Organizer)'}
                      </span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span className="timestamp">{new Date(msg.createdAt).toLocaleString()}</span>
                        <button className="btn btn-sm btn-secondary" onClick={() => setThreadPopup(msg)} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
                          💬 Thread {getRepliesCount(msg._id) > 0 ? `(${getRepliesCount(msg._id)})` : ''}
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={() => handlePinMessage(msg._id)} title={msg.isPinned ? 'Unpin' : 'Pin'}>
                          📌
                        </button>
                        <button className="btn btn-sm btn-error" onClick={() => handleDeleteMessage(msg._id)} title="Delete">
                          🗑️
                        </button>
                      </div>
                    </div>
                    {msg.isAnnouncement && (
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--warning)', textTransform: 'uppercase', marginBottom: '4px' }}>Announcement</div>
                    )}
                    <div className="content">{msg.content}</div>
                    <div className="reactions">
                      <button className="reaction-btn" onClick={() => handleReact(msg._id)}>
                        👍 {msg.reactions?.length || 0}
                      </button>
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={isAnnouncement} onChange={(e) => setIsAnnouncement(e.target.checked)} />
                📢 Post as Announcement
              </label>
            </div>
            <div className="forum-input">
              <input
                type="text"
                className="form-control"
                placeholder={isAnnouncement ? 'Write an announcement...' : 'Post a new message...'}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePostMessage()}
              />
              <button className="btn btn-primary" onClick={() => handlePostMessage()}>Send</button>
            </div>
          </div>
        </div>
      )}

      {/* Thread Popup Modal (Organizer) */}
      {threadPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setThreadPopup(null); }}>
          <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>💬 Thread</h3>
              <button onClick={() => setThreadPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* Original message */}
              <div className="forum-message" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '12px', marginBottom: '16px' }}>
                <div className="message-header">
                  <span className={`author ${threadPopup.author?.role === 'organizer' ? 'organizer' : ''}`}>
                    {threadPopup.author?.role === 'organizer' ? (threadPopup.author?.organizerName || threadPopup.author?.firstName) : `${threadPopup.author?.firstName} ${threadPopup.author?.lastName}`}
                    {threadPopup.author?.role === 'organizer' && ' (Organizer)'}
                  </span>
                  <span className="timestamp">{new Date(threadPopup.createdAt).toLocaleString()}</span>
                </div>
                <div className="content">{threadPopup.content}</div>
              </div>
              {/* Replies */}
              {forumMessages.filter(m => (m.parentMessage?._id || m.parentMessage) === threadPopup._id).length === 0 ? (
                <p style={{ color: 'var(--text-light)', textAlign: 'center', fontSize: '0.875rem' }}>No replies yet.</p>
              ) : (
                forumMessages.filter(m => (m.parentMessage?._id || m.parentMessage) === threadPopup._id).map(reply => (
                  <div key={reply._id} className="forum-message" style={{ marginLeft: '16px', borderLeft: '2px solid var(--border)', paddingLeft: '12px', marginBottom: '8px' }}>
                    <div className="message-header">
                      <span className={`author ${reply.author?.role === 'organizer' ? 'organizer' : ''}`}>
                        ↳ {reply.author?.role === 'organizer' ? (reply.author?.organizerName || reply.author?.firstName) : `${reply.author?.firstName} ${reply.author?.lastName}`}
                        {reply.author?.role === 'organizer' && ' (Organizer)'}
                      </span>
                      <span className="timestamp">{new Date(reply.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="content">{reply.content}</div>
                    <div className="reactions">
                      <button className="reaction-btn" onClick={() => handleReact(reply._id)}>
                        👍 {reply.reactions?.length || 0}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <div className="forum-input">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Reply in thread..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newMessage.trim()) {
                      handlePostMessage(threadPopup);
                    }
                  }}
                />
                <button className="btn btn-primary" onClick={() => handlePostMessage(threadPopup)}>Reply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== FEEDBACK TAB ========== */}
      {activeTab === 'feedback' && (
        <div>
          {feedbackStats && (
            <div style={{ marginBottom: '20px' }}>
              <div className="stats-grid" style={{ marginBottom: '16px' }}>
                <div className="stat-card">
                  <div className="stat-label">Total Responses</div>
                  <div className="stat-value">{feedbackStats.totalFeedbacks || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Average Rating</div>
                  <div className="stat-value">{Number(feedbackStats.averageRating || 0).toFixed(1)} ⭐</div>
                </div>
              </div>

              {/* Rating Distribution */}
              {feedbackStats.ratingDistribution && feedbackStats.totalFeedbacks > 0 && (
                <div className="card" style={{ marginBottom: '20px' }}>
                  <div className="card-header">
                    <h3>Rating Distribution</h3>
                    <button className="btn btn-sm btn-secondary" onClick={handleExportFeedback}>
                      📥 Export Report
                    </button>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    {[5, 4, 3, 2, 1].map(star => {
                      const count = feedbackStats.ratingDistribution[star] || 0;
                      const pct = feedbackStats.totalFeedbacks > 0 ? (count / feedbackStats.totalFeedbacks) * 100 : 0;
                      return (
                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ width: '50px', fontSize: '0.875rem', fontWeight: 500 }}>{star} ⭐</span>
                          <div style={{ flex: 1, height: '18px', background: 'var(--bg)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: star >= 4 ? 'var(--success)' : star === 3 ? 'var(--warning)' : 'var(--error)', borderRadius: '4px', transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ width: '60px', fontSize: '0.8125rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                            {count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h2>Feedback Responses</h2>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm ${feedbackFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleFeedbackFilterChange('')}
                >
                  All
                </button>
                {[5, 4, 3, 2, 1].map(r => (
                  <button
                    key={r}
                    className={`btn btn-sm ${feedbackFilter === String(r) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleFeedbackFilterChange(String(r))}
                  >
                    {r} ⭐
                  </button>
                ))}
              </div>
            </div>
            {feedback.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>
                {feedbackFilter ? `No ${feedbackFilter}-star feedback yet.` : 'No feedback yet.'}
              </p>
            ) : (
              feedback.map(fb => (
                <div key={fb._id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{'⭐'.repeat(fb.rating)} ({fb.rating}/5)</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {fb.comment && <p style={{ marginTop: '6px', fontSize: '0.875rem' }}>{fb.comment}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========== TICKET DETAIL POPUP ========== */}
      {detailPopup && (
        <div className="modal-overlay" onClick={() => setDetailPopup(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Registration Details</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setDetailPopup(null)}>✕</button>
            </div>
            <div style={{ padding: '16px' }}>
              <p><strong>Participant:</strong> {detailPopup.participant?.firstName} {detailPopup.participant?.lastName}</p>
              <p><strong>Email:</strong> {detailPopup.participant?.email}</p>
              <p><strong>Ticket ID:</strong> <span style={{ fontFamily: 'monospace' }}>{detailPopup.ticketId}</span></p>
              <p><strong>Registered:</strong> {new Date(detailPopup.createdAt).toLocaleString()}</p>
              <p><strong>Status:</strong> {detailPopup.status}</p>
              {detailPopup.paymentStatus && detailPopup.paymentStatus !== 'none' && (
                <p><strong>Payment:</strong> {detailPopup.paymentStatus}</p>
              )}

              {/* Merchandise Details */}
              {detailPopup.merchandiseSelections?.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ marginBottom: '8px' }}>🛒 Merchandise Items</h4>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Size</th>
                          <th>Color</th>
                          <th>Variant</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailPopup.merchandiseSelections.map((sel, i) => (
                          <tr key={i}>
                            <td>{sel.name}</td>
                            <td>{sel.quantity}</td>
                            <td>{sel.size || '—'}</td>
                            <td>{sel.color || '—'}</td>
                            <td>{sel.variant || '—'}</td>
                            <td>{sel.price != null ? `₹${sel.price}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Custom Form Responses */}
              {detailPopup.formResponses && Object.keys(detailPopup.formResponses).length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ marginBottom: '8px' }}>📋 Custom Form Responses</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(detailPopup.formResponses).map(([key, value]) => (
                      <div key={key} style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                        <span style={{ fontWeight: 600, minWidth: '140px', marginRight: '12px' }}>{key}:</span>
                        <span>
                          {typeof value === 'string' && (value.startsWith('http') || value.startsWith('uploaded_') || value.match(/^\d+-.+\..+$/)) ? (
                            <a href={value.startsWith('http') ? value : `${import.meta.env.VITE_BACKEND_URL || ''}/uploads/${value}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                              📎 {value.startsWith('http') ? 'View File' : value.replace(/^\d+-/, '')}
                            </a>
                          ) : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizerEventDetail;
