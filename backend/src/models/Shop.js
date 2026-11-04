const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  pinCode: { type: String, required: true, match: /^\\d{6}$/ },
  district: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  mobileNumber: { type: String, required: true, trim: true, match: /^\\+?\\d{7,15}$/ },
  location: {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 }
  },
  active: { type: Boolean, default: true },
  verificationStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'VERIFIED', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, default: '' }
}, { timestamps: true });

shopSchema.index({ verificationStatus: 1, name: 1 });

module.exports = mongoose.model('Shop', shopSchema);
