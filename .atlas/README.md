# ATLAS runtime

This is the public source layout for `/home/atlas/.atlas`. Your working parts
live here; OpenClaw keeps your identity and memory in its own workspace.

- `atlas-webscreen/`: voice UI, HTTP backend, Gateway bridge, runtime plugin,
  instructions and regression tests. Its README explains the voice pipeline.
- `atlas-desktop/`: the separate virtual desktop, Openbox configuration and
  shared wallpapers. It is not the physical screen's desktop.
- `atlas-screen/`: storage for the selected physical display mode. The public
  default is `desktop`; the screen still stays off at boot.
- `atlas-webscreen-workspace/`: an empty home for projects requested through
  WebScreen. Keep each project in its own named directory.

No Google Chrome profile, runtime state, recordings, conversation logs, certificates,
model weights or private generated projects belong in this public tree.
The former standalone starter workspace is not needed: the hot listener uses
the existing OpenClaw `main` agent in its own short-lived run.

## Files outside this directory

The repository's `system/` directory mirrors supporting installation targets:

- `libexec/` → `/usr/local/libexec/`: physical screen, terminal, audio and recovery helpers.
- `etc/atlas/` → `/etc/atlas/`: Zsh, LXTerminal and Openbox terminal settings.
- `etc/X11/` → `/etc/X11/`: Raspberry Pi HDMI configuration.
- `etc/opt/chrome/` → `/etc/opt/chrome/`: managed Google Chrome policies.
- `systemd/` → `/etc/systemd/system/`: service definitions, not automatic enablement.
- `share/atlas/` → `/usr/local/share/atlas/`: Fastfetch/Neofetch ASCII assets and the RAFAS banner.
- `config/` → each user's `.config/`: fetch-tool appearance.

The executable wrappers live in `atlas-commands/` and belong in
`/usr/local/bin/`, available to both the normal user and root. These are source
files for the existing ATLAS OS installation, not a universal installer.
Review paths, the `sami` service user and `/home/atlas` home before installing.
Never overwrite a live user's files without a focused backup.

The touch keyboard sources now live under `../misc/atlas-touch-type/`; install
its two helpers into `/usr/local/libexec/` too. `../misc/rafas/` contains the
small native hotkey listener and its build instructions. Their READMEs are the
installation maps; neither depends on a fresh disk image.

The physical surface needs Xorg, Openbox, LXTerminal, Zsh, zsh-autosuggestions,
zsh-syntax-highlighting, xdotool, wmctrl, xinput, unclutter and Python Tkinter.
The lightweight desktop additionally needs LightDM/LXDE; the virtual desktop
uses Xvfb, Google Chrome and feh. Install system dependencies from your distribution
and the official `google-chrome-stable` ARM64 package from Google. Both browser
launchers use separate `chrome-profile` directories and run as `sami`, including
when called from root. Keep the sandbox on; root should hand over the keys,
not climb into the browser itself.

## WebScreen integration

WebScreen uses Python and Node.js, the installed OpenClaw Gateway SDK and its
configured model/provider. Install the local `atlas-webscreen/openclaw-plugin`
with OpenClaw's plugin installer and enable `atlas-webscreen-runtime` for the
hot listener. Authenticate OpenClaw locally; never copy another installation's
OAuth session, Gateway pairing or API keys. The bridge needs the documented
operator scopes and device approval on first connection.

The current HTTP interface has privileged agent access and no browser login.
Use it only on a trusted network. Do not expose port 5000 publicly. The terminal
mode deliberately opens root locally without a password prompt; it is a
development surface. RAFAS is a separate native console, also with direct local
root access in this first development version. See `../misc/rafas/README.md`.
