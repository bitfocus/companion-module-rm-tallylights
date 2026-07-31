# v1 execution log — 2026-07-31

Record of the subagent-driven execution of
`docs/superpowers/plans/2026-07-31-companion-module-v1.md`: what each task
review found, which findings were fixed, and the rulings on those deliberately
deferred. Preserved here because the scratch workspace it came from was
git-ignored and removed with the worktree.

## Ledger

```
# SDD ledger
created: 086fe6c on feat/v1-module
Task 1: complete (commits 086fe6c..3152f00, review clean — spec OK, 0 critical/important)
Task 1: minor (deferred): package.json repository URL still template placeholder (companion-module-your-module-name); manifest maintainers still "Your name"/"Your email" — FOLD INTO TASK 7 (pre-ship polish)
Task 1: minor (deferred): yarn install emits YN0060 peer-dep warning (eslint 9.39.5 vs @companion-module/tools peer) — inherited from upstream template, not ours
Task 1: minor (deferred): all verification ran on Node v22.14.0 vs declared engines floor ^22.20; no strict-engines in .yarnrc.yml so it passed silently
Task 1: resolved by controller: base 2.0.4 <-> Companion 5.1.0 pairing confirmed (2.0.4 is what current official companion-module-template-ts pins)
Task 2: review 1 (commits 3152f00..02ac2e0) — spec OK on interfaces; 1 important: tsconfig.json TS6059 rootDir conflict (include adds test/**/*.ts but inherits rootDir ./src)
Task 2: minor (deferred): no test exercises the real AbortController timeout path — gap in the brief's specified test list, Task 5 relies on the null-status distinction
Task 2: minor (deferred): isValidCam/isValidDisplayCam are near-duplicate one-liners, not worth abstracting at this size
Task 2: fix round 1/5 dispatched — resumed implementer ae145dfd8f3006731 with the tsconfig finding
Task 2: fix round 1/5 (1 addressed, 0 open — tsconfig rootDir; commits 02ac2e0..8dd7bf7)
Task 2: complete (commits 3152f00..8dd7bf7, review clean, 19/19 tests)
Task 3: complete (commits 8dd7bf7..aad0301, review clean, 28/28 tests, never-throw invariant adversarially traced)
Task 3: minor (deferred): the two fetchCameras failure tests hit the same !result.ok branch; distinction lives in apiGet
Task 3: minor (deferred): entry cast twice in parseCameraList (id then name); one combined cast would be DRYer
Task 3: minor (deferred): tests don't cover array-as-cams-entry, null entry, NaN/Infinity/numeric-string ids — trace confirms safe, but tests don't make it self-evident
Task 3: resolved by controller: reviewer noted malformed response is indistinguishable from empty list with no diagnostic trail. Mitigated at the caller — Task 5's connect() logs 'info' ("No camera list available - actions will use manual camera entry") when the list comes back empty. Confirm that log survives Task 5 review.
Task 4: review 1 (commits aad0301..905adfc) — spec OK; 1 important PLAN-MANDATED: resolveCam('',0,true) returns 0 not null (Number('')===0, isValidDisplayCam(0) true) -> blank dropdown sends a real "none" command; update_display with live=preview=0 turns ALL cameras off
Task 4: ESCALATED to human (plan-mandated finding). Ruling: FIX IT — add digit-only guard. Plan amended in commit 098f209 (guard + 7 regression tests, 45 total); task-4-brief.md regenerated to match.
Task 4: minor (deferred): "prepends None" test asserts only choices[0] and length, not full-array equality
Task 4: minor (deferred): task-4-report.md miscounts new-test split as 7+7; diff has 3 cameraChoices + 7 resolveCam
Task 4: fix round 1/5 dispatched — resumed implementer afc53ff2acaedf6db with the guard + 7 tests
Task 4: fix round 1/5 (1 addressed, 0 open — digit-only guard; commits 905adfc..6aa53a3). RED showed 6/7 failing, correctly explained: 'Infinity' already returned null under the old Number.isFinite check.
Task 4: complete (commits aad0301..6aa53a3, review clean, 45/45 tests)
Task 5: BLOCKED on first dispatch — plan used callback-style isVisible, which does not exist in base 2.0.4 (1.x API). Implementer correctly refused to guess.
Task 5: resolved by controller (mechanism swap, intent unchanged, no human gate needed): use isVisibleExpression `$(options:<id>) == 'manual'` + disableAutoExpression:true on the dropdown. Verified in module-api/input.d.ts:31-44; line 348 recommends exactly this pattern. Plan amended, brief regenerated.
Task 5: SIDE BENEFIT — disableAutoExpression:true + no allowCustom closes the Task 4 reviewer's open question about whether the dropdown could deliver blank/arbitrary text to resolveCam. It cannot.
Task 5: re-dispatched (resumed a97ced45841cadf3e) with the corrected brief
Task 5: complete (commits 6aa53a3..e61e2db, review clean — spec OK, 0 critical/important, all 9 adversarial checks traced clean, 45/45 tests)
Task 5: allowed deviation: cameraOptions made generic <TKey extends string> so option ids keep literal types for ActionsSchema. Reviewer verified type-level only, byte-identical runtime values.
Task 5: minor (deferred, plan-mandated): update_display defaults both dropdowns to NONE, so a fresh unconfigured button sends live=0,preview=0 = all lights off. RULING: default stands — NONE is the safest default; defaulting to a camera would put a wrong camera to air instead. Mitigated by the action's description text.
Task 5: minor (deferred): cameraChoices recomputed per action (4x identical for includeNone:false); harmless at <=32 cameras
Task 5: resolved by controller: plan said "six parameterless actions", there are five. Plan corrected.
Task 5: carried to Task 7: isVisibleExpression syntax unverified against live Companion. Added explicit Step 3b to Task 7 to check the manual field hides/shows.
Task 6: PLAN DEFECT found pre-dispatch by controller (verified against installed base 2.0.4 types, not assumed):
  - setPresetDefinitions takes TWO args (structure, presets) per base.d.ts:108 — plan called it with one + `as never`
  - preset type is 'simple' not 'button' (preset/definition.d.ts)
  - no `category` field; grouping is via CompanionPresetSection whose definitions may be string[] (preset/structure.d.ts)
  - size '14' IS valid (CompanionTextSize, style.d.ts:2)
  - plan's `\\nLIVE` would have emitted a literal backslash-n; corrected to \n
  Resolved by controller (mechanism, same shipped presets): Task 6 rewritten with sections general/cameras, cameras section omitted when empty, and an explicit ban on casting past the types.
Task 6: complete (commits f2ec964..18605e5, review clean — spec OK, 0 critical/important, zero casts, main.ts untouched, ModuleSchema was already exported)
Task 6: minor (deferred, plan-mandated): Live/Preview per-camera blocks are ~12 lines of near-verbatim duplication; could fold into a helper like simple(). Plan specified this structure.
Task 6: minor (deferred): no test coverage for preset shape, so a future action-id typo in presets.ts would not be caught by CI
Task 6: resolved by controller: reviewer's ⚠️ on whether getCameras() does I/O — it is a synchronous getter returning the cached this.cameras field (confirmed in Task 5 review). No I/O in presets.ts.
--- All code tasks (1-6) complete. Task 7 is manual hardware verification, requires the user. ---
FINAL whole-branch review (opus, 086fe6c..18605e5): "Ready to merge: With fixes"
  CRITICAL #1: apiGet builds the URL OUTSIDE the try block, so new URL('http://:80/test') THROWS on the default empty host. init() rejects -> updateActions()/updatePresets() never run -> user adds the connection and sees ZERO actions. Reviewer verified by executing dist/api.js. Violates the ApiResult-always-resolves contract that both call sites assume without try/catch.
  IMPORTANT #2: connect() checks `probe.status === null`, i.e. WHETHER there is a status, not what it is. A 404 from any other web server -> green connection, every button silently fails. Contradicts the plan's own "only the HTTP status is meaningful".
  IMPORTANT #3: 3000ms default timeout is too short for /allOff and /allIdle. Firmware sendEspNowMessage blocks ~100ms per camera (240ms for offline ones) and only sends HTTP 200 after the whole loop: 32 cameras ~3.5s, 13 offline ~3.1s. Abort fires -> "master unreachable" + red status AFTER the command succeeded, and the aborted mid-response client is exactly the HTTP_MAX_DATA_WAIT pressure spec S4 exists to avoid. SPEC DEFECT (S8 picked 3000 without this arithmetic).
  IMPORTANT #4: .github/workflows/node.yaml:52-73 has the whole test job commented out (template default). The 45 tests NEVER run in CI.
  IMPORTANT #5: singleCamera types options as Record<string, unknown>, discarding the ActionsSchema typing; an option-id rename would compile clean and silently make all four camera actions inert.
  IMPORTANT #6: actions.ts/presets.ts have zero tests, leaving all cross-file contracts (option-id<->resolveCam, action-id<->preset actionId) unpinned. Unit-reachable with a stub.
  IMPORTANT #7: single-camera actions default to MANUAL with 1 prefilled -> an untouched "Set Camera Live" button puts camera 1 TO AIR. Opposite risk posture from update_display's NONE default.
  Minors #8-13: log omits address (spec S11 says include URL); MIN_CAM/MAX_CAM duplicated as literals in actions.ts; a 400 doesn't clear stale ConnectionFailure though it proves reachability; firmware 500 = light didn't change, logged same as user error; cameraChoices computed 6x; placeholders in package.json/manifest/HELP.md/README.md/LICENSE (LICENSE still says Copyright 2022 Bitfocus AS).
  #14 verified NON-issues (do not "fix"): manifest apiVersion 0.0.0 is rewritten at package time by build-util.js:110; name/shortname split matches Bitfocus convention; Regex.HOSTNAME accepts IPs.
  PLAN GAP: spec S167 promises the stale-camera-name caveat lands in the README, but Task 7 only covers companion/HELP.md. README.md and LICENSE must be added to Task 7's file list.
  isVisibleExpression DOWNGRADED to acceptable-to-defer: input.d.ts:30-38 documents exactly this syntax and the disableAutoExpression requirement, both satisfied. Still verify visually in Task 7 Step 3b.
FINAL fix wave: all 11 findings fixed (commits 6c5c86d..2935e1d: 95fd85f fix, 2935e1d tests). Tests 45 -> 91.
FINAL scoped re-review: ALL 11 ADDRESSED, no new Critical/Important breakage. Verified: apiGet has no throwing path outside the try; connect() still 2 requests on success / 1 on either failure branch (only 3 apiGet call sites exist repo-wide); UNSET is first in cameraChoices and the default for all 6 pickers; em dash confirmed U+2014 by codepoint; no pre-existing test deleted; node.yaml changed only by uncommenting.
  Re-reviewer independently judged the new tests as real behaviour tests, not stub-echo: the preset-actionId test checks against the live Object.keys of the real UpdateActions map, and the no-sendCommand-on-unusable-selection tests invoke the real callback and assert zero calls.
  Re-reviewer contested one implementer claim: "no unit seam for findings 2/8/10" is overstated — InstanceBase's constructor only duck-types isInstanceContext, so a stub was reachable. Not blocking (those findings never required unit tests). Left as a known coverage gap: the wrong-device /test branch, the address-in-log change, and the 400-clears-stale-failure change are diff-verified only.
STATE: all code complete and reviewed on feat/v1-module @ 2935e1d. 91 tests, build/lint/tsc clean. NOT pushed. NOT merged.
REMAINING: Task 7 (hardware verification + packaging) — requires the user's rig and a running Companion. Workspace deliberately NOT deleted; task-7-brief.md is still needed.
```

