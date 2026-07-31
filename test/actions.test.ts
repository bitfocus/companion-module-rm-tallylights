import { describe, it, expect, beforeEach } from 'vitest'
import type { CompanionActionContext, CompanionActionDefinitions } from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from '../src/actions.js'
import { MANUAL, NONE, UNSET } from '../src/camera-picker.js'
import { MIN_CAM, MAX_CAM } from '../src/api.js'
import type ModuleInstance from '../src/main.js'
import type { Camera } from '../src/cameras.js'

type Defs = CompanionActionDefinitions<ActionsSchema>

/** The callbacks never touch the context, so an empty one is enough. */
const CONTEXT = {} as CompanionActionContext

let defs: Defs
let calls: Array<[string, Record<string, unknown>]>
let logs: Array<[string, string]>

/**
 * Minimal stand-in for ModuleInstance. UpdateActions only reaches for
 * getCameras, log, setActionDefinitions and sendCommand.
 */
function build(cameras: Camera[] = [{ id: 3, name: 'Dolly' }]): void {
	calls = []
	logs = []
	const self = {
		getCameras: () => cameras,
		log: (level: string, message: string) => {
			logs.push([level, message])
		},
		setActionDefinitions: (d: Defs) => {
			defs = d
		},
		sendCommand: async (path: string, params: Record<string, unknown> = {}) => {
			calls.push([path, params])
		},
	} as unknown as ModuleInstance

	UpdateActions(self)
}

/** Presses the button: runs the action's callback with the given options. */
async function press<K extends keyof ActionsSchema>(id: K, options: ActionsSchema[K]['options']): Promise<void> {
	const definition = defs[id]
	if (!definition) throw new Error(`no definition for action ${String(id)}`)
	await definition.callback(
		{ id: 'test-action', controlId: 'test-control', actionId: String(id), options, surfaceId: undefined },
		CONTEXT,
	)
}

const CAM_OPTIONS = { cam: UNSET, cam_manual: 1 }
const DISPLAY_OPTIONS = { live: UNSET, live_manual: 1, preview: UNSET, preview_manual: 1 }

beforeEach(() => {
	build()
})

describe('action definitions', () => {
	it('defines exactly the ten documented actions', () => {
		expect(Object.keys(defs).sort()).toEqual(
			[
				'all_idle',
				'all_off',
				'auto',
				'onair_off',
				'onair_on',
				'set_idle_cam',
				'set_live_cam',
				'set_off_cam',
				'set_preview_cam',
				'update_display',
			].sort(),
		)
	})

	// A freshly dragged button must not put a camera to air, so no picker may
	// default to a real camera, to MANUAL (whose companion field prefills to 1),
	// or to NONE (live=0 & preview=0 means "all cameras off" on the master).
	it('defaults every camera picker to the unset sentinel', () => {
		const pickers = ['set_live_cam', 'set_preview_cam', 'set_idle_cam', 'set_off_cam', 'update_display'] as const
		const seen: string[] = []

		for (const id of pickers) {
			const definition = defs[id]
			if (!definition) throw new Error(`no definition for action ${id}`)
			for (const field of definition.options) {
				if (field.type !== 'dropdown') continue
				seen.push(`${id}.${field.id}`)
				expect(field.default).toBe(UNSET)
				expect(field.default).not.toBe(MANUAL)
				expect(field.default).not.toBe(NONE)
			}
		}

		// Both halves of Set Live + Preview included.
		expect(seen).toEqual([
			'set_live_cam.cam',
			'set_preview_cam.cam',
			'set_idle_cam.cam',
			'set_off_cam.cam',
			'update_display.live',
			'update_display.preview',
		])
	})

	it('offers the fetched cameras in the dropdown', () => {
		const definition = defs.set_live_cam
		if (!definition) throw new Error('no definition')
		const dropdown = definition.options.find((field) => field.type === 'dropdown')
		expect(dropdown?.type === 'dropdown' && dropdown.choices).toEqual([
			{ id: UNSET, label: '— select a camera —' },
			{ id: '3', label: '3 — Dolly' },
			{ id: MANUAL, label: 'Manual entry…' },
		])
	})

	it('bounds the manual field with the shared api.ts limits', () => {
		const single = defs.set_live_cam
		const display = defs.update_display
		if (!single || !display) throw new Error('no definition')

		const singleManual = single.options.find((field) => field.id === 'cam_manual')
		expect(singleManual?.type === 'number' && singleManual.min).toBe(MIN_CAM)
		expect(singleManual?.type === 'number' && singleManual.max).toBe(MAX_CAM)

		// 0 is legitimate for update_display, where it means "none".
		const liveManual = display.options.find((field) => field.id === 'live_manual')
		expect(liveManual?.type === 'number' && liveManual.min).toBe(0)
		expect(liveManual?.type === 'number' && liveManual.max).toBe(MAX_CAM)
	})
})

