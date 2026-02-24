const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const { auth, roleCheck } = require('../middleware/auth');

// All admin routes require authentication + admin role
router.use(auth, roleCheck('admin'));

// Create new organizer account
router.post('/organizers', async (req, res) => {
  try {
    const { organizerName, category, description, contactEmail } = req.body;

    if (!organizerName || !category) {
      return res.status(400).json({ message: 'Organizer name and category are required' });
    }

    // Auto-generate email and password
    const emailSlug = organizerName.toLowerCase().replace(/[^a-z0-9]/g, '') + '@felicity.iiit.ac.in';
    const plainPassword = crypto.randomBytes(6).toString('hex'); // 12 char random password

    // Check if email already exists
    const existing = await User.findOne({ email: emailSlug });
    if (existing) {
      return res.status(400).json({ message: 'An organizer with a similar name already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const organizer = new User({
      firstName: organizerName,
      lastName: 'Club',
      email: emailSlug,
      password: hashedPassword,
      role: 'organizer',
      organizerName,
      category,
      description: description || '',
      contactEmail: contactEmail || emailSlug,
      isActive: true,
    });

    await organizer.save();

    // Return credentials so admin can share them
    res.status(201).json({
      message: 'Organizer account created successfully',
      credentials: {
        email: emailSlug,
        password: plainPassword, // Show once to admin
      },
      organizer: {
        id: organizer._id,
        organizerName: organizer.organizerName,
        category: organizer.category,
        email: organizer.email,
      }
    });
  } catch (error) {
    console.error('Create organizer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List all organizers
router.get('/organizers', async (req, res) => {
  try {
    const organizers = await User.find({ role: 'organizer' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(organizers);
  } catch (error) {
    console.error('List organizers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update organizer
router.put('/organizers/:id', async (req, res) => {
  try {
    const organizer = await User.findOne({ _id: req.params.id, role: 'organizer' });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const { organizerName, category, description, isActive } = req.body;
    if (organizerName) organizer.organizerName = organizerName;
    if (category) organizer.category = category;
    if (description !== undefined) organizer.description = description;
    if (isActive !== undefined) organizer.isActive = isActive;

    await organizer.save();

    const updated = await User.findById(organizer._id).select('-password');
    res.json(updated);
  } catch (error) {
    console.error('Update organizer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Archive or permanently delete organizer
router.delete('/organizers/:id', async (req, res) => {
  try {
    const { action } = req.query;
    const organizer = await User.findOne({ _id: req.params.id, role: 'organizer' });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    if (action === 'delete') {
      // Permanently remove the organizer and all their related data
      const orgEvents = await Event.find({ organizer: req.params.id }).select('_id');
      const eventIds = orgEvents.map(e => e._id);

      // Delete registrations for their events
      await Registration.deleteMany({ event: { $in: eventIds } });
      // Delete their events
      await Event.deleteMany({ organizer: req.params.id });
      // Delete password reset requests
      await PasswordResetRequest.deleteMany({ organizer: req.params.id });
      // Delete the organizer account
      await User.findByIdAndDelete(req.params.id);

      res.json({ message: 'Organizer and all associated data permanently deleted' });
    } else {
      // Default / 'archive': disable account
      organizer.isActive = false;
      await organizer.save();
      res.json({ message: 'Organizer account archived (disabled)' });
    }
  } catch (error) {
    console.error('Remove organizer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List all password reset requests
router.get('/password-resets', async (req, res) => {
  try {
    const requests = await PasswordResetRequest.find()
      .populate('organizer', 'organizerName email category')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('List password resets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve/reject password reset
router.put('/password-resets/:id', async (req, res) => {
  try {
    const { status, adminComment } = req.body;
    const request = await PasswordResetRequest.findById(req.params.id)
      .populate('organizer', 'organizerName email');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    request.status = status;
    request.adminComment = adminComment || '';

    if (status === 'approved') {
      // Generate new password
      const newPassword = crypto.randomBytes(6).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update organizer's password
      await User.findByIdAndUpdate(request.organizer._id, { password: hashedPassword });

      request.newPassword = newPassword; // Store plaintext for admin to share
    }

    await request.save();

    res.json({
      message: `Password reset request ${status}`,
      request,
      ...(status === 'approved' && { newPassword: request.newPassword })
    });
  } catch (error) {
    console.error('Process password reset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      totalParticipants,
      totalOrganizers,
      totalEvents,
      totalRegistrations,
      activeEvents,
      pendingResets
    ] = await Promise.all([
      User.countDocuments({ role: 'participant' }),
      User.countDocuments({ role: 'organizer' }),
      Event.countDocuments(),
      Registration.countDocuments(),
      Event.countDocuments({ status: { $in: ['published', 'ongoing'] } }),
      PasswordResetRequest.countDocuments({ status: 'pending' })
    ]);

    res.json({
      totalParticipants,
      totalOrganizers,
      totalEvents,
      totalRegistrations,
      activeEvents,
      pendingResets
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
