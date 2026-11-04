# MotionAlarm design direction

User choice: simple light interface with green monitoring status and red alerts.

Reading: a beginner-friendly phone utility with a calm, light visual language.
ENERGY 1 / RHYTHM 2 / MOTION 1.

- Color: green identifies the main arm action and active monitoring; red identifies movement alerts and deletion.
- Layout: the monitor is the focal point. The top Settings icon opens a separate page for sensitivity, sound, and vibration. View alert history opens its own page so configuration and logs do not crowd the start/stop controls.
- Typography: the system font keeps phone controls familiar and avoids a font download.
- Spacing: compact controls with at least 44px touch targets keep the app comfortable on phones.
- Panels: monitoring, settings, and history have separate pages because they serve different tasks. Settings reflow into two columns on wider screens. Alerts use a bounded scrolling list so date and status controls remain available above it.
- Icons: the shield represents monitor state, the warning marks detected movement, the phone marks local storage, and the check introduces empty history. The product name is text, not a generated logo.
- Status labels and counts: show actual monitoring state and movement history. Test alarms play feedback without saving history.
- Motion: no decorative animation; the countdown is functional feedback while placing the phone down.
- Theme: fixed light appearance follows the user's selected direction.
- Ionic mode: Material mode keeps the same compact controls and header layout on Android, iOS, and desktop.
- Sound: a second toggle follows the vibration control so audible and physical feedback can be chosen independently without another settings screen.
- Background state: the Android system alarm icon identifies the live service notification. Tapping opens the app; no Stop action appears in the notification. The app uses Android's own screen-lock verification before stopping a secured device's session. Browser and Android descriptions explain their actual behavior.
- Navigation: the history page has a standard Ionic Back control with the monitor as its fallback destination. A link in empty history returns to the monitor to create an alert. Monitoring remains active while viewing history.
- History date: the date filter defaults to the phone's local calendar day. Today resets it and All dates shows older records. Date and status filters combine, and counts describe the selected date.
- Settings icon: the existing Ionicons gear is a labeled navigation control for configuration, explicitly requested by the user. Settings has the same Back behavior as history.
- Accounts: the requested login/register form uses the existing light panel, system type, green primary action, and 44px controls. A separate account section in Settings keeps sign-out away from alarm controls. Red is reserved for errors; pending sync is plain status text. ENERGY 1 / RHYTHM 2 / MOTION 1 remain unchanged.
- REST connection: account and history screens retain their layout. Cached and pending messages describe the user's account rather than the database technology. Refreshing in the background is functional behavior without decorative motion.
