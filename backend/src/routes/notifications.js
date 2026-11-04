const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('shop', 'name address district state pinCode')
      .sort({ createdAt: -1 }).limit(50).lean();
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, readAt: null });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ notifications, unreadCount });
  } catch (error) { next(error); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) { next(error); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID' });
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (error) { next(error); }
});

module.exports = router;
