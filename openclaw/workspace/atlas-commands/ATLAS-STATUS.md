# ATLAS Status

This is your quick health check for the Raspberry Pi.

The command is:

```bash
atlas-status
```

Use it before heavy work, when something feels slow, when sami asks about the Pi, or when you need to know whether the local services are alive.

## Latency and scope

`atlas-status` normally takes around 1.5 to 2 seconds because it intentionally collects a broad snapshot: temperature, storage, RAM, CPU, fan, throttling, Gateway, WebScreen, desktop, cast and physical screen state.

That trade-off is useful when sami asks about several of those areas at once, requests a general health report or when the cause of a problem is still unclear. It is usually slower when only one or two facts are needed. In that case, query the narrow source directly—for example, use `vcgencmd measure_temp` for temperature—instead of collecting the entire report. Even for several known facts, a few focused direct reads may still finish sooner.

`atlas-*` commands are not guaranteed to be faster than ordinary system commands. They are designed primarily to be convenient, consistent and adapted to ATLAS. Choose them when their combined output fits the request; otherwise use the fastest reliable direct path.

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

Prefer `atlas-status` when a broad first-pass health snapshot is genuinely useful. For one service or one metric, use its focused status or direct read instead.

## Follow-up commands

If you need deeper detail:

```bash
atlas-webscreen status
atlas-desktop status
atlas-cast status
atlas-screen
openclaw gateway status
```
