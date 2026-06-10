# Firmware source of truth

The maintained sprout-grower firmware lives in:

`arduino/wifi_ver8/wifi_ver8.ino`

## Current development firmware

- Current source version: `1.0.7`
- USB test device status: `1.0.7` installed on 2026-06-10
- Public OTA server status: still serving `1.0.6`

The `1.0.7` update focuses on command-token based device control, OTA file
checksum validation, and safer manual pump/fan timeout behavior.

Older copied firmware snapshots were removed from source control to avoid
shipping or editing the wrong version. If a historical firmware build is needed,
recover it from Git history after confirming the target device and release tag.
