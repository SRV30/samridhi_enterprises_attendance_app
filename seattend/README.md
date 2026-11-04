# Samridhi Sales Attendance

A dedicated mobile attendance and field-visit application for Samridhi Enterprises.

## Current capabilities

- Role-based sign-in for Admin, Manager and Employee accounts.
- Employee dashboard with shop search, attendance status and verified visit history.
- One-time foreground GPS capture when an employee starts a check-in.
- Server-side distance calculation against trusted shop coordinates and a 50-metre radius.
- Admin workspace for accounts, manager assignments, shop registration, shop editing, GPS pin correction, and shop deactivation/reactivation.
- Shop location capture by map pin, current location or Google Maps link.
- Manager workspace showing only assigned employees and their daily verified shop visits.
- Admin attendance reports with date-range filters, employee filtering, day-wise visit details and Excel-compatible CSV export.
- Asia/Kolkata attendance-day boundaries and report timestamps.

The reporting API limits each report to 92 calendar days. CSV exports open in Microsoft Excel and Google Sheets; they are CSV files, not native XLSX workbooks.

## Technology

- React Native and Expo SDK 58
- Expo Router and TypeScript
- Node.js and Express backend
- MongoDB Atlas
- JWT authentication
- Expo Location for foreground check-in GPS
- Expo File System and Expo Sharing for CSV report export

## Mobile app setup

Requirements:
- Node.js version supported by Expo SDK 58
- npm
- Expo Go on an Android device for development testing

From the `seattend/` directory:

```bash
npm install
```

The project uses `expo-file-system` and `expo-sharing` for report exports. `npm install` synchronizes the package lock after pulling dependency changes.

Create `.env` from `.env.example` and set `EXPO_PUBLIC_API_URL` to the backend URL reachable from the phone. Do not use `localhost` or `127.0.0.1` as the phone's API host when the backend runs on a computer.

Start Expo:

```bash
npx expo start --clear
```

Scan the QR code with Expo Go. The phone and computer should be on a network that allows device-to-device access. If LAN discovery is blocked, try a phone hotspot or:

```bash
npx expo start --tunnel
```

## Role workflows

### Employee

1. Sign in with the company-issued Employee ID and password.
2. Search any active registered shop.
3. Start check-in while physically at the shop.
4. Allow foreground location access for that check-in only.
5. The server verifies reported accuracy and calculates distance to the registered shop pin.
6. A successful first visit marks attendance Present for the Asia/Kolkata day. Other unique shop visits are recorded; repeat visits to the same shop on the same day return the existing record.

### Manager

1. Sign in using the manager account.
2. Review the assigned employees, daily attendance status and verified shop visits.
3. Pull down to refresh the current-day view.

The backend scopes the manager team endpoint to employees assigned to that manager account.

### Admin

1. Create manager and employee accounts.
2. Assign or reassign employees to active managers, or leave them unassigned.
3. Register shops and set their trusted GPS coordinates.
4. Review today's attendance and visits.
5. Open Reports to filter by date range and employee, inspect day-wise details, and share a CSV export.

## Privacy and security

- Location is requested only when the employee initiates a shop check-in; the app does not run background or continuous location tracking.
- Client-side GPS checks are not authoritative. The backend calculates distance from trusted shop coordinates.
- GPS spoofing cannot be completely prevented by standard Android location APIs.
- Never commit `.env` files, API keys, database credentials, signing keys or real employee data.
- Do not report attendance as verified until the server accepts the visit.

## Repository layout

- `seattend/` — Expo mobile application.
- `backend/` — Node.js/Express API.
- The existing Samridhi Enterprises website is maintained in its separate repository and is not changed by this project.

## Production status

The core role workflows and reporting features are implemented in the repository. Physical-device testing, production backend deployment with HTTPS, operational backup/security checks and Play Store release preparation remain necessary before production rollout.
