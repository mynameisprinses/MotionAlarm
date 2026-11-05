# MotionAlarm verification

For the November 5, 2026 light/dark appearance update, see [theme-validation.md](theme-validation.md). The report below records the earlier application verification.

Verified on November 2, 2026 (Asia/Manila).

## Build and behavior

- PASS: production Angular build completed with no budget warnings or errors.
- PASS: ESLint, strict browser-test type checking, and Prettier checks passed.
- PASS: twelve unit tests passed, including native start/stop, activity destruction, background-state restoration, permission errors, Android-owned history, pending disarm verification, duplicate requests, cancellation, and retry.
- PASS: all 30 browser scenarios passed in one complete run across desktop Chrome and a Pixel 7 browser profile. Settings navigation, shared controls, local-calendar date filtering, status filtering, keyboard scrolling, alarm feedback, CRUD persistence, and responsive layout are included.
- PASS: the production web build was copied into the Android project with Capacitor sync. Android notification, foreground-service, wake-lock, vibration, and normal biometric-prompt permissions are declared.
- PASS: native Java compilation completed against Android API 36 with Java 21.
- PASS: `assembleDebug` and `lintDebug` completed successfully with the screen-lock verification and notification changes. The updated `android/app/build/outputs/apk/debug/app-debug.apk` is 4,615,021 bytes. Its packaged monitor, history, and Settings bundles match the current production web build.
- PASS: `apksigner verify --verbose` verified the updated APK's v2 signature. Manifest/source review confirms the foreground service, screen-lock prompt permission, and removal of the notification Stop PendingIntent and action. Remaining native lint warnings concern starter resources, manifest ordering, and available dependency updates.
- PASS: browser tests capture JavaScript exceptions and console errors; successful scenarios reported none.

Browser tests simulate accelerometer events and observe browser sound/vibration calls. Angular native-bridge tests use a fake plugin, including pending and canceled credential verification. Native code is compiled and linted locally. The actual Android credential dialog, correct/incorrect credentials, cancellation, no-screen-lock behavior, physical audio/vibration, screen-off sensor delivery, lock-screen notification appearance, and manufacturer battery restrictions still require an Android phone. The sandboxed ADB device-discovery attempt could not connect to its local server, so no physical-device success is claimed.

## Screen-lock stop review

- CODE INSPECTED: the notification has no `addAction()` or Stop PendingIntent. Tapping its content opens the app.
- CODE INSPECTED: `stop()` checks `isDeviceSecure()`. A device with no secure screen lock stops immediately; an unavailable check fails without stopping.
- CODE INSPECTED: Android 11+ allows only `DEVICE_CREDENTIAL` in the system prompt. Android 7-10 use Android's older credential-confirmation activity, whose available methods are controlled by the OS.
- CODE INSPECTED: only successful system verification stops a secured session. Canceling, errors, and activity destruction do not call the session's stop method.
- CODE INSPECTED: repeated requests are rejected, and successful verification is tied to the session ID so an old confirmation cannot stop a new session.
- CODE INSPECTED: the app never receives or stores the user's PIN, pattern, or password. Android's force-stop, reboot, and service-management controls remain available.

## Beginner readability

- PASS: the long monitoring function is split into named Android, browser-access, countdown, movement, and alarm steps. These remain ordinary class methods.
- PASS: CRUD status changes and saved-alert validation use explicit `if/else` blocks. Filtering and deletion use loops and array operations; the app logic has no RxJS pipelines or `map`/`filter`/`reduce` chains.
- PASS: Android state reading, storage writes, countdown arithmetic, notification setup, and audio-focus decisions use explicit sequential statements and named intermediate values.
- PASS: the app still uses plain shared services, arrays, variables, named functions, and explicit conditions. Android authentication uses the platform callbacks required for a system credential prompt.
- PASS: the README includes a reading order and explains `async/await`, callbacks, and the Android background code. Platform lifecycle, permission, wake-lock, and audio-focus handling remain because the background feature depends on them.

## Control checks

