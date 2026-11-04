# Samridhi Sales Attendance

A dedicated Android attendance and field-visit application for Samridhi Enterprises.

## Project status

The repository currently contains the Expo React Native mobile application foundation and the first employee sign-in interface. Authentication, GPS verification, attendance APIs, and the separate admin dashboard are planned next.

## Technology

- React Native
- Expo SDK 58
- Expo Router
- TypeScript
- Node.js + Express (planned backend)
- MongoDB Atlas (planned database)

## Mobile app setup

Requirements:
- Node.js LTS
- npm
- Expo Go on an Android device for initial development testing

Install dependencies:

```bash
npm install
```

Start Expo:

```bash
npx expo start
```

Scan the QR code using Expo Go. If local network discovery is blocked, use:

```bash
npx expo start --tunnel
```

## Initial employee workflow

1. Employee enters their company-issued Employee ID and password.
2. The app will authenticate against the attendance backend (not connected yet).
3. After authentication, employees will be able to find registered shops.
4. A shop visit will be accepted only after server-side verification that the employee is within the configured 50-metre radius.
5. The first accepted visit of the day marks attendance Present. Further unique shop visits are recorded; duplicate visits to the same shop on the same day are prevented.

All attendance timestamps and daily boundaries will use Asia/Kolkata. Location should be requested only when needed for a visit, with clear user disclosure.

## Planned repository layout

- `seattend/` — Expo Android application (current)
- `admin/` — separate web administration dashboard (planned)
- `backend/` — API and business logic (planned)

## Security

- Never commit `.env` files, API keys, database credentials, signing keys, or real employee data.
- Client-side GPS checks are not authoritative. The backend must calculate distance from trusted shop coordinates.
- The app must not claim attendance is verified until the server accepts the visit.

## License

See [LICENSE](./LICENSE).
