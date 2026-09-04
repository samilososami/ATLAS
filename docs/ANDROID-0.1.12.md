# ATLAS Android 0.1.12-preview

Full-interface visual and interaction rework.

- Extends the onboarding language across Atlas, Actions, Terminal, Status,
  Settings, dialogs and pairing: deep ink layers, restrained blue light,
  clearer hierarchy and tactile three-dimensional controls.
- Adds fluid, event-driven transitions for navigation, voice state changes,
  action execution, terminal state, pull-to-refresh, updates and selection.
- Rebuilds Bluetooth pairing as a visible sequence from discovery through
  secure verification, with focused motion, semantic haptics and clear
  success/error feedback.
- Adds a native dark splash and a reduced-motion-safe reveal after launch or
  biometric unlock.
- Hardens Bluetooth pairing against stale scans, overlapping GATT attempts and
  stalled connections.
- Keeps the animation layer lightweight: no idle animation polling loop, large
  loading surfaces do not repaint continuously, and the WebView still pauses
  in the background.
- Fixes **PERMITIR TODO** so permissions that open Android Settings pause the
  sequence and resume correctly when the user returns.
