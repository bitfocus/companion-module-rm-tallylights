import { combineRgb } from '@companion-module/base'
import type {
	CompanionPresetDefinitions,
	CompanionPresetSection,
	CompanionPresetFeedback,
} from '@companion-module/base'
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
		feedbacks: CompanionPresetFeedback<ModuleSchema['feedbacks']>[] = [],
	) => {
		presets[id] = {
			type: 'simple',
			name: label,
			style: { text: label, size: '14', color: fg, bgcolor: bg },
			steps: [{ down: [{ actionId, options: {} }], up: [] }],
			feedbacks,
		}
		generalIds.push(id)
	}

	simple('onair_on', 'ON AIR', 'onair_on', RED, WHITE, [
		{ feedbackId: 'onair', options: {}, style: { bgcolor: RED, color: WHITE } },
	])
	simple('onair_off', 'OFF AIR', 'onair_off', DARK, WHITE, [
		// Inverted: this button should light when the light is OFF air, so the
		// operator can see at a glance which state pressing it will leave them in.
		{ feedbackId: 'onair', options: {}, style: { bgcolor: GREEN, color: WHITE }, isInverted: true },
	])
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
			feedbacks: [
				{
					feedbackId: 'camera_live',
					options: { cam: String(camera.id), cam_manual: camera.id },
					// Required for a boolean feedback -- the preset type makes style
					// non-optional when the feedback's type is 'boolean'.
					style: { bgcolor: RED, color: WHITE },
				},
			],
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
			feedbacks: [
				{
					feedbackId: 'camera_preview',
					options: { cam: String(camera.id), cam_manual: camera.id },
					style: { bgcolor: GREEN, color: WHITE },
				},
			],
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