## Final fix wave report

# Final whole-branch review — fix report

Branch `feat/v1-module`, base HEAD `6c5c86d`. All eleven findings applied. Nothing under `docs/` touched.

## Per-finding changes

### 1. CRITICAL — `apiGet` threw instead of resolving when `host` is empty (`src/api.ts`)

Moved the `buildUrl` call inside the `try` (now inlined into the `fetch` argument), so
`new URL('http://:80/test')` throwing on the default empty host is caught by the existing
`catch` and returns `{ ok: false, status: null, body: '' }`. Added a doc comment on `apiGet`
stating in capitals that it **never rejects**, naming both call sites that depend on it and
explaining why the URL build must stay inside the `try`. Updated the `catch` comment to list
"invalid URL" as a cause.

Tests (`test/api.test.ts`):

- `resolves rather than throwing when the host is empty` — asserts the result **and** that
  `fetch` was never called, proving the failure happens at URL construction rather than in
  the network layer.
- `aborts and reports a null status when the request outlives timeoutMs` — real abort path
  with `vi.useFakeTimers()` and a `fetch` stub that rejects on `signal`'s `abort` event. It
  advances to 2999 ms and asserts `signal.aborted === false`, then advances 1 ms more and
  asserts `signal.aborted === true` before asserting the resolved value, so the test pins
  that the abort is driven by `timeoutMs` and not by something incidental.
