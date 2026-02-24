const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const { auth, roleCheck } = require('../middleware/auth');

// Submit feedback for an event
router.post('/', auth, roleCheck('participant'), async (req, res) => {
  try {
    const { eventId, rating, comment } = req.body;

    if (!eventId || !rating) {
      return res.status(400).json({ message: 'Event ID and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Verify user attended the event
    const registration = await Registration.findOne({
      event: eventId,
      participant: req.user._id,
      status: { $in: ['registered', 'completed'] }
    });

    if (!registration) {
      return res.status(400).json({ message: 'You can only provide feedback for events you attended' });
    }

    // Check if already submitted feedback
    const existing = await Feedback.findOne({ event: eventId, participant: req.user._id });
    if (existing) {
      return res.status(400).json({ message: 'You have already submitted feedback for this event' });
    }

    const feedback = new Feedback({
      event: eventId,
      participant: req.user._id,
      rating,
      comment: comment || '',
    });

    await feedback.save();

    res.status(201).json({ message: 'Feedback submitted successfully', feedback });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get feedback for an event (organizer)
router.get('/event/:eventId', auth, async (req, res) => {
  try {
    const { rating, sort } = req.query;
    const filter = { event: req.params.eventId };

    if (rating) {
      filter.rating = parseInt(rating);
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'rating-high') sortOption = { rating: -1 };
    if (sort === 'rating-low') sortOption = { rating: 1 };

    // For organizers show anonymous feedback 
    // Participants can see aggregate only
    const feedbacks = await Feedback.find(filter)
      .sort(sortOption);

    res.json(feedbacks);
  } catch (error) {
    console.error('Get event feedback error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Feedback statistics
router.get('/event/:eventId/stats', auth, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ event: req.params.eventId });

    if (feedbacks.length === 0) {
      return res.json({
        totalFeedbacks: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      });
    }

    const totalRating = feedbacks.reduce((sum, f) => sum + f.rating, 0);
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    feedbacks.forEach(f => ratingDistribution[f.rating]++);

    res.json({
      totalFeedbacks: feedbacks.length,
      averageRating: totalRating / feedbacks.length,
      ratingDistribution,
    });
  } catch (error) {
    console.error('Feedback stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