describe('single-camera actions', () => {
	const cases = [
		['set_live_cam', '/set_live_cam'],
		['set_preview_cam', '/set_preview_cam'],
		['set_idle_cam', '/set_idle_cam'],
		['set_off_cam', '/set_off_cam'],
	] as const

	it.each(cases)('%s sends %s with the selected camera', async (id, path) => {
		await press(id, { cam: '3', cam_manual: 1 })
		expect(calls).toEqual([[path, { cam: 3 }]])
	})

	it.each(cases)('%s sends the manual value when manual is selected', async (id, path) => {
		await press(id, { cam: MANUAL, cam_manual: 7 })
		expect(calls).toEqual([[path, { cam: 7 }]])
	})

	// The important part is "no call at all" rather than a call with cam=0 or
	// cam=NaN, either of which the master would act on.
	it.each(cases)('%s sends nothing at all when left unconfigured (%s)', async (id) => {
		await press(id, CAM_OPTIONS)
		expect(calls).toEqual([])
		expect(logs.map(([level]) => level)).toEqual(['warn'])
	})

	it.each(cases)('%s sends nothing for an out of range manual value (%s)', async (id) => {
		await press(id, { cam: MANUAL, cam_manual: 99 })
		expect(calls).toEqual([])
	})

	it('sends nothing for None, which these actions do not accept', async () => {
		await press('set_live_cam', { cam: NONE, cam_manual: 1 })
		expect(calls).toEqual([])
	})
})

describe('update_display', () => {
	it('sends both live and preview', async () => {
		await press('update_display', { live: '3', live_manual: 1, preview: '2', preview_manual: 1 })
		expect(calls).toEqual([['/update_display', { live: 3, preview: 2 }]])
	})

	it('accepts None as 0 on either half', async () => {
		await press('update_display', { live: '3', live_manual: 1, preview: NONE, preview_manual: 1 })
		expect(calls).toEqual([['/update_display', { live: 3, preview: 0 }]])
	})

	it('sends nothing at all when left unconfigured', async () => {
		await press('update_display', DISPLAY_OPTIONS)
		expect(calls).toEqual([])
		expect(logs.map(([level]) => level)).toEqual(['warn'])
	})

	it('sends nothing when only the live half is unusable', async () => {
		await press('update_display', { live: UNSET, live_manual: 1, preview: '2', preview_manual: 1 })
		expect(calls).toEqual([])
	})

	it('sends nothing when only the preview half is unusable', async () => {
		await press('update_display', { live: '3', live_manual: 1, preview: UNSET, preview_manual: 1 })
		expect(calls).toEqual([])
	})
})

describe('parameterless actions', () => {
	it('auto sends /auto', async () => {
		await press('auto', {})
		expect(calls).toEqual([['/auto', {}]])
	})

	it('all_idle sends /allIdle', async () => {
		await press('all_idle', {})
		expect(calls).toEqual([['/allIdle', {}]])
	})

	it('all_off sends /allOff', async () => {
		await press('all_off', {})
		expect(calls).toEqual([['/allOff', {}]])
	})

	it('onair_on sends status=onair', async () => {
		await press('onair_on', {})
		expect(calls).toEqual([['/onair_status', { status: 'onair' }]])
	})

	it('onair_off sends status=offair', async () => {
		await press('onair_off', {})
		expect(calls).toEqual([['/onair_status', { status: 'offair' }]])
	})
})

describe('with no camera list', () => {
	beforeEach(() => {
		build([])
	})

	it('still offers manual entry, so manual selection works', async () => {
		await press('set_live_cam', { cam: MANUAL, cam_manual: 12 })
		expect(calls).toEqual([['/set_live_cam', { cam: 12 }]])
	})
})
