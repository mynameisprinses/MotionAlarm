# MotionAlarm

A phone movement alarm built with Ionic Angular, Capacitor, Supabase Auth, and PostgreSQL. The app calls Supabase's HTTPS REST endpoints directly using `fetch()`.

```text
Ionic Angular → Supabase Auth and REST API → PostgreSQL
```

## Run the app

Use Node.js 24.15 or newer in the Node 24 release line.

```sh
npm ci
npm start
```

Open `http://localhost:4200`, or use `ionic serve --port 8100`. The web app needs a configured Supabase project for accounts and alert history.

## Supabase setup

1. Choose a dedicated Supabase project.
2. Run `supabase/migrations/20261107024658_create_motion_alarm.sql` in that project's SQL Editor. It creates alert tables, ownership policies, grants, and the atomic upload function.
3. In **Settings → API Keys**, copy the publishable API key. In **Integrations → Data API**, copy the project URL.
4. Set `supabaseUrl` and `supabasePublishableKey` in both `src/environments/environment.ts` and `src/environments/environment.prod.ts`. These are public client settings. Administrative keys do not belong in the app.
5. Enable email/password accounts in Supabase Auth. Configure your actual app URL in Auth's URL configuration for email confirmation links. If email confirmation is enabled, the registration screen asks users to confirm their address before logging in.

This version starts with new accounts and account-specific history. It uses separate local session/cache keys and leaves previous saved data untouched.

For local Supabase development, the generated `supabase/config.toml` and migration are included. The pinned CLI supports `npx supabase --help`. A local Supabase stack requires Docker; hosted-project setup through the SQL Editor does not.

## Use MotionAlarm

1. Register or log in. The inputs have placeholders and show/hide password controls.
2. Tap **Motion alarm start**, allow the phone's requested permissions, and set it down during the five-second countdown.
3. Movement beyond the selected sensitivity creates one alert per monitoring session. Sound rings until stopped when enabled; vibration uses supported device hardware.
4. Tap **Motion alarm stop**. On Android, the existing native device-credential verification applies when a screen lock is configured.
5. **View alert history** opens date and status filters. Review, delete, and clear actions update the current account's alerts.
6. **Settings** controls sensitivity, sound, vibration, and Appearance. Monitoring settings are locked during an active session; appearance can change at any time.
7. **Test alarm** previews sound and vibration without saving a movement alert.

The requested explanatory paragraphs have been removed from the monitor, Settings, and account panel. Native alarm behavior is retained.

## How the code works

| File | Purpose |
| --- | --- |
| `src/app/api/api-request.ts` | Direct HTTPS requests with the public API key and user access token |
| `src/app/auth/auth.service.ts` | Sign-up, login, token refresh, logout, and local session restoration |
| `src/app/alert-history/alert-history.service.ts` | REST CRUD, pagination, account-specific cache, and offline upload queue |
| `src/app/home/home.page.ts` | Countdown, browser motion, native alarm bridge, sound, and vibration |
| `src/app/theme/theme.service.ts` | Light/dark/device preference and persistence |
| `supabase/migrations/20261107024658_create_motion_alarm.sql` | Tables, permissions, row-level security, and idempotent uploads |
| `tests/database.test.mjs` | Runs the real migration in an embedded PostgreSQL engine and tests its policies |
| `tests/supabase-mock.mjs` | Disposable REST protocol fixture used only by browser tests |

Read the [REST walkthrough](docs/REST-API.md) for endpoints and a button-to-database example.

## Data and offline behavior

`alerts` stores `user_id`, `id`, `created_at`, `source`, `status`, and `strength`. Database policies restrict access to the signed-in owner. Only status can be updated; event details remain immutable. Test events are rejected by the database.

`alert_imports` stores upload receipts. The `record_movement_alert` function writes a receipt and alert in one transaction. Retries cannot duplicate alerts or restore an alert after deletion. Receipts are retained after clearing history.

The app caches alerts and pending changes by Supabase account. It retries while open and connected. Android queues background alerts under the active account ID and removes a queue entry only after a successful REST upload. Signing out is blocked during monitoring. Login tokens and caches remain on the device, so use a trusted device.

## Build Android

```sh
npm run android:sync
npm run android:open
```

Android Studio can build and install the app on a connected phone. Rebuild and sync after web changes. The installed app uses the production Supabase configuration.

The **Android APK** GitHub Actions workflow also builds a debug APK. Open a successful run, download **MotionAlarm-Android** from Artifacts, and extract the APK. To publish an installation QR code, manually run the workflow with **Publish a test release with an APK download and QR code** selected. The release contains the APK and QR image. Private repositories require GitHub access to download.

These are debug builds. Production releases need a persistent signing key. Uninstalling or clearing app data removes unsynced local records; synced alerts stay in the account.

## Device behavior

- Android monitoring uses the existing foreground service and can continue with the screen locked. Force-stop, reboot, and system service termination can end monitoring.
- Browser monitoring requires a visible page, an awake screen, a supported motion sensor, and a secure origin. Browser monitoring stops when hidden.
- Sound, vibration, background delivery, screen-lock verification, and manufacturer battery restrictions need checks on a real phone.

## Checks

```sh
npm run build
npm run lint
npm test
```

Unit tests exercise authentication, direct REST requests, offline queues, account changes, and the Android bridge. Database tests execute the actual SQL migration in an embedded PostgreSQL engine and enforce ownership, grants, event constraints, and retry behavior. Browser tests use a disposable REST fixture plus installed Chrome at desktop and phone sizes. The fixture is test infrastructure, not a deployed API or an application dependency. Hosted-project verification is separate.

See [validation notes](docs/VALIDATION.md) and the [migration report](docs/supabase-validation.md).
