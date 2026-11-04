# MotionAlarm

A beginner-friendly phone movement alarm built from the **Ionic Angular blank standalone** starter. It uses Angular 22, Ionic 9, and Capacitor 8.

## Run it

Dependencies are already installed in this workspace. Start the REST API in one terminal:

```sh
npm run api
```

Start the app in a second terminal:

```sh
npm start
```

Open `http://localhost:4200`. You can also use `ionic serve` if you have the Ionic CLI installed.

The app now connects through **Ionic → Express REST API → Firebase**. Read the [beginner REST walkthrough](docs/REST-API.md) for the route table, a button-to-database example, and phone deployment steps.

For a fresh checkout, run `npm install` first. Use Node.js 24.15 or newer in the Node 24 release line, or another version supported by Angular 22.

## Try the features

Log in or register with an email and password first. Each account has its own movement alerts. Password resets are available from the login page.

1. Tap **Motion alarm start**, allow notifications on Android (or motion access in a browser), and put the phone down during the five-second countdown.
2. Wait for **Watching for movement**. Lift, tilt, or move the phone enough to pass the selected sensitivity.
3. The app rings until stopped if **Sound on alert** is enabled, vibrates for one second if vibration is enabled, and saves a movement alert. Android uses the phone's default alarm tone and alarm volume.
4. Tap **Motion alarm stop** inside the app. Android asks for the phone's screen-lock verification if a PIN, pattern, or password is set. With no screen lock, it stops immediately. Canceling verification leaves the session running. Notifications have no Stop button.
5. Tap **View alert history** to open the scrollable history page. Its date filter defaults to today on the phone. Choose another date, **Today**, or **All dates**, and combine that with New/Reviewed status filters. The Back button returns to the monitor.
6. **Delete** removes one log after confirmation. **Clear history** removes all logs after confirmation.
7. Tap the **Settings gear** at the top to change sensitivity, vibration, or sound. Controls are disabled while monitoring. The selected values remain available while navigating between pages.

On a computer, use **Test alarm** to preview sound and vibration without an accelerometer. Tests never create history records, locally or in Firestore.

## Firebase setup

The public project configuration for `motionalarm-560cd` is in `api/config.mjs`. The app only needs an API URL. Development uses `http://localhost:3000/api`; set your hosted HTTPS URL in `src/environments/environment.prod.ts` before building the installed app. Analytics is not initialized. No service-account key is needed.

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
2. Create the default **Cloud Firestore Standard edition** database.
3. Publish the contents of `firestore.rules` in **Firestore Database → Rules**, or run `npx firebase login` followed by `npx firebase deploy --only firestore:rules --project motionalarm-560cd` from this directory.

Alerts live at `users/{uid}/alerts/{alertId}`. The API verifies the login with Firebase Authentication, then forwards the user's token to Firestore. Rules restrict access to the signed-in owner and reject Test records, malformed events, and edits to event details. Upload receipts live at `users/{uid}/imports/{alertId}` so retrying an upload cannot recreate a deleted alert. Receipts contain only the event ID and remain after history is cleared.

The app keeps a separate local cache and offline change queue for each account. It sends changes through REST and refreshes history every five seconds while visible. Android first queues background movement under the signed-in user's ID, then uploads it when open and connected. Queue entries are removed only after the API acknowledges them. Use a trusted device because login tokens and cached alerts remain locally. Signing out clears the visible history and is blocked during an active alarm.

Existing history from the earlier account-free version is not automatically assigned to whichever person logs in first. It is left in the old local storage. New account history comes from Firestore and the current user's Android queue.

## Where to read the code

