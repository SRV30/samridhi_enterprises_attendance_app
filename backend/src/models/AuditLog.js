const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorName: { type: String, required: true, trim: true },
  actorRole: { type: String, enum: ['admin', 'employee', 'system'], default: 'system' },
  action: { type: String, required: true, trim: true, index: true },
  entityType: { type: String, enum: ['account', 'shop', 'visit'], required: true, index: true },
  entityId: { type: String, default: '' },
  entityLabel: { type: String, default: '', trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, default: '' }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
