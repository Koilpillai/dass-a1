import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API from '../../api/axios';

const formatDateForInput = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CreateEvent = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams(); // If present, we're editing an existing event
  const isEditing = !!editId;
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [eventStatus, setEventStatus] = useState('draft');
  const [formLocked, setFormLocked] = useState(false);
  const [loadingEvent, setLoadingEvent] = useState(!!editId);

  // Step 1: Basic Info
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'normal',
    eligibility: 'all',
    startDate: '',
    endDate: '',
    registrationDeadline: '',
    registrationLimit: '',
    registrationFee: 0,
    tags: '',
  });

  // Step 2: Custom form fields (normal) or merchandise items
  const [customForm, setCustomForm] = useState([]);
  const [merchandiseItems, setMerchItems] = useState([]);

  // Date validation errors
  const [dateErrors, setDateErrors] = useState({});

  // Load existing event data if editing
  useEffect(() => {
    if (editId) {
      loadEventForEdit();
    }
  }, [editId]);

  const loadEventForEdit = async () => {
    try {
      const res = await API.get(`/organizer/event/${editId}`);
      const ev = res.data.event || res.data;
      setEventStatus(ev.status);
      setFormLocked(ev.formLocked || false);

      setForm({
        name: ev.name || '',
        description: ev.description || '',
        type: ev.type || 'normal',
        eligibility: ev.eligibility || 'all',
        startDate: formatDateForInput(ev.startDate),
        endDate: formatDateForInput(ev.endDate),
        registrationDeadline: formatDateForInput(ev.registrationDeadline),
        registrationLimit: ev.registrationLimit || '',
        registrationFee: ev.registrationFee || 0,
        tags: ev.tags?.join(', ') || '',
      });

      if (ev.type === 'normal' && ev.customForm?.length > 0) {
        setCustomForm(ev.customForm.map(f => ({
          fieldName: f.fieldName,
          fieldType: f.fieldType,
          required: f.required,
          options: f.options || [],
          order: f.order,
        })));
      }

      if (ev.type === 'merchandise' && ev.merchandiseItems?.length > 0) {
        setMerchItems(ev.merchandiseItems.map(item => ({
          name: item.name,
          description: item.description || '',
          sizes: item.sizes?.join(', ') || '',
          colors: item.colors?.join(', ') || '',
          variants: item.variants?.join(', ') || '',
          stock: item.stock || 0,
          price: item.price || 0,
          purchaseLimit: item.purchaseLimit || 5,
        })));
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load event data for editing' });
    } finally {
      setLoadingEvent(false);
    }
  };

  const handleBasicChange = (key, value) => {
    setForm(prev => {
      const updated = { ...prev, [key]: value };
      // Enforce fee = 0 for merchandise events
      if (key === 'type' && value === 'merchandise') {
        updated.registrationFee = 0;
      }
      // Live date validation
      validateDates(updated);
      return updated;
    });
  };

  const validateDates = (f) => {
    const errors = {};
    if (f.startDate && f.endDate && new Date(f.startDate) >= new Date(f.endDate)) {
      errors.endDate = 'End date must be after start date';
    }
    if (f.registrationDeadline && f.endDate && new Date(f.registrationDeadline) >= new Date(f.endDate)) {
      errors.registrationDeadline = 'Registration deadline must be before end date';
    }
    if (f.registrationDeadline && f.startDate && new Date(f.registrationDeadline) > new Date(f.startDate)) {
      errors.registrationDeadline = 'Registration deadline must be on or before start date';
    }
    setDateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Custom Form field management
  const addFormField = () => {
    setCustomForm(prev => [...prev, {
      fieldName: '',
      fieldType: 'text',
      required: false,
      options: [],
      order: prev.length,
    }]);
  };

  const updateFormField = (idx, key, value) => {
    setCustomForm(prev => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f));
  };

  const removeFormField = (idx) => {
    setCustomForm(prev => prev.filter((_, i) => i !== idx));
  };

  const moveFormField = (idx, direction) => {
    setCustomForm(prev => {
      const arr = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((f, i) => ({ ...f, order: i }));
    });
  };

  // Merchandise item management
  const addMerchItem = () => {
    setMerchItems(prev => [...prev, {
      name: '',
      description: '',
      sizes: '',
      colors: '',
      variants: '',
      stock: 10,
      price: 0,
      purchaseLimit: 5,
    }]);
  };

  const updateMerchItem = (idx, key, value) => {
    setMerchItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  };

  const removeMerchItem = (idx) => {
    setMerchItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (publish = false) => {
    // Validate dates before submit
    if (!validateDates(form)) {
      setMessage({ type: 'error', text: 'Please fix date validation errors before saving.' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Convert datetime-local strings to proper ISO strings with timezone info
      // This prevents 5.5h offset when server timezone differs from client
      const toISO = (dtStr) => dtStr ? new Date(dtStr).toISOString() : '';

      const payload = {
        ...form,
        startDate: toISO(form.startDate),
        endDate: toISO(form.endDate),
        registrationDeadline: toISO(form.registrationDeadline),
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        registrationLimit: form.registrationLimit ? parseInt(form.registrationLimit) : 0,
        registrationFee: parseFloat(form.registrationFee) || 0,
      };

      if (form.type === 'normal') {
        payload.customForm = customForm;
      } else {
        payload.merchandiseItems = merchandiseItems.map(item => ({
          ...item,
          sizes: typeof item.sizes === 'string' ? item.sizes.split(',').map(s => s.trim()).filter(Boolean) : item.sizes,
          colors: typeof item.colors === 'string' ? item.colors.split(',').map(c => c.trim()).filter(Boolean) : item.colors,
          variants: typeof item.variants === 'string' ? item.variants.split(',').map(v => v.trim()).filter(Boolean) : item.variants,
          stock: parseInt(item.stock),
          price: parseFloat(item.price),
          purchaseLimit: parseInt(item.purchaseLimit) || 5,
        }));
      }

      let res;
      if (isEditing) {
        res = await API.put(`/events/${editId}`, payload);
        if (publish && eventStatus === 'draft') {
          try {
            await API.put(`/events/${editId}/publish`);
          } catch (pubErr) {
            // Publish validation failed — revert the draft save by undoing the update
            setMessage({ type: 'error', text: pubErr.response?.data?.message || 'Publishing failed. Event was NOT saved.' });
            setSaving(false);
            return;
          }
        }
        setMessage({ type: 'success', text: `Event ${publish ? 'updated and published' : 'updated'}!` });
        setTimeout(() => navigate(`/organizer/event/${editId}`), 1500);
      } else {
        res = await API.post('/events', payload);
        if (publish) {
          try {
            await API.put(`/events/${res.data._id}/publish`);
          } catch (pubErr) {
            // Publish failed — delete the just-created draft so it doesn't linger
            try { await API.delete(`/events/${res.data._id}`); } catch {}
            setMessage({ type: 'error', text: pubErr.response?.data?.message || 'Publishing failed. Event was NOT saved.' });
            setSaving(false);
            return;
          }
        }
        setMessage({ type: 'success', text: `Event ${publish ? 'created and published' : 'saved as draft'}!` });
        setTimeout(() => navigate('/dashboard'), 1500);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save event' });
    } finally {
      setSaving(false);
    }
  };

  // Determine which fields are editable based on event status
  const isFieldDisabled = (fieldName) => {
    if (!isEditing) return false;
    if (eventStatus === 'draft') return false;
    if (eventStatus === 'published') {
      // Only description, deadline, limit are editable for published events
      const allowedFields = ['description', 'registrationDeadline', 'registrationLimit'];
      return !allowedFields.includes(fieldName);
    }
    return true; // ongoing/closed: nothing editable
  };

  if (loadingEvent) {
    return <div className="loading" style={{ minHeight: '50vh' }}><div className="spinner"></div></div>;
  }

  // For ongoing/closed events, don't show edit form
  if (isEditing && ['ongoing', 'closed'].includes(eventStatus)) {
    return (
      <div className="page-container" style={{ maxWidth: '800px' }}>
        <div className="alert alert-warning">
          {eventStatus === 'ongoing' ? 'Ongoing' : 'Closed'} events cannot be edited. Only status changes are allowed from the event detail page.
        </div>
        <button className="btn btn-secondary" onClick={() => navigate(`/organizer/event/${editId}`)}>
          ← Back to Event
        </button>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div className="page-header">
        <h1>{isEditing ? 'Edit Event' : 'Create Event'}</h1>
        {isEditing && (
          <span className={`badge badge-${eventStatus === 'draft' ? 'warning' : 'success'}`} style={{ fontSize: '0.875rem' }}>
            {eventStatus}
          </span>
        )}
      </div>

      {isEditing && eventStatus === 'published' && (
        <div className="alert alert-info" style={{ marginBottom: '16px' }}>
          This event is published. Only the description, registration deadline, and registration limit can be modified.
        </div>
      )}

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Step Indicator */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['Basic Info', form.type === 'normal' ? 'Custom Form' : 'Merchandise', 'Review'].map((label, idx) => (
          <button
            key={idx}
            onClick={() => setStep(idx + 1)}
            className={`btn btn-sm ${step === idx + 1 ? 'btn-primary' : 'btn-secondary'}`}
          >
            {idx + 1}. {label}
          </button>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="card">
          <h2 style={{ marginBottom: '16px' }}>Basic Information</h2>

          <div className="form-group">
            <label>Event Name *</label>
            <input type="text" className="form-control" value={form.name}
              onChange={(e) => handleBasicChange('name', e.target.value)} placeholder="e.g., Hackathon 2026"
              disabled={isFieldDisabled('name')} />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={4} value={form.description}
              onChange={(e) => handleBasicChange('description', e.target.value)}
              placeholder="Describe your event..." />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Event Type *</label>
              <select className="form-control" value={form.type}
                onChange={(e) => handleBasicChange('type', e.target.value)}
                disabled={isFieldDisabled('type')}>
                <option value="normal">Normal Event</option>
                <option value="merchandise">Merchandise</option>
              </select>
            </div>
            <div className="form-group">
              <label>Eligibility</label>
              <select className="form-control" value={form.eligibility}
                onChange={(e) => handleBasicChange('eligibility', e.target.value)}
                disabled={isFieldDisabled('eligibility')}>
                <option value="all">All Participants</option>
                <option value="iiit">IIIT Only</option>
                <option value="non-iiit">Non-IIIT Only</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Date</label>
              <input type="datetime-local" className="form-control" value={form.startDate}
                onChange={(e) => handleBasicChange('startDate', e.target.value)}
                disabled={isFieldDisabled('startDate')} />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input type="datetime-local" className="form-control" value={form.endDate}
                onChange={(e) => handleBasicChange('endDate', e.target.value)}
                disabled={isFieldDisabled('endDate')}
                style={dateErrors.endDate ? { borderColor: 'var(--error)' } : {}} />
              {dateErrors.endDate && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{dateErrors.endDate}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Registration Deadline</label>
              <input type="datetime-local" className="form-control" value={form.registrationDeadline}
                onChange={(e) => handleBasicChange('registrationDeadline', e.target.value)}
                style={dateErrors.registrationDeadline ? { borderColor: 'var(--error)' } : {}} />
              {dateErrors.registrationDeadline && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{dateErrors.registrationDeadline}</span>}
            </div>
            <div className="form-group">
              <label>Registration Limit (0 = unlimited)</label>
              <input type="number" className="form-control" value={form.registrationLimit}
                onChange={(e) => handleBasicChange('registrationLimit', e.target.value)} min="0" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Registration Fee (₹){form.type === 'merchandise' && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>(Always 0 for merchandise events)</span>}</label>
              <input type="number" className="form-control" value={form.type === 'merchandise' ? 0 : form.registrationFee}
                onChange={(e) => handleBasicChange('registrationFee', e.target.value)} min="0" step="0.01"
                disabled={isFieldDisabled('registrationFee') || form.type === 'merchandise'} />
            </div>
            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input type="text" className="form-control" value={form.tags}
                onChange={(e) => handleBasicChange('tags', e.target.value)} placeholder="tech, coding, hackathon"
                disabled={isFieldDisabled('tags')} />
            </div>
          </div>

          <button className="btn btn-primary" onClick={() => setStep(2)} style={{ marginTop: '16px' }}
            disabled={Object.keys(dateErrors).length > 0}>
            Next: {form.type === 'normal' ? 'Custom Form' : 'Merchandise'} →
          </button>
        </div>
      )}

      {/* Step 2: Custom Form (Normal Event) */}
      {step === 2 && form.type === 'normal' && (
        <div className="card">
          <div className="card-header">
            <h2>Custom Registration Form</h2>
            {!formLocked && !isFieldDisabled('customForm') && (
              <button className="btn btn-sm btn-primary" onClick={addFormField}>+ Add Field</button>
            )}
          </div>

          {formLocked && (
            <div className="alert alert-warning" style={{ marginBottom: '12px' }}>
              This form is locked because registrations have already been received. Fields cannot be modified.
            </div>
          )}

          {customForm.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>
              No custom fields added. Participants will register with just their account info.
              {!formLocked && ' Add fields to collect additional information.'}
            </p>
          )}

          {customForm.map((field, idx) => (
            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '12px', opacity: formLocked ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Field #{idx + 1}</span>
                {!formLocked && !isFieldDisabled('customForm') && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => moveFormField(idx, -1)} disabled={idx === 0}>↑</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => moveFormField(idx, 1)} disabled={idx === customForm.length - 1}>↓</button>
                    <button className="btn btn-sm btn-error" onClick={() => removeFormField(idx)}>Remove</button>
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Field Name</label>
                  <input type="text" className="form-control" value={field.fieldName}
                    onChange={(e) => updateFormField(idx, 'fieldName', e.target.value)}
                    placeholder="e.g., T-shirt Size" disabled={formLocked} />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select className="form-control" value={field.fieldType}
                    onChange={(e) => updateFormField(idx, 'fieldType', e.target.value)}
                    disabled={formLocked}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="email">Email</option>
                    <option value="textarea">Long Text</option>
                    <option value="dropdown">Dropdown</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="file">File Upload</option>
                  </select>
                </div>
              </div>
              {field.fieldType === 'dropdown' && (
                <div className="form-group">
                  <label>Options (comma-separated)</label>
                  <input type="text" className="form-control"
                    value={field.options?.join(', ') || ''}
                    onChange={(e) => updateFormField(idx, 'options', e.target.value.split(',').map(o => o.trim()))}
                    placeholder="Option 1, Option 2, Option 3" disabled={formLocked} />
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: formLocked ? 'default' : 'pointer' }}>
                <input type="checkbox" checked={field.required}
                  onChange={(e) => updateFormField(idx, 'required', e.target.checked)} disabled={formLocked} />
                Required field
              </label>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next: Review →</button>
          </div>
        </div>
      )}

      {/* Step 2: Merchandise Items */}
      {step === 2 && form.type === 'merchandise' && (
        <div className="card">
          <div className="card-header">
            <h2>Merchandise Items</h2>
            {!isFieldDisabled('merchandiseItems') && (
              <button className="btn btn-sm btn-primary" onClick={addMerchItem}>+ Add Item</button>
            )}
          </div>

          {merchandiseItems.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>
              Add at least one merchandise item for sale.
            </p>
          )}

          {merchandiseItems.map((item, idx) => (
            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Item #{idx + 1}</span>
                {!isFieldDisabled('merchandiseItems') && (
                  <button className="btn btn-sm btn-error" onClick={() => removeMerchItem(idx)}>Remove</button>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Item Name</label>
                  <input type="text" className="form-control" value={item.name}
                    onChange={(e) => updateMerchItem(idx, 'name', e.target.value)} placeholder="e.g., Felicity T-Shirt"
                    disabled={isFieldDisabled('merchandiseItems')} />
                </div>
                <div className="form-group">
                  <label>Price (₹)</label>
                  <input type="number" className="form-control" value={item.price}
                    onChange={(e) => updateMerchItem(idx, 'price', e.target.value)} min="0" step="0.01"
                    disabled={isFieldDisabled('merchandiseItems')} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" className="form-control" value={item.description}
                  onChange={(e) => updateMerchItem(idx, 'description', e.target.value)}
                  disabled={isFieldDisabled('merchandiseItems')} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Sizes (comma-separated)</label>
                  <input type="text" className="form-control" value={item.sizes}
                    onChange={(e) => updateMerchItem(idx, 'sizes', e.target.value)} placeholder="S, M, L, XL"
                    disabled={isFieldDisabled('merchandiseItems')} />
                </div>
                <div className="form-group">
                  <label>Colors (comma-separated)</label>
                  <input type="text" className="form-control" value={item.colors}
                    onChange={(e) => updateMerchItem(idx, 'colors', e.target.value)} placeholder="Black, White, Navy"
                    disabled={isFieldDisabled('merchandiseItems')} />
                </div>
              </div>
              <div className="form-group">
                <label>Variants (comma-separated, optional)</label>
                <input type="text" className="form-control" value={item.variants}
                  onChange={(e) => updateMerchItem(idx, 'variants', e.target.value)} placeholder="e.g., Regular, Premium, Limited Edition"
                  disabled={isFieldDisabled('merchandiseItems')} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Stock</label>
                  <input type="number" className="form-control" value={item.stock}
                    onChange={(e) => updateMerchItem(idx, 'stock', e.target.value)} min="0" />
                </div>
                <div className="form-group">
                  <label>Purchase Limit (per person)</label>
                  <input type="number" className="form-control" value={item.purchaseLimit}
                    onChange={(e) => updateMerchItem(idx, 'purchaseLimit', e.target.value)} min="1" />
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next: Review →</button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="card">
          <h2 style={{ marginBottom: '16px' }}>Review Your Event</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <div><strong>Name:</strong> {form.name || '(not set)'}</div>
            <div><strong>Type:</strong> {form.type}</div>
            <div><strong>Eligibility:</strong> {form.eligibility}</div>
            <div><strong>Fee:</strong> {form.registrationFee > 0 ? `₹${form.registrationFee}` : 'Free'}</div>
            <div><strong>Start:</strong> {form.startDate ? new Date(form.startDate).toLocaleString() : 'Not set'}</div>
            <div><strong>End:</strong> {form.endDate ? new Date(form.endDate).toLocaleString() : 'Not set'}</div>
            <div><strong>Limit:</strong> {form.registrationLimit || 'Unlimited'}</div>
            <div><strong>Deadline:</strong> {form.registrationDeadline ? new Date(form.registrationDeadline).toLocaleString() : 'No deadline'}</div>
            <div><strong>Tags:</strong> {form.tags || 'None'}</div>
          </div>

          {form.type === 'normal' && customForm.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Custom Form Fields ({customForm.length})</h3>
              <ul style={{ paddingLeft: '20px', fontSize: '0.875rem' }}>
                {customForm.map((f, i) => (
                  <li key={i}>{f.fieldName} ({f.fieldType}){f.required ? ' — Required' : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {form.type === 'merchandise' && merchandiseItems.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Merchandise Items ({merchandiseItems.length})</h3>
              <ul style={{ paddingLeft: '20px', fontSize: '0.875rem' }}>
                {merchandiseItems.map((item, i) => (
                  <li key={i}>
                    {item.name} — ₹{item.price} (Stock: {item.stock})
                    {item.variants && <span style={{ color: 'var(--text-secondary)' }}> | Variants: {typeof item.variants === 'string' ? item.variants : item.variants.join(', ')}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            {form.description}
          </p>

          {/* Date validation errors */}
          {Object.keys(dateErrors).length > 0 && (
            <div className="alert alert-error" style={{ marginBottom: '12px' }}>
              {Object.values(dateErrors).map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-secondary" onClick={() => handleSubmit(false)} disabled={saving || Object.keys(dateErrors).length > 0}>
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save as Draft'}
            </button>
            {(!isEditing || eventStatus === 'draft') && (
              <button className="btn btn-primary" onClick={() => handleSubmit(true)} disabled={saving || Object.keys(dateErrors).length > 0}>
                {saving ? 'Publishing...' : isEditing ? 'Save & Publish' : 'Create & Publish'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateEvent;
