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
 */
function fakeSelf(state = initialState, cameras = CAMERAS) {
	const captured: { defs?: Record<string, any> } = {}
	const self = {
		getState: () => state,
		getCameras: () => cameras,
		setFeedbackDefinitions: (defs: Record<string, any>) => {
			captured.defs = defs
		},
	}
	return { self: self as any, captured }
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

	it('is false for an unconfigured picker rather than matching camera 0', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_live.callback(evt(UNSET), ctx)).toBe(false)
		expect(await defs.camera_live.callback(evt(''), ctx)).toBe(false)
	})

	it('honours manual entry', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_live.callback(evt(MANUAL, 2), ctx)).toBe(true)
		expect(await defs.camera_live.callback(evt(MANUAL, 1), ctx)).toBe(false)
	})
})

describe('camera_preview', () => {
	it('is true for the preview camera only', async () => {
		const defs = definitions(applySnapshot(initialState, SNAP))
		expect(await defs.camera_preview.callback(evt('1'), ctx)).toBe(true)
		expect(await defs.camera_preview.callback(evt('2'), ctx)).toBe(false)
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
