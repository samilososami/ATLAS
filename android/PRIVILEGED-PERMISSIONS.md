# Privileged phone permissions

ATLAS 0.1.5 asks for permissions individually during onboarding. Microphone, notifications and nearby Bluetooth are required for the intended voice, persistent-connection and pairing experience. Every other permission is optional.

These grants are capability prerequisites, not an unrestricted remote-control API. Any future native phone tool must expose a narrow operation, validate its inputs, avoid reading unrelated private data and require explicit confirmation for irreversible changes. The private APK and single paired phone reduce exposure but do not remove the need for those checks.

Android may restrict SMS, call-log, phone, background sensors, Wi-Fi and all-files access depending on OS version, device policy or distribution channel. The app must treat refusal or platform restriction as a normal state.
