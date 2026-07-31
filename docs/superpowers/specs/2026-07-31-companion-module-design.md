# RM Tally Lights — Bitfocus Companion Module (v1) Design

**Date:** 2026-07-31
**Status:** Design approved; implementation plan pending

---

## 1. Context

The RM Tally Lights master (ESP32) exposes a complete HTTP control API — camera
states, the `/update_display` ATEM integration endpoint, and On Air relay
control. Bitfocus Companion is already in the signal chain: the master's own
design doc specifies `/onair_status` as being driven by OBS→Companion on stream
start/stop, and labels `/update_display` the ATEM/Companion endpoint.

Today that integration is built by hand — a Companion user adds Generic HTTP
actions and types URLs like `http://192.168.0.76/set_live_cam?cam=3` into each
button. That works, but it is error-prone, undiscoverable, and unreasonable to
ask of a regular Companion user.

This module replaces hand-typed URLs with named actions in Companion's action
dropdown, so an operator building a button that also drives OBS and an ATEM can
pick **RM Tally Lights → Set On Air Lights On** from a list.

## 2. Goals

- Named, discoverable actions covering show control and On Air.
- A camera picker showing real camera names rather than bare numbers.
- Ready-to-drag presets for the common buttons.
- Zero background load on the master.

## 3. Non-goals (deferred or rejected)

| Not in v1 | Why |
|---|---|
| Feedbacks (buttons reflecting state) | Requires polling. Deferred to v2 — see §4. |
| Companion variables | Without reads they can only report what was last *sent*, which silently goes stale. Misleading state on an on-air indicator is the worst failure mode available. |
| Toggle On Air | Master has no toggle endpoint, and without feedbacks a toggle button cannot show its state. Explicit Set On Air Lights On / Off matches the existing OBS start/stop trigger model. |
| Management endpoints (camera add/remove/rename, export/import settings) | Setup tasks nobody performs from a control surface. |
| `/reset_wifi` | Clears the master's WiFi credentials and restarts it. One mispress takes the rig off the network mid-show. Belongs in the web UI only. |
| `/set_color` | Sets *camera #1's matrix only*, not a global colour. The name would mislead; it reads as a debug endpoint rather than show control. |
| Automated tests against hardware | The ESP32 is not a CI target. |

## 4. The load-bearing constraint

The master runs the **synchronous ESP32 `WebServer`**, which is known to wedge
under connection pressure (the `HTTP_MAX_DATA_WAIT` issue). Unlike a browser tab
that gets closed, Companion runs continuously — a poorly chosen poll interval
would apply that pressure permanently.

v1 therefore performs:

- **two** requests when the connection is configured or reconfigured, and
- **one** request per button press.

Nothing runs in the background. This is strictly less load than the Generic HTTP
setup it replaces. Any future feedback support must revisit this deliberately
with a conservative, configurable interval and non-overlapping requests.

## 5. Target platform

Verified against current releases on 2026-07-31:

| | |
|---|---|
| Companion | 5.1.0 |
| `@companion-module/base` | 2.0.4 |
| Node | `^22.20` |
| TypeScript | `~6.0.3` |
| Package manager | Yarn 4.17 |
| Template | `companion-module-template-ts` |

The template registers a module as a **default-exported class extending
`InstanceBase`** with `init` / `destroy` / `configUpdated` / `getConfigFields`,
delegating to `updateActions(self)`-style functions in separate files. This
design follows that shape.

## 6. Module identity

| Field | Value |
|---|---|
| Repository | `companion-module-rm-tallylights` (standalone; Companion requires one repo per module) |
| Manifest `id` | `rm-tallylights` |
| Name | RM Tally Lights |
| Manufacturer | Rosnell Media Group |
| Products | Tally Lights Manager |

## 7. Architecture

```
src/
├── main.ts       InstanceBase subclass: init / destroy /
│                 configUpdated / getConfigFields. Wiring only.
├── config.ts     Config field definitions + config type
├── api.ts        HTTP client. Pure URL building + one GET helper.
│                 Zero Companion imports.
├── cameras.ts    Camera list fetch, cache, and dropdown choices
├── actions.ts    Action definitions
└── presets.ts    Preset definitions
```

**`api.ts` imports nothing from `@companion-module/base`.** It turns
`("set_live_cam", { cam: 3 })` into a URL and performs the GET. This isolates
the logic most likely to carry bugs — parameter encoding, camera-range
validation, the `0 = none` rule — so it can be unit tested without instantiating
Companion.

**`cameras.ts` owns the entire fetch/cache/fallback story.** Nothing else knows
whether the camera list came from the master or from the numeric fallback;
`actions.ts` and `presets.ts` just ask it for choices.

Adding feedbacks in v2 means a new file plus a poller, with no change to any of
these.

## 8. Configuration

| Field | Type | Default |
|---|---|---|
| Master address | text (IP or hostname) | — |
| Port | number | 80 |
| Request timeout | number (ms) | 3000 |

