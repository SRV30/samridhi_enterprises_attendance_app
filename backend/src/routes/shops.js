const express = require('express');
const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function validMobile(value) {
  return typeof value === 'string' && /^\\+?\\d{7,15}$/.test(value.trim().replace(/[\\s().-]/g, ''));
}
function validateShop(body) {
  const { name, address, pinCode, district, state, mobileNumber, latitude, longitude } = body;
  if (!cleanText(name) || !cleanText(address) || !/^\\d{6}$/.test(String(pinCode || '').trim()) ||
      !cleanText(district) || !cleanText(state) || !validMobile(mobileNumber) ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return 'Name, address, 6-digit PIN code, district, state, valid mobile number and GPS coordinates are required';
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin'
      ? (req.query.status && ['PENDING', 'VERIFIED', 'REJECTED'].includes(req.query.status)
          ? { verificationStatus: req.query.status } : {})
      : { $or: [
          { verificationStatus: 'VERIFIED', active: true },
          { createdBy: req.user._id, verificationStatus: { $in: ['PENDING', 'REJECTED'] } }
        ] };
    const shops = await Shop.find(filter)
      .populate('createdBy', 'name email role')
      .populate('verifiedBy', 'name email')
      .sort({ createdAt: -1 }).lean();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ shops });
  } catch (error) { next(error); }
});

// Both roles can register a shop. Employee submissions always require admin verification.
router.post('/', allowRoles('admin', 'employee'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const validationError = validateShop(body);
    if (validationError) return res.status(400).json({ message: validationError });

    const isAdmin = req.user.role === 'admin';
    const shop = await Shop.create({
      name: cleanText(body.name),
      address: cleanText(body.address),
      pinCode: String(body.pinCode).trim(),
      district: cleanText(body.district),
      state: cleanText(body.state),
      mobileNumber: body.mobileNumber.trim().replace(/[\\s().-]/g, ''),
      location: { latitude: body.latitude, longitude: body.longitude },
      createdBy: req.user._id,
      verificationStatus: isAdmin ? 'VERIFIED' : 'PENDING',
      verifiedBy: isAdmin ? req.user._id : null,
      verifiedAt: isAdmin ? new Date() : null
    });
    res.status(201).json({
      message: isAdmin ? 'Shop registered and verified' : 'Shop submitted for admin verification',
      shop
    });
  } catch (error) { next(error); }
});

// Only admins may edit shop details or verification state.
router.patch('/:id', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid shop ID' });
    const allowed = ['name', 'address', 'pinCode', 'district', 'state', 'mobileNumber', 'active', 'latitude', 'longitude', 'verificationStatus', 'rejectionReason'];
    const body = req.body || {};
    const keys = Object.keys(body);
    if (!keys.length || keys.some(key => !allowed.includes(key))) {
      return res.status(400).json({ message: 'Provide valid shop fields to update' });
    }

    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    for (const key of ['name', 'address', 'district', 'state']) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'string' || !body[key].trim()) return res.status(400).json({ message: key + ' is required' });
        shop[key] = body[key].trim();
      }
    }
    if (body.pinCode !== undefined) {
      if (!/^\\d{6}$/.test(String(body.pinCode).trim())) return res.status(400).json({ message: 'PIN code must contain exactly 6 digits' });
      shop.pinCode = String(body.pinCode).trim();
    }
    if (body.mobileNumber !== undefined) {
      if (!validMobile(body.mobileNumber)) return res.status(400).json({ message: 'Enter a valid mobile number' });
      shop.mobileNumber = body.mobileNumber.trim().replace(/[\\s().-]/g, '');
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') return res.status(400).json({ message: 'active must be a boolean' });
      shop.active = body.active;
    }
    if (body.latitude !== undefined || body.longitude !== undefined) {
      const latitude = body.latitude ?? shop.location.latitude;
      const longitude = body.longitude ?? shop.location.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ message: 'Invalid coordinates' });
      }
      shop.location = { latitude, longitude };
    }
    if (body.verificationStatus !== undefined) {
      if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(body.verificationStatus)) {
        return res.status(400).json({ message: 'Invalid verification status' });
      }
      shop.verificationStatus = body.verificationStatus;
      shop.verifiedBy = body.verificationStatus === 'VERIFIED' ? req.user._id : null;
      shop.verifiedAt = body.verificationStatus === 'VERIFIED' ? new Date() : null;
      if (body.verificationStatus !== 'REJECTED') shop.rejectionReason = '';
    }
    if (body.rejectionReason !== undefined) shop.rejectionReason = cleanText(body.rejectionReason);

    await shop.save();
    res.json({ message: 'Shop updated', shop });
  } catch (error) { next(error); }
});

// Hard delete is restricted to admins.
router.delete('/:id', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid shop ID' });
    const shop = await Shop.findByIdAndDelete(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    res.json({ message: 'Shop deleted successfully' });
  } catch (error) { next(error); }
});

module.exports = router;
