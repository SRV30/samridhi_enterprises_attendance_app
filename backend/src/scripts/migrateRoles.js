require('dotenv').config();
const mongoose = require('mongoose');

async function migrateLegacyRoles() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');

  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.db.collection('users');

  const converted = await users.updateMany(
    { role: 'manager' },
    { $set: { role: 'employee' }, $unset: { manager: '' } }
  );
  const assignmentsCleared = await users.updateMany(
    { manager: { $exists: true } },
    { $unset: { manager: '' } }
  );
  const remaining = await users.countDocuments({ role: 'manager' });

  console.log('Legacy manager accounts converted to employee:', converted.modifiedCount);
  console.log('Employee manager assignments cleared:', assignmentsCleared.modifiedCount);
  console.log('Legacy manager accounts remaining:', remaining);

  if (remaining > 0) {
    throw new Error('Some legacy manager accounts remain. Review the users collection before deploying.');
  }
  console.log('Role migration completed. No account was granted admin access.');
}

migrateLegacyRoles()
  .catch(error => {
    console.error('Role migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
