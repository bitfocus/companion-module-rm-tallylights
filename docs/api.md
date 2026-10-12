# RM Tally Lights master — protocol reference

This module talks to the RM Tally Lights **master**, an ESP32 that relays tally
state over ESP-NOW to the camera tally lights and the On Air lights. The master
exposes a plain HTTP API for commands and, from firmware **v1.3.0**, a WebSocket
for state push. This page documents the parts of that protocol the module uses.

Base URL is the master's IP address on the local network, port 80 by default.
There is no authentication.

## Commands (HTTP `GET`)

Every command is a `GET` with query parameters. Camera ids are integers `1`–`32`.

| Path               | Params                                 | Effect                                                                    |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------- |
| `/set_live_cam`    | `cam=N`                                | Set camera N live. Not exclusive — other live cameras stay live           |
| `/set_preview_cam` | `cam=N`                                | Set camera N to preview                                                   |
| `/set_idle_cam`    | `cam=N`                                | Set camera N idle                                                         |
| `/set_off_cam`     | `cam=N`                                | Turn camera N's light off                                                 |
| `/update_display`  | `live=X&preview=Y`                     | Set the live/preview pair and turn every other camera off. `0` means none |
| `/auto`            | —                                      | Swap the current preview and live cameras                                 |
| `/allIdle`         | —                                      | Set all cameras idle                                                      |
| `/allOff`          | —                                      | Turn all camera lights off                                                |
| `/onair_status`    | `status=onair` \| `offair` \| `toggle` | Switch the On Air lights (`toggle` since v1.2.0)                          |

A command returns HTTP `200` on success and `400` with a plain-text reason when
a parameter is missing or out of range.

## Reads (HTTP `GET`, JSON)

**`/api/cameras`** — the configured cameras. The module reads this to name
cameras in its dropdowns.

```json
{
	"cams": [
		{ "id": 1, "name": "Main Camera", "address": "AA:BB:CC:DD:EE:FF", "protected": true },
		{ "id": 3, "name": "Dolly", "address": "11:22:33:44:55:66", "protected": false }
	]
}
```

**`/api/camera-status`** — the current mode of every camera, plus the On Air state.

```json
{ "cameras": [{ "id": 1, "address": "AA:BB:CC:DD:EE:FF", "mode": "live" }], "onair": "offair" }
```

## State push (WebSocket `/ws`, firmware v1.3.0+)

`ws://<master-ip>/ws`. The master sends a full snapshot when a client connects
and again on every state change; it never sends deltas. Changes are coalesced
to at most one message per 100 ms.

```json
{
	"type": "state",
	"onair": "onair",
	"live": 2,
	"preview": 1,
	"cameras": [
		{ "id": 1, "mode": "preview" },
		{ "id": 2, "mode": "live" }
	]
}
```

- `mode` is one of `live`, `preview`, `idle`, `off`.
- `live` / `preview` are the lowest camera id in that mode, or `0` for none.
- `onair` is `onair` or `offair`.
- Inbound frames are ignored; all commands go over HTTP.
- At most 4 clients. When a fifth connects, the oldest is evicted, and the
  client that arrived over the cap is not sent the connect-time snapshot.

The module builds its feedbacks and variables from these messages and does not
poll the master. Against firmware older than v1.3.0 there is no `/ws`, so the
module's actions still work and its feedbacks and variables stay inactive.

## Hardware and firmware

The tally system — master, camera tally lights and On Air relay lights — is a
self-built ESP32 project by the module's author. There is no commercial product
page; this document is the protocol reference for the module.
