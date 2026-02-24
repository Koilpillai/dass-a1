const mongoose = require('mongoose');

const forumMessageSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: { type: String, required: true },
  isAnnouncement: { type: Boolean, default: false },
  parentMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForumMessage',
    default: null
  },
  isPinned: { type: Boolean, default: false },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, default: '👍' }
  }],
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('ForumMessage', forumMessageSchema);
