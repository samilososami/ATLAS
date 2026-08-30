# Nmap - Know the neighbourhood without knocking on every door

Nmap is available for authorised diagnostics on ATLAS' current private network. Use the smallest scan that answers the question. A home network is not a laboratory target range, and a television does not need sixty-five thousand tiny knocks every ten minutes.

## Autonomy first

When a task depends on an IP address, port or service, treat that information as something ATLAS can usually discover. Do not ask sami to provide it before checking the cached report, current ADB transports, saved device records and the live neighbour table. If those are insufficient, run the smallest focused Nmap scan that can answer the question. Ask only when multiple plausible targets remain, authorization or pairing is required, or the requested host is outside the visible network.

Start with `/home/atlas/.atlas/nmap/REPORT.md`. It is the quick map hanging by the door. Refresh or deepen only the relevant part of the network instead of rescanning everything out of habit.

## Fast discovery

Find active hosts without scanning ports:

```bash
nmap -sn 192.168.1.0/24
```

This is the preferred first step when looking for an Android device, computer or television whose IP has changed. For ADB specifically, a focused port check is usually enough:

```bash
nmap -p 5555,37099 --open 192.168.1.0/24
```

Modern wireless debugging may use a random advertised port, so inspect the automatic report and local discovery information before widening the scan.

## Automatic report

ATLAS maintains a private cache at:

```text
/home/atlas/.atlas/nmap/REPORT.md
```

`atlas-nmap-report.timer` refreshes it every ten minutes. The automatic profile performs host discovery and bounded version detection on the one hundred most common TCP ports of active hosts. It runs with reduced scheduling priority and atomically replaces the previous report, so ATLAS can answer common LAN questions without launching a new scan.

The report is a cache, not an oracle. Sleeping devices, client isolation, firewalls and hosts that ignore discovery probes can make a device disappear. If the requested host is absent, run a focused scan rather than pretending the report is complete.

Check the service with:

```bash
systemctl status atlas-nmap-report.timer
journalctl -u atlas-nmap-report.service
```

## Focused and deep scans

Use service detection only on the relevant target or ports:

```bash
nmap -sV --version-light -p 22,80,443,445,5555 TARGET
```

An all-port scan is available for one private IP when the user actually needs it:

```bash
sudo /usr/local/libexec/atlas-nmap-report --deep PRIVATE_IP
```

It writes `DEEP_<IP>.md` beside `REPORT.md`. Do not run `-p-`, aggressive scripts, vulnerability scripts, evasion options or repeated high-rate probes across the whole subnet without a concrete reason and explicit scope.

## Privacy

LAN reports may contain private IPs, MAC addresses, vendors, hostnames and service versions. They belong only in `.atlas/nmap/`, are excluded from Git and must not be quoted outside the user's direct private session unless requested.
