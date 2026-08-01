import { describe, it, expect } from 'vitest'
import { UpdateFeedbacks, feedbackCameraOptions } from '../src/feedbacks.js'
import { initialState, applySnapshot, setConnected, type StateSnapshot } from '../src/state.js'
import { cameraChoices, MANUAL, UNSET } from '../src/camera-picker.js'
import type { Camera } from '../src/cameras.js'

const CAMERAS: Camera[] = [
	{ id: 1, name: 'Main Camera' },
	{ id: 2, name: 'Canon' },
]

const SNAP: StateSnapshot = {
	onair: 'onair',
	live: 2,
	preview: 1,
	cameras: [
		{ id: 1, mode: 'preview' },
		{ id: 2, mode: 'live' },
	],
}

/**
 * Minimal stand-in for ModuleInstance. Only the three members the feedback
 * definitions touch are implemented; the cast keeps the test free of a full
 * Companion mock, which this repo deliberately avoids.
 *
 * `getState` reads a mutable binding rather than closing over the `state`
 * parameter directly, and `setState` swaps it after `UpdateFeedbacks` has
 * already run. Without this, a regression that hoisted `self.getState()` to
 * the top of `UpdateFeedbacks` -- freezing every tally at whatever state
 * existed when definitions were built -- would pass every test here.
 */
function fakeSelf(state = initialState, cameras = CAMERAS) {
	let current = state
	const captured: { defs?: Record<string, any> } = {}
	const self = {
		getState: () => current,
		getCameras: () => cameras,
		setFeedbackDefinitions: (defs: Record<string, any>) => {
			captured.defs = defs
		},
	}
	return { self: self as any, captured, setState: (next: typeof state) => (current = next) }
}

function definitions(state = initialState, cameras = CAMERAS) {
	const { self, captured } = fakeSelf(state, cameras)
	UpdateFeedbacks(self)
	if (!captured.defs) throw new Error('UpdateFeedbacks did not set any definitions')
	return captured.defs
}

const evt = (cam: string, cam_manual = 1) => ({ options: { cam, cam_manual } }) as any
const ctx = {} as any

describe('feedbackCameraOptions', () => {
	it('builds a dropdown plus a manual number field', () => {
		const fields = feedbackCameraOptions(cameraChoices(CAMERAS, false))
		expect(fields.map((f) => f.id)).toEqual(['cam', 'cam_manual'])
		expect(fields[0].type).toBe('dropdown')
		expect(fields[1].type).toBe('number')
	})

	it('defaults the dropdown to UNSET so an unconfigured feedback matches nothing', () => {
		const fields = feedbackCameraOptions(cameraChoices(CAMERAS, false))
		expect((fields[0] as any).default).toBe(UNSET)
	})

	it('disables auto-expression on the dropdown the manual field references', () => {
		const fields = feedbackCameraOptions(cameraChoices(CAMERAS, false))
		expect((fields[0] as any).disableAutoExpression).toBe(true)
		expect((fields[1] as any).isVisibleExpression).toBe(`$(options:cam) == '${MANUAL}'`)
	})
})

describe('feedback definitions', () => {
	it('defines exactly the four feedbacks, all boolean', () => {
		const defs = definitions()
		expect(Object.keys(defs).sort()).toEqual(['camera_live', 'camera_preview', 'connected', 'onair'])
		for (const def of Object.values(defs)) {
			expect(def.type).toBe('boolean')
			expect(typeof def.name).toBe('string')
			expect(def.defaultStyle).toBeDefined()
		}
	})
})

describe('camera_live', () => {
	it('is true for the live camera and false for another', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_live.callback(evt('2'), ctx)).toBe(true)
		expect(await defs.camera_live.callback(evt('1'), ctx)).toBe(false)
	})

	it('is false before any snapshot arrives', async () => {
		const defs = definitions()
		expect(await defs.camera_live.callback(evt('2'), ctx)).toBe(false)
	})

	// Named for what this actually proves: SNAP has no camera id 0, so a
	// resolveCam with no digit-only guard would still land on null here via the
	// MIN_CAM range check, not the guard. This only pins "unconfigured or blank
	// input is inert"; the guard itself (rejecting '0x3', ' 3 ', etc.) is
	// exhaustively covered in camera-picker.test.ts and isn't re-tested here.
	it('is false for an unconfigured picker or a blank selection', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_live.callback(evt(UNSET), ctx)).toBe(false)
		expect(await defs.camera_live.callback(evt(''), ctx)).toBe(false)
	})

	it('honours manual entry', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_live.callback(evt(MANUAL, 2), ctx)).toBe(true)
		expect(await defs.camera_live.callback(evt(MANUAL, 1), ctx)).toBe(false)
	})

	it('reads state at call time, not at definition time', async () => {
		const { self, captured, setState } = fakeSelf(initialState)
		UpdateFeedbacks(self)
		const defs = captured.defs!
		expect(await defs.camera_live.callback(evt('2'), ctx)).toBe(false)
		// No second UpdateFeedbacks call: the definitions must see the new state.
		setState(applySnapshot(initialState, SNAP))
		expect(await defs.camera_live.callback(evt('2'), ctx)).toBe(true)
	})
})

describe('camera_preview', () => {
	it('is true for the preview camera only', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_preview.callback(evt('1'), ctx)).toBe(true)
		expect(await defs.camera_preview.callback(evt('2'), ctx)).toBe(false)
	})

	it('is false before any snapshot arrives', async () => {
		const defs = definitions()
		expect(await defs.camera_preview.callback(evt('1'), ctx)).toBe(false)
	})

	// See the equivalent camera_live test for why this is titled this way
	// rather than claiming to pin the digit-only guard.
	it('is false for an unconfigured picker or a blank selection', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_preview.callback(evt(UNSET), ctx)).toBe(false)
		expect(await defs.camera_preview.callback(evt(''), ctx)).toBe(false)
	})

	it('honours manual entry', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_preview.callback(evt(MANUAL, 1), ctx)).toBe(true)
		expect(await defs.camera_preview.callback(evt(MANUAL, 2), ctx)).toBe(false)
	})
})

describe('onair', () => {
	it('follows the snapshot', async () => {
		expect(await definitions(applySnapshot(initialState, SNAP)).onair.callback({ options: {} } as any, ctx)).toBe(true)
		const off = applySnapshot(initialState, { ...SNAP, onair: 'offair' })
		expect(await definitions(off).onair.callback({ options: {} } as any, ctx)).toBe(false)
	})

	it('is false before any snapshot arrives', async () => {
		expect(await definitions().onair.callback({ options: {} } as any, ctx)).toBe(false)
	})
})

describe('connected', () => {
	it('follows the socket, not the last action', async () => {
		const up = setConnected(initialState, true)
		expect(await definitions(up).connected.callback({ options: {} } as any, ctx)).toBe(true)
		const down = setConnected(applySnapshot(up, SNAP), false)
		expect(await definitions(down).connected.callback({ options: {} } as any, ctx)).toBe(false)
	})
})
