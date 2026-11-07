# Direct Supabase REST migration

Checked November 7, 2026 (Asia/Manila). The app now calls Supabase Auth and the PostgreSQL Data API directly from Ionic Angular using `fetch()`.

## Completed locally

- PASS: production web build with the supplied project URL and public API configuration. The generated-assets write requires execution outside the Windows sandbox.
- PASS: Capacitor sync copies the final web build and supplied project configuration into the Android assets. A new APK and physical-device checks are separate.
- PASS: 35 Angular unit tests covering direct REST headers and errors, session refresh races, confirmation-required registration, separate account caches, offline queues, native upload acknowledgement, monitoring, and themes.
- PASS: 36 browser scenarios across desktop Chrome and the Pixel 7 profile against the disposable Supabase REST fixture. Coverage includes signup/login, visibility controls, CRUD, account isolation, dates, scrolling, offline retries, sensors, sound, vibration, settings, keyboard use, and both themes.
- PASS: two additional desktop/mobile browser checks cover confirmation-required signup without creating a signed-in session.
- PASS: the actual SQL migration executes in an embedded PostgreSQL engine. Assertions cover row ownership, anonymous access denial, immutable event fields, status constraints, rejected Test events, invalid strengths, receipt rollback, and retries after deletion.
- PASS: ESLint, strict browser-test type checking, and Prettier.
- PASS: old backend packages, application connections, configuration, test helpers, and documentation references are removed. The lockfile no longer contains those packages.
- PASS: light/dark phone and desktop screenshots are visually reviewed after the text removals.
- PASS: the requested home, Settings, and Your account paragraphs are removed. Test alarm, native credential verification, background monitoring, account controls, and theme switching retain their behavior.

The browser fixture models the REST protocol for isolated UI tests. The separate database test runs real PostgreSQL constraints, grants, and row-level policies. Neither establishes that a hosted project has been configured.

## Hosted setup awaiting database access

The user chose fresh accounts and history, leaving previous data untouched, and supplied `https://cluavgnjyejsxwhzjhui.supabase.co` and its publishable key. Development and production environment files are configured for that project. The unrelated PetCare project was not modified.

Live REST checks confirm HTTP 200 from Auth settings using the supplied public key. Email/password signup is enabled and email confirmation is required. Supabase's auth preflight accepts `http://localhost:8103` with the required `apikey` and `content-type` headers. Reading `alerts` currently returns HTTP 404 with `PGRST205`, confirming that the required table has not been deployed. The connected Supabase account reports no permission for this project, so hosted schema application, advisor checks, and authenticated live CRUD verification remain outstanding. The user chose to run the reviewed migration in the project's SQL Editor; subsequent REST verification will follow that manual step.

The reviewed schema is in `supabase/migrations/20261107024658_create_motion_alarm.sql`. It contains explicit grants, RLS ownership checks, a user/date index, immutable event columns, and an upload function with `security invoker`. The generated local configuration requires explicit Data API grants and email confirmation. Existing external data was not modified.

## Delivery gate supplement

- R-02 PASS: the changed product text uses direct instructions without em dashes.
- R-03 PASS: retained browser layout checks cover 320, 393, 620, 768, 1024, and 1440px and short screens.
- R-23 PASS: the change introduces no new visual assets or navigation structure.
- R-24 PASS: monitor, settings, history, login, and sign-out navigation pass browser checks.
- R-25 PASS: existing light/dark text, placeholder, focus, and status tokens are reused.
- R-26 PASS: existing controls remain functional after removing the explanatory text; auth and alert requests use the new REST routes.
- R-27 PASS: registration confirmation, auth failures, offline state, empty history, native failures, and unconfigured accounts have implemented feedback.
- R-32 PASS: visibility controls, focus, dialog Enter/Escape, and keyboard history scrolling pass browser checks.
- R-33 PASS: changes are authored directly in TypeScript, HTML, SCSS, SQL, and test source.
- R-34 PASS: both themes pass the retained browser scenarios.
- R-35 PASS: unit, browser, database, and lint verification are recorded above. Hosted verification is explicitly outstanding.
- R-36 PASS: documentation distinguishes isolated tests, actual PostgreSQL policy tests, hosted setup, and physical-device behavior.
- R-37 PASS: the existing direction and ENERGY 1 / RHYTHM 2 / MOTION 1 are retained in DESIGN.md.
- R-38 PASS: browser test records are confined to a disposable fixture, and database tests use an in-memory engine.

Purpose gate PASS: removal of the requested helper paragraphs simplifies existing screens; existing colors, typography, controls, and structural spacing preserve the documented utility design.

Liveliness PASS: the monitor remains the focal point, green and red retain their monitoring/alert meanings, whitespace separates controls, and no decorative motion is introduced.

Craftsmanship PASS: written design purposes support C-1; exercised controls support C-2; removal of redundant explanations supports C-3; theme, keyboard, responsive, offline, and error checks support C-4; test/hosted distinctions support C-5. The unchanged consistency locks remain covered by the [base UI gate](theme-validation.md).
