const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, allowRoles('admin'));

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 30));
    const filter = {};
    if (['account', 'shop', 'visit'].includes(req.query.entityType)) filter.entityType = req.query.entityType;
    if (typeof req.query.action === 'string' && req.query.action.trim()) filter.action = req.query.action.trim();
    if (typeof req.query.actor === 'string' && mongoose.isValidObjectId(req.query.actor)) filter.actor = req.query.actor;
    if (typeof req.query.from === 'string' && typeof req.query.to === 'string') {
      const from = new Date(req.query.from + 'T00:00:00.000Z');
      const to = new Date(req.query.to + 'T23:59:59.999Z');
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
        return res.status(400).json({ message: 'Invalid audit date range' });
      }
      filter.createdAt = { $gte: from, $lte: to };
    }
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter)
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

module.exports = router;