- `afterEach` now also calls `vi.useRealTimers()`.

### 2. IMPORTANT — the `/test` probe ignored the HTTP status value (`src/main.ts`)

Added the `else if (!probe.ok)` branch between the `status === null` branch and the success
path, with the wrong-device message and `this.cameras = []`. Only the status is inspected;
the body is not compared. The branch makes **no** additional request, so `connect()` still
issues exactly two requests on the success path and exactly one on either failure path.

### 3. IMPORTANT — default request timeout raised to 10000 ms (`src/config.ts`, `src/main.ts`)

`default: 3000` → `default: 10000`, with a comment recording the firmware measurement
(~100 ms per online camera, ~240 ms per offline one, ~7.7 s for 32 offline cameras on
`/allOff` and `/allIdle`, reply sent only after the whole loop). `min: 500` / `max: 30000`
left alone.

The network-failure log in `sendCommand` is now honest about the ambiguity:

```
Request to <host>:<port><path> got no response within <timeoutMs>ms — the master may still have executed it
```

### 4. IMPORTANT — CI never ran the tests (`.github/workflows/node.yaml`)

Uncommented the `test:` job verbatim, including dropping the "Uncomment this to enable
running unit tests" comment line. Nothing else in the workflow changed — the `lint` job is
untouched.

