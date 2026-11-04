const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, email, employeeId, password } = req.body || {};
    const loginValue = String(identifier || email || employeeId || '').trim();
    if (!loginValue || !password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email address and password are required' });
    }

    // New accounts use email. Legacy accounts can still sign in with their existing internal ID.
    const lookup = loginValue.includes('@')
      ? { email: loginValue.toLowerCase() }
      : { employeeId: loginValue.toUpperCase() };
    const user = await User.findOne(lookup).select('+passwordHash');
    if (!user || !user.active || user.isDeleted || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email/ID or password' });
    }
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h'
    });
    return res.json({
      token,
      user: {
        id: user.id, name: user.name, employeeId: user.employeeId,
        email: user.email || null, phone: user.phone || '', role: user.role
      }
    });
  } catch (error) { next(error); }
});

router.get('/me', authenticate, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id: req.user.id, name: req.user.name, employeeId: req.user.employeeId,
    email: req.user.email || null, phone: req.user.phone || '', role: req.user.role
  });
});

module.exports = router;
