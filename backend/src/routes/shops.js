const express = require('express');
const Shop = require('../models/Shop');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const shops = await Shop.find({ active: true }).sort({ name: 1 }).lean();
    res.json({ shops });
  } catch (error) { next(error); }
});

router.post('/', allowRoles('admin'), async (req, res, next) => {
  try {
    const { name, shopCode, address = '', area = '', latitude, longitude } = req.body || {};
    if (!name || !shopCode || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'Valid name, shopCode, latitude and longitude are required' });
    }
    const shop = await Shop.create({ name, shopCode, address, area, location: { latitude, longitude } });
    res.status(201).json({ shop });
  } catch (error) { next(error); }
});

router.patch('/:id', allowRoles('admin'), async (req, res, next) => {
  try {
    const allowed = ['name', 'address', 'area', 'active'];
    const update = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) update[key] = req.body[key];
    if (req.body?.latitude !== undefined || req.body?.longitude !== undefined) {
      const current = await Shop.findById(req.params.id);
      if (!current) return res.status(404).json({ message: 'Shop not found' });
      const latitude = req.body.latitude ?? current.location.latitude;
      const longitude = req.body.longitude ?? current.location.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ message: 'Invalid coordinates' });
      }
      update.location = { latitude, longitude };
    }
    const shop = await Shop.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    res.json({ shop });
  } catch (error) { next(error); }
});

module.exports = router;
