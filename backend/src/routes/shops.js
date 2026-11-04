const express = require('express');
const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { writeAuditLog } = require('../utils/audit');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function validMobile(value) {
  return typeof value === 'string' && /^\+?\d{7,15}$/.test(value.trim().replace(/[\s().-]/g, ''));
}
function validateShop(body) {
  const { name, address, pinCode, district, state, mobileNumber, latitude, longitude } = body;
  if (!cleanText(name) || !cleanText(address) || !/^\d{6}$/.test(String(pinCode || '').trim()) ||
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
      ? { isDeleted: { $ne: true }, ...(req.query.status && ['PENDING', 'VERIFIED', 'REJECTED'].includes(req.query.status) ? { verificationStatus: req.query.status } : {}) }
      : { isDeleted: { $ne: true }, $or: [
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
      mobileNumber: body.mobileNumber.trim().replace(/[\s().-]/g, ''),
      location: { latitude: body.latitude, longitude: body.longitude },
      createdBy: req.user._id,
      verificationStatus: isAdmin ? 'VERIFIED' : 'PENDING',
      verifiedBy: isAdmin ? req.user._id : null,
      verifiedAt: isAdmin ? new Date() : null
    });
    if (!isAdmin) {
      const admins = await User.find({ role: 'admin', active: true, isDeleted: { $ne: true } }).select('_id').lean();
      if (admins.length) {
        await Notification.insertMany(admins.map(admin => ({
          recipient: admin._id,
          title: 'New shop awaiting approval',
          message: shop.name + ' was submitted by ' + req.user.name + '. Review the shop details and GPS pin.',
          type: 'SHOP_SUBMITTED',
          shop: shop._id
        })));
      }
    }
    await writeAuditLog(req, { action: isAdmin ? 'SHOP_CREATED' : 'SHOP_SUBMITTED', entityType: 'shop', entityId: shop.id, entityLabel: shop.name, details: { verificationStatus: shop.verificationStatus } });
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

    const shop = await Shop.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    for (const key of ['name', 'address', 'district', 'state']) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'string' || !body[key].trim()) return res.status(400).json({ message: key + ' is required' });
        shop[key] = body[key].trim();
      }
    }
    if (body.pinCode !== undefined) {
      if (!/^\d{6}$/.test(String(body.pinCode).trim())) return res.status(400).json({ message: 'PIN code must contain exactly 6 digits' });
      shop.pinCode = String(body.pinCode).trim();
    }
    if (body.mobileNumber !== undefined) {
      if (!validMobile(body.mobileNumber)) return res.status(400).json({ message: 'Enter a valid mobile number' });
      shop.mobileNumber = body.mobileNumber.trim().replace(/[\s().-]/g, '');
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
    const previousStatus = shop.verificationStatus;
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
    const changedFields = Object.keys(body).filter(key => key !== 'rejectionReason');
    await writeAuditLog(req, { action: previousStatus !== shop.verificationStatus ? (shop.verificationStatus === 'VERIFIED' ? 'SHOP_APPROVED' : shop.verificationStatus === 'REJECTED' ? 'SHOP_REJECTED' : 'SHOP_UPDATED') : 'SHOP_UPDATED', entityType: 'shop', entityId: shop.id, entityLabel: shop.name, details: { changedFields, verificationStatus: shop.verificationStatus, ...(shop.verificationStatus === 'REJECTED' ? { rejectionReason: shop.rejectionReason } : {}) } });
    if (previousStatus !== shop.verificationStatus && ['VERIFIED', 'REJECTED'].includes(shop.verificationStatus) && shop.createdBy) {
      const approved = shop.verificationStatus === 'VERIFIED';
      await Notification.create({
        recipient: shop.createdBy,
        title: approved ? 'Your shop has been approved' : 'Your shop registration needs correction',
        message: approved
          ? shop.name + ' has been approved. It is now available for employee check-ins.'
          : shop.name + ' was rejected. ' + (shop.rejectionReason || 'Please contact your admin for correction details.'),
        type: approved ? 'SHOP_APPROVED' : 'SHOP_REJECTED',
        shop: shop._id
      });
    }
    res.json({ message: 'Shop updated', shop });
  } catch (error) { next(error); }
});

// Hard delete is restricted to admins.
router.delete('/:id', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid shop ID' });
    const shop = await Shop.findOneAndUpdate({ _id: req.params.id, isDeleted: { $ne: true } }, { $set: { isDeleted: true, active: false } }, { new: true });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    await writeAuditLog(req, { action: 'SHOP_DELETED', entityType: 'shop', entityId: shop.id, entityLabel: shop.name });
    res.json({ message: 'Shop removed from the directory. Historical visits are preserved.' });
  } catch (error) { next(error); }
});

module.exports = router;
