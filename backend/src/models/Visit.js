const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  shopName: { type: String, trim: true, default: '' },
  shopPlaceName: { type: String, trim: true, default: '' },
  shopAddress: { type: String, trim: true, default: '' },
  attendanceDay: { type: String, required: true, index: true },
  checkedInAt: { type: Date, required: true },
  reportedLocation: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracyMeters: { type: Number, required: true }
  },
  distanceMeters: { type: Number, required: true },
  verification: { type: String, enum: ['verified'], default: 'verified' }
}, { timestamps: true });

visitSchema.index({ employee: 1, shop: 1, attendanceDay: 1 }, { unique: true });

module.exports = mongoose.model('Visit', visitSchema);
