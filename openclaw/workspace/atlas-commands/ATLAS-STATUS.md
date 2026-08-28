# ATLAS Status

This is your quick health check for the Raspberry Pi.

The command is:

```bash
atlas-status
```

Use it before heavy work, when something feels slow, when sami asks about the Pi, or when you need to know whether the local services are alive.

## What it shows

`atlas-status` reports:

- host and Raspberry Pi model
- uptime
- CPU usage
- useful CPU detail
- RAM used/total
- storage used/total
- temperature
- active cooler fan state and RPM when available
- throttle state from `vcgencmd get_throttled`
- top RAM consumer
- OpenClaw Gateway state
- Atlas WebScreen state
- Atlas Desktop state
- Atlas Cast state
- physical ATLAS Screen power, selected mode, active surface, and boot default

## Usage

Run:

```bash
atlas-status
```

Example interpretation:

```text
OpenClaw Gateway: running / enabled
Atlas WebScreen: stopped / disabled
Atlas Desktop: stopped / disabled
Atlas Cast: stopped / manual
Atlas Screen: off / selected desktop / active none / boot off
```

That means the brain/gateway is up, but visual/cast surfaces are not consuming resources.

## When to use it

Use it when sami asks:

- "is the webscreen running?"
- "how is the Pi?"
- "is the gateway on?"
- "why is it slow?"
- "is cast running?"
- "do we have RAM/CPU for this?"

Prefer `atlas-status` over raw `systemctl` checks for first-pass status. It is faster and easier to read.

## Follow-up commands

If you need deeper detail:

```bash
atlas-webscreen status
atlas-desktop status
atlas-cast status
atlas-screen
openclaw gateway status
```
