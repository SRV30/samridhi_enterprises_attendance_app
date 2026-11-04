const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  shopCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  address: { type: String, default: '' },
  area: { type: String, default: '' },
  location: {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 }
  },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Shop', shopSchema);
