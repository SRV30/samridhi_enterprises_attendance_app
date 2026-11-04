const express = require('express');
const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.user.role === 'admin' && req.query.includeInactive === 'true';
    const filter = includeInactive ? {} : { active: true };
    const shops = await Shop.find(filter).sort({ name: 1 }).lean();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ shops });
  } catch (error) { next(error); }
});

router.post('/', allowRoles('admin'), async (req, res, next) => {
  try {
    const { name, shopCode, address = '', area = '', latitude, longitude } = req.body || {};
    if (typeof name !== 'string' || !name.trim() ||
        typeof shopCode !== 'string' || !shopCode.trim() ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'Valid name, shopCode, latitude and longitude are required' });
    }
    const shop = await Shop.create({
      name: name.trim(),
      shopCode: shopCode.trim().toUpperCase(),
      address: typeof address === 'string' ? address.trim() : '',
      area: typeof area === 'string' ? area.trim() : '',
      location: { latitude, longitude }
    });
    res.status(201).json({ shop });
  } catch (error) { next(error); }
});

router.patch('/:id', allowRoles('admin'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid shop ID' });
    }
    const allowed = ['name', 'shopCode', 'address', 'area', 'active', 'latitude', 'longitude'];
    const body = req.body || {};
    const keys = Object.keys(body);
    if (!keys.length || keys.some(key => !allowed.includes(key))) {
      return res.status(400).json({ message: 'Provide valid shop fields to update' });
    }

    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    for (const key of ['name', 'address', 'area']) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'string' || (key === 'name' && !body[key].trim())) {
          return res.status(400).json({ message: key + ' must be a valid string' });
        }
        shop[key] = body[key].trim();
      }
    }
    if (body.shopCode !== undefined) {
      if (typeof body.shopCode !== 'string' || !body.shopCode.trim()) {
        return res.status(400).json({ message: 'shopCode must be a non-empty string' });
      }
      shop.shopCode = body.shopCode.trim().toUpperCase();
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

    await shop.save();
    res.json({ shop });
  } catch (error) { next(error); }
});

module.exports = router;
