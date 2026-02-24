const express = require('express');
const router = express.Router();
const ForumMessage = require('../models/ForumMessage');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { auth, roleCheck } = require('../middleware/auth');

// Get forum messages for an event
router.get('/:eventId', auth, async (req, res) => {
  try {
    const messages = await ForumMessage.find({
      event: req.params.eventId,
      isDeleted: { $ne: true }
    })
    .populate('author', 'firstName lastName role organizerName')
    .populate({
      path: 'parentMessage',
      populate: { path: 'author', select: 'firstName lastName role organizerName' }
    })
    .sort({ isAnnouncement: -1, isPinned: -1, createdAt: -1 });

    res.json(messages);
  } catch (error) {
    console.error('Get forum messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Post a message
router.post('/:eventId', auth, async (req, res) => {
  try {
    const { content, parentMessage, isAnnouncement } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Verify event exists
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check permissions
    if (req.user.role === 'participant') {
      // Participants must be registered
      const registration = await Registration.findOne({
        event: req.params.eventId,
        participant: req.user._id,
        status: { $in: ['registered', 'completed'] }
      });

      if (!registration) {
        return res.status(403).json({
          message: 'You must be registered for this event to post in the forum'
        });
      }
    } else if (req.user.role === 'organizer') {
      // Organizer must own this event
      if (event.organizer.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: 'Only the event organizer can post in this forum'
        });
      }
    }

    const message = new ForumMessage({
      event: req.params.eventId,
      author: req.user._id,
      content: content.trim(),
      parentMessage: parentMessage || null,
      isAnnouncement: req.user.role === 'organizer' && isAnnouncement ? true : false,
    });

    await message.save();
    await message.populate('author', 'firstName lastName role organizerName');
    if (message.parentMessage) {
      await message.populate({
        path: 'parentMessage',
        populate: { path: 'author', select: 'firstName lastName role organizerName' }
      });
    }

    // Update event's last forum activity timestamp only if the poster is NOT the organizer
    // This way the organizer doesn't get notified about their own messages
    if (event.organizer.toString() !== req.user._id.toString()) {
      await Event.findByIdAndUpdate(req.params.eventId, { lastForumActivity: new Date() });
    }

    // If this is an announcement from the organizer, update lastAnnouncementAt
    // so participants get notified
    if (req.user.role === 'organizer' && isAnnouncement) {
      await Event.findByIdAndUpdate(req.params.eventId, { lastAnnouncementAt: new Date() });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Post forum message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Pin/unpin message (organizer only)
router.put('/:id/pin', auth, roleCheck('organizer', 'admin'), async (req, res) => {
  try {
    const message = await ForumMessage.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify organizer owns the event
    if (req.user.role === 'organizer') {
      const event = await Event.findById(message.event);
      if (!event || event.organizer.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to moderate this forum' });
      }
    }

    message.isPinned = !message.isPinned;
    await message.save();

    res.json({ message: `Message ${message.isPinned ? 'pinned' : 'unpinned'}`, forumMessage: message });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete message (organizer only)
router.delete('/:id', auth, roleCheck('organizer', 'admin'), async (req, res) => {
  try {
    const message = await ForumMessage.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify organizer owns the event
    if (req.user.role === 'organizer') {
      const event = await Event.findById(message.event);
      if (!event || event.organizer.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to moderate this forum' });
      }
    }

    message.isDeleted = true;
    message.content = '[Message deleted by moderator]';
    await message.save();

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// React to a message
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { type } = req.body;
    const message = await ForumMessage.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Toggle reaction
    const existingIndex = message.reactions.findIndex(
      r => r.user.toString() === req.user._id.toString() && r.type === (type || '👍')
    );

    if (existingIndex !== -1) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions.push({ user: req.user._id, type: type || '👍' });
    }

    await message.save();

    res.json(message);
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
