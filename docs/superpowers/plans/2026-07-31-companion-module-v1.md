# RM Tally Lights Companion Module v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Bitfocus Companion module that exposes the RM Tally Lights master's HTTP API as ten named actions plus presets, so operators stop hand-typing URLs into Generic HTTP.

**Architecture:** A TypeScript module scaffolded from `companion-module-template-ts`. All network and parsing logic lives in two Companion-free files (`api.ts`, `cameras.ts`) that are unit tested in isolation; the Companion-facing files (`actions.ts`, `presets.ts`, `main.ts`) are declarative wiring on top of them. Nothing polls: two HTTP requests when the connection is configured, one per button press.

**Tech Stack:** TypeScript, `@companion-module/base` 2.0.4, Node `^22.20`, Yarn 4.17, Vitest.

## Global Constraints

Every task's requirements implicitly include this section.

- Target Companion **5.1.0**, `@companion-module/base` **2.0.4**, Node **`^22.20`**, TypeScript **`~6.0.3`**, Yarn **4.17**.
- **No polling, ever.** Exactly two requests on `init()`/`configUpdated()`, one per button press. No timers, no intervals, no retries.
- **No feedbacks, no variables, no On Air toggle** in v1.
- Camera numbers are **1–32**. `/update_display` additionally accepts **0 = none**.
- Module identity: id `rm-tallylights`, name `RM Tally Lights`, manufacturer `Rosnell Media Group`, products `Tally Lights Manager`.
- Action names are **user-visible and final** — use them verbatim from Task 5.
- `api.ts` and `cameras.ts` MUST NOT import from `@companion-module/base`.
- Master API facts, verified against firmware:
  - `/test` → `200 text/plain` body `RM Server Working!` — the module MUST NOT compare this string; only the HTTP status is meaningful
  - `/api/cameras` → `200 application/json` body `{"cams":[{"id":1,"name":"Main Camera","address":"AA:BB:CC:DD:EE:FF","protected":true}]}`
  - Control endpoints → `200 text/plain` on success, `400 text/plain` with a human-readable reason on bad input.
- Repo: `~/Documents/Arduino/companion-module-rm-tallylights` (`rocampocr/companion-module-rm-tallylights`, branch `main`). Push with SSH.

---

### Task 1: Scaffold the module from the official template

**Files:**

- Create: everything from `companion-module-template-ts` at repo root
- Modify: `companion/manifest.json`, `package.json`
- Delete: `src/feedbacks.ts`, `src/variables.ts`

**Interfaces:**

- Consumes: nothing
- Produces: a buildable module skeleton. Later tasks rely on `src/main.ts` exporting `default class ModuleInstance extends InstanceBase<ModuleSchema>`, and on `src/config.ts` exporting `type ModuleConfig` and `GetConfigFields()`.

- [ ] **Step 1: Extract the template over the existing repo**

The repo already contains `docs/`; the template has no `docs/`, so nothing is clobbered.

```bash
cd ~/Documents/Arduino/companion-module-rm-tallylights
curl -L https://github.com/bitfocus/companion-module-template-ts/archive/refs/heads/main.tar.gz \
  | tar xz --strip-components=1
```

- [ ] **Step 2: Confirm the template landed and docs survived**

```bash
ls src/ companion/ docs/superpowers/specs/
```

Expected: `src/` contains `main.ts config.ts actions.ts feedbacks.ts presets.ts variables.ts upgrades.ts`; `companion/` contains `manifest.json HELP.md`; the spec is still in `docs/`.

- [ ] **Step 3: Install dependencies**

```bash
yarn install
```

- [ ] **Step 4: Verify the untouched template builds**

```bash
yarn build
```

Expected: PASS. If this fails, stop — the toolchain is wrong and nothing downstream will work.

- [ ] **Step 5: Set module identity in `companion/manifest.json`**

Change **only** these fields. Leave `runtime`, `api`, `apiVersion`, and `entrypoint` exactly as the template ships them — those track the base library version and must not be hand-edited.

```json
{
	"id": "rm-tallylights",
	"name": "rm-tallylights",
	"shortname": "RM Tally Lights",
	"description": "Control RM Tally Lights camera tally and On Air lights",
	"version": "1.0.0",
	"license": "MIT",
	"manufacturer": "Rosnell Media Group",
	"products": ["Tally Lights Manager"],
	"keywords": ["tally", "onair", "esp32"],
	"repository": "https://github.com/rocampocr/companion-module-rm-tallylights",
	"bugs": "https://github.com/rocampocr/companion-module-rm-tallylights/issues"
}
```

- [ ] **Step 6: Set the package name in `package.json`**

Change `"name"` to `"companion-module-rm-tallylights"` and `"version"` to `"1.0.0"`. Leave every dependency untouched.

- [ ] **Step 7: Add Vitest**

The template ships no test framework.

```bash
yarn add -D vitest
```

Then add to the `scripts` block in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Verify Vitest runs with no tests yet**