| File | Purpose |
| --- | --- |
| `src/app/home/home.page.ts` | Monitoring controls, motion sensor, sound, and vibration |
| `src/app/alert-history/alert-history.page.ts` | Separate history page, filters, and confirmation dialogs |
| `src/app/alert-history/alert-history.service.ts` | Shared alert array, storage, and CRUD functions used by both pages |
| `src/app/alert-history/alert-history.page.html` | Alert list, status controls, and Back navigation |
| `src/app/app.routes.ts` | Routes for `/home`, `/alert-history`, and `/settings` |
| `src/app/settings/settings.page.ts` | Separate Settings page and Android state refresh |
| `src/app/settings/alarm-settings.service.ts` | Shared settings and current monitoring state, using plain variables |
| `src/app/home/movement-alert.ts` | The fields stored in each alert |
| `src/app/home/alarm-sound.ts` | Browser alarm tone and sound cleanup |
| `src/app/home/native-alarm.ts` | Typed bridge between Angular and the Android plugin |
| `src/app/home/home.page.html` | Ionic controls and Angular conditions/loops |
| `src/app/home/home.page.scss` | Page layout, including phone and tablet layouts |
| `src/theme/variables.scss` | Light theme, green controls, and red alerts |
| `capacitor.config.ts` | Native app name and app ID |
| `android/` | Generated Android project |
| `android/app/src/main/java/com/motionalarm/app/MotionAlarmService.java` | Native background sensor, countdown, notification, vibration, and alarm |
| `android/app/src/main/java/com/motionalarm/app/MotionAlarmPlugin.java` | Native methods called by the Ionic page, notification permission, and screen updates |
| `android/app/src/main/java/com/motionalarm/app/AlertStore.java` | Android alert CRUD and persistent storage |
| `android/app/src/main/java/com/motionalarm/app/AlarmSound.java` | Android alarm sound playback and audio focus |

## Beginner walkthrough

The pages use ordinary variables and functions. Shared authentication and history use Angular signals so HTTP replies and offline changes update the screen. REST routes are plain Express functions, with Firebase requests in one helper file. Monitoring and browser sound stay in the home page and sound helper. Android background work needs a native Java service because a hidden WebView cannot reliably keep JavaScript timers and motion events running.

`routerLink="/alert-history"` opens the history page without reloading the app. Ionic keeps the monitor page in memory, so moving between these pages preserves the monitoring session. The history page uses `ionViewWillEnter()` to refresh Android logs whenever it opens, including when Ionic reuses the page. Browser alerts stay in the shared service, so going back does not restore deleted logs or lose alerts that could not be saved.

### Follow the code step by step

Monitoring functions perform actions in order. The history page filters by date and status, while its service sends REST requests. One shared list updates both pages. The API saves events and receipts atomically so retries cannot overwrite an already processed event. The [REST walkthrough](docs/REST-API.md) follows one review button click through every file.

Start with `startMonitoring()` in `home.page.ts`. It chooses one of two paths:

- Android: `startAndroidMonitoring()` sends the settings to the native service and reads its state.
- Browser: `startBrowserMonitoring()` requests access, attaches the sensor, and calls `startCountdown()`.

`updateCountdown()` subtracts one second on each tick. `checkMovement()` calculates the change in acceleration. If movement reaches the threshold, `triggerBrowserAlarm()` creates one alert and starts the selected feedback. Android performs those same actions in `MotionAlarmService`.

Read `AlertHistoryService` next for CRUD, then `AlertHistoryPage` for filters and confirmation dialogs. Both pages share one service so they see the same alerts.

`async/await` waits for permissions, storage, and device operations. The small functions passed to sensor listeners and timers are callbacks: the phone calls them when a reading arrives or time passes. `requestBrowserAccess()` starts motion and audio requests together before awaiting them because phones require those requests to begin during the button tap.

The Android service, notification permissions, wake lock, and audio-focus handling are more advanced platform code. They are kept in separate Java files because monitoring after the screen closes needs Android to run the sensor and sound. Removing those parts would remove the background feature.

### Android background monitoring

On Android, `startMonitoring()` calls the local `MotionAlarm` Capacitor plugin. The plugin requests notification permission and starts `MotionAlarmService`. The service owns the five-second countdown, accelerometer listener, sound, vibration, and notification independently of the Angular screen.

After starting, it continues when you press Home, lock the screen, or remove the activity from Recents on devices that allow the foreground service to remain running. Its notification opens MotionAlarm and contains no Stop action, including on the lock screen. Closing the Angular page only disconnects its listener; it does not stop the Android service.

### Screen-lock verification when stopping

