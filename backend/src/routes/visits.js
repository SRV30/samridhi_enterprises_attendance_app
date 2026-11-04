const express = require('express');
const Shop = require('../models/Shop');
const Visit = require('../models/Visit');
const { writeAuditLog } = require('../utils/audit');
const { authenticate, allowRoles } = require('../middleware/auth');
const { attendanceDay, distanceMeters } = require('../utils/attendance');

const router = express.Router();
router.use(authenticate);

router.post('/check-in', allowRoles('employee'), async (req, res, next) => {
  try {
    const { shopId, latitude, longitude, accuracyMeters } = req.body || {};
    if (!shopId || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        !Number.isFinite(accuracyMeters) || latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180 || accuracyMeters <= 0 || accuracyMeters > 50) {
      return res.status(400).json({ message: 'Valid GPS coordinates and accuracy of 50m or better are required' });
    }
    const shop = await Shop.findOne({ _id: shopId, active: true, verificationStatus: 'VERIFIED' });
    if (!shop) return res.status(404).json({ message: 'Active verified shop not found' });

    const distance = distanceMeters(
      { latitude, longitude },
      { latitude: shop.location.latitude, longitude: shop.location.longitude }
    );
    if (distance > 50) {
      return res.status(403).json({ message: 'You must be within 50 metres of this shop', distanceMeters: Math.round(distance) });
    }

    const day = attendanceDay();
    const existing = await Visit.findOne({ employee: req.user.id, shop: shop.id, attendanceDay: day });
    if (existing) return res.status(200).json({ message: 'This shop is already recorded for today', alreadyVisited: true, visit: existing });

    try {
      const visit = await Visit.create({
        employee: req.user.id, shop: shop.id, attendanceDay: day, checkedInAt: new Date(),
        reportedLocation: { latitude, longitude, accuracyMeters },
        distanceMeters: Math.round(distance * 100) / 100
      });
      await writeAuditLog(req, { action: 'VISIT_CHECKED_IN', entityType: 'visit', entityId: visit.id, entityLabel: shop.name, details: { shopId: shop.id, shopName: shop.name, attendanceDay: day, distanceMeters: visit.distanceMeters, accuracyMeters } });
      return res.status(201).json({ message: 'Shop visit verified', alreadyVisited: false, visit });
    } catch (error) {
      if (error.code === 11000) {
        const visit = await Visit.findOne({ employee: req.user.id, shop: shop.id, attendanceDay: day });
        return res.status(200).json({ message: 'This shop is already recorded for today', alreadyVisited: true, visit });
      }
      throw error;
    }
  } catch (error) { next(error); }
});

router.get('/today', allowRoles('employee'), async (req, res, next) => {
  try {
    const day = attendanceDay();
    const visits = await Visit.find({ employee: req.user.id, attendanceDay: day })
      .populate('shop', 'name address pinCode district state mobileNumber location verificationStatus')
      .sort({ checkedInAt: 1 });
    res.json({ date: day, attendance: visits.length ? 'Present' : 'Not marked', visitCount: visits.length, visits });
  } catch (error) { next(error); }
});

router.get('/team/today', allowRoles('admin'), async (req, res, next) => {
  try {
    const day = attendanceDay();
    const employees = await require('../models/User').find({ role: 'employee', isDeleted: { $ne: true } }).select('name employeeId email phone active role').lean();
    const ids = employees.map(employee => employee._id);
    const visits = await Visit.find({ employee: { $in: ids }, attendanceDay: day })
      .populate('employee', 'name employeeId email phone')
      .populate('shop', 'name address pinCode district state')
      .sort({ checkedInAt: 1 }).lean();
    res.json({ date: day, employees: employees.map(employee => {
      const ownVisits = visits.filter(visit => String(visit.employee._id) === String(employee._id));
      return { ...employee, attendance: ownVisits.length ? 'Present' : 'Not marked', visitCount: ownVisits.length, visits: ownVisits };
    }) });
  } catch (error) { next(error); }
});

module.exports = router;
