# Companion Module v2.0.0 — Feedbacks and Variables — Design

**Date:** 2026-08-01
**Status:** Design approved by the owner; implementation plan pending
**Scope:** `companion-module-rm-tallylights` only. No firmware changes — those are a separate release.
**Baseline:** `v1.0.0` (`69a6dcd`), never published.
**Depends on:** firmware **v1.3.0**, whose `/ws` protocol is defined in `RMTallyLights/RMTallyLights_Master/docs/superpowers/specs/2026-08-01-firmware-v1.3.0-websocket-push-design.md` §3. **That document owns the wire format; this one consumes it.** Implement the firmware first.

---

## 1. Why, and why it is v2 rather than v1.1

Module v1.0.0 is actions-only. It can tell the master to do things but cannot
show what the master is doing, so a button can send "toggle On Air" without
being able to indicate whether the light is currently on. Feedbacks were cut
from v1 for two reasons: the master had no toggle endpoint, and there was no
push channel to drive a feedback from. Firmware v1.2.0 removed the first.
Firmware v1.3.0 removes the second.

**v1.0.0 was never published.** The owner has decided to submit **v2.0.0** to
the Bitfocus registry instead, so as not to go through the submission process
twice. That makes this release the module's first public appearance, which
raises the bar in three concrete ways recorded in §7.

## 2. What this release contains

1. A WebSocket client that holds one connection to the master and keeps the latest state.
2. Four feedbacks.
3. Five variables.
4. Presets wired to their feedbacks, so they work on arrival.
5. The submission readiness work in §7.

## 3. Architecture

Four new units, each with one job. The existing files keep theirs.