No poll-interval field, because nothing polls.

## 9. Actions

Ten actions:

| Action | Endpoint | Options |
|---|---|---|
| Set Camera Live | `/set_live_cam?cam=N` | camera picker |
| Set Camera Preview | `/set_preview_cam?cam=N` | camera picker |
| Set Camera Idle | `/set_idle_cam?cam=N` | camera picker |
| Set Camera Off | `/set_off_cam?cam=N` | camera picker |
| Set Live + Preview | `/update_display?live=X&preview=Y` | two pickers, each allowing *None* |
| Auto (swap live/preview) | `/auto` | — |
| All Cameras Idle | `/allIdle` | — |
| All Cameras Off | `/allOff` | — |
| Set On Air Lights On | `/onair_status?status=onair` | — |
| Set On Air Lights Off | `/onair_status?status=offair` | — |

### Camera picker

One reusable option builder used by every camera action:

- A dropdown of `3 — Dolly` entries built from the cached camera list. The
  dropdown **value is the camera `id` returned by `/api/cameras`** — the same
  number the endpoints take as `cam=N`. The name is display only and is never
  sent.
- A `Manual entry…` choice that reveals a 1–32 number field.

The manual option covers three cases with one control: the master being
unreachable when the button is configured, a camera renamed in the web UI since
the list was cached, and a power user who simply wants to enter a number.

`Set Live + Preview` additionally offers *None*, mapping to `0`, matching the
endpoint's own semantics. Two firmware behaviours to surface in the action's
help text rather than reimplement: selecting *None* for both turns all cameras
off, and selecting the **same camera** for live and preview also turns all
cameras off.

Cached names may lag a rename made in the web UI until the connection config is
re-saved. This is cosmetic only — the number the action sends is unchanged, so
buttons keep working correctly. It will be documented in the module README.

### Presets

Ready-to-drag buttons: `ON AIR`, `OFF AIR`, `AUTO`, `ALL OFF`, `ALL IDLE` and a
Live/Preview pair for each camera in the cache. With no feedbacks in v1 these
are pre-labelled and pre-wired, not state-reflecting.

## 10. Data flow

```
init() / configUpdated()
   └─ GET /test              → InstanceStatus.Ok | ConnectionFailure
   └─ GET /api/cameras       → cache list, build dropdown choices
   └─ updateActions() + updatePresets()

button press
   └─ actions.ts callback → api.ts builds URL → GET → check status
```

The two requests are independent. If `/test` succeeds but `/api/cameras` fails,
status stays `Ok` — the master is reachable — and the picker falls back to
numeric entry with only the names missing. Only a failure of `/test` itself sets
`ConnectionFailure`.

## 11. Error handling

| Situation | Response |
|---|---|
| Network error / timeout | Log warning with the URL; set `ConnectionFailure`. **No automatic retry.** |
| HTTP 400 | Log the master's plain-text reason verbatim; leave status `Ok` |
| HTTP 200 | Debug log; if status was `ConnectionFailure`, clear it to `Ok` |

Three deliberate choices:

- **No retry.** Retrying into a wedge-prone synchronous server risks making a
  struggling master worse. A visibly failed press the operator can repeat beats
  a module quietly hammering the device.
- **400s do not mark the connection failed.** The master answered correctly; we
  sent it something it rejected. Its error strings are already human-readable
  (`"Camera number must be between 1 and 32"`), so they are surfaced verbatim
  rather than replaced with our own wording.
- **Any success clears a failed status.** With no polling this is the only
  recovery signal available, and it costs nothing.

Timeouts use an `AbortController` at the configured value so a wedged master
cannot leave requests hanging.

## 12. Testing

**Unit** — neither target needs Companion running:

- `api.ts` — URL construction per action, parameter encoding, camera range
  validation, `/update_display` *None* → `0` mapping.
- `cameras.ts` — parsing `/api/cameras`, dropdown choice generation, fallback
  when the fetch fails.

**Manual, against the real rig:**

- Every action fires and the physical lights and On Air relay respond.
- Master powered off → picker degrades to numeric, status shows
  `ConnectionFailure`, no crash.
- Master powered back on → first successful press clears status to `Ok`.
- The packaged `.tgz` loads via Companion's Modules page. The Bitfocus docs
  specifically warn that packaging is where modules break, so this is verified
  separately from the dev-module run.

## 13. Distribution

`yarn companion-module-build` produces a `.tgz` that users can load directly
from Companion's Modules page. Real users can therefore be served before any
registry submission — the registry is for discoverability, not a gate on
shipping. Submission to the Bitfocus module registry is the eventual goal and
the repo follows Bitfocus conventions from the start so that no rework is
needed.

## 14. Deferred to v2

Feedbacks (buttons reflecting live state) and the variables that accompany
them, both gated on a conservative polling design per §4. This is the feature
that makes an on-air button turn red when the light is genuinely on, and is the
main reason to build a real module rather than continue with Generic HTTP.
