import { cameraChoices, resolveCam, MANUAL, NONE } from './camera-picker.js'
import type ModuleInstance from './main.js'

export type ActionsSchema = {
	set_live_cam: { options: { cam: string; cam_manual: number } }
	set_preview_cam: { options: { cam: string; cam_manual: number } }
	set_idle_cam: { options: { cam: string; cam_manual: number } }
	set_off_cam: { options: { cam: string; cam_manual: number } }
	update_display: { options: { live: string; live_manual: number; preview: string; preview_manual: number } }
	auto: { options: Record<string, never> }
	all_idle: { options: Record<string, never> }
	all_off: { options: Record<string, never> }
	onair_on: { options: Record<string, never> }
	onair_off: { options: Record<string, never> }
}

/**
 * Builds the dropdown + manual-number field pair for one camera selection.
 * Generic over the id prefix so each field's `id` keeps its literal type
 * (e.g. `'cam' | 'cam_manual'`) instead of widening to `string`, which is
 * what `ActionsSchema` above requires.
 */
function cameraOptions<TKey extends string>(self: ModuleInstance, idPrefix: TKey, label: string, includeNone: boolean) {
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
			id: `${idPrefix}_manual` as const,
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
