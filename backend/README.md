# Samridhi Sales Attendance API

This is a separate backend for the attendance app. It does not connect to or modify the existing e-commerce website.

## Requirements
- Node.js 20+
- MongoDB Atlas database and database user

## Local setup
1. Copy `.env.example` to `.env`.
2. Fill in `MONGODB_URI` and generate a unique `JWT_SECRET` (at least 32 characters). Never commit `.env`.
3. Install dependencies: `npm install`.
4. Start the API: `npm run dev`.
5. Check `http://localhost:5000/api/health`.

## Create the first administrator
Set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and a strong `SEED_ADMIN_PASSWORD` in `.env`, then run `npm run seed:admin` once. Remove the seed password from the environment after creation. The script refuses to overwrite an existing account.

## Initial endpoints
- `POST /api/auth/login` — employee ID and password; returns JWT.
- `GET /api/auth/me` — current authenticated account.
- `GET /api/shops` — active shops.
- `POST /api/shops` — admin creates a shop with trusted coordinates.
- `PATCH /api/shops/:id` — admin updates shop details/coordinates.
- `POST /api/visits/check-in` — employee submits shop ID and one-time GPS reading.
- `GET /api/visits/today` — employee's attendance and verified visits for the Asia/Kolkata day.
- `GET /api/visits/team/today` — manager's assigned team or admin's employee overview.

All protected endpoints require `Authorization: Bearer <token>`.

## Attendance verification
- Server calculates distance using the shop coordinates stored in MongoDB; client-supplied distance is never trusted.
- Check-in is accepted only within 50 metres and with reported GPS accuracy no worse than 50 metres.
- A unique database index enforces one visit per employee/shop/Asia-Kolkata calendar day, including concurrent requests.
- First verified visit means the employee is Present for that day.
- GPS spoofing cannot be fully eliminated by a normal Android location API. Treat coordinates as a risk signal and retain audit records; do not describe this as spoof-proof.
- Location is submitted only when the employee initiates check-in; this API does not implement background/continuous tracking.

## Important implementation status
This is the first API foundation, not a finished production system. Employee/manager provisioning, manager assignment management, Excel exports, password reset, audit review UI, and full admin web panel are not implemented yet. Do not deploy for real employee attendance until those controls, validation, HTTPS, backups, and end-to-end tests are completed.