The native `stop()` method checks `KeyguardManager.isDeviceSecure()`. If no PIN, pattern, or password is configured, it stops immediately. Otherwise Android handles verification before the service is stopped. The app never asks for, reads, or stores the lock-screen credential in an HTML form.

Android 11 and newer use the system `BiometricPrompt` with only `DEVICE_CREDENTIAL` allowed, which requests the device PIN, pattern, or password. Android 7 through 10 use the older system credential-confirmation activity; the exact verification options are controlled by Android. Cancellation, errors, closing the app, and duplicate stop requests do not authorize stopping. A confirmation is bound to the current monitoring session and cannot stop a later session.

This applies to stopping during the countdown, while monitoring, and while the alarm rings. The browser preview cannot verify the phone's screen lock. Android's own force-stop, active-apps Stop, reboot, and battery controls remain outside this app's verification flow.

References: [Android device-secure detection and legacy confirmation](https://developer.android.com/reference/android/app/KeyguardManager), [allowed authenticators](https://developer.android.com/reference/android/hardware/biometrics/BiometricPrompt.Builder#setAllowedAuthenticators(int)), and [Capacitor activity-result callbacks](https://capacitorjs.com/docs/plugins/android#intents-with-results).

The service uses a partial wake lock while monitoring so a non-wakeup accelerometer can keep delivering events with the screen off. This uses extra battery. The lock, sensor listener, audio, vibration, and notification are cleaned up when the session stops.

Android can still stop the service because of device-specific battery restrictions or memory pressure. **Force stop**, the Android active-apps **Stop** control, and a phone reboot end monitoring. This version respects those stops and does not automatically restart. You must open the app and arm it again.

Android queues movement alerts in account-specific app-private `SharedPreferences` through `AlertStore`, including while the page is closed. Reopening the app syncs the current user's queue to Firestore and restores the native service state. The background service does not depend on JavaScript being active to detect movement or sound the alarm.

### Alarm sound

The native `AlarmSound` helper plays the phone's default alarm tone in a loop using the alarm audio stream. It requests audio focus and pauses or stops if another audio source takes focus. Alarm volume, Do Not Disturb settings, audio routing, and device behavior can affect audibility; this app does not change those settings.

The browser helper generates an alternating tone with the Web Audio API. Audio is unlocked from the start or **Test alarm** button tap. Real movement alarms ring until **Motion alarm stop**; tests preview the sound for two seconds without saving an alert. Switching off **Sound on alert** keeps motion logging and the independent vibration setting available.

### Motion detection

In a browser, `startMonitoring()` asks for motion permission where necessary, attaches the Capacitor Motion listener, and starts the countdown. Android performs the same calculation inside `MotionAlarmService.onSensorChanged()`. Both paths only arm if actual sensor readings have arrived.

During the countdown, `checkMovement()` remembers the current X, Y, and Z readings as the resting baseline. Once armed, it compares new readings against that fixed baseline:

```ts
const x = sample.x - this.baselineX;
const y = sample.y - this.baselineY;
const z = sample.z - this.baselineZ;
this.strength = Math.sqrt(x * x + y * y + z * z);
```

If `strength >= threshold`, the monitor changes to the alert state, creates a log, and starts the enabled sound and vibration feedback. Using the gravity-inclusive readings also lets tilting change the measured level. The values are changes in acceleration, measured in m/s², not a distance measurement.

The three sensitivity thresholds are `0.9` (high), `1.8` (balanced), and `3.2` (low). A lower threshold catches a smaller change. You can adjust these numbers in the HTML options after testing your phone.

The page creates **one movement alert per arming session**. Changing state before creating the alert prevents repeated sensor events, including vibration from the phone itself, from filling the history.

Angular's starter uses zoneless change detection. `changeDetector.markForCheck()` tells Angular to refresh the screen after sensor events and timer callbacks.

The app shell and routed pages use `ChangeDetectionStrategy.Eager` so these refreshes also show shared data changes while Ionic keeps the monitor page in memory. This follows [Ionic's guidance for pages using plain fields on Angular 22](https://ionicframework.com/docs/angular/lifecycle). The ESLint configuration allows this strategy for the outlet shell and routed pages. The CRUD code still uses ordinary arrays and variables.

### CRUD

| Operation | Function | What it does |
| --- | --- | --- |
| Create | `createAlert()` | Queues a movement alert and sends `POST /api/alerts` |
| Read | `refresh()` | Sends queued changes and loads `GET /api/alerts` |
| Read/filter | `visibleAlerts` | Uses a `for` loop to build the list for the selected filter |
| Update | `toggleStatus()` | Changes `New` to `Reviewed`, or back again |
| Delete | `deleteAlert()` | Sends `DELETE /api/alerts/:id` after confirmation |
| Delete all | `clearHistory()` | Deletes the account's saved alerts in batches after confirmation |

`AlertHistoryService` uses REST for alert CRUD and refreshes the shared list every five seconds while the app is visible. Android queues background events before syncing through the same API. The page supplies date/status filters and confirmation dialogs. Deleting or clearing affects the account on all devices. Settings reset after a reload unless an Android session is still running, in which case its active settings are restored.

Offline changes stay in the app's account-specific queue until connected. Pending Android events remain on the phone until successfully uploaded. History shows cached/pending/offline state, failures, and Retry sync. Clear history requires a connection and waits for pending changes. The previous SDK's IndexedDB cache is not migrated; reconnect an old installation before upgrading to finish any still-pending SDK writes.

## Run on Android

The Android project has already been added. Install Android Studio and its required SDK/JDK, then run:

```sh
npm run android:sync
npm run android:open
```

Use Android Studio to choose a connected phone and run the app. Repeat `npm run android:sync` after changing the web code so the installed app gets the new build.

On macOS, you can add iOS later with `npm install @capacitor/ios`, `npx cap add ios`, `npm run build`, and `npx cap sync ios`, then open the project in Xcode with `npx cap open ios`.

## Build an Android APK with GitHub Actions

The workflow is in `.github/workflows/android.yml`. It builds on pushes and pull requests to `master` or `main`, and you can also run it manually. It sets up Node.js 24, Java 21, Android command-line tools, and Android SDK 36 on GitHub's Ubuntu 24.04 runner, so Android Studio is not needed on your computer.

Commit and push the workflow along with the project. Include `package-lock.json` and the `android` folder, including the Gradle wrapper JAR. If you already created GitHub's sample `CI` workflow, replace it with this workflow or remove that sample to avoid an extra run that only prints messages.

### Download the APK

1. Open your repository on GitHub and select **Actions**.
2. Choose **Android APK**, then open a successful run.
3. Under **Artifacts**, download **MotionAlarm-Android**.
4. Extract the ZIP and copy **MotionAlarm.apk** to your Android phone.
5. Open the APK and approve installation from the app you used to download it.

Artifacts are kept for seven days and require a GitHub login to download.

### Publish a QR code for installation

GitHub Actions is not required to create a QR code. A QR code contains a download URL; the APK must first be built and available at that URL. This workflow can do both the build and the QR generation.

1. Make sure the workflow is committed on your repository's default branch, so the **Run workflow** button is available.
2. Open **Actions → Android APK → Run workflow**.
3. Select **Publish a test release with an APK download and QR code**, then click **Run workflow**.
4. After both jobs finish, open the **Publish APK and installation QR** job summary or the new entry under **Releases**.
5. Scan the displayed QR code on your Android phone, download the APK, and open it to install.

The release includes `MotionAlarm.apk` and `install-qr.png`. The QR points directly to that release's APK, so it continues to work after the workflow artifact expires. Each manual release uses a unique tag, such as `android-12-1`. Normal pushes and pull requests only build an artifact; publication happens when you select the manual checkbox.

The workflow uses GitHub's automatic `GITHUB_TOKEN`; no personal access token or additional secret needs to be created. Your repository or organization must allow workflows to create releases. If publication fails with a permissions error, check **Settings → Actions → General → Workflow permissions** and any organization restrictions.

For downloading without a GitHub account, the repository must be public. A private repository still requires the phone's browser to sign in with an account that has access. A QR code does not bypass repository permissions.

These are debug APKs for testing. Fresh runners can generate different debug signing keys. If Android reports that a new APK conflicts with an installed copy, uninstall the old test app first; uninstalling removes its local alert history. Production releases should use a persistent signing key.

GitHub's standard hosted runners are free for public repositories. Private repositories have plan-specific included usage; artifact storage also has limits. This workflow uses a standard Ubuntu runner and a short artifact retention period.

References: [manual workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [artifact downloads](https://github.com/actions/upload-artifact#outputs), [release download URLs](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases), and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Device behavior

- The installed Android APK supports background and lock-screen monitoring through its foreground service and partial wake lock. Allow notifications before starting, then stop inside the app with screen-lock verification when configured.
- Browser previews and the iOS web path still require a visible page and awake screen. Their monitoring and sound stop when the page becomes hidden. Native background monitoring is implemented for Android only.
- Force-stopping the Android app, stopping it from Android's active-apps controls, restarting the phone, or the system killing the service ends monitoring. Some manufacturers apply additional battery restrictions.
- Browser motion access requires a supported phone, permission where applicable, and HTTPS. `localhost` is also treated as secure; opening a computer's plain HTTP LAN address on a phone usually is not.
- Real sound and vibration depend on device support and settings. Check Android's alarm volume and default alarm tone. The app respects audio focus and does not override Do Not Disturb.
- Very gentle movement may not pass the acceleration threshold. Test sensitivity on your actual phone.
- Clearing app/browser data or uninstalling removes local cached data and any unsynced alerts. Alerts already saved in Firestore remain in the account.
- Native motion, screen-off operation, physical vibration, sound audibility, and device battery behavior still need testing on a real phone. Browser tests simulate motion and observe sound/vibration calls; Angular integration tests use a fake native bridge.

## Check the updated APK on your phone

1. Install a newly built Android APK. This update includes native Java code and an Android service, so the Android package must be rebuilt.
2. Raise Android's alarm volume, keep **Sound on alert** enabled, and create a test alert to hear the two-second preview.
3. Tap **Motion alarm start**, allow notification permission, put the phone down, and wait for **Watching for movement**.
4. Press Home, lock the screen, and then move the phone. Confirm the alarm rings and the movement notification appears.
5. Confirm there is no Stop action in either the lock-screen notification or notification drawer. Open MotionAlarm, tap **Motion alarm stop**, cancel verification, and confirm the session stays active. Try again with the correct device credential and confirm it stops.
6. Repeat with no screen lock configured and confirm stopping is immediate. Also test canceling during the countdown and stopping while monitoring with a secure screen lock.
7. Start again and test removing the activity from Recents. If the device stops the service, check the manufacturer's background/battery settings; this behavior varies by phone.
8. Check the Settings page, today's default history filter, another date, and scrolling through a long history list.
9. Confirm that deliberately force-stopping MotionAlarm ends monitoring. Open the app and start again for a new session.

## Checks

```sh
npm run build
npm run lint
npm test
```

Browser tests use installed Google Chrome at desktop and mobile sizes. `npm run test:e2e` starts Auth and Firestore emulators, checks security rules, tests the REST API, then starts a test API on port 3001 and a browser app on port 4201. Everything uses the separate `demo-motion-alarm` project. Java 21 or newer is required. Test accounts and alerts never go to the production project. Coverage includes authentication, token refresh, account isolation, CRUD persistence, offline review, sensor triggering, unsaved tests, settings, and responsive layout. Unit tests also cover the Android bridge, account switching, offline queues, and retries.

See [verification notes](docs/VALIDATION.md) for the recorded results and [desktop](docs/screenshots/desktop.png) / [mobile](docs/screenshots/mobile.png) previews.

## API references

- [Ionic blank starter and standalone option](https://ionicframework.com/docs/cli/commands/start)
- [Capacitor Motion and motion permissions](https://capacitorjs.com/docs/apis/motion)
- [Capacitor Haptics and vibration](https://capacitorjs.com/docs/apis/haptics)
- [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#special-use)
- [Android background sensor restrictions](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview#sensors-practices)
- [Android audio focus](https://developer.android.com/media/optimize/audio-focus)
