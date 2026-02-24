const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const { auth, roleCheck } = require('../middleware/auth');

// All organizer routes require authentication + organizer role
router.use(auth, roleCheck('organizer'));

// Get all events by current organizer
router.get('/events', async (req, res) => {
  try {
    const events = await Event.find({ organizer: req.user._id })
      .sort({ createdAt: -1 });
    res.json(events);
  } catch (error) {
    console.error('Get organizer events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get analytics for all completed events
router.get('/analytics', async (req, res) => {
  try {
    const events = await Event.find({
      organizer: req.user._id,
    });

    const analytics = await Promise.all(events.map(async (event) => {
      const registrations = await Registration.find({ event: event._id });
      // For merchandise: count distinct participants with approved payments
      // For normal: count registrations with registered/completed status
      let totalRegistrations;
      if (event.type === 'merchandise') {
        const distinctParticipants = new Set(
          registrations
            .filter(r => ['registered', 'completed'].includes(r.status))
            .map(r => r.participant.toString())
        );
        totalRegistrations = distinctParticipants.size;
      } else {
        totalRegistrations = registrations.filter(r => ['registered', 'completed'].includes(r.status)).length;
      }
      const attended = registrations.filter(r => r.attendance).length;
      const revenue = registrations
        .filter(r => r.paymentStatus === 'approved' || r.status === 'registered')
        .reduce((sum, r) => sum + (r.totalAmount || event.registrationFee || 0), 0);

      return {
        eventId: event._id,
        eventName: event.name,
        type: event.type,
        status: event.status,
        registrations: totalRegistrations,
        attendance: attended,
        revenue,
        views: event.views,
      };
    }));

    // Summary stats
    const summary = {
      totalEvents: events.length,
      totalRegistrations: analytics.reduce((s, a) => s + a.registrations, 0),
      totalRevenue: analytics.reduce((s, a) => s + a.revenue, 0),
      totalAttendance: analytics.reduce((s, a) => s + a.attendance, 0),
    };

    res.json({ analytics, summary });
  } catch (error) {
    console.error('Organizer analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get detailed event info with registrations
router.get('/event/:id', async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizer: req.user._id });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const registrations = await Registration.find({ event: event._id })
      .populate('participant', 'firstName lastName email contactNumber collegeName participantType')
      .sort({ createdAt: -1 });

    const stats = {
      totalRegistrations: event.type === 'merchandise'
        ? new Set(registrations.filter(r => ['registered', 'completed'].includes(r.status)).map(r => r.participant.toString())).size
        : registrations.filter(r => ['registered', 'completed'].includes(r.status)).length,
      attended: registrations.filter(r => r.attendance).length,
      revenue: registrations
        .filter(r => r.paymentStatus === 'approved' || (event.type === 'normal' && r.status === 'registered'))
        .reduce((sum, r) => sum + (r.totalAmount || event.registrationFee || 0), 0),
      pendingPayments: registrations.filter(r => r.paymentStatus === 'pending').length,
    };

    res.json({ event, registrations, stats });
  } catch (error) {
    console.error('Get organizer event detail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Request password reset
router.post('/password-reset', async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'Please provide a reason for the password reset' });
    }

    // Check for existing pending request
    const existing = await PasswordResetRequest.findOne({
      organizer: req.user._id,
      status: 'pending'
    });
    if (existing) {
      return res.status(400).json({ message: 'You already have a pending password reset request' });
    }

    const request = new PasswordResetRequest({
      organizer: req.user._id,
      clubName: req.user.organizerName,
      reason,
    });

    await request.save();

    res.status(201).json({ message: 'Password reset request submitted', request });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get password reset history
router.get('/password-reset-history', async (req, res) => {
  try {
    const requests = await PasswordResetRequest.find({ organizer: req.user._id })
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Password reset history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