| Control | Verified result |
| --- | --- |
| Motion alarm start | Requests permission where required, counts down, and monitors only after valid sensor readings |
| Motion alarm stop | Stops the browser alarm; Android requests screen-lock verification if configured before stopping |
| Pending/canceled verification | Mocked native calls keep the current state active, reject duplicate requests, preserve cancellation feedback, and allow a retry; actual device dialog remains untested |
| Android notification | Opens the app and has no app-provided Stop button; source removal is compiled, physical notification appearance remains untested |
| Settings icon / Back | Opens `/settings` from the top gear and returns to the monitor |
| Settings while active | Sensitivity and feedback controls are disabled during monitoring |
| Movement sensitivity | Selecting High triggers on a smaller simulated movement; threshold options are numeric |
| Vibrate on alert | Enabled produces one vibration call; disabled produces none |
| Sound on alert | Enabled starts the browser oscillator; disabled starts none; Motion alarm stop ends browser playback |
| Create test alert | Creates an explicitly labeled Test entry and previews sound for two seconds when enabled |
| All alerts / New / Reviewed | Shows the matching records and a useful empty state |
| History date / Today / All dates | Defaults to the local day; changing dates combines with status filters; Today resets and All dates includes older records |
| History scrolling | A long list scrolls independently; focusing it and pressing End makes the last row reachable |
| Mark reviewed / Mark new | Updates status, counts, filters, and saved history |
| Delete: Cancel / Delete | Cancel retains the entry; confirmation deletes it |
| Clear history: Cancel / Clear history | Cancel retains entries; confirmation clears saved history |
| Reload | Restores saved alerts and statuses; deleted history stays deleted |
| View alert history | Opens `/alert-history`; history controls are absent from the home page |
| Back to monitor | Returns to `/home`, with a fallback that works after opening history directly or reloading it |
| Go to monitor | Empty history links to the monitor, where creating a test alert makes it available on the history page |
| Monitor while viewing history | A simulated movement creates a visible history entry, keeps sound active, and returns to Motion alarm stop with Back |
| Keyboard | Enter opens a delete dialog; Escape dismisses it without deleting |

## Failure checks

- PASS: missing sensor readings return to idle with an actionable message.
- PASS: denied motion permission displays an error and leaves the arm control available.
- PASS: unsupported sensor APIs leave the manual test feature usable.
- PASS: repeated motion events create one alert and one vibration per arming session.
- PASS: rearming uses a new resting baseline without duplicating the existing alert.
- PASS: leaving the visible browser page stops browser monitoring and sound.
- PASS: native-bridge tests verify that hiding or destroying the Angular page does not call Android Stop, and reopening restores background-created alerts and the service's active settings.
- PASS: unreadable saved history is preserved until explicitly cleared.
- PASS: storage write failure keeps the alert visible and explains that it is only in memory.
- PASS: navigating to history preserves alerts kept only in memory after storage errors; clearing history and then creating another alert does not restore deleted logs.

## Anti Slop delivery gate

The user's direction is a light interface with green monitoring and red alerts. Design decisions and their purposes are recorded in `DESIGN.md`.

