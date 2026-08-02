import { isOnAir, type ModuleState } from './state.js'
import type { Camera } from './cameras.js'
import type ModuleInstance from './main.js'

export type VariablesSchema = {
	live_cam: string
	preview_cam: string
	live_cam_name: string
	preview_cam_name: string
	onair: string
}

/**
 * Keyed by variable id, each entry just a display name.
 *
 * This is the shape setVariableDefinitions() expects in
 * @companion-module/base 2.x -- an object, not an array, and with no
 * variableId field (see dist/module-api/variable.d.ts).
 */
export const VARIABLE_DEFINITIONS: Record<keyof VariablesSchema, { name: string }> = {
	live_cam: { name: 'Live camera number' },
	preview_cam: { name: 'Preview camera number' },
	live_cam_name: { name: 'Live camera name' },
	preview_cam_name: { name: 'Preview camera name' },
	onair: { name: 'On Air state' },
}

/** Empty string rather than a placeholder: nothing live should render as nothing. */
function nameFor(camId: number, cameras: Camera[]): string {
	if (camId === 0) return ''
	return cameras.find((c) => c.id === camId)?.name ?? ''
}

/**
 * Values are strings throughout, including the camera numbers, so a button
 * label shows `0` rather than an empty cell when nothing is live.
 */
export function variableValues(state: ModuleState, cameras: Camera[]): VariablesSchema {
	const live = state.snapshot?.live ?? 0
	const preview = state.snapshot?.preview ?? 0

	return {
		live_cam: String(live),
		preview_cam: String(preview),
		live_cam_name: nameFor(live, cameras),
		preview_cam_name: nameFor(preview, cameras),
		onair: isOnAir(state) ? 'onair' : 'offair',
	}
}

export function UpdateVariables(self: ModuleInstance): void {
	self.setVariableDefinitions(VARIABLE_DEFINITIONS)
}
