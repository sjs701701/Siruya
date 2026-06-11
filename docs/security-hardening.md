# Security hardening checklist

This project currently has mobile app and firmware code in this repository.
The cloud WebSocket server at `mqtt.app2-server.kr` is not present here, so
server-side ownership enforcement cannot be completed from this repo alone.

## Completed in this repo

- Firmware `secrets.h` files are no longer tracked.
- `arduino/wifi_ver8/wifi_ver8.ino` is the firmware source of truth.
- Firmware version `1.0.7` was built and installed on one USB-connected test
  device.
- New device provisioning returns a per-device `command_token`.
- The app stores `Device.commandToken` and sends it with:
  - local HTTP `/command`
  - cloud WebSocket `command`
- Firmware verifies the command token for local HTTP and WebSocket commands
  when a token is stored.
- OTA now requires an MD5 checksum in the firmware manifest before applying an
  update.
- MQTT command support is kept for development compatibility, but `PUMP=ON`
  and `FAN=ON` now use the same 60-second manual timeout policy as app commands.
- The app now shows firmware updates only when the manifest version is
  numerically newer than the device version and the manifest includes a valid
  32-character MD5 checksum.
- Device persistence now stores durable device identity fields separately from
  volatile runtime state, so stale online/offline or fan/water values are not
  restored as if they were current.
- Device liveness tracking is separated from the watering countdown anchor.
  This prevents a healthy WebSocket device from flickering offline while the
  two-hour watering countdown anchor is intentionally preserved.
- The app validates cloud WebSocket messages before applying them, so malformed
  `state` frames are ignored instead of crashing the render path.
- Corrupt stored device entries are backed up and skipped while valid stored
  devices continue to load. Demo devices are excluded from persistence.
- Storage load and persist failures now surface through the home screen with a
  retry action instead of silently disabling persistence for the session.

## Cloud server requirements

The cloud WebSocket server must enforce these rules before external testing:

1. Require an app credential on `app_hello`.
2. Track device ownership by `deviceId`.
3. Bind a device only from an explicit registration flow.
4. Reject app commands for devices not owned by the app user/session.
5. Forward and verify the per-device `token` field on `command` messages.
6. Never auto-bind unclaimed online devices to the first app that connects.

## Release blocker: cloud command routing

Observed on 2026-06-10 with test device `840ff0a4`:

- The app WebSocket received `state` frames from the device every 3 seconds.
- The same app WebSocket received `hello_ok` with an empty `devices` list.
- Sending a no-op command through the cloud WebSocket returned
  `command_error` with `device offline`.
- Local HTTP command to the same device succeeded after discovering its local
  IP (`POST http://192.168.35.182/command` returned `{"ok":true}`).

This means the cloud server can forward device state to apps while still
treating the device as unavailable for command routing. The likely server-side
failure is that device liveness/state broadcast and command routing are backed
by different connection maps, or `device_hello` does not register the device in
the command routing map used by app commands.

Temporary development mitigation:

- The app now prefers local HTTP commands when a stored `ipAddress` is present.
- Cloud WebSocket command routing remains a fallback path only.
- The currently connected test app storage was patched with
  `ipAddress: 192.168.35.182` for device `840ff0a4`.

Release acceptance criteria:

- `app_hello` must report online devices consistently with devices that are
  actively sending `state`.
- A valid app command for an online owned device must be forwarded to that
  exact device connection instead of returning `device offline`.
- The server must return a clear error for unauthorized, unknown, and truly
  offline devices as separate cases.
- The app should not need a local LAN IP for normal production control.

## Firmware manifest requirement

The sprout-grower manifest must include:

```json
{
  "product": "sprout-grower",
  "version": "1.0.7",
  "url": "https://example.com/firmware.bin",
  "md5": "0123456789abcdef0123456789abcdef"
}
```

`md5` is required by current firmware. Signature verification is still a future
hardening step and should be added before production release.

## Deployment status

- USB test device: `1.0.7` installed.
- Public firmware manifest server: still advertises `1.0.6` and has no `md5`
  field as of 2026-06-10.
- Public OTA rollout: not started.

The server files prepared for rollout are:

- `build/firmware/server/sprout-grower/waterplant_1.0.7.bin`
- `build/firmware/server/sprout-grower/latest.json`

The prepared `1.0.7` MD5 is:

```text
c30eb2bccfb84e48d8fa1ca713d739bb
```

## Git history cleanup

Do not rewrite Git history until the HiveMQ password has been rotated and the
team is ready to force-update shared branches. Rewriting history before rotating
the exposed credential does not secure the system.

## Deferred release-quality work

- Firmware `1.0.8` should close the provisioning gaps before broader testing:
  shut down the open setup AP after successful provisioning, require tokens for
  `/wifi/set` and `/wifi/clear`, remove side-effecting GET endpoints, remove
  wildcard CORS, and accept OTA only when the server version is newer.
- The reset gesture UX must be decided before implementing the firmware
  provisioning window. Example decision needed: which physical touch duration
  reopens setup mode and what LED feedback confirms it.
- Add signed OTA manifests and firmware signature verification.
- Add a real cloud account/session model for ownership.
- Add full accessibility labels and localization after final copy is approved.
