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

	const parsed = Number(dropdownValue)
	if (!Number.isFinite(parsed)) return null
	return validate(parsed) ? parsed : null
}
