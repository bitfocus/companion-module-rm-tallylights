import { describe, it, expect, beforeEach } from 'vitest'
import type {
	CompanionActionContext,
	CompanionActionDefinitions,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from '../src/actions.js'
import { UpdatePresets } from '../src/presets.js'
import type ModuleInstance from '../src/main.js'
import type { ModuleSchema } from '../src/main.js'
import type { Camera } from '../src/cameras.js'

type Defs = CompanionActionDefinitions<ActionsSchema>
type Presets = CompanionPresetDefinitions<ModuleSchema>
type Sections = CompanionPresetSection<ModuleSchema>[]

const CONTEXT = {} as CompanionActionContext
const CAMERAS: Camera[] = [
	{ id: 1, name: 'Main Camera' },
	{ id: 3, name: 'Dolly' },
]

let actions: Defs
let presets: Presets
let sections: Sections
let calls: Array<[string, Record<string, unknown>]>

/**
 * Minimal stand-in for ModuleInstance, shared by both generators so the presets
 * are checked against the real action definitions rather than a copy.
 */
function build(cameras: Camera[] = CAMERAS): void {
	calls = []
	const self = {
		getCameras: () => cameras,
		log: () => {},
		setActionDefinitions: (d: Defs) => {
			actions = d
		},
		setPresetDefinitions: (s: Sections, p: Presets) => {
			sections = s
			presets = p
		},
		sendCommand: async (path: string, params: Record<string, unknown> = {}) => {
			calls.push([path, params])
		},
	} as unknown as ModuleInstance

	UpdateActions(self)
	UpdatePresets(self)
}

function sectionIds(id: string): string[] | undefined {
	return sections.find((section) => section.id === id)?.definitions as string[] | undefined
}

/** Every button-down action across every preset, with the preset id for context. */
function allPresetActions(): Array<{
	presetId: string
	actionId: keyof ActionsSchema
	options: Record<string, unknown>
}> {
	const result: Array<{ presetId: string; actionId: keyof ActionsSchema; options: Record<string, unknown> }> = []
	for (const [presetId, preset] of Object.entries(presets)) {
		if (!preset) continue
		for (const step of preset.steps) {
			for (const action of step.down) {
				// Presets deliberately use plain option values, never the
				// ExpressionOrValue wrapper the type also permits.
				result.push({ presetId, actionId: action.actionId, options: action.options })
			}
		}
	}
	return result
}

beforeEach(() => {
	build()
})

describe('preset structure', () => {
	it('defines the five general presets plus two per camera', () => {
		expect(sectionIds('general')).toEqual(['onair_on', 'onair_off', 'auto', 'all_off', 'all_idle'])
		expect(sectionIds('cameras')).toEqual(['live_1', 'preview_1', 'live_3', 'preview_3'])
		expect(Object.keys(presets)).toHaveLength(9)
	})

	it('lists every section id as a real preset definition', () => {
		for (const section of sections) {
			for (const id of section.definitions as string[]) {
				expect(presets[id], `section ${section.id} references missing preset ${id}`).toBeDefined()
			}
		}
	})

	it('names the camera presets after the fetched camera', () => {
		expect(presets.live_3?.name).toBe('Dolly Live')
		expect(presets.preview_3?.name).toBe('Dolly Preview')
	})
})

describe('with no camera list', () => {
	beforeEach(() => {
		build([])
	})

	it('omits the cameras section entirely rather than showing an empty group', () => {
		expect(sections.map((section) => section.id)).toEqual(['general'])
		expect(sectionIds('cameras')).toBeUndefined()
	})

	it('still ships the general presets', () => {
		expect(sectionIds('general')).toHaveLength(5)
		expect(Object.keys(presets)).toHaveLength(5)
	})
})

describe('preset to action contract', () => {
	// The guard against a typo'd or renamed actionId, which Companion would
	// silently drop at runtime.
	it('points every preset action at a defined action', () => {
		const known = Object.keys(actions)
		expect(known).toHaveLength(10)

		const referenced = allPresetActions()
		expect(referenced).toHaveLength(9)

		for (const { presetId, actionId } of referenced) {
			expect(known, `preset ${presetId} references unknown action ${String(actionId)}`).toContain(String(actionId))
		}
	})

	// The guard against mismatched option key names: run each preset's own
	// options through the real action callback and require a command to go out.
	// A renamed option id would resolve to null and send nothing.
	it('supplies option values every action can actually resolve', async () => {
		for (const { presetId, actionId, options } of allPresetActions()) {
			calls = []
			const definition = actions[actionId]
			if (!definition) throw new Error(`no definition for ${String(actionId)}`)
			await definition.callback(
				{
					id: 'test-action',
					controlId: 'test-control',
					actionId: String(actionId),
					options: options as never,
					surfaceId: undefined,
				},
				CONTEXT,
			)
			expect(calls, `preset ${presetId} sent no command`).toHaveLength(1)
		}
	})

	it('points the camera presets at the matching action with digit-string ids', () => {
		const live = allPresetActions().find((entry) => entry.presetId === 'live_3')
		const preview = allPresetActions().find((entry) => entry.presetId === 'preview_3')
		expect(live?.actionId).toBe('set_live_cam')
		expect(live?.options).toEqual({ cam: '3', cam_manual: 3 })
		expect(preview?.actionId).toBe('set_preview_cam')
		expect(preview?.options).toEqual({ cam: '3', cam_manual: 3 })
	})

	it('maps the on-air presets to the on-air actions', () => {
		const entries = allPresetActions()
		expect(entries.find((entry) => entry.presetId === 'onair_on')?.actionId).toBe('onair_on')
		expect(entries.find((entry) => entry.presetId === 'onair_off')?.actionId).toBe('onair_off')
	})
})