### 5. IMPORTANT — `singleCamera` discarded the `ActionsSchema` typing (`src/actions.ts`)

```typescript
const singleCamera = (path: string) => async (event: { options: ActionsSchema['set_live_cam']['options'] }) => {
	const cam = resolveCam(event.options.cam, event.options.cam_manual, false)
```

The `String()` / `Number()` wrappers are gone. Removed the equivalent redundant wrappers in
the `update_display` callback too, since that callback already had correct inferred types and
leaving them would have been inconsistent with the same fix one function above.

### 6. IMPORTANT — `actions.ts` and `presets.ts` had no tests

Added `test/actions.test.ts` (32 tests) and `test/presets.test.ts` (9 tests). Both use a
minimal local object cast through `as unknown as ModuleInstance` supplying only
`getCameras`, `log`, `setActionDefinitions`, `setPresetDefinitions` and `sendCommand`. No
mocking library added. `ModuleInstance` and the base types are imported as `import type`, so
nothing from `@companion-module/base` is loaded at runtime by `actions.test.ts`.

`test/actions.test.ts` covers:

- the ten action ids are exactly the documented ten;
- each of the four single-camera actions sends its own path with `{ cam: 3 }` for
  `{ cam: '3', cam_manual: 1 }`, and `{ cam: 7 }` for `{ cam: MANUAL, cam_manual: 7 }`;
- **no** `sendCommand` call at all (not a call with a wrong value) for the unconfigured
  `UNSET` default, for an out-of-range manual value, and for `NONE` on an action that does
  not accept it — each asserting `calls` is empty, plus exactly one `warn` log;
- `update_display` sends both `live` and `preview`, accepts `NONE` as `0`, and sends nothing
  at all when either half alone is unusable;
- `auto` → `/auto`, `all_idle` → `/allIdle`, `all_off` → `/allOff`,
  `onair_on` → `status: 'onair'`, `onair_off` → `status: 'offair'`;
- every camera dropdown across all five camera-bearing actions defaults to `UNSET` (finding
  7), enumerating the six field paths so a newly added picker that is not defaulted is
  caught;
- the manual field's `min`/`max` are the imported `MIN_CAM`/`MAX_CAM` (finding 9);
- with an empty camera list, manual entry still works.

`test/presets.test.ts` covers:

- section contents and preset count;
- every section-referenced id is a real preset definition;
- **every preset `actionId` is a key of the real action-definitions map** — the map comes
  from running `UpdateActions` against the same stub in the same `build()` call, so it is the
  real map, not a hand-copied list;
- **every preset's own options, fed through the real action callback, produce exactly one
  `sendCommand` call** — this pins the preset option key names against `resolveCam`'s
  arguments, which a pure structural assertion would not;
- the `cameras` section is absent (not empty) when `getCameras()` returns `[]`.

### 7. IMPORTANT — an unconfigured button fired a real command

`src/camera-picker.ts` exports `const UNSET = 'unset'`, and `cameraChoices` now seeds the
array with `{ id: UNSET, label: '— select a camera —' }` before `None` and the cameras, for
every picker. The dash is U+2014 (verified: codepoints `0x2014`), matching the `3 — Dolly`
style. `resolveCam` is unchanged — `UNSET` falls through its digit-only guard to `null`.