| Rule | Result and evidence |
| --- | --- |
| R-01 Color | PASS: green identifies arming/monitoring and red identifies alerts/deletion; no decorative gradients |
| R-02 Copy | PASS: authored UI, source, and documentation were checked for em dashes |
| R-03 Mobile | PASS: no horizontal overflow at 320, 393, 620, 768, 919, 1024, and 1440px; control bounds are at least 44px in both dimensions |
| R-04 Icons | PASS: existing Ionicons identify monitor state, movement, a phone, and empty history; no custom logo was invented |
| R-05 Structure | PASS: monitor, Settings, and history each have a route; Settings reflow at tablet widths; history has date/status controls above a bounded list |
| R-06 Typography | PASS: system font chosen for familiar phone controls and no font download |
| R-07 Background | PASS: plain light background separates the white controls without decorative patterns |
| R-08 Arrows | PASS: buttons use direct action labels without decorative arrows |
| R-09 Badges | PASS: labels show actual alert status and the real count |
| R-10 Glass | PASS: no glass effects |
| R-11 Radius | PASS: consistent panel corners, smaller control corners, and compact status labels |
| R-12 Shadow | PASS: panels use borders; button shadows are disabled |
| R-13 Glow | PASS: no glows |
| R-14 Cards | PASS: monitor and Settings serve different tasks; history uses rows with independent scrolling |
| R-15 Actions | PASS: Motion alarm start, Motion alarm stop, Today, All dates, Create test alert, Mark reviewed, Delete, and Clear history describe their actions |
| R-16 Language | PASS: product copy describes sensor, vibration, and local history behavior |
| R-17 Numbers | PASS: counts come from the alert array; countdown and thresholds are actual application values |
| R-18 Testimonials | PASS: no testimonials |
| R-19 Motion | PASS: no decorative animation; countdown communicates time to place the phone down |
| R-20 Identity | PASS: the monitor state is the focal point; green/red state colors and movement readings fit the phone utility |
| R-21 Theme | PASS: fixed light theme follows the user's explicit selection |
| R-22 Illustration | PASS: no generic illustrations |
| R-23 Assets | PASS: product name is text; status symbols use existing icons; the Android notification uses the system alarm icon; native launcher artwork remains the starter default |
| R-24 Navigation | PASS: history and Settings links open implemented routes; Back and the empty-state link reach the monitor; direct history entry and reloading also work |
| R-25 Contrast | PASS: main text 14.19:1, secondary text 5.17:1, primary button 7.09:1, danger button 6.44:1, New status 6.57:1, Reviewed status 7.25:1 |
| R-26 Interaction | PASS: each control has a tested action, as listed above |
| R-27 States | PASS: explicit loading markup plus exercised empty, error, countdown, armed, and alert states |
| R-28 FAQ | PASS: no FAQ |
| R-29 Palette | PASS: green and red state colors with neutral surfaces and text |
| R-30 Originality | PASS: content-led phone utility layout; no named product design was copied |
| R-31 Purpose | PASS: palette, layout, typography, spacing, panels, icons, and motion purposes are recorded in `DESIGN.md` |
| R-32 Keyboard | PASS: semantic controls and visible focus styles; dialog Enter/Escape behavior tested |
| R-33 Source edits | PASS: app features were authored directly in TypeScript, HTML, and SCSS |
| R-34 Themes | PASS: only the selected light theme ships; system dark styles are removed |
| R-35 Verification | PASS: current web build, lint, twelve unit tests, all 30 browser tests, Capacitor sync, native compilation, APK assembly, Android lint, all three packaged page comparisons, APK signature verification, and six desktop/mobile screenshot inspections completed; physical-device credential checks remain explicitly outstanding |
| R-36 Claims | PASS: Android service behavior and system-stop limits are explicit; browser previews require a visible page; no promise of monitoring after force-stop or reboot |
| R-37 Direction | PASS: user selected the light/green/red direction before UI implementation |
| R-38 Content | PASS: all displayed records are actual app entries; manually created records are explicitly labeled Test |

PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 is declared and reflected in the calm monitor, varied setup/history composition, and functional countdown.

PASS: craftsmanship checks C-1 through C-5 are supported by the written design purposes, tested controls, task-based composition, responsive/error-state checks, and actual application data.

PASS: all six desktop/mobile screenshots of the monitor, history, and Settings were visually inspected. Browser layout checks cover 320, 393, 620, 768, 919, 1024, and 1440px with no horizontal overflow and visible controls at least 44px in both dimensions. Ionic's hidden form inputs are excluded from touch-target measurements. The long-history scenario confirms that scrolling reaches the last record, and the date scenario includes local 00:30 timestamps to exercise local-calendar filtering.

## Dependency note

The downloaded starter's build tooling was updated to `@angular/build` 22.2.5, which resolves to Vite 8.3.5, after its initial audit flagged the older Vite version. The initial audit also reported moderate advisories in development-tool dependency trees, including ESLint and Capacitor CLI. These require upstream dependency updates; they are not fixed by the application code.
