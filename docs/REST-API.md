# Supabase REST walkthrough

MotionAlarm sends HTTPS requests directly from Ionic Angular to Supabase using `fetch()`. The app needs only the project URL and a publishable API key. Authenticated data requests also carry the signed-in user's access token.

```text
Ionic page → Angular service → Supabase REST endpoint → PostgreSQL
```

## Authentication

| Method | Endpoint | Body |
| --- | --- | --- |
| GET | `/auth/v1/settings` | Checks that the project allows registration without email confirmation |
| POST | `/auth/v1/signup` | `{ email, password }` |
| POST | `/auth/v1/token?grant_type=password` | `{ email, password }` |
| POST | `/auth/v1/token?grant_type=refresh_token` | `{ refresh_token }` |
| POST | `/auth/v1/logout?scope=local` | No body |

Successful login returns `access_token`, `refresh_token`, `expires_in`, and `user`. The auth service converts these fields to the app's session structure, remembers the session, and refreshes it before expiry. An account change during refresh cannot overwrite a newer login.

Registration accepts email-shaped identifiers such as `demo@example.com` and passwords of 8–48 characters. The app checks that Supabase's **Confirm email** setting is off before sending signup, then saves the session returned by Auth.

The app requests server logout when online and clears the local session. Network failure does not prevent local sign-out. Account caches remain separate, and sign-out is blocked during monitoring.

## Alert CRUD

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/rest/v1/alerts?select=id,created_at,source,status,strength&order=created_at.desc,id.desc&limit=1000&offset=0` | Read a page of the current account's alerts |
| POST | `/rest/v1/rpc/record_movement_alert` | Atomically save an alert and its upload receipt |
| PATCH | `/rest/v1/alerts?id=eq.ALERT_ID` | Change `{ "status": "Reviewed" }` or `{ "status": "New" }` |
| DELETE | `/rest/v1/alerts?id=eq.ALERT_ID` | Delete one alert |
| DELETE | `/rest/v1/alerts?user_id=eq.ACCOUNT_ID` | Clear the current account's history |

The create request body is `{ "p_id": "EVENT_ID", "p_created_at": "ISO_TIMESTAMP", "p_strength": 2.5 }`. Its owner always comes from the validated token through `auth.uid()`. Source and initial status are database defaults. The app cannot use this function to save a Test record.

The upload function and table constraints run in one PostgreSQL transaction. If validation fails, the receipt is also rolled back. If a receipt already exists, retrying has no effect, even when the alert was deleted.

Data API reads return ordinary JSON arrays. The history service converts `created_at` to the UI's `createdAt`, reads subsequent pages when needed, and combines the result with pending local edits. Successful minimal writes can have an empty response body. Error parsing supports Supabase Auth and PostgreSQL/PostgREST error shapes.

## Follow a review button

1. The history page calls `toggleStatus(alert)`.
2. The history service updates its local cache and queues the status change.
3. The auth service supplies a valid access token.
4. `ApiService.request()` sends a PATCH to the alert's REST URL with `apikey` and `Authorization: Bearer ACCESS_TOKEN` headers.
5. PostgreSQL checks grants, the user's row-level policy, and the status constraint.
6. After success, the app removes the queued change and refreshes the list.

Offline changes remain queued. Returning online retries them in order. Native background events are acknowledged only after their upload succeeds.

## Database access

The migration enables RLS on both public tables and explicitly grants the minimum operations used by the app. Each row must belong to `auth.uid()`. Authenticated users can update only the status column. Anonymous users cannot read or write alerts or receipts. The upload function uses `security invoker`, so it cannot bypass those account policies.

Use the public publishable key in client configuration. Administrative credentials are not used by this app. Apply and verify the migration before connecting a hosted project.

## Run and verify

```sh
npm start
npm run test:database
npm run test:unit
npm run test:e2e
```

The browser fixture is isolated at `http://127.0.0.1:54321`; the browser app runs on port 4201 with `environment.e2e.ts`. It tests REST request behavior without sending test accounts to a hosted project. The database test separately executes the migration and real PostgreSQL permissions. Neither test replaces checking the selected hosted project's configuration and deployed policies.

References: [Supabase REST API](https://supabase.com/docs/guides/api), [database access and grants](https://supabase.com/docs/guides/api/securing-your-api), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
