const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, allowRoles('admin'));

// Admin creates manager and employee accounts. Passwords are never returned.
router.post('/', async (req, res, next) => {
  try {
    const { name, employeeId, email, password, role = 'employee', managerId = null } = req.body || {};
    if (!name || !employeeId || typeof password !== 'string' || !password ||
        !['manager', 'employee'].includes(role)) {
      return res.status(400).json({ message: 'Name, employeeId, password and a valid role (manager or employee) are required' });
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ message: 'Password must not exceed 72 bytes' });
    }

    let manager = null;
    if (managerId) {
      if (role !== 'employee' || !mongoose.isValidObjectId(managerId)) {
        return res.status(400).json({ message: 'Only employees can be assigned to a valid manager' });
      }
      manager = await User.findOne({ _id: managerId, role: 'manager', active: true });
      if (!manager) return res.status(400).json({ message: 'Active manager not found' });
    }

    const normalizedId = String(employeeId).trim().toUpperCase();
    const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: String(name).trim(),
      employeeId: normalizedId,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      passwordHash,
      role,
      manager: manager ? manager._id : null
    });

    return res.status(201).json({
      user: {
        id: user.id, name: user.name, employeeId: user.employeeId,
        email: user.email || null, role: user.role, manager: user.manager,
        active: user.active
      }
    });
  } catch (error) { next(error); }
});

// List accounts without password hashes; optionally filter by role.
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.role) {
      if (!['admin', 'manager', 'employee'].includes(req.query.role)) {
        return res.status(400).json({ message: 'Invalid role filter' });
      }
      filter.role = req.query.role;
    }
    const users = await User.find(filter)
      .select('name employeeId email role manager active createdAt')
      .populate('manager', 'name employeeId')
      .sort({ role: 1, name: 1 })
      .lean();
    res.json({ users });
  } catch (error) { next(error); }
});

// Update employee manager assignment or deactivate/reactivate an account.
router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const allowed = ['active', 'managerId'];
    if (!Object.keys(req.body || {}).some(key => allowed.includes(key)) ||
        Object.keys(req.body || {}).some(key => !allowed.includes(key))) {
      return res.status(400).json({ message: 'Only active and managerId can be updated' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be changed through this endpoint' });

    if (req.body.active !== undefined) {
      if (typeof req.body.active !== 'boolean') return res.status(400).json({ message: 'active must be a boolean' });
      user.active = req.body.active;
    }
    if (req.body.managerId !== undefined) {
      if (user.role !== 'employee') return res.status(400).json({ message: 'Only employees can be assigned to a manager' });
      if (req.body.managerId === null || req.body.managerId === '') {
        user.manager = null;
      } else {
        if (!mongoose.isValidObjectId(req.body.managerId)) return res.status(400).json({ message: 'Invalid manager ID' });
        const manager = await User.findOne({ _id: req.body.managerId, role: 'manager', active: true });
        if (!manager) return res.status(400).json({ message: 'Active manager not found' });
        user.manager = manager._id;
      }
    }
    await user.save();
    res.json({
      user: {
        id: user.id, name: user.name, employeeId: user.employeeId,
        email: user.email || null, role: user.role, manager: user.manager,
        active: user.active
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
