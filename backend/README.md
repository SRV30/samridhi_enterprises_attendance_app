# Samridhi Sales Attendance API

Separate Node.js API for the Samridhi Sales Attendance mobile app. It does not modify or connect to the Samridhi Enterprises e-commerce website.

## Requirements

- Node.js 20+
- MongoDB Atlas database and database user

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` and a unique `JWT_SECRET` (at least 32 characters).
3. Install dependencies with `npm install`.
4. Start the development server with `npm run dev`.
5. Check `http://localhost:5000/api/health`.

Never commit `.env`, database credentials, JWT secrets or real employee records.

## Create the first administrator

Set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`, then run `npm run seed:admin` once. Remove the seed password from the environment after account creation. The script refuses to overwrite an existing administrator.

## API overview

All protected endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | Sign in with company ID and password |
| GET | `/api/auth/me` | Authenticated | Read current account |
| GET | `/api/shops` | Authenticated | List active shops; admins may pass `?includeInactive=true` to view the full shop directory |
| POST | `/api/shops` | Admin | Register a shop and trusted GPS coordinates |
| PATCH | `/api/shops/:id` | Admin | Update shop details or coordinates |
| GET | `/api/users` | Admin | List accounts |
| POST | `/api/users` | Admin | Create a manager or employee |
| PATCH | `/api/users/:id` | Admin | Update account status or employee manager assignment |
| POST | `/api/visits/check-in` | Employee | Submit a one-time GPS reading for shop check-in |
| GET | `/api/visits/today` | Employee | Read own attendance and today's visits |
| GET | `/api/visits/team/today` | Manager/Admin | Read assigned team or admin team overview |
| GET | `/api/reports/attendance` | Admin | Read date-filtered attendance and employee summaries |
| GET | `/api/reports/attendance.csv` | Admin | Download an Excel-compatible CSV report |

### Attendance report filters

Both reporting endpoints accept:

- `from`: inclusive start date in `YYYY-MM-DD` format.
- `to`: inclusive end date in `YYYY-MM-DD` format.
- `employeeId`: optional MongoDB employee ID to limit the report to one employee.

Report ranges are limited to 92 calendar days. Attendance dates and displayed check-in times use `Asia/Kolkata`. The CSV export includes employee summaries and verified shop visit rows; it can be opened in Microsoft Excel or Google Sheets.

## Attendance verification

- The server calculates distance using the shop coordinates stored in MongoDB; client-supplied distance is never trusted.
- Check-in is accepted only within 50 metres and with reported GPS accuracy no worse than 50 metres.
- A unique database index enforces one visit per employee/shop/Asia-Kolkata calendar day, including concurrent requests.
- The first verified visit marks the employee Present for that day.
- Managers can access only employees assigned to their manager account through the manager team endpoint.
- Report endpoints are restricted to administrators.
- GPS spoofing cannot be fully eliminated by a normal Android location API. Treat coordinates as a risk signal and retain audit records; do not describe this as spoof-proof.
- Employee location is requested only when the employee initiates a check-in; this API does not implement background/continuous tracking.

## Production checklist

Before real employee attendance is collected, complete end-to-end testing, HTTPS deployment, production CORS configuration, database backups, secret rotation, monitoring, and an operational review of GPS edge cases and exports.
