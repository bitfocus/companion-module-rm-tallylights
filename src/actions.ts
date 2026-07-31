import { cameraChoices, resolveCam, MANUAL, UNSET, type Choice } from './camera-picker.js'
import { MIN_CAM, MAX_CAM } from './api.js'
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
function cameraOptions<TKey extends string>(idPrefix: TKey, label: string, includeNone: boolean, choices: Choice[]) {
	return [
		{
			id: idPrefix,
			type: 'dropdown' as const,
			label,
			// Never a real camera: an unconfigured button must send nothing rather
			// than put camera 1 to air, and for update_display a live/preview pair
			// of None+None means "all cameras off" on the master.
			default: UNSET,
			choices,
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
			// From api.ts so the UI field and the resolveCam validator cannot drift.
			// 0 rather than MIN_CAM when None is allowed: update_display reads 0 as
			// "none".
			min: includeNone ? 0 : MIN_CAM,
			max: MAX_CAM,
			// base 2.x has no callback-style isVisible; visibility is a Companion
			// expression string evaluated in the UI. Fields referenced here must set
			// disableAutoExpression (see above).
			isVisibleExpression: `$(options:${idPrefix}) == '${MANUAL}'`,
		},
	]
}

export function UpdateActions(self: ModuleInstance): void {
	const cameras = self.getCameras()
	const camChoices = cameraChoices(cameras, false)
	const displayChoices = cameraChoices(cameras, true)

	/**
	 * Shared handler for the four single-camera actions. The event is typed from
	 * ActionsSchema rather than Record<string, unknown> so a renamed or typo'd
	 * option id fails to compile instead of silently reading undefined and
	 * making all four actions inert.
	 */
	const singleCamera = (path: string) => async (event: { options: ActionsSchema['set_live_cam']['options'] }) => {
		const cam = resolveCam(event.options.cam, event.options.cam_manual, false)
		if (cam === null) {
			self.log('warn', `Ignoring ${path}: no valid camera selected`)
			return
		}
		await self.sendCommand(path, { cam })
	}

	self.setActionDefinitions({
		set_live_cam: {
			name: 'Set Camera Live',
			options: cameraOptions('cam', 'Camera', false, camChoices),
			callback: singleCamera('/set_live_cam'),
		},

		set_preview_cam: {
			name: 'Set Camera Preview',
			options: cameraOptions('cam', 'Camera', false, camChoices),
			callback: singleCamera('/set_preview_cam'),
		},

		set_idle_cam: {
			name: 'Set Camera Idle',
			options: cameraOptions('cam', 'Camera', false, camChoices),
			callback: singleCamera('/set_idle_cam'),
		},

		set_off_cam: {
			name: 'Set Camera Off',
			options: cameraOptions('cam', 'Camera', false, camChoices),
			callback: singleCamera('/set_off_cam'),
		},

		update_display: {
			name: 'Set Live + Preview',
			description:
				'Sets both at once. Note: the master turns ALL cameras off if live and preview are the same camera, or if both are None.',
			options: [
				...cameraOptions('live', 'Live camera', true, displayChoices),
				...cameraOptions('preview', 'Preview camera', true, displayChoices),
			],
			callback: async (event) => {
				const live = resolveCam(event.options.live, event.options.live_manual, true)
				const preview = resolveCam(event.options.preview, event.options.preview_manual, true)
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
