const AuditLog = require('../models/AuditLog');

async function writeAuditLog(req, { action, entityType, entityId = '', entityLabel = '', details = {} }) {
  try {
    await AuditLog.create({
      actor: req.user?._id || null,
      actorName: req.user?.name || 'System',
      actorRole: req.user?.role || 'system',
      action,
      entityType,
      entityId: String(entityId || ''),
      entityLabel: String(entityLabel || '').slice(0, 180),
      details,
      ipAddress: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64)
    });
  } catch (error) {
    // Audit persistence must not make an otherwise successful business action fail.
    console.error('Audit log write failed:', error.message);
  }
}

module.exports = { writeAuditLog };
