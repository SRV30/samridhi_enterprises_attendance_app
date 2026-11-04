require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

(async () => {
  try {
    if (!process.env.MONGODB_URI || !process.env.SEED_ADMIN_NAME ||
        !process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD) {
      throw new Error('Set MONGODB_URI, SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in backend/.env');
    }
    if (process.env.SEED_ADMIN_PASSWORD.length < 12) throw new Error('Seed admin password must be at least 12 characters');
    await mongoose.connect(process.env.MONGODB_URI);
    const employeeId = process.env.SEED_ADMIN_EMAIL.trim().toUpperCase();
    const exists = await User.findOne({ $or: [{ email: process.env.SEED_ADMIN_EMAIL.toLowerCase() }, { employeeId }] });
    if (exists) throw new Error('An account with this admin email/ID already exists; refusing to overwrite it');
    const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12);
    await User.create({
      name: process.env.SEED_ADMIN_NAME, employeeId,
      email: process.env.SEED_ADMIN_EMAIL, passwordHash, role: 'admin'
    });
    console.log('Admin account created. Store credentials securely and remove seed credentials from .env.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
})();
