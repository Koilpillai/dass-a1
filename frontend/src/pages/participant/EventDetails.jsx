import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import { io } from 'socket.io-client';

const EventDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registration, setRegistration] = useState(null);
  const [allRegistrations, setAllRegistrations] = useState([]); // all regs for this event (for multi-ticket merch)
  const [formResponses, setFormResponses] = useState({});
  const [merchSelections, setMerchSelections] = useState([]);
  const [showTicket, setShowTicket] = useState(!!searchParams.get('ticket'));
  const [message, setMessage] = useState({ type: '', text: '' });
  const [itemLimits, setItemLimits] = useState({}); // { itemId: { purchaseLimit, ordered, remaining } }

  // Forum state
  const [forumMessages, setForumMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showForum, setShowForum] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [threadView, setThreadView] = useState(true);
  const socketRef = useRef(null);
  const forumEndRef = useRef(null);

  // Thread popup state
  const [threadPopup, setThreadPopup] = useState(null); // message object whose thread is open

  // Feedback state
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    fetchEvent();
    checkRegistration();
    fetchItemLimits();
  }, [id]);

  // Mark event as viewed for forum and announcement notifications
  useEffect(() => {
    if (id) {
      localStorage.setItem(`forumViewed_${id}`, new Date().toISOString());
      localStorage.setItem(`announcementViewed_${id}`, new Date().toISOString());
    }
  }, [id]);

  useEffect(() => {
    if (showForum && event) {
      fetchForumMessages();
      setupSocket();
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [showForum, event]);

  const fetchEvent = async () => {
    try {
      const res = await API.get(`/events/${id}`);
      setEvent(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load event' });
    } finally {
      setLoading(false);
    }
  };

  const checkRegistration = async () => {
    // Only participants use registrations/my endpoint
    if (user?.role !== 'participant') return;
    try {
      const res = await API.get('/registrations/my');
      const allRegs = res.data.filter(r => r.event?._id === id);
      setAllRegistrations(allRegs); // Store all registrations for multi-ticket display
      if (allRegs.length === 0) {
        setRegistration(null);
        return;
      }

      const isMerchandise = allRegs[0]?.event?.type === 'merchandise';

      // For merchandise events, prioritize pending registration without proof uploaded
      // so the upload form is shown instead of the purchase form
      if (isMerchandise) {
        const pendingWithoutProof = allRegs.find(r =>
          r.status === 'pending_approval' && (!r.paymentProof || r.paymentProof === '')
        );
        if (pendingWithoutProof) {
          setRegistration(pendingWithoutProof);
          return;
        }
      }

      // For normal events, prefer approved/active registrations
      const approved = allRegs.find(r => r.paymentStatus === 'approved' || r.status === 'registered');
      const pending = allRegs.find(r => r.status === 'pending_approval');
      const reg = approved || pending || allRegs[0];
      if (reg) {
        setRegistration(reg);
      }
    } catch (err) {
      // Not registered
    }
  };

  const fetchItemLimits = async () => {
    if (user?.role !== 'participant') return;
    try {
      const res = await API.get(`/registrations/item-limits/${id}`);
      setItemLimits(res.data);
    } catch {
      // Not a merchandise event or error — ignore
    }
  };

  // Check if current user is the event's organizer
  const isEventOrganizer = user?.role === 'organizer' && event?.organizer?._id === user?._id;

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

  const setupSocket = () => {
    if (socketRef.current) return;
    const socketURL = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    socketRef.current = io(socketURL);
    socketRef.current.emit('joinForum', id);
    socketRef.current.on('messageReceived', (msg) => {
      setForumMessages(prev => {
        if (prev.some(m => m._id === msg._id)) return prev;
        // Find correct insertion point: after announcements/pinned, before other messages (newest first order)
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

  const handleRegister = async (e) => {
    e?.preventDefault();
    setRegistering(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = { eventId: id };

      if (event.type === 'normal') {
        payload.formResponses = formResponses;
      } else if (event.type === 'merchandise') {
        payload.merchandiseSelections = merchSelections.filter(s => s.quantity > 0);
        if (payload.merchandiseSelections.length === 0) {
          setMessage({ type: 'error', text: 'Please select at least one item' });
          setRegistering(false);
          return;
        }
      }

      const res = await API.post('/registrations', payload);
      setRegistration(res.data);
      if (event.type === 'merchandise') {
        setMessage({ type: 'success', text: 'Order placed! Please upload payment proof below to complete your purchase.' });
        setMerchSelections([]);
        fetchItemLimits(); // Refresh remaining limits
        checkRegistration(); // Refresh registrations list
      } else if (event.registrationFee > 0) {
        setMessage({ type: 'success', text: 'Registration submitted! Please upload payment proof below. Your registration will be confirmed once payment is approved.' });
      } else {
        setMessage({ type: 'success', text: 'Registration successful! Check your email for the ticket.' });
        setShowTicket(true);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Registration failed' });
    } finally {
      setRegistering(false);
    }
  };

  const handlePostMessage = async (overrideReplyTo) => {
    if (!newMessage.trim()) return;
    try {
      const payload = { content: newMessage };
      const effectiveReply = overrideReplyTo || replyTo;
      if (effectiveReply) payload.parentMessage = effectiveReply._id;
      const res = await API.post(`/forum/${id}`, payload);
      socketRef.current?.emit('newMessage', { eventId: id, message: res.data });
      // Insert at correct position (after announcements/pinned, newest first)
      setForumMessages(prev => {
        if (prev.some(m => m._id === res.data._id)) return prev;
        const firstRegularIdx = prev.findIndex(m => !m.isAnnouncement && !m.isPinned);
        if (firstRegularIdx === -1) return [...prev, res.data];
        return [...prev.slice(0, firstRegularIdx), res.data, ...prev.slice(firstRegularIdx)];
      });
      setNewMessage('');
      setReplyTo(null);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to post message' });
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

  const handleSubmitFeedback = async () => {
    try {
      await API.post('/feedback', {
        eventId: id,
        rating: feedbackRating,
        comment: feedbackComment,
      });
      setFeedbackSubmitted(true);
      setMessage({ type: 'success', text: 'Feedback submitted successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to submit feedback' });
    }
  };

  const handleUploadPaymentProof = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('paymentProof', file);
    try {
      await API.post(`/registrations/${registration._id}/payment-proof`, fd);
      setMessage({ type: 'success', text: 'Payment proof uploaded!' });
      checkRegistration();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to upload payment proof' });
    }
  };

  if (loading) return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;
  if (!event) return <div className="page-container"><div className="alert alert-error">Event not found</div></div>;

  const isDeadlinePassed = event.registrationDeadline && new Date() > new Date(event.registrationDeadline);
  const isLimitReached = event.registrationLimit > 0 && event.registrationCount >= event.registrationLimit;
  const isAllStockExhausted = event.type === 'merchandise' && event.merchandiseItems?.every(item => item.stock <= 0);
  const isRejected = registration && (registration.status === 'rejected' || registration.paymentStatus === 'rejected');
  // For merchandise: check if there's a pending order without payment proof uploaded
  const hasPendingWithoutProof = registration && registration.status === 'pending_approval' &&
    (!registration.paymentProof || registration.paymentProof === '');
  // For merchandise events: allow new purchases unless there's an unpaid pending order
  // For normal events: allow if not registered, or if rejected
  const canRegister = (
    event.type === 'merchandise'
      ? !hasPendingWithoutProof
      : (!registration || isRejected)
  ) && !isDeadlinePassed && !isLimitReached && !isAllStockExhausted &&
    ['published', 'ongoing'].includes(event.status) && user?.role === 'participant' &&
    (event.eligibility === 'all' || user?.participantType === event.eligibility);

  return (
    <div className="page-container">
      {message.text && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {/* Event Header */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{event.name}</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              By {event.organizer?.organizerName}
              {event.organizer?.category && ` • ${Array.isArray(event.organizer.category) ? event.organizer.category.join(', ') : event.organizer.category}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className="badge badge-primary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
              {event.type === 'normal' ? '📋 Normal Event' : '🛍️ Merchandise'}
            </span>
            <span className={`badge badge-${event.status === 'published' ? 'success' : event.status === 'ongoing' ? 'info' : 'secondary'}`}>
              {event.status}
            </span>
          </div>
        </div>

        <p style={{ marginTop: '16px', whiteSpace: 'pre-wrap' }}>{event.description}</p>

        {/* Event details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px', padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
          <div>
            <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Start Date</strong>
            <p>{event.startDate ? new Date(event.startDate).toLocaleString() : 'TBA'}</p>
          </div>
          <div>
            <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>End Date</strong>
            <p>{event.endDate ? new Date(event.endDate).toLocaleString() : 'TBA'}</p>
          </div>
          <div>
            <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Registration Deadline</strong>
            <p style={{ color: isDeadlinePassed ? 'var(--error)' : 'inherit' }}>
              {event.registrationDeadline ? new Date(event.registrationDeadline).toLocaleString() : 'No Deadline'}
              {isDeadlinePassed && ' (Passed)'}
            </p>
          </div>
          <div>
            <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Eligibility</strong>
            <p style={{ textTransform: 'capitalize' }}>{event.eligibility === 'all' ? 'Everyone' : event.eligibility + ' students only'}</p>
          </div>
          <div>
            <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Registration Fee</strong>
            <p>{event.registrationFee > 0 ? `₹${event.registrationFee}` : 'Free'}</p>
          </div>
          <div>
            <strong style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Registrations</strong>
            <p>{event.registrationCount}{event.registrationLimit > 0 ? ` / ${event.registrationLimit}` : ''}</p>
          </div>
        </div>

        {event.tags?.length > 0 && (
          <div className="event-tags" style={{ marginTop: '16px' }}>
            {event.tags.map((tag, i) => <span key={i} className="event-tag">{tag}</span>)}
          </div>
        )}
      </div>

      {/* Blocking Messages */}
      {isDeadlinePassed && !registration && (
        <div className="alert alert-warning">Registration deadline has passed for this event.</div>
      )}
      {isLimitReached && !registration && (
        <div className="alert alert-warning">This event has reached its maximum capacity. No more registrations are being accepted.</div>
      )}
      {isAllStockExhausted && !registration && event.type === 'merchandise' && (
        <div className="alert alert-warning">All merchandise items are out of stock.</div>
      )}

      {/* Registration Form (Normal Event) */}
      {canRegister && event.type === 'normal' && user?.role === 'participant' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '16px' }}>Register for this Event</h2>
          <form onSubmit={handleRegister}>
            {event.customForm?.sort((a, b) => a.order - b.order).map(field => (
              <div className="form-group" key={field._id}>
                <label>
                  {field.fieldName}
                  {field.required && <span style={{ color: 'var(--error)' }}> *</span>}
                </label>
                {field.fieldType === 'text' || field.fieldType === 'number' || field.fieldType === 'email' ? (
                  <input
                    type={field.fieldType}
                    className="form-control"
                    required={field.required}
                    value={formResponses[field.fieldName] || ''}
                    onChange={(e) => setFormResponses(prev => ({ ...prev, [field.fieldName]: e.target.value }))}
                  />
                ) : field.fieldType === 'textarea' ? (
                  <textarea
                    className="form-control"
                    required={field.required}
                    value={formResponses[field.fieldName] || ''}
                    onChange={(e) => setFormResponses(prev => ({ ...prev, [field.fieldName]: e.target.value }))}
                  />
                ) : field.fieldType === 'dropdown' ? (
                  <select
                    className="form-control"
                    required={field.required}
                    value={formResponses[field.fieldName] || ''}
                    onChange={(e) => setFormResponses(prev => ({ ...prev, [field.fieldName]: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                  </select>
                ) : field.fieldType === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formResponses[field.fieldName] || false}
                      onChange={(e) => setFormResponses(prev => ({ ...prev, [field.fieldName]: e.target.checked }))}
                    />
                    Yes
                  </label>
                ) : field.fieldType === 'file' ? (
                  <div>
                    <input
                      type="file"
                      className="form-control"
                      required={field.required && !formResponses[field.fieldName]}
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        try {
                          const fd = new FormData();
                          fd.append('formFile', file);
                          const res = await API.post('/registrations/upload-form-file', fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });
                          setFormResponses(prev => ({ ...prev, [field.fieldName]: res.data.filename }));
                          setMessage({ type: 'success', text: `File "${res.data.originalName}" uploaded successfully` });
                        } catch (err) {
                          setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to upload file' });
                        }
                      }}
                    />
                    {formResponses[field.fieldName] && (
                      <p style={{ fontSize: '0.8125rem', color: 'var(--success)', marginTop: '4px' }}>
                        ✅ File uploaded
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {event.customForm?.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                No additional information required. Click register to proceed.
              </p>
            )}
            {event.registrationFee > 0 && (
              <div className="alert alert-info" style={{ marginBottom: '16px' }}>
                <strong>Registration Fee: ₹{event.registrationFee}</strong>
                <p style={{ marginTop: '4px', fontSize: '0.875rem' }}>After registering, you will need to upload payment proof for organizer approval.</p>
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg" disabled={registering}>
              {registering ? 'Registering...' : event.registrationFee > 0 ? 'Register & Pay' : 'Register Now'}
            </button>
          </form>
        </div>
      )}

      {/* Merchandise Selection */}
      {canRegister && event.type === 'merchandise' && user?.role === 'participant' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '16px' }}>Purchase Merchandise</h2>
          {event.merchandiseItems?.map((item, idx) => {
            const limit = itemLimits[item._id];
            const remainingLimit = limit ? limit.remaining : item.purchaseLimit;
            const maxQty = Math.min(item.stock, remainingLimit);
            const limitReached = remainingLimit <= 0;
            return (
            <div key={item._id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '1rem' }}>{item.name}</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.description}</p>
              <p style={{ fontWeight: 600, color: 'var(--primary)', margin: '8px 0' }}>₹{item.price}</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.8125rem' }}>
                <p style={{ color: item.stock > 0 ? 'var(--success)' : 'var(--error)', margin: 0 }}>
                  {item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}
                </p>
                <p style={{ color: limitReached ? 'var(--error)' : 'var(--text-secondary)', margin: 0 }}>
                  Per-person limit: {item.purchaseLimit}
                  {limit && limit.ordered > 0 && ` (${limit.ordered} already ordered, ${remainingLimit} remaining)`}
                  {limitReached && ' — Limit reached'}
                </p>
              </div>
              {item.stock > 0 && !limitReached && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {item.sizes?.length > 0 && (
                    <select className="form-control" style={{ width: 'auto' }}
                      onChange={(e) => {
                        const updated = [...merchSelections];
                        const existing = updated.find(s => s.itemId === item._id);
                        if (existing) existing.size = e.target.value;
                        else updated.push({ itemId: item._id, size: e.target.value, color: '', variant: '', quantity: 1 });
                        setMerchSelections(updated);
                      }}
                    >
                      <option value="">Size</option>
                      {item.sizes.map((s, i) => <option key={i} value={s}>{s}</option>)}
                    </select>
                  )}
                  {item.colors?.length > 0 && (
                    <select className="form-control" style={{ width: 'auto' }}
                      onChange={(e) => {
                        const updated = [...merchSelections];
                        const existing = updated.find(s => s.itemId === item._id);
                        if (existing) existing.color = e.target.value;
                        else updated.push({ itemId: item._id, size: '', color: e.target.value, variant: '', quantity: 1 });
                        setMerchSelections(updated);
                      }}
                    >
                      <option value="">Color</option>
                      {item.colors.map((c, i) => <option key={i} value={c}>{c}</option>)}
                    </select>
                  )}
                  {item.variants?.length > 0 && (
                    <select className="form-control" style={{ width: 'auto' }}
                      onChange={(e) => {
                        const updated = [...merchSelections];
                        const existing = updated.find(s => s.itemId === item._id);
                        if (existing) existing.variant = e.target.value;
                        else updated.push({ itemId: item._id, size: '', color: '', variant: e.target.value, quantity: 1 });
                        setMerchSelections(updated);
                      }}
                    >
                      <option value="">Variant</option>
                      {item.variants.map((v, i) => <option key={i} value={v}>{v}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '0.875rem' }}>Qty:</label>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: '70px' }}
                      min="0"
                      max={maxQty}
                      value={merchSelections.find(s => s.itemId === item._id)?.quantity || 0}
                      onChange={(e) => {
                        const qty = Math.min(parseInt(e.target.value) || 0, maxQty);
                        const updated = [...merchSelections];
                        const existing = updated.find(s => s.itemId === item._id);
                        if (existing) existing.quantity = qty;
                        else updated.push({ itemId: item._id, size: '', color: '', variant: '', quantity: qty });
                        setMerchSelections(updated);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            );
          })}
          {merchSelections.filter(s => s.quantity > 0).length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <p style={{ fontWeight: 600, fontSize: '1.125rem' }}>
                Total: ₹{merchSelections.reduce((sum, s) => {
                  const item = event.merchandiseItems.find(i => i._id === s.itemId);
                  return sum + (item?.price || 0) * s.quantity;
                }, 0)}
              </p>
              <button onClick={handleRegister} className="btn btn-primary btn-lg" style={{ marginTop: '12px' }} disabled={registering}>
                {registering ? 'Processing...' : 'Purchase'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Payment Proof Upload (Merchandise or Paid Normal Events) */}
      {registration && registration.status === 'pending_approval' && !registration.paymentProof && !isRejected && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '12px' }}>Upload Payment Proof</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Please upload a screenshot or photo of your payment (₹{registration.totalAmount || event?.registrationFee || 0}) to confirm your registration.
          </p>
          <input type="file" accept="image/*" onChange={handleUploadPaymentProof} className="form-control" />
        </div>
      )}

      {/* Payment Proof Submitted - Awaiting Approval */}
      {registration && registration.status === 'pending_approval' && registration.paymentProof && registration.paymentStatus === 'pending' && (
        <div className="alert alert-info" style={{ marginBottom: '20px' }}>
          Payment proof uploaded successfully. Awaiting organizer approval.
        </div>
      )}

      {/* Ticket Display - for normal events: single ticket; for merchandise: all approved tickets */}
      {event.type === 'merchandise' && (() => {
        const approvedRegs = allRegistrations.filter(r => r.ticketId && r.paymentStatus === 'approved');
        if (approvedRegs.length === 0) return null;
        return (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>Your Tickets ({approvedRegs.length})</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowTicket(!showTicket)}>
                {showTicket ? 'Hide' : 'Show'} Tickets
              </button>
            </div>
            {showTicket && approvedRegs.map((reg, idx) => (
              <div key={reg._id} className="ticket" style={{ marginBottom: idx < approvedRegs.length - 1 ? '20px' : 0 }}>
                <h2>🎟️ {event.name} — Order #{idx + 1}</h2>
                <div className="ticket-id">{reg.ticketId}</div>
                {reg.qrCode && (
                  <div className="qr-code">
                    <img src={reg.qrCode} alt="QR Code" />
                  </div>
                )}
                <div className="ticket-info">
                  <p><strong>Event:</strong> {event.name}</p>
                  <p><strong>Type:</strong> Merchandise</p>
                  <p><strong>Date:</strong> {event.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBA'}</p>
                  <p><strong>Status:</strong> {reg.status}</p>
                  {reg.merchandiseSelections?.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <strong>Items:</strong>
                      <ul style={{ margin: '4px 0 0 16px' }}>
                        {reg.merchandiseSelections.map((sel, i) => (
                          <li key={i}>
                            {sel.name} × {sel.quantity}
                            {sel.size && ` (Size: ${sel.size})`}
                            {sel.color && ` (Color: ${sel.color})`}
                            {sel.variant && ` (${sel.variant})`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Ticket Display - Normal events */}
      {event.type !== 'merchandise' && registration && registration.ticketId && (
        (registration.status === 'registered' && (!registration.paymentStatus || registration.paymentStatus === 'none' || registration.paymentStatus === 'approved')) || showTicket
      ) && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>Your Ticket</h2>
            <button className="btn btn-sm btn-secondary" onClick={() => setShowTicket(!showTicket)}>
              {showTicket ? 'Hide' : 'Show'} Ticket
            </button>
          </div>
          {showTicket && (
            <div className="ticket">
              <h2>🎟️ {event.name}</h2>
              <div className="ticket-id">{registration.ticketId}</div>
              {registration.qrCode && (
                <div className="qr-code">
                  <img src={registration.qrCode} alt="QR Code" />
                </div>
              )}
              <div className="ticket-info">
                <p><strong>Event:</strong> {event.name}</p>
                <p><strong>Type:</strong> {event.type}</p>
                <p><strong>Date:</strong> {event.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBA'}</p>
                <p><strong>Status:</strong> {registration.status}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feedback Section */}
      {registration && registration.status === 'registered' && !feedbackSubmitted && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '12px' }}>Leave Feedback</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.875rem' }}>
            Your feedback is anonymous and helps organizers improve future events.
          </p>
          <div className="form-group">
            <label>Rating</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1, 2, 3, 4, 5].map(r => (
                <button
                  key={r}
                  onClick={() => setFeedbackRating(r)}
                  style={{
                    fontSize: '1.5rem', cursor: 'pointer', background: 'none', border: 'none',
                    opacity: r <= feedbackRating ? 1 : 0.3
                  }}
                >
                  ⭐
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Comment (optional)</label>
            <textarea
              className="form-control"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Share your thoughts..."
            />
          </div>
          <button onClick={handleSubmitFeedback} className="btn btn-primary">Submit Feedback</button>
        </div>
      )}

      {/* Discussion Forum */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2>💬 Discussion Forum</h2>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowForum(!showForum)}>
            {showForum ? 'Hide' : 'Show'} Forum
          </button>
        </div>
        {showForum && (
          <>
            <div className="forum-container">
              {forumMessages.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '20px' }}>
                  No messages yet. Be the first to post!
                </p>
              ) : (
                // Show only top-level messages, each with a "View Thread" button
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
                        <span className="timestamp">{new Date(msg.createdAt).toLocaleString()}</span>
                      </div>
                      {msg.isAnnouncement && (
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--warning)', textTransform: 'uppercase', marginBottom: '4px' }}>Announcement</div>
                      )}
                      <div className="content">{msg.content}</div>
                      <div className="reactions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          className={`reaction-btn ${msg.reactions?.some(r => r.user === user?._id) ? 'active' : ''}`}
                          onClick={() => handleReact(msg._id)}
                        >
                          👍 {msg.reactions?.length || 0}
                        </button>
                        {(registration || isEventOrganizer) && (
                          <button className="btn btn-sm btn-secondary" onClick={() => setThreadPopup(msg)} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
                            💬 Thread {getRepliesCount(msg._id) > 0 ? `(${getRepliesCount(msg._id)})` : ''}
                          </button>
                        )}
                        {isEventOrganizer && (
                          <>
                            <button className="btn btn-sm btn-secondary" onClick={() => handlePinMessage(msg._id)} title={msg.isPinned ? 'Unpin' : 'Pin'} style={{ padding: '2px 6px', fontSize: '0.75rem' }}>
                              📌
                            </button>
                            <button className="btn btn-sm btn-error" onClick={() => handleDeleteMessage(msg._id)} title="Delete" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ));
                })()
              )}
              <div ref={forumEndRef} />
            </div>
            {(registration || isEventOrganizer) && (
              <div style={{ marginTop: '12px' }}>
                <div className="forum-input">
                  <input
                    type="text"
                    className="form-control"
                    placeholder={isEventOrganizer ? 'Post a new message...' : 'Type a new message...'}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePostMessage()}
                  />
                  <button className="btn btn-primary" onClick={handlePostMessage}>Send</button>
                </div>
              </div>
            )}
            {!registration && !isEventOrganizer && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Register for this event to join the discussion.
              </p>
            )}
          </>
        )}
      </div>

      {/* Thread Popup Modal */}
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
                <p style={{ color: 'var(--text-light)', textAlign: 'center', fontSize: '0.875rem' }}>No replies yet. Start the conversation!</p>
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
                      <button className={`reaction-btn ${reply.reactions?.some(r => r.user === user?._id) ? 'active' : ''}`} onClick={() => handleReact(reply._id)}>
                        👍 {reply.reactions?.length || 0}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {(registration || isEventOrganizer) && (
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventDetails;
