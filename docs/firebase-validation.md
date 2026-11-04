# Firebase integration validation

Checked on November 4, 2026. Scope: the account flow, REST API, Firestore history, unsaved alarm tests, and Android upload bridge. The current architecture is Ionic → Express REST API → Firebase REST APIs.

## Verification

- PASS: Production build and `cap sync android` completed through `npm run android:sync`.
- PASS: `npm run lint` completed, including ESLint, browser-test type checking, and Prettier checks. `git diff --check` reported no whitespace errors.
- PASS: 22 unit tests across five files. These cover native monitoring, REST calls, account-specific offline queues, preserving the queue during token refresh, rejecting stale responses after logout, native upload retries, shared token refresh requests, expired sessions, and account switching during refresh.
- PASS: Four REST integration tests against the local Firebase emulators. These cover registration/login/password reset/token refresh, alert CRUD, duplicate upload retries, preserving deletions, input validation, forged/missing tokens, and account isolation. The final API rerun passed all four.
- PASS: Four Firestore emulator security tests. Owners can perform CRUD; other accounts and anonymous users are denied; malformed and Test events are rejected; native import receipts are private and immutable.
- PASS: All 26 Playwright checks have passed on Desktop Chrome and Mobile Chrome. The final targeted rerun passed the four history CRUD/offline cases after their dialog-wait and status selectors were adjusted. Coverage includes account flows, account isolation, CRUD/filtering, offline reconnect, movement recording, unsaved tests, settings, keyboard input, responsive layouts, and short-screen scrolling.
- PASS: Tests use `demo-motion-alarm`, local Auth/Firestore emulators, and a separate test REST API. The test API refuses to start without a demo project and both emulators. The frontend has no Firebase SDK imports or Firebase endpoint calls.

## Design delivery gate

- R-02 PASS: New account and history copy uses ordinary punctuation without em dashes.
- R-03 PASS: Browser checks found no horizontal overflow at 320, 393, 620, 768, 1024, and 1440px; phone landscape and short-screen content remained reachable.
- R-17/R-18 PASS: No statistics or testimonials were introduced.
- R-23/R-24 PASS: Account navigation implements the requested login/register flow; all links resolve to existing routes. No generated visual assets were introduced.
- R-25 PASS: Calculated contrast is 5.52:1 for muted text on white, 7.09:1 for white on the green action, and 7.51:1 for error text on its light red surface. The existing theme is retained.
- R-26 PASS: Account and history controls call the REST API; test feedback uses the existing sound/vibration helpers without saving; Retry sync retries the queue and reloads account history. Failed upload retries and offline queue ordering are covered by unit tests.
- R-27 PASS: Login has submitting, validation, and request-error states. History has loading, empty, cached, offline, pending, and read-error states.
- R-28 PASS: No FAQ was introduced.
- R-32 PASS: Browser tests exercised keyboard form input, focus, dialog opening, and Escape dismissal; inputs and account buttons have visible focus styling.
- R-33 PASS: Features were written in their TypeScript, HTML, SCSS, Java, and rules source files.
- R-34 PASS: The fixed light theme follows the existing user-selected direction; no theme switch was introduced.
- R-35 PASS: The app was built, the account/history flows were exercised in browser tests, and the native bridge was checked with unit tests.
- R-36/R-38 PASS: No performance, customer, or compliance claims were introduced. Sync messages distinguish cached and pending data from acknowledged writes.
- R-37 PASS: The existing `DESIGN.md` supplies the light utility direction. ENERGY 1 / RHYTHM 2 / MOTION 1 are retained.
- Purpose gate PASS: No gradients, glow, illustrations, decorative patterns, or new icon system were added. The system font, green primary action, separate account panel, and compact form follow the reasons recorded in `DESIGN.md`.
- Liveliness gate PASS: The current form action is the focal point; field groups and account tabs establish hierarchy; green is the deliberate action accent; no decorative motion was added.
- Craftsmanship/quality locks PASS: Account content determines the layout, controls have real behavior, mobile/keyboard states are exercised, and the existing palette, type, spacing, and panel radii are retained.

## Remaining project setup

The Firebase CLI has no authorized account, so production rules were not deployed. Enable Email/Password, create the default Firestore Standard database, and publish `firestore.rules`. The API already has the public project configuration. Development uses a local API; an installed app requires a hosted HTTPS API and its URL in `src/environments/environment.prod.ts`. Hosting has not been deployed. The API uses user tokens and does not need a service-account private key.

No production users or test alerts were created during validation. Native Java source and Capacitor assets are updated, but an APK build and physical-device check were not performed. Historical account-free records and the older SDK's IndexedDB cache are not automatically migrated. Synced alerts remain in Firestore; an older installation should reconnect before upgrading if it has pending SDK writes. See `REST-API.md` for the beginner walkthrough and deployment steps.
