const mongoose = require('mongoose');

const customFormFieldSchema = new mongoose.Schema({
  fieldName: { type: String, required: true },
  fieldType: {
    type: String,
    enum: ['text', 'textarea', 'number', 'email', 'dropdown', 'checkbox', 'file'],
    required: true
  },
  required: { type: Boolean, default: false },
  options: [String], // For dropdown fields
  order: { type: Number, default: 0 }
}, { _id: true });

const merchandiseItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  sizes: [String],
  colors: [String],
  variants: [String],
  stock: { type: Number, required: true, default: 0 },
  price: { type: Number, required: true, default: 0 },
  purchaseLimit: { type: Number, default: 1 },
  image: { type: String, default: '' }
}, { _id: true });

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    enum: ['normal', 'merchandise'],
    required: true
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eligibility: {
    type: String,
    enum: ['all', 'iiit', 'non-iiit'],
    default: 'all'
  },
  startDate: { type: Date },
  endDate: { type: Date },
  registrationDeadline: { type: Date },
  registrationLimit: { type: Number, default: 0 }, // 0 = unlimited
  registrationFee: { type: Number, default: 0 },
  registrationCount: { type: Number, default: 0 },
  tags: [String],
  status: {
    type: String,
    enum: ['draft', 'published', 'closed', 'ongoing', 'completed'],
    default: 'draft'
  },

  // Normal event fields
  customForm: [customFormFieldSchema],
  formLocked: { type: Boolean, default: false },

  // Merchandise event fields
  merchandiseItems: [merchandiseItemSchema],

  // Analytics
  views: { type: Number, default: 0 },
  viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Forum activity tracking
  lastForumActivity: { type: Date, default: null },
  lastAnnouncementAt: { type: Date, default: null },
}, { timestamps: true });

// Text index for search
eventSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Event', eventSchema);
