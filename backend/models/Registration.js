const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
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
  formResponses: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['registered', 'completed', 'cancelled', 'rejected', 'pending_approval'],
    default: 'registered'
  },
  ticketId: { type: String, unique: true, sparse: true },
  qrCode: { type: String }, // Base64 QR code image

  // Merchandise-specific fields
  merchandiseSelections: [{
    itemId: { type: mongoose.Schema.Types.ObjectId },
    name: String,
    size: String,
    color: String,
    variant: String,
    quantity: { type: Number, default: 1 },
    price: Number
  }],
  totalAmount: { type: Number, default: 0 },
  paymentProof: { type: String, default: '' }, // file path
  paymentStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none'
  },

  // Attendance
  attendance: { type: Boolean, default: false },
  attendanceMarkedAt: { type: Date },
}, { timestamps: true });

// Index for lookups (not unique and allows multiple registrations for merch events)
registrationSchema.index({ event: 1, participant: 1 });

module.exports = mongoose.model('Registration', registrationSchema);
