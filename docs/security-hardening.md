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

## Cloud server requirements

The cloud WebSocket server must enforce these rules before external testing:

1. Require an app credential on `app_hello`.
2. Track device ownership by `deviceId`.
3. Bind a device only from an explicit registration flow.
4. Reject app commands for devices not owned by the app user/session.
5. Forward and verify the per-device `token` field on `command` messages.
6. Never auto-bind unclaimed online devices to the first app that connects.

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
- Public firmware manifest server: still advertises `1.0.6`.
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

- Add signed OTA manifests and firmware signature verification.
- Add a real cloud account/session model for ownership.
- Add full accessibility labels and localization after final copy is approved.
