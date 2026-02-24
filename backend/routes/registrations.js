const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const User = require('../models/User');
const { auth, roleCheck } = require('../middleware/auth');
const { generateQR } = require('../utils/generateQR');
const { sendTicketEmail, sendMerchandiseEmail } = require('../utils/email');
const { storage: cloudinaryStorage } = require('../config/cloudinary');

// Multer config using Cloudinary storage
const upload = multer({ storage: cloudinaryStorage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// Upload a file for custom form field
router.post('/upload-form-file', auth, roleCheck('participant'), upload.single('formFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }
    // Return Cloudinary URL and original filename
    res.json({ filename: req.file.path, originalName: req.file.originalname });
  } catch (error) {
    console.error('Upload form file error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register for an event
router.post('/', auth, roleCheck('participant'), async (req, res) => {
  try {
    const { eventId, formResponses, merchandiseSelections } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check event status
    if (event.status !== 'published' && event.status !== 'ongoing') {
      return res.status(400).json({ message: 'This event is not accepting registrations' });
    }

    // Check deadline
    if (event.registrationDeadline && new Date() > new Date(event.registrationDeadline)) {
      return res.status(400).json({ message: 'Registration deadline has passed' });
    }

    // Check registration limit
    if (event.registrationLimit > 0 && event.registrationCount >= event.registrationLimit) {
      return res.status(400).json({ message: 'Registration limit has been reached' });
    }

    // Check eligibility
    const participant = await User.findById(req.user._id);
    if (event.eligibility !== 'all' && participant.participantType !== event.eligibility) {
      return res.status(400).json({ message: `This event is only for ${event.eligibility} participants` });
    }

    // Check for duplicate registration only for normal events
    if (event.type === 'normal') {
      const existing = await Registration.findOne({
        event: eventId,
        participant: req.user._id,
        status: { $nin: ['rejected', 'cancelled'] }, // Allow re-registration after rejection
      });
      if (existing) {
        return res.status(400).json({ message: 'You are already registered for this event' });
      }
    }

    // Build registration
    const registrationData = {
      event: eventId,
      participant: req.user._id,
    };

    // Generate ticket ID and QR only for free normal events
    const isPaidNormal = event.type === 'normal' && event.registrationFee > 0;
    if (event.type === 'normal' && !isPaidNormal) {
      const ticketId = `FEL-${uuidv4().substring(0, 8).toUpperCase()}`;
      const qrCode = await generateQR({
        ticketId,
        eventId: event._id,
        eventName: event.name,
        participantId: req.user._id,
        participantName: `${participant.firstName} ${participant.lastName}`
      });
      registrationData.ticketId = ticketId;
      registrationData.qrCode = qrCode;
    }

    if (event.type === 'normal') {
      registrationData.formResponses = formResponses || {};
      if (isPaidNormal) {
        // Paid normal event requires payment approval
        // paymentStatus stays 'none' until participant uploads proof
        registrationData.status = 'pending_approval';
        registrationData.paymentStatus = 'none';
        registrationData.totalAmount = event.registrationFee;
      } else {
        registrationData.status = 'registered';
      }
      // Lock form after first registration
      if (!event.formLocked && event.customForm.length > 0) {
        event.formLocked = true;
      }
    } else if (event.type === 'merchandise') {
      // Check if participant has an existing order without payment proof uploaded
      const unpaidPending = await Registration.findOne({
        event: eventId,
        participant: req.user._id,
        status: 'pending_approval',
        $or: [{ paymentProof: '' }, { paymentProof: null }, { paymentProof: { $exists: false } }]
      });
      if (unpaidPending) {
        return res.status(400).json({ message: 'Please upload payment proof for your previous order before making a new purchase' });
      }

      // Validate merchandise selections
      if (!merchandiseSelections || merchandiseSelections.length === 0) {
        return res.status(400).json({ message: 'Please select at least one item' });
      }

      // Fetch all previous non-rejected/cancelled registrations for cumulative limit check
      const previousRegs = await Registration.find({
        event: eventId,
        participant: req.user._id,
        status: { $nin: ['rejected', 'cancelled'] }
      });

      let totalAmount = 0;
      const validatedItems = [];

      for (const selection of merchandiseSelections) {
        const item = event.merchandiseItems.id(selection.itemId);
        if (!item) {
          return res.status(400).json({ message: `Item not found: ${selection.itemId}` });
        }
        if (item.stock < selection.quantity) {
          return res.status(400).json({ message: `Insufficient stock for ${item.name}` });
        }

        // Cumulative per-user purchase limit check across all orders
        const previousQty = previousRegs.reduce((sum, reg) => {
          const prevSel = reg.merchandiseSelections.find(s => s.itemId.toString() === selection.itemId);
          return sum + (prevSel ? prevSel.quantity : 0);
        }, 0);
        const remaining = Math.max(0, item.purchaseLimit - previousQty);
        if (selection.quantity > remaining) {
          return res.status(400).json({
            message: `Purchase limit exceeded for ${item.name}. Per-person limit: ${item.purchaseLimit}, Already ordered: ${previousQty}, You can buy up to ${remaining} more.`
          });
        }

        totalAmount += item.price * selection.quantity;
        validatedItems.push({
          itemId: item._id,
          name: item.name,
          size: selection.size || '',
          color: selection.color || '',
          variant: selection.variant || '',
          quantity: selection.quantity,
          price: item.price
        });
      }

      registrationData.merchandiseSelections = validatedItems;
      registrationData.totalAmount = totalAmount;
      registrationData.status = 'pending_approval';
      // paymentStatus stays 'none' until participant uploads proof
      registrationData.paymentStatus = 'none';
    }

    const registration = new Registration(registrationData);
    await registration.save();

    // Increment registration count only for free normal events
    // Paid normal + merchandise events get counted only when payment is approved
    if (event.type === 'normal' && !isPaidNormal) {
      event.registrationCount += 1;
    }
    await event.save();

    // Send ticket email for free normal events only
    if (event.type === 'normal' && !isPaidNormal && registrationData.ticketId) {
      await sendTicketEmail(participant, event, registrationData.ticketId, registrationData.qrCode);
    }

    await registration.populate('event', 'name type startDate endDate');
    await registration.populate('participant', 'firstName lastName email');

    res.status(201).json(registration);
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You are already registered for this event' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Get remaining per-user purchase limits for merchandise items
router.get('/item-limits/:eventId', auth, roleCheck('participant'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event || event.type !== 'merchandise') {
      return res.status(400).json({ message: 'Not a merchandise event' });
    }

    // Get all non-rejected/cancelled registrations for this user + event
    const userRegs = await Registration.find({
      event: req.params.eventId,
      participant: req.user._id,
      status: { $nin: ['rejected', 'cancelled'] }
    });

    // Compute remaining limits per item
    const limits = {};
    for (const item of event.merchandiseItems) {
      const orderedQty = userRegs.reduce((sum, reg) => {
        const sel = reg.merchandiseSelections.find(s => s.itemId.toString() === item._id.toString());
        return sum + (sel ? sel.quantity : 0);
      }, 0);
      limits[item._id.toString()] = {
        purchaseLimit: item.purchaseLimit,
        ordered: orderedQty,
        remaining: Math.max(0, item.purchaseLimit - orderedQty)
      };
    }

    res.json(limits);
  } catch (error) {
    console.error('Get item limits error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user's registrations
router.get('/my', auth, roleCheck('participant'), async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = { participant: req.user._id };

    if (status) filter.status = status;

    let registrations = await Registration.find(filter)
      .populate({
        path: 'event',
        populate: { path: 'organizer', select: 'organizerName category isActive' }
      })

      .sort({ createdAt: -1 });

    // Filter out registrations for events from disabled organizers
    registrations = registrations.filter(r =>
      r.event && (!r.event.organizer || r.event.organizer.isActive !== false)
    );

    // Filter by event type if specified
    if (type) {
      registrations = registrations.filter(r => r.event && r.event.type === type);
    }

    res.json(registrations);
  } catch (error) {
    console.error('Get my registrations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get registrations for an event (organizer)
router.get('/event/:eventId', auth, roleCheck('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Verify ownership (organizers can only see their own events)
    if (req.user.role === 'organizer' && event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { search, status } = req.query;
    const filter = { event: req.params.eventId };
    if (status) filter.status = status;

    let registrations = await Registration.find(filter)
      .populate('participant', 'firstName lastName email contactNumber collegeName participantType')

      .sort({ createdAt: -1 });

    // Search by participant name or email
    if (search) {
      const searchLower = search.toLowerCase();
      registrations = registrations.filter(r =>
        r.participant &&
        (`${r.participant.firstName} ${r.participant.lastName}`.toLowerCase().includes(searchLower) ||
         r.participant.email.toLowerCase().includes(searchLower))
      );
    }

    res.json(registrations);
  } catch (error) {
    console.error('Get event registrations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get ticket details
router.get('/:id/ticket', auth, async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id)
      .populate('event', 'name type startDate endDate organizer')
      .populate('participant', 'firstName lastName email');

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    // Only the registrant or the event organizer can view the ticket
    if (
      registration.participant._id.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      const event = await Event.findById(registration.event._id);
      if (!event || event.organizer.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized' });
      }
    }

    res.json(registration);
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload payment proof (merchandise)
router.post('/:id/payment-proof', auth, roleCheck('participant'), upload.single('paymentProof'), async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id);

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    if (registration.participant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a payment proof image' });
    }

    registration.paymentProof = req.file.path; // Cloudinary URL
    registration.paymentStatus = 'pending';
    await registration.save();

    res.json({ message: 'Payment proof uploaded', registration });
  } catch (error) {
    console.error('Upload payment proof error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve/reject payment (organizer)
router.put('/:id/payment-status', auth, roleCheck('organizer'), async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    const registration = await Registration.findById(req.params.id)
      .populate('event')
      .populate('participant', 'firstName lastName email');

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    // Verify ownership
    if (registration.event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Verify payment proof has been uploaded before allowing approve/reject
    if (!registration.paymentProof) {
      return res.status(400).json({ message: 'Cannot process payment - no payment proof has been uploaded by the participant' });
    }

    if (status === 'approved') {
      const freshEvent = await Event.findById(registration.event._id);

      // For merchandise: check cumulative per-user purchase limits before approving
      if (freshEvent.type === 'merchandise') {
        const otherApprovedRegs = await Registration.find({
          event: freshEvent._id,
          participant: registration.participant._id,
          status: 'registered',
          _id: { $ne: registration._id }
        });

        for (const sel of registration.merchandiseSelections) {
          const item = freshEvent.merchandiseItems.id(sel.itemId);
          if (!item || item.stock < sel.quantity) {
            return res.status(400).json({
              message: `Cannot approve — insufficient stock for ${sel.name}. Available: ${item ? item.stock : 0}, Requested: ${sel.quantity}.`
            });
          }
          // Cumulative limit check
          const approvedQty = otherApprovedRegs.reduce((sum, reg) => {
            const prevSel = reg.merchandiseSelections.find(s => s.itemId.toString() === sel.itemId.toString());
            return sum + (prevSel ? prevSel.quantity : 0);
          }, 0);
          if (approvedQty + sel.quantity > item.purchaseLimit) {
            return res.status(400).json({
              message: `Cannot approve — would exceed per-person purchase limit for ${sel.name}. Limit: ${item.purchaseLimit}, Already approved: ${approvedQty}, This order: ${sel.quantity}.`
            });
          }
        }
      }

      // Check registration limit for all event types
      // For merchandise: count distinct participants with at least one approved registration
      if (freshEvent.registrationLimit > 0) {
        if (freshEvent.type === 'merchandise') {
          const distinctParticipants = await Registration.distinct('participant', {
            event: freshEvent._id,
            status: { $in: ['registered', 'completed'] }
          });
          // Check if this participant is already counted
          const isAlreadyCounted = distinctParticipants.some(p => p.toString() === registration.participant._id.toString());
          if (!isAlreadyCounted && distinctParticipants.length >= freshEvent.registrationLimit) {
            return res.status(400).json({ message: 'Cannot approve — registration limit reached' });
          }
        } else {
          const approvedCount = await Registration.countDocuments({
            event: freshEvent._id,
            status: { $in: ['registered', 'completed'] }
          });
          if (approvedCount >= freshEvent.registrationLimit) {
            return res.status(400).json({ message: 'Cannot approve — registration limit reached' });
          }
        }
      }

      registration.paymentStatus = 'approved';
      registration.status = 'registered';

      // Generate ticket ID and QR code now that payment is approved
      const ticketId = `FEL-${uuidv4().substring(0, 8).toUpperCase()}`;
      const qrCode = await generateQR({
        ticketId,
        eventId: registration.event._id,
        eventName: registration.event.name,
        participantId: registration.participant._id,
        participantName: `${registration.participant.firstName} ${registration.participant.lastName}`
      });
      registration.ticketId = ticketId;
      registration.qrCode = qrCode;

      // For merchandise: only increment registrationCount if this is the participant's first approved registration
      if (freshEvent.type === 'merchandise') {
        const existingApproved = await Registration.countDocuments({
          event: freshEvent._id,
          participant: registration.participant._id,
          status: 'registered',
          _id: { $ne: registration._id }
        });
        if (existingApproved === 0) {
          freshEvent.registrationCount += 1;
        }
      } else {
        freshEvent.registrationCount += 1;
      }

      if (freshEvent.type === 'merchandise') {
        // Decrement stock for merchandise
        for (const sel of registration.merchandiseSelections) {
          const item = freshEvent.merchandiseItems.id(sel.itemId);
          if (item) {
            item.stock -= sel.quantity;
          }
        }

        // Send merchandise confirmation email
        await sendMerchandiseEmail(
          registration.participant,
          registration.event,
          ticketId,
          registration.merchandiseSelections,
          registration.totalAmount,
          qrCode
        );
      } else {
        // Send regular ticket email for paid normal events
        await sendTicketEmail(registration.participant, registration.event, ticketId, qrCode);
      }

      await freshEvent.save();
    } else if (status === 'rejected') {
      registration.paymentStatus = 'rejected';
      registration.status = 'rejected';
    }

    await registration.save();

    res.json({ message: `Payment ${status}`, registration });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export CSV
router.get('/event/:eventId/export', auth, roleCheck('organizer', 'admin'), async (req, res) => {
  try {
    const registrations = await Registration.find({ event: req.params.eventId })
      .populate('participant', 'firstName lastName email contactNumber collegeName participantType')


    // Build CSV
    const headers = 'Name,Email,Contact,College,Type,Status,Ticket ID,Attendance,Registered At\n';
    const rows = registrations.map(r => {
      const p = r.participant;
      return `"${p.firstName} ${p.lastName}","${p.email}","${p.contactNumber}","${p.collegeName}","${p.participantType}","${r.status}","${r.ticketId}","${r.attendance ? 'Yes' : 'No'}","${r.createdAt.toISOString()}"`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=registrations-${req.params.eventId}.csv`);
    res.send(headers + rows);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark attendance via QR code / ticket ID
router.post('/mark-attendance', auth, roleCheck('organizer'), async (req, res) => {
  try {
    const { ticketId, eventId } = req.body;

    if (!ticketId || !eventId) {
      return res.status(400).json({ message: 'Ticket ID and event ID are required' });
    }

    // Verify organizer owns the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Block attendance marking before event start date
    if (event.startDate && new Date() < new Date(event.startDate)) {
      return res.status(400).json({ message: 'Cannot mark attendance before the event has started' });
    }

    // Find registration by ticket ID
    const registration = await Registration.findOne({ ticketId, event: eventId })
      .populate('participant', 'firstName lastName email');

    if (!registration) {
      return res.status(404).json({ message: 'No registration found with this ticket ID for this event' });
    }

    if (registration.status !== 'registered') {
      return res.status(400).json({ message: `Cannot mark attendance - registration status is "${registration.status}"` });
    }

    if (registration.attendance) {
      return res.status(400).json({ 
        message: `Attendance already marked for ${registration.participant.firstName} ${registration.participant.lastName} at ${new Date(registration.attendanceMarkedAt).toLocaleString()}`,
        registration
      });
    }

    registration.attendance = true;
    registration.attendanceMarkedAt = new Date();
    await registration.save();

    res.json({ 
      message: `Attendance marked for ${registration.participant.firstName} ${registration.participant.lastName}`,
      registration 
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
