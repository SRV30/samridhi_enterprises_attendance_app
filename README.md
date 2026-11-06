# Samridhi Enterprises Attendance App

A location-verified attendance and shop-visit management application for Samridhi Enterprises. The project contains an Expo mobile/web frontend and a Node.js/Express API backed by MongoDB.

## Features

### Admin
- Create admin and employee accounts using name, mandatory email, optional phone number, password and role.
- View the account directory and individual account profiles.
- Activate or deactivate employee accounts.
- Archive accounts without deleting their attendance history.
- Register, review, verify, reject, edit and manage shops.
- View today's team attendance, notifications and audit logs.
- Generate attendance reports and export them as CSV.
- Change account password.

### Employee
- Sign in using an email address and password.
- View verified shops and submit new shop registrations for admin review.
- Check in at a verified shop using the device's current GPS location.
- View today's visits, attendance history and notifications.
- Change account password.

### Attendance verification
- Location permission is requested when a location-dependent action is used.
- Check-in requires GPS accuracy of 50 metres or better.
- The server independently calculates the distance between the submitted coordinates and the verified shop location.
- Check-in is accepted only within 50 metres of an active, verified shop.
- Attendance days use the `Asia/Kolkata` time zone.
- A unique employee/shop/attendance-day constraint prevents duplicate daily visits to the same shop.

## Technology

| Layer | Technology |
|---|---|
| Mobile and web app | Expo, React Native, Expo Router, TypeScript |
| Location | Expo Location |
| Secure native session storage | Expo SecureStore |
| API | Node.js, Express |
| Database | MongoDB with Mongoose |
| Authentication | JSON Web Tokens (JWT) |
| Password hashing | bcryptjs |
| API security | Helmet, CORS, login rate limiting |
| Mobile build and hosting | EAS Build / EAS Hosting |
| API hosting | Vercel |

## Repository structure

```text
.
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── scripts/
│   │   └── utils/
│   └── package.json
└── seattend/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   └── lib/
    ├── app.json
    ├── eas.json
    └── package.json
```

## Requirements

- Node.js 20 or newer
- npm
- MongoDB database (local or hosted)
- Expo account for EAS builds and hosting
- Android device for APK testing; iOS distribution requires Apple signing credentials

## Backend setup

1. Open a terminal in the `backend` directory.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in `backend/`:

   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=replace_with_a_random_secret_at_least_32_characters_long
   JWT_EXPIRES_IN=12h
   CORS_ORIGINS=http://localhost:8081,https://your-production-frontend.example
   ```

   Use a strong, unique JWT secret. Do not commit `.env` or production credentials.

4. Start the API:

   ```bash
   npm run dev
   ```

5. Check the health endpoint:

   ```text
   http://localhost:5000/api/health
   ```

   A healthy API responds with a JSON status of `ok`.

### Backend environment variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign JWTs; minimum 32 characters |
| `CORS_ORIGINS` | Yes in production | Comma-separated exact frontend origins |
| `JWT_EXPIRES_IN` | No | JWT lifetime; defaults to `12h` |
| `PORT` | No | Local API port; defaults to `5000` |

In production, configure `CORS_ORIGINS` with the exact deployed frontend origin(s). The API intentionally fails to start in production if this variable is empty. Native mobile API requests may not send an Origin header; authentication and authorization are still enforced by the API.

## Frontend setup

1. Open a terminal in `seattend/`.
2. Install dependencies:

   ```bash
   npm ci
   ```

3. Create `seattend/.env` for local development:

   ```env
   EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:5000
   ```

   Replace the example with the computer's reachable LAN IP address. A physical phone and development computer must be on a network that allows them to communicate. Do not use `localhost` as the API host on a physical phone.

4. Start Expo:

   ```bash
   npx expo start
   ```

The production API URL is configured in the EAS build profiles in `seattend/eas.json`. Public Expo environment variables are bundled into the app; never put passwords, JWT secrets or database credentials in `EXPO_PUBLIC_*` variables.

## Android APK build

From `seattend/`:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The preview profile is configured for an installable APK. Download the completed build from the EAS build page and install it on a test device.

For a Google Play release build:

```bash
npx eas-cli@latest build --platform android --profile production
```

The production profile is configured to produce an Android App Bundle (AAB), not an APK.

## Deployment

### Backend on Vercel

- Set the Vercel project root directory to `backend`.
- Configure `MONGODB_URI`, `JWT_SECRET`, and `CORS_ORIGINS` in Vercel Environment Variables.
- Set `CORS_ORIGINS` to the exact hosted frontend origin, for example `https://samridhi-enterprises-attendance-app.expo.app`.
- Deploy or redeploy after changing environment variables.
- Verify `/api/health` after deployment.

### Frontend on EAS

- The Expo project is configured in `seattend/app.json`.
- EAS build profiles are defined in `seattend/eas.json`.
- Ensure the API URL in the selected EAS profile points to the deployed backend before building.
- Rebuild and redistribute the app after frontend code changes; an already-installed standalone APK does not automatically receive source-code changes.

## Account and session security

- API routes authenticate requests with a bearer JWT and enforce role-based authorization.
- Passwords are stored as bcrypt hashes, not plain text.
- Saved native sessions use Expo SecureStore; web sessions use browser local storage.
- On app startup, the saved token is checked against the API before the session is restored.
- JWTs currently expire after the configured lifetime (12 hours by default). Users must sign in again after token expiry; automatic refresh tokens are not currently implemented.
- Deactivating or archiving an account prevents further authentication.
- Archiving an account preserves attendance visits and reports. It does not permanently erase the account's historical records.

## Important operational notes

- Test GPS behaviour outdoors and on the actual phones used by employees. Indoor GPS accuracy can be insufficient for the 50-metre check-in rule.
- Keep MongoDB backups enabled and periodically test restoring a backup.
- Review Vercel logs and database connectivity if the API health check or requests fail.
- The API login rate limiter currently uses the default in-memory store. In serverless deployments, limits are not shared across separate instances; use a shared store if stronger cross-instance rate limiting is required.
- Do not commit `.env` files, signing credentials, private keys, database exports or real user data.

## Useful commands

Backend:

```bash
cd backend
npm install
npm run dev
npm run check
```

Frontend:

```bash
cd seattend
npm ci
npx expo start
npx eas-cli@latest build --platform android --profile preview
```

## License

No license has been specified. All rights reserved unless the repository owner adds a license.
