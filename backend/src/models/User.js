const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'employee'], default: 'employee', required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
