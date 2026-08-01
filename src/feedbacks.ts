import { combineRgb, type SomeCompanionFeedbackInputField } from '@companion-module/base'
import { cameraChoices, resolveCam, MANUAL, UNSET, type Choice } from './camera-picker.js'
import { MIN_CAM, MAX_CAM } from './api.js'
import { isLive, isPreview, isOnAir } from './state.js'
import type ModuleInstance from './main.js'

const WHITE = combineRgb(255, 255, 255)
const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 150, 0)
const AMBER = combineRgb(180, 120, 0)

/**
 * A feedback schema entry carries both the feedback's type and its options --
 * the type is part of the schema, not only of the definition. See
 * @companion-module/base dist/module-api/base.d.ts and feedback.d.ts.
 */
export type FeedbacksSchema = {
	camera_live: { type: 'boolean'; options: { cam: string; cam_manual: number } }
	camera_preview: { type: 'boolean'; options: { cam: string; cam_manual: number } }
	onair: { type: 'boolean'; options: Record<string, never> }
	connected: { type: 'boolean'; options: Record<string, never> }
}

/**
 * The same dropdown-plus-manual-entry pair the actions use, built from the
 * shared camera picker rather than reimplemented -- the picker's digit-only
 * guard exists because a blank dropdown once resolved to camera 0 and sent a
 * real command, and a second control is how that returns.
 *
 * Deliberately independent of `cameraOptions` in actions.ts (that one is
 * unexported and generic over the action field's id prefix, which this
 * feedback union doesn't need), but the two field shapes -- id, type,
 * default, disableAutoExpression, isVisibleExpression syntax -- must stay in
 * sync by hand. A change to either (e.g. how visibility expressions are
 * written, or which field disables auto-expression) needs the same change in
 * the other.
 */
export function feedbackCameraOptions(choices: Choice[]): SomeCompanionFeedbackInputField<'cam' | 'cam_manual'>[] {
	return [
		{
			id: 'cam',
			type: 'dropdown',
			label: 'Camera',
			// Never a real camera: an unconfigured feedback must match nothing
			// rather than silently track camera 1.
			default: UNSET,
			choices,
			// Required so the manual field's isVisibleExpression may reference this
			// field, and it stops the picker being turned into an arbitrary
			// expression -- the only route by which blank or non-digit text could
			// reach resolveCam.
			disableAutoExpression: true,
		},
		{
			id: 'cam_manual',
			type: 'number',
			label: 'Camera (manual)',
			default: 1,
			min: MIN_CAM,
			max: MAX_CAM,
			// base 2.x has no callback-style isVisible; visibility is an expression
			// string evaluated in the UI.
			isVisibleExpression: `$(options:cam) == '${MANUAL}'`,
		},
	]
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const camChoices = cameraChoices(self.getCameras(), false)

	self.setFeedbackDefinitions({
		camera_live: {
			type: 'boolean',
			name: 'Camera is Live',
			description: 'True while the master reports this camera as live.',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: feedbackCameraOptions(camChoices),
			callback: (feedback) => {
				const cam = resolveCam(feedback.options.cam, feedback.options.cam_manual, false)
				if (cam === null) return false
				return isLive(self.getState(), cam)
			},
		},

		camera_preview: {
			type: 'boolean',
			name: 'Camera is Preview',
			description: 'True while the master reports this camera as preview.',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: feedbackCameraOptions(camChoices),
			callback: (feedback) => {
				const cam = resolveCam(feedback.options.cam, feedback.options.cam_manual, false)
				if (cam === null) return false
				return isPreview(self.getState(), cam)
			},
		},

		onair: {
			type: 'boolean',
			name: 'On Air is On',
			description: 'True while the On Air light is on.',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => isOnAir(self.getState()),
		},

		connected: {
			type: 'boolean',
			name: 'Master is Connected',
			// Deliberately not affected by whether the last action succeeded: an
			// action failing means one request failed, the socket dropping means the
			// master is gone, and conflating them makes the indicator flicker
			// exactly when a stable answer matters most.
			description: 'True while the state socket to the master is open.',
			defaultStyle: { bgcolor: AMBER, color: WHITE },
			options: [],
			callback: () => self.getState().connected,
		},
	})
}