`src/actions.ts` now uses `default: UNSET` for every dropdown, single-camera actions and both
`Set Live + Preview` halves, replacing `includeNone ? NONE : MANUAL`.

Existing `camera-picker` assertions were updated to include the new first entry (exact-array
assertions extended, `None` assertion moved from index 0 to index 1, length 4 → 5). No
existing test was deleted or loosened. Added the two pinning tests
`resolveCam(UNSET, 1, false)` and `resolveCam(UNSET, 1, true)` → `null`, plus a test that
`UNSET` is first for all three `cameraChoices` shapes.

### 8. MINOR — failure logs omitted the address (`src/main.ts`)

`sendCommand` computes `const addr = \`${target.host}:${target.port}${path}\`` once and uses
it in all three log lines (no-response, rejected, and the debug OK line).

### 9. MINOR — camera bounds duplicated as literals (`src/actions.ts`)

Imports `MIN_CAM, MAX_CAM` from `./api.js`. `max: 32` → `max: MAX_CAM`, and
`min: includeNone ? 0 : 1` → `min: includeNone ? 0 : MIN_CAM`. The literal `0` is kept for the
`includeNone` case because it is `update_display`'s "none", not a camera bound.

### 10. MINOR — a non-ok HTTP response left a stale `ConnectionFailure` (`src/main.ts`)

`this.updateStatus(InstanceStatus.Ok)` added before the early return in the `!result.ok`
branch, with a comment noting a 400 is not a success but is proof of reachability.

### 11. MINOR — hoisted the repeated `cameraChoices` call (`src/actions.ts`)

`UpdateActions` computes `cameras`, `camChoices` and `displayChoices` once per call.
`cameraOptions` no longer takes `self` — it takes the prebuilt `Choice[]`, which also removed
its only reason to know about `ModuleInstance`. Six `cameraChoices` invocations per
`UpdateActions` became two.

## Mutation checks

Each new high-value test was verified to fail when the defect it targets is reintroduced
(source restored immediately after each check):

| Reintroduced defect                                   | Result                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `buildUrl` hoisted back outside the `try`             | `× resolves rather than throwing when the host is empty` — `1 failed \| 20 passed`                 |
| abort timer changed to `target.timeoutMs * 2`         | `× aborts and reports a null status when the request outlives timeoutMs` — `1 failed \| 20 passed` |
| picker `default: UNSET` → `default: MANUAL`           | `× defaults every camera picker to the unset sentinel` — `1 failed \| 31 passed`                   |
| preset `actionId: 'set_live_cam'` → `'set_live_cams'` | 3 failures incl. `× points every preset action at a defined action` — `3 failed \| 6 passed`       |
| preset option key `cam` → `camera`                    | `× supplies option values every action can actually resolve` — `2 failed \| 7 passed`              |

The last row is the one that matters most: the option-key typo is caught by executing the
real action callback, which a stub-echo assertion would have missed.

## Verification

```
$ yarn build
build ok

$ yarn lint
lint ok

$ npx tsc -p tsconfig.json --noEmit
tsc ok

$ yarn test
 RUN  v4.1.10 /Users/rodrigoocampo/Documents/Arduino/companion-module-rm-tallylights/.worktrees/v1-module

 Test Files  5 passed (5)
      Tests  91 passed (91)
   Duration  194ms
```

Output is pristine — no warnings, no unhandled-rejection noise, no lint output at all.

Test count: **45 → 91** (+46).

| File                         | Tests         |
| ---------------------------- | ------------- |
| `test/actions.test.ts` (new) | 32            |
| `test/api.test.ts`           | 21 (was 19)   |
| `test/camera-picker.test.ts` | 20 (was 17)   |
| `test/cameras.test.ts`       | 9 (unchanged) |
| `test/presets.test.ts` (new) | 9             |

## Load-bearing constraint re-checked

- `grep -rn "setInterval\|setTimeout\|retry" src/` returns only the pre-existing abort timer
  in `apiGet` and the word "retry" inside the `sendCommand` doc comment. No timers,
  intervals, or retries introduced.
- `apiGet` call sites are unchanged in number: `/api/cameras` in `cameras.ts`, `/test` and
  the per-press command in `main.ts`. `connect()` = two requests on success, one on either
  failure branch.
