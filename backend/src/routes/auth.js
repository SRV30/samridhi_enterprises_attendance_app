const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { employeeId, password } = req.body || {};
    if (!employeeId || !password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Employee ID and password are required' });
    }
    const user = await User.findOne({ employeeId: String(employeeId).trim().toUpperCase() }).select('+passwordHash');
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid employee ID or password' });
    }
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h'
    });
    return res.json({
      token,
      user: { id: user.id, name: user.name, employeeId: user.employeeId, role: user.role }
    });
  } catch (error) { next(error); }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, employeeId: req.user.employeeId, role: req.user.role });
});

module.exports = router;