| File                       | Responsibility                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/socket.ts` _(new)_    | Owns the WebSocket lifecycle: connect, reconnect with backoff, close cleanly on destroy. Parses and validates incoming frames. Knows nothing about Companion. |
| `src/state.ts` _(new)_     | A pure reducer: takes a parsed snapshot, returns the module's view of the world. No I/O, no Companion imports — the unit under test.                          |
| `src/feedbacks.ts` _(new)_ | Feedback definitions. Reads state, returns booleans.                                                                                                          |
| `src/variables.ts` _(new)_ | Variable definitions and value computation.                                                                                                                   |
| `src/main.ts`              | Wires them together: owns the socket, holds current state, calls `checkFeedbacks()` and `setVariableValues()` when it changes.                                |

The split matters for testability. `socket.ts` needs a live server to
exercise; `state.ts` does not, and it is where the logic that can be
_wrong_ lives. v1 established the pattern with 91 vitest tests over pure
functions and it should continue.

### Decision D1 — Node's built-in `WebSocket`, no new dependency

Node 22 exposes `WebSocket` as a global (verified on the development machine:
`typeof globalThis.WebSocket === 'function'` on v22.14.0, and `engines.node`
is already `^22.20`).

Server-Sent Events were considered and rejected for exactly this reason: SSE is
a better conceptual fit for one-way push and is lighter on the ESP32, but Node
22 has **no** global `EventSource`, so consuming it would require adding an npm
dependency. The module currently has exactly one runtime dependency
(`@companion-module/base`). For a first public release, keeping it at one is
worth more than the firmware saving.

_Reversal cost: low, but reversing means adding a dependency._

## 4. Feedbacks

All four are boolean feedbacks, so the operator controls the styling.

| Id               | Shows                               | True when                        |
| ---------------- | ----------------------------------- | -------------------------------- |
| `camera_live`    | that camera is live                 | `cameras[id].mode === 'live'`    |
| `camera_preview` | that camera is in preview           | `cameras[id].mode === 'preview'` |
| `onair`          | the On Air light is on              | `onair === 'onair'`              |
| `connected`      | the module is talking to the master | the socket is open               |

`camera_live` and `camera_preview` take a camera option using the **existing**
`camera-picker.ts` — the same dropdown-plus-manual-entry control the actions
use, including its digit-only guard. Reusing it means the picker's rules are
defined once, and the blank-dropdown bug fixed during v1 development cannot
reappear in a different control.

### Decision D2 — `connected` is driven by the socket, not by action results

`connected` reflects socket state only. It does not consider whether the last
action succeeded.

An action failing means one request failed; the socket dropping means the
master is gone. Conflating them would make the indicator flicker on a single
rejected command, which is precisely when an operator most needs a _stable_
answer to "is the master there".

_Reversal cost: trivial._

## 5. Variables

| Variable           | Example       | Notes                                                   |
| ------------------ | ------------- | ------------------------------------------------------- |
| `live_cam`         | `2`           | `0` when nothing is live                                |
| `preview_cam`      | `1`           | `0` when nothing is in preview                          |
| `live_cam_name`    | `Canon`       | Empty string when nothing is live                       |
| `preview_cam_name` | `Main Camera` | Empty string when nothing is in preview                 |
| `onair`            | `onair`       | Literally `onair` or `offair`, as the master reports it |

`live_cam` and `preview_cam` come straight from the snapshot's `live` and
`preview`. The firmware derives those from per-camera modes (firmware spec D0,
which also deletes the partially-maintained globals that would otherwise have
supplied them), so `live_cam` can never name a camera that `camera_live` says
is not live. The module reconciles nothing; take the values as given.

Per-camera mode variables (`camera_2_mode` and so on) were considered and
**dropped**. They would mean a variable set that changes shape whenever a
camera is added or removed, for a job the `camera_live` / `camera_preview`
feedbacks already do better.

### Decision D3 — names come from the cached camera list, refreshed on drift

The snapshot carries ids, not names. The module maps id→name using the camera
list it already fetches from `/api/cameras`.

That cache goes stale if a camera is renamed on the master. Rather than putting
names in every snapshot — inflating the hot path to serve a rare case — the
module re-fetches the camera list when either:

- a snapshot contains a camera id the module does not know, or
- the socket reconnects.

A rename that does not add an id and does not drop the connection will show
stale text until the next reconnect. That is accepted: the alternative is
polling the camera list, which is the thing this whole project removes.

_Reversal cost: low. If it proves annoying, the firmware can add names to the snapshot — a protocol change, so firmware-side._

## 6. Behaviour at the edges

**No push available.** If the socket cannot connect — an older master, a
firewall, a master mid-reboot — the module logs it once, `connected` reads
false, and **every action continues to work exactly as in v1**. There is no
polling fallback and no firmware version negotiation; the owner is the only
operator of this hardware and asked not to over-engineer it. Actions keep
working because that requires no extra code, not because of a compatibility
layer: they were never coupled to the socket.

**Reconnection.** Exponential backoff, capped, running until `destroy()`. On
reconnect the master sends a snapshot unprompted (firmware spec §3.3), so no
priming request is needed.

**`destroy()`.** Must close the socket and cancel any pending reconnect timer.
Companion creates and destroys instances on every config change; a leaked
socket or timer per edit is a real leak in a long-running Companion process.
v1's `destroy()` only logs, because v1 held no resources. It now holds two.

**Malformed frames.** A frame that is not JSON, or is JSON that fails
validation against firmware spec §3.2, is logged at debug and discarded. State
is left as it was. A snapshot protocol makes this safe — the next valid message
restores correctness with no reconciliation.

## 7. Submission readiness

v2.0.0 is the first public release, so three things that did not matter for an
unpublished v1 now do.

**`companion/manifest.json`** — version to `2.0.0`. The rest (id, manufacturer
`Rosnell Media Group`, product `Tally Lights Manager`, maintainer, keywords)
was settled during v1 and stands.

**`companion/HELP.md`** — currently documents actions only. It must document
every feedback and every variable, since it is what a user sees in Companion's
help pane, and state which firmware version is required for feedbacks to work.

**Runtime dependencies stay at exactly one.** See D1.

**One stale comment to correct.** `main.ts`'s `sendCommand()` says the module
deliberately does not retry because _"the master runs a synchronous web server
that wedges under connection pressure."_ That was true of v1.0.0's target. It
has been false since firmware v1.1.0, which replaced the synchronous server and
was measured clean at 20 concurrent clients. The no-retry behaviour itself is
still right — a visibly failed press the operator can repeat beats a silent
retry storm during a show — but the stated reason is wrong and would mislead
the next reader. Correct the comment; keep the behaviour.

### Decision D4 — no upgrade script

v1.0.0 was never published, so no user has a v1 button to migrate. No action
ids, option names or preset ids change in this release regardless. The existing
empty `UpgradeScripts` export stays, because `@companion-module/base` requires
it.

_Reversal cost: n/a — adding one later is always possible._

## 8. Testing

**Unit (vitest), the bulk of it.** `state.ts` is pure and gets the coverage:
snapshot applied to empty state; snapshot replacing prior state; unknown camera
id triggering a refresh signal; malformed input rejected without mutating
state; `live_cam_name` resolution including the no-live-camera and
unknown-id cases; `onair` mapping both ways. `socket.ts`'s parse/validate
boundary is pure too and gets the same treatment. This follows v1's pattern of
testing logic as functions rather than mocking Companion.

**Integration, against real hardware.** Feedbacks change colour when tally is
driven from the master's web UI; variables render on a button label; the
`connected` feedback goes false when the master reboots and true again when it
returns, without a Companion restart. That last one is the reconnection path
and it cannot be proven any other way.

**Not tested automatically:** anything requiring Companion itself to be
running. The owner drives those checks.

## 9. Non-goals

| Not in this release                 | Why                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Polling fallback for older firmware | §6 — owner is the sole operator; explicitly asked not to over-engineer.                   |
| Per-camera mode variables           | §5 — variable set would change shape with the camera list, and feedbacks cover the need.  |
| Sending commands over the WebSocket | The firmware does not accept them (firmware spec §3.4), and HTTP actions already work.    |
| Retry on failed actions             | Behaviour is deliberate and unchanged; only its stale justification is corrected. See §7. |
| Authentication                      | The master has none on any endpoint. Nothing the module can do about it alone.            |

## 10. Rollback

The module is not yet published, so rollback is `git checkout v1.0.0` with no
external consequence. Once submitted to the Bitfocus registry this stops being
true — which is the reason §7 exists.

## 11. Results

Implemented across 19 commits on `feature/module-v2`, merged as `42fe220` and
tagged `v2.0.0` on 2026-08-01. 162 tests (up from 91), lint clean, build clean,
`yarn package` clean. Runtime dependencies: still exactly one.

**Verified against the real master at 192.168.0.76, without Companion.** The
compiled module was driven directly from Node: `fetchCameras` read both cameras
over HTTP; the socket connected and was primed with a snapshot; six frames
arrived across four state changes; `isLive` / `isPreview` / `isOnAir` tracked
correctly at every step; `variableValues` resolved `Canon` and `Main Camera` and
reverted to `0` / empty on reset; and `stop()` exited the process immediately,
proving no reconnect timer leaked. The firmware's own `ws-check` passed 7/7
against the same device.

**Not yet verified — needs Companion and the owner.** Presets showing state
unwired, a variable rendering on a button label, **Master is Connected**
recovering from a master reboot without a Companion restart, and editing the
connection host without leaving a duplicate socket. That last one exercises the
races §11.1 describes.

### 11.1 What review caught that the tests did not

Five defects reached review and none reached hardware. They are recorded because
the pattern is the point: every one lived in code that unit tests either did not
cover or could not.

**`StateSocket.start()` was not idempotent.** A second call stranded the first
socket with its handlers attached; when it later closed it nulled the reference,
after which `stop()` could not close the second and a third was scheduled. The
review also found that the task's brief — mine — had left the entire connection
lifecycle untested while covering all of the parsing. That gap is why the bug
survived. Twenty-eight socket tests now exist, and the implementer verified each
new regression test fails with its fix reverted.

**The camera-list refresh was an unbounded request loop.** A snapshot naming an
id `/api/cameras` will never return — a deleted camera lingering in the pushed
array, or an id `parseCameraList` skips — retriggered a fetch on every frame,
with no in-flight guard and a 10-second timeout. Fixing it introduced a second
defect: a single timed-out fetch then blacklisted a genuinely new camera until
reconnect, which is exactly what adding a camera mid-show looks like.

**Two `connect()` races.** `startSocket()` runs after two awaits of up to
`config.timeout` each. Overlapping config saves could leave a socket that
`stopSocket()` and `destroy()` could never reach, burning one of the master's
four WebSocket slots per edit; and a `destroy()` mid-connect could create a
socket outliving the instance. A generation counter and a `destroyed` flag close
both. A third round was needed because the first guard was placed after the
state mutations it was meant to protect.

**`refreshCameras()` could commit a stale master's camera list.** Found by the
whole-branch review: it had a `destroyed` guard but no generation guard, and
because the reconnect-triggered refresh was the one swallowed by
`refreshInFlight`, nothing re-read the list until the socket next dropped —
potentially never during a show.

**The documentation contradicted itself three rounds running.** Each round's new
prose disagreed with a sentence it had left in place, and each was caught only by
reading both files whole rather than the diff. The last one claimed that on an
unprimed reconnect nothing refreshes, when camera _names_ do — because that read
goes over HTTP and does not care whether the socket was primed.

### 11.2 Known and deliberately not addressed

- **An unprimed reconnect can leave the tally confidently stale.** The firmware evicts the _oldest_ `/ws` client and skips priming an arriving client over its four-client cap. The module is typically the oldest, so it can be evicted and return unprimed: **Master is Connected** goes true while the tally holds old values, and the master only broadcasts on change. Requires four other clients — browser tabs on the master's own UI. Documented in `HELP.md`. The fix is to prime from `/api/camera-status` on reconnect, which needs a second parser and a second source for `onair`: a feature, and the first item of the v2.1 backlog.
- **The refresh loop is narrowed, not closed.** An HTTP 200 whose body parses to `[]` is indistinguishable from a failed request, so it is never recorded as unresolvable. The real bound is one serialized request per state change, not the per-frame storm an earlier analysis claimed — that figure misread the firmware's 100 ms coalescing floor as a broadcast rate. The clean fix is `fetchCameras` returning `null` on failure, which changes a shared contract.
- **The OFF AIR preset lights when there is no connection at all.** Its feedback is inverted, so with no information it reports "not on air". Every other feedback fails dark; this one fails lit. Documented rather than changed — the inversion is correct behaviour for the connected case.
- **`main.ts` has no direct test coverage.** The plan ruled against building a fake `InstanceBase`, consistent with a repo that tests pure functions and mocks nothing. The consequence is that the code which absorbed the most review effort has no regression tests, and the final fix shipped untested.
- **Definitions are rebuilt on every reconnect** even when the camera list is unchanged, pushing three full definition sets over IPC. Load lands on Companion, not the device.
