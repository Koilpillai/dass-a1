const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  participant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: { type: String, default: '' },
}, { timestamps: true });

// One feedback per participant per event
feedbackSchema.index({ event: 1, participant: 1 }, { unique: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
