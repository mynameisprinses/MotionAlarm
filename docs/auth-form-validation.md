# Account form verification

Verified November 5, 2026 (Asia/Manila). This supplements the existing [UI delivery gate](theme-validation.md) for the login and registration changes.

The email, password, and confirmation inputs now have placeholders alongside their visible labels. Login offers Show password; registration offers Show passwords for both password fields. Passwords start hidden and visibility resets when switching forms, returning to login, or completing authentication. The forgot-password option and reset form have been removed from the account screen.

## Verification

- PASS: production build completes without budget warnings.
- PASS: ESLint, browser-test type checking, and Prettier pass.
- PASS: eight authentication browser scenarios pass across desktop Chrome and the Pixel 7 profile. They cover registration, confirmation mismatch, login restoration, sign-out and sign-in, wrong credentials, duplicate accounts, placeholders, password visibility, keyboard input, and responsive layouts in both themes.
- PASS: phone and desktop screenshots of the changed forms are visually reviewed. Tests generate screenshots in `test-results/auth-*`.

## Delivery gate supplement

- R-02 PASS: the new labels and placeholders use plain action text without em dashes.
- R-03 PASS: both themes have zero horizontal overflow at 320, 393, 620, 768, and 1280px; short-screen tests reach Create account.
- R-23 PASS: the new control is a native labeled checkbox; no visual assets are introduced.
- R-24 PASS: real registration and login reach the monitor; sign-out returns to login.
- R-25 PASS: placeholders use the existing secondary-text token at full opacity, providing 5.52:1 contrast in light mode and 7.98:1 in dark mode against the form surface.
- R-26 PASS: the checkbox reveals and hides passwords without changing their values; actual authentication works while passwords are revealed.
- R-27 PASS: confirmation mismatch, incorrect login, duplicate accounts, and disabled submission states remain implemented; browser checks exercise the error cases.
- R-32 PASS: visible labels remain associated with inputs; Tab reaches password and Space toggles visibility with a visible focus outline. The checkbox label has a measured touch height of at least 44px.
- R-33 PASS: the feature is authored directly in Angular TypeScript, HTML, and SCSS.
- R-34 PASS: light and dark browser scenarios verify both forms and visibility states.
- R-35 PASS: the app is built, all changed controls are exercised, and screenshots are reviewed.
- R-37 PASS: the change follows the existing calm phone-utility direction in DESIGN.md, with ENERGY 1 / RHYTHM 2 / MOTION 1.

Purpose gate PASS: the native checkbox provides a familiar, keyboard-accessible way to reveal passwords. The existing font, colors, panel hierarchy, and spacing are reused; design purposes are recorded in DESIGN.md.

Liveliness PASS: the form heading and submission remain the focal points, whitespace separates input groups, green identifies the primary action, and the existing MotionAlarm identity and declared dials are preserved without decorative motion.

Craftsmanship PASS: C-1 is supported by the recorded design purposes; C-2 by tested checkbox and form behavior; C-3 by placing visibility beside the password fields; C-4 by both-theme, keyboard, responsive, and error checks; C-5 by using descriptive placeholders and emulator-only test accounts. The unchanged consistency locks remain covered by the base UI delivery gate.
