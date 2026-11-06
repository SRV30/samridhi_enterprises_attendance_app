require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDatabase = require('./config/db');
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shops');
const visitRoutes = require('./routes/visits');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const auditRoutes = require('./routes/audit');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

const app = express();
// Render runs the app behind a single trusted reverse proxy.
app.set('trust proxy', 1);

const origins = (process.env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
if (process.env.NODE_ENV === 'production' && origins.length === 0) {
  throw new Error('CORS_ORIGINS must contain the exact production frontend origins');
}
app.use(helmet());
app.use(cors({ origin(origin, callback) {
  if (!origin || origins.length === 0 || origins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin not allowed by CORS'));
} }));
app.use(express.json({ limit: '20kb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'samridhi-attendance-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((error, _req, res, _next) => {
  if (error.code === 11000) return res.status(409).json({ message: 'A record with this unique value already exists' });
  console.error(error);
  res.status(500).json({ message: 'Internal server error' });
});

const port = Number(process.env.PORT) || 5000;
connectDatabase().then(() => app.listen(port, () => console.log(`Attendance API listening on port ${port}`)))
  .catch(error => { console.error('Startup failed:', error.message); process.exit(1); });