```bash
yarn test --passWithNoTests
```

Expected: PASS, zero tests.

- [ ] **Step 9: Remove feedbacks and variables**

v1 has neither. Delete the files:

```bash
rm src/feedbacks.ts src/variables.ts
```

Then in `src/main.ts` remove the two imports (`UpdateFeedbacks`, `UpdateVariableDefinitions`), the two wrapper methods, the two calls inside `init()`, and the `feedbacks` and `variables` keys from the `ModuleSchema` type.

Leave `src/upgrades.ts` in place — Companion requires the upgrade-scripts export even when the array is empty.

- [ ] **Step 10: Verify it still builds**

```bash
yarn build && yarn lint
```

Expected: both PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold module from companion-module-template-ts

Sets module identity for Rosnell Media Group, adds Vitest, and removes
the feedbacks and variables files since v1 ships neither."
```

---

### Task 2: `api.ts` — URL building and the GET helper

**Files:**

- Create: `src/api.ts`
- Test: `test/api.test.ts`

**Interfaces:**

- Consumes: nothing (no Companion imports — enforced)
- Produces:
  - `type ApiTarget = { host: string; port: number; timeoutMs: number }`
  - `type ApiResult = { ok: boolean; status: number | null; body: string }`
  - `buildUrl(target: { host: string; port: number }, path: string, params?: Record<string, string | number>): string`
  - `apiGet(target: ApiTarget, path: string, params?: Record<string, string | number>): Promise<ApiResult>`
  - `MIN_CAM: 1`, `MAX_CAM: 32`
  - `isValidCam(cam: number): boolean`
  - `isValidDisplayCam(cam: number): boolean`

`status: null` specifically means network error or timeout, as distinct from an HTTP status. Task 6 depends on that distinction to decide whether to set `ConnectionFailure`.

- [ ] **Step 1: Write the failing tests**

Create `test/api.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildUrl, apiGet, isValidCam, isValidDisplayCam } from '../src/api.js'

describe('buildUrl', () => {
	it('builds a bare path and omits the default port', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 80 }, '/auto')).toBe('http://192.168.0.76/auto')
	})

	it('includes a non-default port', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 8080 }, '/auto')).toBe('http://192.168.0.76:8080/auto')
	})

	it('appends a single query param', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 80 }, '/set_live_cam', { cam: 3 })).toBe(
			'http://192.168.0.76/set_live_cam?cam=3',
		)
	})

	it('appends both update_display params including zero', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 80 }, '/update_display', { live: 2, preview: 0 })).toBe(
			'http://192.168.0.76/update_display?live=2&preview=0',
		)
	})

	it('accepts a hostname as well as an IP', () => {
		expect(buildUrl({ host: 'tally.local', port: 80 }, '/allOff')).toBe('http://tally.local/allOff')
	})
})

describe('isValidCam', () => {
	it.each([1, 17, 32])('accepts %i', (cam) => {
		expect(isValidCam(cam)).toBe(true)
	})

	it.each([0, -1, 33, 1.5, NaN])('rejects %s', (cam) => {
		expect(isValidCam(cam)).toBe(false)
	})
})

describe('isValidDisplayCam', () => {
	it('accepts 0 because update_display treats it as none', () => {
		expect(isValidDisplayCam(0)).toBe(true)
	})

	it('still rejects out of range values', () => {
		expect(isValidDisplayCam(33)).toBe(false)
	})
})

describe('apiGet', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('reports success for a 200', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('RM Server Working!', { status: 200 })))
		const result = await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/test')
		expect(result).toEqual({ ok: true, status: 200, body: 'RM Server Working!' })
	})

	it("surfaces the master's 400 reason verbatim", async () => {
		const reason = 'Camera number must be between 1 and 32'
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(reason, { status: 400 })))
		const result = await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/set_live_cam', { cam: 99 })
		expect(result).toEqual({ ok: false, status: 400, body: reason })
	})

	it('reports a network error with a null status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
		const result = await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/test')
		expect(result).toEqual({ ok: false, status: null, body: '' })
	})

	it('passes the built URL to fetch', async () => {
		const spy = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
		vi.stubGlobal('fetch', spy)
		await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/set_off_cam', { cam: 4 })
		expect(spy.mock.calls[0][0]).toBe('http://192.168.0.76/set_off_cam?cam=4')
	})
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
yarn test
```

Expected: FAIL — cannot resolve `../src/api.js`.

- [ ] **Step 3: Write the implementation**

Create `src/api.ts`:

```typescript
export const MIN_CAM = 1
export const MAX_CAM = 32

export interface ApiTarget {
	host: string
	port: number
	timeoutMs: number
}

export interface ApiResult {
	/** True only for a 2xx response. */
	ok: boolean
	/** HTTP status, or null for a network error or timeout. */
	status: number | null
	body: string
}

export function buildUrl(
	target: Pick<ApiTarget, 'host' | 'port'>,
	path: string,
	params: Record<string, string | number> = {},
): string {
	const url = new URL(`http://${target.host}:${target.port}${path}`)
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, String(value))
	}
	return url.toString()
}

