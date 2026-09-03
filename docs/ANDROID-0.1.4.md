# ATLAS Android 0.1.4 Preview

This supersedes 0.1.3 with two fixes found immediately during its post-publication emulator test:

- declares the network-state permission required by Android when scheduling a connectivity-constrained widget refresh;
- creates the widget configuration view before styling its system bars, preventing a null window-insets controller on Android 15.

It includes everything from 0.1.3:

- secure in-app GitHub release checks, release notes, verified APK download and Android-confirmed installation;
- Dark as the default appearance for new installations, while preserving an existing preference;
- resizable 2×2+ widgets for saved actions, A1 status, Codex limits, Chat and Push-to-talk shortcuts.

The APK is published before the corrected widget and full self-update flows are exercised in the emulator. Compilation, JavaScript/policy tests and Android Lint pass before publication.
