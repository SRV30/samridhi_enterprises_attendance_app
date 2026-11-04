const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, allowRoles('admin'));

// Admin creates employee accounts. The only account roles are admin and employee.
router.post('/', async (req, res, next) => {
  try {
    const { name, employeeId, email, password } = req.body || {};
    if (typeof name !== 'string' || !name.trim() ||
        typeof employeeId !== 'string' || !employeeId.trim() ||
        typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Name, employeeId and password are required' });
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ message: 'Password must not exceed 72 bytes' });
    }

    const normalizedId = employeeId.trim().toUpperCase();
    const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      employeeId: normalizedId,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      passwordHash,
      role: 'employee'
    });

    return res.status(201).json({
      user: {
        id: user.id, name: user.name, employeeId: user.employeeId,
        email: user.email || null, role: user.role, active: user.active
      }
    });
  } catch (error) { next(error); }
});

// List accounts without password hashes.
router.get('/', async (_req, res, next) => {
  try {
    const users = await User.find({})
      .select('name employeeId email role active createdAt')
      .sort({ role: 1, name: 1 })
      .lean();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ users });
  } catch (error) { next(error); }
});

// Admin can only deactivate or reactivate employee accounts.
router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const body = req.body || {};
    if (Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'active') ||
        typeof body.active !== 'boolean') {
      return res.status(400).json({ message: 'Only an active boolean can be updated' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'employee') return res.status(403).json({ message: 'Only employee accounts can be changed here' });

    user.active = body.active;
    await user.save();
    res.json({
      user: {
        id: user.id, name: user.name, employeeId: user.employeeId,
        email: user.email || null, role: user.role, active: user.active
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