export function isValidCam(cam: number): boolean {
	return Number.isInteger(cam) && cam >= MIN_CAM && cam <= MAX_CAM
}

/** update_display accepts 0, meaning "none". */
export function isValidDisplayCam(cam: number): boolean {
	return Number.isInteger(cam) && cam >= 0 && cam <= MAX_CAM
}

export async function apiGet(
	target: ApiTarget,
	path: string,
	params: Record<string, string | number> = {},
): Promise<ApiResult> {
	const url = buildUrl(target, path, params)
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), target.timeoutMs)

	try {
		const response = await fetch(url, { signal: controller.signal })
		const body = await response.text()
		return { ok: response.ok, status: response.status, body }
	} catch {
		// Network error, DNS failure, or the abort above firing.
		return { ok: false, status: null, body: '' }
	} finally {
		clearTimeout(timer)
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test
```

Expected: PASS, 19 tests.

- [ ] **Step 5: Verify the no-Companion-imports rule**

```bash
grep -c "@companion-module" src/api.ts || echo "clean"
```

Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add src/api.ts test/api.test.ts
git commit -m "feat: add HTTP client with URL building and camera validation

Keeps a null status distinct from an HTTP status so callers can tell a
network failure from a rejected request. No Companion imports, so this is
unit testable in isolation."
```

---

### Task 3: `cameras.ts` — fetching, parsing, and caching the camera list

**Files:**

- Create: `src/cameras.ts`
- Test: `test/cameras.test.ts`

**Interfaces:**

- Consumes: `ApiTarget`, `apiGet` from `src/api.js`
- Produces:
  - `interface Camera { id: number; name: string }`
  - `parseCameraList(body: string): Camera[]` — returns `[]` on any malformed input, never throws
  - `fetchCameras(target: ApiTarget): Promise<Camera[]>`

Task 5 turns `Camera[]` into dropdown choices. This file deliberately does not know about Companion's choice format.

- [ ] **Step 1: Write the failing tests**

Create `test/cameras.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseCameraList, fetchCameras } from '../src/cameras.js'

const REAL_BODY =
	'{"cams":[{"id":1,"name":"Main Camera","address":"AA:BB:CC:DD:EE:FF","protected":true},' +
	'{"id":3,"name":"Dolly","address":"11:22:33:44:55:66","protected":false}]}'

describe('parseCameraList', () => {
	it('parses the real master payload', () => {
		expect(parseCameraList(REAL_BODY)).toEqual([
			{ id: 1, name: 'Main Camera' },
			{ id: 3, name: 'Dolly' },
		])
	})

	it('returns an empty list for an empty cams array', () => {
		expect(parseCameraList('{"cams":[]}')).toEqual([])
	})

	it('returns an empty list for malformed JSON rather than throwing', () => {
		expect(parseCameraList('not json at all')).toEqual([])
	})

	it('returns an empty list when the cams key is missing', () => {
		expect(parseCameraList('{"something":1}')).toEqual([])
	})

	it('skips entries with an unusable id', () => {
		expect(parseCameraList('{"cams":[{"id":"x","name":"Bad"},{"id":2,"name":"Good"}]}')).toEqual([
			{ id: 2, name: 'Good' },
		])
	})

	it('falls back to a generated name when name is missing', () => {
		expect(parseCameraList('{"cams":[{"id":5}]}')).toEqual([{ id: 5, name: 'Camera 5' }])
	})
})

describe('fetchCameras', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns parsed cameras on success', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(REAL_BODY, { status: 200 })))
		const cameras = await fetchCameras({ host: '192.168.0.76', port: 80, timeoutMs: 3000 })
		expect(cameras).toEqual([
			{ id: 1, name: 'Main Camera' },
			{ id: 3, name: 'Dolly' },
		])
	})

	it('returns an empty list when the master is unreachable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
		const cameras = await fetchCameras({ host: '192.168.0.76', port: 80, timeoutMs: 3000 })
		expect(cameras).toEqual([])
	})

	it('returns an empty list on a non-200', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })))
		const cameras = await fetchCameras({ host: '192.168.0.76', port: 80, timeoutMs: 3000 })
		expect(cameras).toEqual([])
	})
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
yarn test
```

Expected: FAIL — cannot resolve `../src/cameras.js`.

- [ ] **Step 3: Write the implementation**

Create `src/cameras.ts`:

```typescript
import { apiGet, type ApiTarget } from './api.js'

export interface Camera {
	id: number
	name: string
}

/**
 * Parses the master's /api/cameras payload.
 * Returns [] for anything unusable — an empty list is a valid state that
 * callers already handle by falling back to manual camera entry.
 */
export function parseCameraList(body: string): Camera[] {
	let parsed: unknown
	try {
		parsed = JSON.parse(body)
	} catch {
		return []
	}

	const cams = (parsed as { cams?: unknown })?.cams
	if (!Array.isArray(cams)) return []

	const cameras: Camera[] = []
	for (const entry of cams) {
		const id = (entry as { id?: unknown })?.id
		if (typeof id !== 'number' || !Number.isInteger(id)) continue

		const rawName = (entry as { name?: unknown })?.name
		const name = typeof rawName === 'string' && rawName.length > 0 ? rawName : `Camera ${id}`

		cameras.push({ id, name })
	}
	return cameras
}

export async function fetchCameras(target: ApiTarget): Promise<Camera[]> {
	const result = await apiGet(target, '/api/cameras')
	if (!result.ok) return []
	return parseCameraList(result.body)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test
```

Expected: PASS, 28 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/cameras.ts test/cameras.test.ts
git commit -m "feat: add camera list fetching and parsing

Parsing never throws — a malformed or unreachable response yields an empty
list, which callers already treat as the manual-entry fallback."
```

---

### Task 4: The camera picker option builder

**Files:**

- Create: `src/camera-picker.ts`
- Test: `test/camera-picker.test.ts`

**Interfaces:**

- Consumes: `Camera` from `src/cameras.js`; `isValidCam`, `isValidDisplayCam` from `src/api.js`
- Produces:
  - `MANUAL = 'manual'`, `NONE = 'none'`
  - `cameraChoices(cameras: Camera[], includeNone: boolean): Array<{ id: string; label: string }>`
  - `resolveCam(dropdownValue: string, manualValue: number, allowNone: boolean): number | null`

`resolveCam` returns `null` for anything invalid; Task 5 turns that into a logged warning and skips the request. Dropdown ids are strings throughout because the `manual` and `none` sentinels share the field with numeric camera ids.

- [ ] **Step 1: Write the failing tests**

Create `test/camera-picker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { cameraChoices, resolveCam, MANUAL, NONE } from '../src/camera-picker.js'

const CAMERAS = [
	{ id: 1, name: 'Main Camera' },
	{ id: 3, name: 'Dolly' },
]

describe('cameraChoices', () => {
	it('labels cameras as "id — name" and appends the manual option', () => {
		expect(cameraChoices(CAMERAS, false)).toEqual([
			{ id: '1', label: '1 — Main Camera' },
			{ id: '3', label: '3 — Dolly' },
			{ id: MANUAL, label: 'Manual entry…' },
		])
	})

	it('prepends None when asked', () => {
		const choices = cameraChoices(CAMERAS, true)
		expect(choices[0]).toEqual({ id: NONE, label: 'None' })
		expect(choices).toHaveLength(4)
	})

	it('still offers manual entry when no cameras are known', () => {
		expect(cameraChoices([], false)).toEqual([{ id: MANUAL, label: 'Manual entry…' }])
	})
})

describe('resolveCam', () => {
	it('resolves a numeric dropdown value', () => {
		expect(resolveCam('3', 0, false)).toBe(3)
	})

	it('resolves the manual value when manual is selected', () => {
		expect(resolveCam(MANUAL, 12, false)).toBe(12)
	})

	it('rejects an out of range manual value', () => {
		expect(resolveCam(MANUAL, 99, false)).toBeNull()
	})

	it('rejects zero when none is not allowed', () => {
		expect(resolveCam('0', 0, false)).toBeNull()
	})

	it('resolves None to 0 when allowed', () => {
		expect(resolveCam(NONE, 0, true)).toBe(0)
	})

	it('rejects None when not allowed', () => {
		expect(resolveCam(NONE, 0, false)).toBeNull()
	})

	it('rejects a non-numeric dropdown value', () => {
		expect(resolveCam('banana', 0, false)).toBeNull()
	})

	// Regression guards: Number('') and Number('   ') are both 0, which
	// isValidDisplayCam accepts as "none". Without a digit-only guard a blank
	// dropdown value would send a real command instead of being skipped.
	it('rejects a blank dropdown value even when None is allowed', () => {
		expect(resolveCam('', 0, true)).toBeNull()
	})

	it('rejects a whitespace dropdown value even when None is allowed', () => {
		expect(resolveCam('   ', 0, true)).toBeNull()
	})

	it.each(['0x3', '1e1', '+3', ' 3 ', 'Infinity'])('rejects the non-digit form %s', (value) => {
		expect(resolveCam(value, 0, false)).toBeNull()
	})
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
yarn test
```

Expected: FAIL — cannot resolve `../src/camera-picker.js`.

- [ ] **Step 3: Write the implementation**

Create `src/camera-picker.ts`:

```typescript
import { isValidCam, isValidDisplayCam } from './api.js'
import type { Camera } from './cameras.js'

export const MANUAL = 'manual'
export const NONE = 'none'

export interface Choice {
	id: string
	label: string
}

export function cameraChoices(cameras: Camera[], includeNone: boolean): Choice[] {
	const choices: Choice[] = []
	if (includeNone) {
		choices.push({ id: NONE, label: 'None' })
	}
	for (const camera of cameras) {
		choices.push({ id: String(camera.id), label: `${camera.id} — ${camera.name}` })
	}
	choices.push({ id: MANUAL, label: 'Manual entry…' })
	return choices
}

/**
 * Turns a dropdown selection plus its manual companion field into a camera
 * number. Returns null when the selection is unusable.
 */
export function resolveCam(dropdownValue: string, manualValue: number, allowNone: boolean): number | null {
	const validate = allowNone ? isValidDisplayCam : isValidCam

	if (dropdownValue === NONE) {
		return allowNone ? 0 : null
	}

	if (dropdownValue === MANUAL) {
		return validate(manualValue) ? manualValue : null
	}

	// Digit-only. Number() would turn '' and '   ' into 0 — which isValidDisplayCam
	// accepts as "none" — so a blank dropdown value would send a real command
	// instead of being warned and skipped. It would also accept '0x3', '1e1',
	// '+3' and ' 3 ' as cameras. Real dropdown ids are always plain digits.
	if (!/^\d+$/.test(dropdownValue)) return null

	const parsed = Number(dropdownValue)
	return validate(parsed) ? parsed : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test
```

Expected: PASS, 45 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/camera-picker.ts test/camera-picker.test.ts
git commit -m "feat: add camera picker choices and resolution

Dropdown ids are strings so the manual and none sentinels can share the
field with numeric camera ids. Invalid selections resolve to null rather
than a bogus camera number."
```

---

### Task 5: `actions.ts`, `config.ts`, and `main.ts` — actions and wiring

**Files:**

- Modify: `src/actions.ts` (replace the template's sample action entirely)
- Modify: `src/config.ts` (replace the template's host/port fields)
- Modify: `src/main.ts` (add instance members, replace `init` and `configUpdated`)

**Interfaces:**

- Consumes: `apiGet`, `ApiTarget` from `src/api.js`; `fetchCameras`, `Camera` from `src/cameras.js`; `cameraChoices`, `resolveCam`, `MANUAL`, `NONE` from `src/camera-picker.js`
- Produces:
  - `UpdateActions(self: ModuleInstance): void`
  - `type ModuleConfig = { host: string; port: number; timeout: number }`
  - `GetConfigFields(): SomeCompanionConfigField[]`
  - `ModuleInstance.getApiTarget(): ApiTarget`, `.getCameras(): Camera[]`, `.sendCommand(path, params): Promise<void>`

**Note:** this task merges what were originally Tasks 5 and 6. They are combined because `actions.ts` references instance members that only the wiring adds, so neither half compiles on its own. The combined task ends with a green build and is genuinely reviewable.

Action names are user-visible and final:

| Action id         | Name                     |
| ----------------- | ------------------------ |
| `set_live_cam`    | Set Camera Live          |
| `set_preview_cam` | Set Camera Preview       |
| `set_idle_cam`    | Set Camera Idle          |
| `set_off_cam`     | Set Camera Off           |
| `update_display`  | Set Live + Preview       |
| `auto`            | Auto (swap live/preview) |
| `all_idle`        | All Cameras Idle         |
| `all_off`         | All Cameras Off          |
| `onair_on`        | Set On Air Lights On     |
| `onair_off`       | Set On Air Lights Off    |

- [ ] **Step 1: Replace `src/actions.ts` wholesale**

```typescript
import { cameraChoices, resolveCam, MANUAL, NONE } from './camera-picker.js'
import type ModuleInstance from './main.js'

/** Builds the dropdown + manual-number field pair for one camera selection. */
function cameraOptions(self: ModuleInstance, idPrefix: string, label: string, includeNone: boolean) {
	return [
		{
			id: idPrefix,
			type: 'dropdown' as const,
			label,
			default: includeNone ? NONE : MANUAL,
			choices: cameraChoices(self.getCameras(), includeNone),
			// Required so the manual field's isVisibleExpression may reference this
			// field. Also prevents the user turning the camera picker into an
			// arbitrary expression, which is the only way blank or non-digit text
			// could otherwise reach resolveCam.
			disableAutoExpression: true,
		},
		{
			id: `${idPrefix}_manual`,
			type: 'number' as const,
			label: `${label} (manual)`,
			default: 1,
			min: includeNone ? 0 : 1,
			max: 32,
			// base 2.x has no callback-style isVisible; visibility is a Companion
			// expression string evaluated in the UI. Fields referenced here must set
			// disableAutoExpression (see above).
			isVisibleExpression: `$(options:${idPrefix}) == '${MANUAL}'`,
		},
	]
}

export function UpdateActions(self: ModuleInstance): void {
	/** Shared handler for the four single-camera actions. */
	const singleCamera = (path: string) => async (event: { options: Record<string, unknown> }) => {
		const cam = resolveCam(String(event.options.cam), Number(event.options.cam_manual), false)
		if (cam === null) {
			self.log('warn', `Ignoring ${path}: no valid camera selected`)
			return
		}
		await self.sendCommand(path, { cam })
	}

	self.setActionDefinitions({
		set_live_cam: {
			name: 'Set Camera Live',
			options: cameraOptions(self, 'cam', 'Camera', false),
			callback: singleCamera('/set_live_cam'),
		},

		set_preview_cam: {
			name: 'Set Camera Preview',
			options: cameraOptions(self, 'cam', 'Camera', false),
			callback: singleCamera('/set_preview_cam'),
		},

		set_idle_cam: {
			name: 'Set Camera Idle',
			options: cameraOptions(self, 'cam', 'Camera', false),
			callback: singleCamera('/set_idle_cam'),
		},

		set_off_cam: {
			name: 'Set Camera Off',
			options: cameraOptions(self, 'cam', 'Camera', false),
			callback: singleCamera('/set_off_cam'),
		},

		update_display: {
			name: 'Set Live + Preview',
			description:
				'Sets both at once. Note: the master turns ALL cameras off if live and preview are the same camera, or if both are None.',
			options: [
				...cameraOptions(self, 'live', 'Live camera', true),
				...cameraOptions(self, 'preview', 'Preview camera', true),
			],
			callback: async (event) => {
				const live = resolveCam(String(event.options.live), Number(event.options.live_manual), true)
				const preview = resolveCam(String(event.options.preview), Number(event.options.preview_manual), true)
				if (live === null || preview === null) {
					self.log('warn', 'Ignoring Set Live + Preview: invalid camera selection')
					return
				}
				await self.sendCommand('/update_display', { live, preview })
			},
		},

		auto: {
			name: 'Auto (swap live/preview)',
			options: [],
			callback: async () => {
				await self.sendCommand('/auto')
			},
		},

		all_idle: {
			name: 'All Cameras Idle',
			options: [],
			callback: async () => {
				await self.sendCommand('/allIdle')
			},
		},

		all_off: {
			name: 'All Cameras Off',
			options: [],
			callback: async () => {
				await self.sendCommand('/allOff')
			},
		},

		onair_on: {
			name: 'Set On Air Lights On',
			options: [],
			callback: async () => {
				await self.sendCommand('/onair_status', { status: 'onair' })
			},
		},

		onair_off: {
			name: 'Set On Air Lights Off',
			options: [],
			callback: async () => {
				await self.sendCommand('/onair_status', { status: 'offair' })
			},
		},
	})
}
```

- [ ] **Step 2: Update the `ActionsSchema` type**

The template declares an `ActionsSchema` interface (referenced by `ModuleSchema` in `main.ts`) that types action ids and their options. Replace its `sample_action` entry with the ten ids above. Give each camera action `cam: string` and `cam_manual: number`; give `update_display` `live: string`, `live_manual: number`, `preview: string`, `preview_manual: number`; give the five parameterless actions (`auto`, `all_idle`, `all_off`, `onair_on`, `onair_off`) empty options.

Follow the exact shape the scaffolded template uses — do not invent a different one.

Do not run `yarn build` yet — `actions.ts` references instance members that
Step 5 adds. The build is expected to be red between Step 2 and Step 5, and
green from Step 6 onward.

- [ ] **Step 3: Replace `src/config.ts`**

```typescript
import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	timeout: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Master address',
			width: 8,
			regex: Regex.HOSTNAME,
			default: '',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 80,
		},
		{
			type: 'number',
			id: 'timeout',
			label: 'Request timeout (ms)',
			width: 4,
			min: 500,
			max: 30000,
			default: 3000,
		},
	]
}
```

If `Regex.HOSTNAME` does not exist in `base` 2.0.4, use `Regex.IP` instead and note it in the commit message. Check with:

```bash
grep -o "HOSTNAME\|IP" node_modules/@companion-module/base/dist/index.d.ts | sort -u
```

- [ ] **Step 4: Add the three instance members to `src/main.ts`**

Inside the `ModuleInstance` class, alongside the existing lifecycle methods:

```typescript
	private cameras: Camera[] = []

	getApiTarget(): ApiTarget {
		return {
			host: this.config.host,
			port: this.config.port,
			timeoutMs: this.config.timeout,
		}
	}

	getCameras(): Camera[] {
		return this.cameras
	}

	/**
	 * Fire-and-forget command. Deliberately does not retry: the master runs a
	 * synchronous web server that wedges under connection pressure, so a
	 * visibly failed press the operator can repeat beats hammering the device.
	 */
	async sendCommand(path: string, params: Record<string, string | number> = {}): Promise<void> {
		const result = await apiGet(this.getApiTarget(), path, params)

		if (result.status === null) {
			this.log('warn', `Request to ${path} failed: master unreachable`)
			this.updateStatus(InstanceStatus.ConnectionFailure)
			return
		}

		if (!result.ok) {
			// The master answered, so the connection is fine — we sent something
			// it rejected. Its error strings are already human-readable.
			this.log('warn', `Master rejected ${path}: ${result.body}`)
			return
		}

		this.log('debug', `${path} OK`)
		this.updateStatus(InstanceStatus.Ok)
	}
```

Add the imports at the top of `main.ts`:

```typescript
import { apiGet, type ApiTarget } from './api.js'
import { fetchCameras, type Camera } from './cameras.js'
```

`InstanceStatus` is already imported by the template.

- [ ] **Step 5: Replace the body of `init()` and `configUpdated()`**

Both do the same thing, so route them through one method:

```typescript
	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.connect()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.connect()
	}

	/**
	 * Exactly two requests. Nothing polls — see the v1 design spec, section 4.
	 */
	private async connect(): Promise<void> {
		this.updateStatus(InstanceStatus.Connecting)

		const target = this.getApiTarget()
		const probe = await apiGet(target, '/test')

		if (probe.status === null) {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'Master unreachable')
			this.cameras = []
		} else {
			this.updateStatus(InstanceStatus.Ok)
			// A camera-list failure is not a connection failure: the master
			// answered the probe, so we stay Ok and fall back to manual entry.
			this.cameras = await fetchCameras(target)
			if (this.cameras.length === 0) {
				this.log('info', 'No camera list available — actions will use manual camera entry')
			}
		}

		this.updateActions()
		this.updatePresets()
	}
```

- [ ] **Step 6: Verify the whole module builds, lints, and tests**

```bash
yarn build && yarn lint && yarn test
```

Expected: all PASS, 45 tests. This is the first green build since Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/actions.ts src/config.ts src/main.ts
git commit -m "feat: add the ten v1 actions and wire the module

init and configUpdated both make exactly two requests and nothing else.
A camera-list failure keeps the connection Ok and degrades to manual entry;
only the /test probe failing marks the connection down. sendCommand never
retries: the master's synchronous web server wedges under pressure, so a
visibly failed press beats hammering the device."
```

---

### Task 6: `presets.ts` — ready-to-drag buttons

**Files:**

- Modify: `src/presets.ts` (replace the template's sample preset entirely)

**Interfaces:**

- Consumes: `getCameras()` from the instance
- Produces: `UpdatePresets(self: ModuleInstance): void`

Presets: `ON AIR`, `OFF AIR`, `AUTO`, `ALL OFF`, `ALL IDLE`, and a Live/Preview pair per known camera. No feedbacks, so these are pre-labelled and pre-wired only.

- [ ] **Step 1: Replace `src/presets.ts`**

The preset API shape below was verified against the installed
`@companion-module/base@2.0.4` type definitions, not assumed:

- `setPresetDefinitions(structure, presets)` takes **two** arguments
  (`base.d.ts:108`): an array of `CompanionPresetSection` and the preset map.
- A preset's `type` is **`'simple'`**, not `'button'`
  (`preset/definition.d.ts`, `CompanionSimplePresetDefinition extends CompanionPresetDefinitionBase<'simple'>`).
- There is **no `category` field**. Grouping is expressed by sections, whose
  `definitions` may be a plain array of preset id strings
  (`CompanionPresetReference[] = string[]`, `preset/structure.d.ts`).
- `size: '14'` is valid — `CompanionTextSize` is
  `'auto' | '7' | '14' | '18' | '24' | '30' | '44' | number` (`style.d.ts:2`).

```typescript
import { combineRgb } from '@companion-module/base'
import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 150, 0)
const DARK = combineRgb(40, 40, 40)

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const generalIds: string[] = []
	const cameraIds: string[] = []

	const simple = (
		id: string,
		label: string,
		actionId: 'onair_on' | 'onair_off' | 'auto' | 'all_off' | 'all_idle',
		bg: number,
		fg: number,
	) => {
		presets[id] = {
			type: 'simple',
			name: label,
			style: { text: label, size: '14', color: fg, bgcolor: bg },
			steps: [{ down: [{ actionId, options: {} }], up: [] }],
			feedbacks: [],
		}
		generalIds.push(id)
	}

	simple('onair_on', 'ON AIR', 'onair_on', RED, WHITE)
	simple('onair_off', 'OFF AIR', 'onair_off', DARK, WHITE)
	simple('auto', 'AUTO', 'auto', DARK, WHITE)
	simple('all_off', 'ALL OFF', 'all_off', BLACK, WHITE)
	simple('all_idle', 'ALL IDLE', 'all_idle', DARK, WHITE)

	for (const camera of self.getCameras()) {
		const liveId = `live_${camera.id}`
		presets[liveId] = {
			type: 'simple',
			name: `${camera.name} Live`,
			style: { text: `${camera.name}\nLIVE`, size: '14', color: WHITE, bgcolor: RED },
			steps: [
				{
					down: [{ actionId: 'set_live_cam', options: { cam: String(camera.id), cam_manual: camera.id } }],
					up: [],
				},
			],
			feedbacks: [],
		}
		cameraIds.push(liveId)

		const previewId = `preview_${camera.id}`
		presets[previewId] = {
			type: 'simple',
			name: `${camera.name} Preview`,
			style: { text: `${camera.name}\nPVW`, size: '14', color: WHITE, bgcolor: GREEN },
			steps: [
				{
					down: [{ actionId: 'set_preview_cam', options: { cam: String(camera.id), cam_manual: camera.id } }],
					up: [],
				},
			],
			feedbacks: [],
		}
		cameraIds.push(previewId)
	}

	const sections: CompanionPresetSection<ModuleSchema>[] = [{ id: 'general', name: 'General', definitions: generalIds }]

	// Omit the section entirely rather than showing an empty group when the
	// master was unreachable and no camera list was fetched.
	if (cameraIds.length > 0) {
		sections.push({ id: 'cameras', name: 'Cameras', definitions: cameraIds })
	}

	self.setPresetDefinitions(sections, presets)
}
```

Two notes:

- `ModuleSchema` must be **exported** from `src/main.ts` for the type imports
  above to work. If Task 1 left it unexported, add the `export` keyword — that
  is the only change permitted to `main.ts` in this task.
- Do not fall back to `as never`, `as any`, or `Record<string, unknown>`. If the
  types reject something, the shape above is wrong and you should report it
  rather than cast past it — a cast here would silently ship malformed presets
  that Companion rejects at runtime.

- [ ] **Step 2: Verify build, lint, and tests**

```bash
yarn build && yarn lint && yarn test
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/presets.ts
git commit -m "feat: add presets for On Air, transport, and per-camera buttons

Per-camera presets are generated from the fetched camera list, so they are
absent when the master was unreachable at connect time."
```

---

### Task 7: Verify against the real rig and package

No new code. This is the task that decides whether v1 actually ships.

**Files:**

- Modify: `companion/HELP.md`

- [ ] **Step 1: Point Companion at the dev module**

In Companion 5.1.0: Settings → Developer modules path → set to the parent directory of this repo. Restart Companion.

- [ ] **Step 2: Add the connection**

Connections → add `RM Tally Lights`. Enter the master's IP, port 80, timeout 3000.

Expected: status goes green, and the camera dropdown in any camera action lists real names such as `3 — Dolly`.

- [ ] **Step 3: Verify all ten actions against hardware**

Make a button for each and press it. Confirm the **physical** result, not just the absence of an error:

- [ ] Set Camera Live → that camera's matrix turns red
- [ ] Set Camera Preview → green
- [ ] Set Camera Idle → white
- [ ] Set Camera Off → black
- [ ] Set Live + Preview → both change together
- [ ] Set Live + Preview with the same camera in both → all cameras go off
- [ ] Auto → live and preview swap
- [ ] All Cameras Idle → all white
- [ ] All Cameras Off → all black
- [ ] Set On Air Lights On → **relay clicks, on-air light illuminates**
- [ ] Set On Air Lights Off → relay releases, light goes out

- [ ] **Step 3b: Verify the manual-entry field's conditional visibility**

The `isVisibleExpression` string `$(options:cam) == 'manual'` was written from
the base 2.0.4 type docs and has never been evaluated by a running Companion.
Confirm in the action editor that:

- With a named camera selected, the `Camera (manual)` number field is **hidden**.
- With `Manual entry…` selected, it **appears**.

If it is always visible or never visible, the expression syntax is wrong. That
is cosmetic — every action still works via the dropdown — but report it so the
syntax can be corrected.

- [ ] **Step 4: Verify manual entry**

Choose `Manual entry…` in a camera action, enter a valid number, confirm it works. Enter `99`, confirm the action is ignored and a warning appears in the Companion log rather than a request being sent.

- [ ] **Step 5: Verify offline degradation**

Power the master off, then:

- [ ] Press any button → connection goes red, Companion logs "master unreachable", nothing crashes
- [ ] Delete and re-add the connection while the master is off → dropdown falls back to `Manual entry…` only
- [ ] Power the master back on and press a button → status returns to green on the first success

- [ ] **Step 6: Write `companion/HELP.md`**

Replace the template content with: what the module does; the three config fields; the ten actions; the note that camera names come from the master and can lag a rename until the connection is re-saved; and the `/update_display` all-off behaviour when live and preview match.

- [ ] **Step 7: Package and verify the packaged build**

```bash
yarn companion-module-build
```

Expected: a `pkg/` folder and `companion-module-rm-tallylights-1.0.0.tgz`.

Load that `.tgz` through Companion's Modules page on a clean Companion instance and repeat Step 2 plus two actions from Step 3. The Bitfocus docs warn that packaging is where modules break, so a passing dev-module run does not substitute for this.

- [ ] **Step 8: Commit and push**

```bash
git add companion/HELP.md
git commit -m "docs: add module help

Verified against the real rig: all ten actions drive hardware, manual entry
and offline degradation behave, and the packaged .tgz loads."
git push origin main
```

---

## Post-v1

Feedbacks and variables, per section 14 of the spec. Gated on a conservative, configurable, non-overlapping poll design — the master's synchronous web server is the constraint, not an implementation detail to work around.
