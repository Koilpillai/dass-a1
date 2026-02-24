const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Event = require('../models/Event');
const { auth, roleCheck } = require('../middleware/auth');

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate({
        path: 'followedOrganizers',
        select: 'organizerName category description contactEmail isActive',
        match: { isActive: true }
      });

    // Filter out null entries
    const userObj = user.toObject();
    if (userObj.followedOrganizers) {
      userObj.followedOrganizers = userObj.followedOrganizers.filter(o => o != null);
    }
    res.json(userObj);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
router.put('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.role === 'participant') {
      // Editable: firstName, lastName, contactNumber, collegeName, areasOfInterest, followedOrganizers
      const { firstName, lastName, contactNumber, collegeName, areasOfInterest } = req.body;
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (contactNumber !== undefined) user.contactNumber = contactNumber;
      if (collegeName !== undefined) user.collegeName = collegeName;
      if (areasOfInterest) user.areasOfInterest = areasOfInterest;
    } else if (user.role === 'organizer') {
      // Editable: organizerName, category, description, contactEmail, contactNumber, discordWebhook
      const { organizerName, category, description, contactEmail, contactNumber, discordWebhook } = req.body;
      if (organizerName) user.organizerName = organizerName;
      if (category) user.category = category;
      if (description !== undefined) user.description = description;
      if (contactEmail !== undefined) user.contactEmail = contactEmail;
      if (contactNumber !== undefined) user.contactNumber = contactNumber;
      if (discordWebhook !== undefined) user.discordWebhook = discordWebhook;
    }

    await user.save();

    const updatedUser = await User.findById(req.user._id).select('-password');
    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update participant preferences (onboarding)
router.put('/preferences', auth, roleCheck('participant'), async (req, res) => {
  try {
    const { areasOfInterest, followedOrganizers } = req.body;
    const user = await User.findById(req.user._id);

    if (areasOfInterest) user.areasOfInterest = areasOfInterest;
    if (followedOrganizers) user.followedOrganizers = followedOrganizers;
    user.isOnboarded = true;

    await user.save();

    const updatedUser = await User.findById(req.user._id)
      .select('-password')
      .populate('followedOrganizers', 'organizerName category');
    res.json(updatedUser);
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change password
router.put('/change-password', auth, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List all active organizers
router.get('/organizers', async (req, res) => {
  try {
    const organizers = await User.find({ role: 'organizer', isActive: true })
      .select('organizerName category description contactEmail')
      .sort({ organizerName: 1 });
    res.json(organizers);
  } catch (error) {
    console.error('List organizers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get organizer detail with events
router.get('/organizers/:id', async (req, res) => {
  try {
    const organizer = await User.findOne({ _id: req.params.id, role: 'organizer' })
      .select('organizerName category description contactEmail');

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Get organizer's events
    const upcomingEvents = await Event.find({
      organizer: req.params.id,
      status: { $in: ['published', 'ongoing', 'closed'] },
    }).sort({ startDate: 1 });

    const pastEvents = await Event.find({
      organizer: req.params.id,
      status: 'completed'
    }).sort({ endDate: -1 });

    res.json({ organizer, upcomingEvents, pastEvents });
  } catch (error) {
    console.error('Get organizer detail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Follow/unfollow organizer
router.post('/organizers/:id/follow', auth, roleCheck('participant'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const organizerId = req.params.id;

    // Verify organizer exists
    const organizer = await User.findOne({ _id: organizerId, role: 'organizer' });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const index = user.followedOrganizers.indexOf(organizerId);
    if (index === -1) {
      user.followedOrganizers.push(organizerId);
    } else {
      user.followedOrganizers.splice(index, 1);
    }

    await user.save();

    res.json({
      following: index === -1,
      followedOrganizers: user.followedOrganizers
    });
  } catch (error) {
    console.error('Follow/unfollow error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
