# MotionAlarm REST API

```text
Ionic app → Express REST API → Firebase Authentication / Firestore REST APIs
```

The app sends JSON using `fetch()`. It no longer imports Firebase's JavaScript SDK. Firebase still checks each user's token and applies `firestore.rules`.

## Run locally

Open two terminals in the project folder:

```sh
# Terminal 1: API on port 3000
npm run api
```

```sh
# Terminal 2: Ionic/Angular on port 4200
npm start
```

Open `http://localhost:4200`. Check the server at `http://localhost:3000/api/health`.

Your project ID and public Web API key are already in `api/config.mjs`. Enable Email/Password authentication, create the default Firestore database, and publish `firestore.rules` in Firebase Console. No service-account key or Google password is needed. Optional overrides can be copied from `api/.env.example` to the Git-ignored `api/.env`.

## Files to read

| File | What to learn from it |
| --- | --- |
| `api/app.mjs` | The HTTP routes, input checks, and JSON responses |
| `api/firebase.mjs` | Small functions that call Firebase and translate its document format |
| `api/config.mjs` | Project configuration and allowed browser origins |
| `api/server.mjs` | Starting and stopping the HTTP server |
| `src/app/api/api-request.ts` | The app's one HTTP helper, `ApiService.request()` |
| `src/app/auth/auth.service.ts` | Login, registration, saved sessions, and token refresh |
| `src/app/alert-history/alert-history.service.ts` | Local history, offline changes, and calls to the alert routes |

There is no controller/repository framework or generated API layer. Start with one route in `app.mjs`, then follow its function into `firebase.mjs`.

## Routes

All paths start with `/api`.

| Method | Path | Request / purpose |
| --- | --- | --- |
| GET | `/health` | Check the server |
| POST | `/auth/register` | `{ email, password }` |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/refresh` | `{ refreshToken }` |
| POST | `/auth/password-reset` | `{ email }` |
| GET | `/auth/me` | Read the verified current user |
| GET | `/alerts` | Read the current user's alerts |
| POST | `/alerts` | Save a new movement alert |
| PATCH | `/alerts/:id` | `{ status: "New" }` or `{ status: "Reviewed" }` |
| DELETE | `/alerts/:id` | Delete one alert |
| DELETE | `/alerts` | Clear account history |

Register, login, and refresh return a session containing `user: { uid, email }`, `idToken`, `refreshToken`, and `expiresAt` in milliseconds. Keep actual tokens private. Protected requests send:

```http
Authorization: Bearer YOUR_ID_TOKEN
```

The server checks that token with Firebase Authentication and gets the user ID from the verified response. The request cannot choose another person's ID. The same token goes to Firestore, so its security rules also apply. The API has no administrator credential that bypasses those rules.

`POST /alerts` accepts exactly these fields:

```json
{
  "id": "a-stable-unique-id",
  "createdAt": "2026-11-04T08:00:00.000Z",
  "source": "Movement",
  "status": "New",
  "strength": 2.5
}
```

It returns HTTP 201 and `{ "id": "a-stable-unique-id" }`. Retrying the same ID does not duplicate an alert. A receipt at `users/{uid}/imports/{id}` also prevents a retry from overwriting a review or recreating a deleted event. Receipts contain only the event ID and remain after history is cleared. Test events are rejected with HTTP 400.

`GET /alerts` returns `{ "alerts": [...] }`. Successful deletes return HTTP 204 without a body. Errors return `{ "error": { "code": "...", "message": "..." } }`. Invalid input returns 400; invalid login returns 401; denied Firestore access returns 403; an unavailable Firebase service returns 503.

## Follow a button click

For **Mark reviewed**:

1. The page calls `history.toggleStatus(alert)`.
2. The history service updates the local list and queues a PATCH request.
3. `auth.getToken(uid)` supplies a token, refreshing it if needed.
4. `ApiService.request()` sends `PATCH /api/alerts/the-id` with the status and bearer token.
5. Express verifies the login and calls `updateAlert()`.
6. Firebase checks the rules and saves the status.
7. The app removes the acknowledged change from its queue and reloads history.

## Offline and sign-out

Each account has its own local cache and queue. New alerts, reviews, and deletions update the screen immediately and sync in order. Failed requests stay queued. The app refreshes every five seconds while visible, when a page opens, and when the connection returns.

Android keeps its account-specific native queue for background movement. A native entry is removed only after the API accepts it. Test alarms never enter either queue.

Sign-out clears the local login tokens; it needs no API request because there is no separate server session. Issued Firebase ID tokens expire on their normal schedule. Stop an active alarm before signing out. Use a trusted device because login tokens and cached alerts are saved locally.

The old SDK's IndexedDB cache is not migrated. Synced alerts remain in Firestore. Before upgrading an older installation, reconnect it so any still-pending SDK writes can finish.

## Installed Android app

The phone needs a reachable HTTPS API. `localhost` on a phone refers to the phone itself.

1. Host this project on a Node service with HTTPS and start it with `npm run api`.
2. Set `ALLOWED_ORIGINS` to your hosted web app's origin and the installed app's origin, typically `https://localhost` for Capacitor Android.
3. Set `apiBaseUrl` in `src/environments/environment.prod.ts` to the full hosted HTTPS URL ending in `/api`.
4. Run `npm run android:sync`, then rebuild/install the app.

The production URL is empty until you have a real host. No hosting or Firebase rules deployment has been performed automatically.

## Tests

```sh
npm run test:unit
npm run test:e2e
```

The second command needs Java 21 or newer. It starts local Auth/Firestore emulators, checks the rules, exercises the REST routes, then runs desktop/phone browser checks. Everything uses `demo-motion-alarm`. The test API refuses to start without a demo project and both emulators.
