const mongoose = require('mongoose');

async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  await mongoose.connect(process.env.MONGODB_URI);

  const User = require('../models/User');
  const Shop = require('../models/Shop');
  const unsupportedRoles = await User.countDocuments({ role: { $nin: ['admin', 'employee'] } });
  if (unsupportedRoles > 0) {
    throw new Error(
      'Database contains ' + unsupportedRoles +
      ' account(s) with unsupported roles. Run "npm run migrate:roles" in backend/ before starting the API.'
    );
  }

  await Shop.updateMany({ verificationStatus: { $exists: false } }, { $set: { verificationStatus: 'VERIFIED' } });
  console.log('MongoDB connected. Supported account roles: admin, employee. Legacy shops preserved as verified.');
}

module.exports = connectDatabase;
