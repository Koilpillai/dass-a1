const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  leader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    joinedAt: { type: Date }
  }],
  inviteCode: { type: String, unique: true },
  maxSize: { type: Number, required: true },
  minSize: { type: Number, default: 2 },
  isComplete: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
