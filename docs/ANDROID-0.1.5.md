# ATLAS Android 0.1.5 Preview

This preview introduces the new first-run experience and companion controls:

- a guided Spanish onboarding flow with one Android permission request per page, required voice/notification/Bluetooth grants, optional advanced grants and a sequential **PERMITIR TODO** route;
- six-digit Bluetooth pairing with `atlas-app pair`, a 120-second discovery window and the full-screen `ATLAS A1 detectado` mobile flow;
- a sticky, encrypted relay connection for status and widgets after the app closes;
- direct push-to-talk with device-rate resampling, real input/output audio levels and a red cancel button while Atlas is working;
- direct actions with long-press multi-selection, edit, select-all and bulk delete; direct terminal open/close with a status dot;
- a compact pull-to-refresh status dashboard and simplified settings/update progress;
- distinct 2×2+ launcher widgets for actions, A1 overview, Codex limits, CPU, RAM, chat and voice;
- fixed light ATLAS appearance and immersive Android presentation.

The app requests broad optional permissions because this is a private single-device build. Granting a permission does not by itself implement or authorize an ATLAS phone action: native phone tools must still be added explicitly and should validate destructive operations.

Validation before publication: debug APK build, Android Lint, JavaScript syntax checks, Python compilation, shell syntax and Node policy tests.