- `src/api.ts`, `src/cameras.ts` and `src/camera-picker.ts` still import nothing from
  `@companion-module/base` (verified by grep).

## Files changed

Modified: `.github/workflows/node.yaml`, `src/actions.ts`, `src/api.ts`,
`src/camera-picker.ts`, `src/config.ts`, `src/main.ts`, `test/api.test.ts`,
`test/camera-picker.test.ts`.
Added: `test/actions.test.ts`, `test/presets.test.ts`.

Nothing out of scope was touched: `package.json`, `companion/manifest.json`,
`companion/HELP.md`, `README.md`, `LICENSE`, `engines`, and everything under `docs/` are
unchanged.

## Not fixed / residual notes

Nothing was declined. Two things a reviewer should know:

1. **Findings 2, 8 and 10 are not unit-tested.** They live in `ModuleInstance`, which extends
   `InstanceBase` and cannot be instantiated without a Companion host, so there is no unit
   seam for them. The brief did not ask for `main.ts` tests and adding one would have meant
   either a test-only refactor of `connect()`/`sendCommand()` or a mocking library — both out
   of scope. They were verified by reading the diff. The wrong-device branch (finding 2) is
   the one worth exercising on hardware or against any non-master HTTP server during Task 7.
2. **Finding 3 has a UX consequence worth accepting deliberately.** With a 10000 ms default,
   a button press against a powered-off master now blocks up to 10 s before the operator sees
   the warning, where it used to be 3 s. That is the intended trade — a false "unreachable"
   on a command the master actually executed is worse — but it should be on the record for
   the hardware pass.

## Task 7 — hardware verification (2026-07-31)

**PASSED.** The module was accepted and configured in Companion without
difficulty and all functionality behaved as expected. `Set On Air Lights On`
audibly clicked the relay and lit the Cabina Sonido light, proving the full
chain: Companion → module → master → ESP-NOW → relay.

All ten endpoints were additionally verified directly against the master at
192.168.0.76, bypassing the module, to establish a known-good hardware baseline:

| Check                                                               | Result                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/test`                                                             | `RM Server Working!` — confirms the reflash landed             |
| `set_live_cam` / `set_preview_cam` / `set_idle_cam` / `set_off_cam` | 200, correct mode each time                                    |
| `auto`                                                              | `Switched: Camera 1 (preview->live), Camera 2 (live->preview)` |
| `allIdle` / `allOff`                                                | `sent to 2/2 cameras`                                          |
| `update_display?live=2&preview=1`                                   | `Preview=1, Live=2`                                            |
| `update_display?live=1&preview=1`                                   | `All cameras turned off (live and preview were the same)`      |
| `onair_status` onair/offair                                         | 200; `/api/status` flipped `offair` → `onair` → `offair`       |
| `set_live_cam?cam=99`                                               | `400 Camera number must be between 1 and 32`                   |
| `onair_status?status=bogus`                                         | `400 status must be 'onair' or 'offair'`                       |

Both 400 bodies match the `test/api.test.ts` fixtures verbatim — those strings
were written from the firmware source and are now confirmed against the running
device.

Device state was captured before testing and restored afterwards (cam1 live,
cam2 idle, offair).

### Firmware behaviour discovered during verification

`set_live_cam` is **not exclusive**: setting camera 2 live left camera 1 live as
well. These are per-camera commands, so `/update_display` is the only action that
produces a clean live/preview pair. Not a defect, but it shapes how buttons
should be built.

### Step 3b — `isVisibleExpression` confirmed working

The manual-entry number field hides when a named camera is selected from the
dropdown, reappears on `Manual entry…`, and works when used. This was the only
part of the module written from type definitions
(`module-api/input.d.ts:31-44`) without ever being executed, so it was the last
unverified assumption in the build. The pattern —
`isVisibleExpression: "$(options:<id>) == '<sentinel>'"` on a field whose
referenced dropdown sets `disableAutoExpression: true` — is now known good and
safe to reuse.

### Offline degradation confirmed

With the master powered off the module behaved as designed: a red connection and
a log line rather than a crash, recovering on the first successful press once the
master returned. This exercised the `status: null` branch of `sendCommand` and
the `ConnectionFailure`-clears-on-success path, neither of which has unit
coverage (`ModuleInstance` needs a Companion host to instantiate), so it was the
only evidence available for that code.

**Task 7 is complete. Every item verified.**
