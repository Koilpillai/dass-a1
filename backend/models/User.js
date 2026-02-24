const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, unique: true, required: true, lowercase: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['participant', 'organizer', 'admin'],
    required: true
  },

  // Participant-specific fields
  participantType: { type: String, enum: ['iiit', 'non-iiit'] },
  collegeName: { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  areasOfInterest: [{ type: String }],
  followedOrganizers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isOnboarded: { type: Boolean, default: false },

  // Organizer-specific fields
  organizerName: { type: String },
  category: [{ type: String }],
  description: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  discordWebhook: { type: String, default: '' },

  // System fields
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Index for search (MongoDB allows only ONE text index per collection)
userSchema.index({
  organizerName: 'text', category: 'text', description: 'text',
  firstName: 'text', lastName: 'text', email: 'text'
});

module.exports = mongoose.model('User', userSchema);
