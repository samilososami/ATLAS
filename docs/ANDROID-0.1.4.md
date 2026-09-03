# ATLAS Android 0.1.4 Preview

This supersedes 0.1.3 with two fixes found immediately during its post-publication emulator test:

- declares the network-state permission required by Android when scheduling a connectivity-constrained widget refresh;
- creates the widget configuration view before styling its system bars, preventing a null window-insets controller on Android 15.

It includes everything from 0.1.3:

- secure in-app GitHub release checks, release notes, verified APK download and Android-confirmed installation;
- Dark as the default appearance for new installations, while preserving an existing preference;
- resizable 2×2+ widgets for saved actions, A1 status, Codex limits, Chat and Push-to-talk shortcuts.

The APK was published before emulator verification, as requested. Post-publication verification then covered:

- a complete in-app update from 0.1.3 to 0.1.4, including release discovery, notes, download, digest/signature checks and Android's installer confirmation;
- widget pinning and configuration on Android 15;
- real resizing from the 2×2 minimum to a wider layout in Pixel Launcher;
- Chat and Push-to-talk deep links, plus selection of all four default saved actions;
- a clean Android runtime log for the corrected widget flows.

Compilation, JavaScript/policy tests and Android Lint also pass.
