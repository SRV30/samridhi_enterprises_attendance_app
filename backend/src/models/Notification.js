const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  type: { type: String, enum: ['SHOP_SUBMITTED', 'SHOP_APPROVED', 'SHOP_REJECTED'], required: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
