# Samridhi Sales Attendance — Admin Panel

Separate Vite/React web interface for administrators. It connects to the attendance API and does not modify the existing e-commerce website.

## Setup

```powershell
cd web-admin
Copy-Item .env.example .env
```

Set `VITE_API_URL` in `.env` to the backend URL. For local laptop use, the default is `http://localhost:5000`. To open this panel from another device on the same LAN, use the laptop's LAN IP and configure the backend CORS_ORIGINS accordingly.

```powershell
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually http://localhost:5173).

## Current features

- Admin-only sign in
- Overview of active employees, managers, registered shops and today's visits
- Create manager and employee accounts
- Optionally assign an employee to an active manager
- Activate/deactivate manager and employee accounts
- Register shops with trusted latitude/longitude coordinates
- List registered shops and today's verified visits

## Security notes

- API access is protected by the backend admin role.
- The JWT is stored in sessionStorage and cleared on sign out.
- Use HTTPS in production and restrict CORS to the deployed admin-panel origin.
- Never commit real credentials or production environment files.
- This is an initial admin panel; add password reset, audit history, stronger session controls and automated tests before production rollout.
