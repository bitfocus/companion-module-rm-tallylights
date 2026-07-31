import { isValidCam, isValidDisplayCam } from './api.js'
import type { Camera } from './cameras.js'

export const MANUAL = 'manual'
export const NONE = 'none'
/**
 * Default for every camera picker. resolveCam does not recognise it, so it
 * resolves to null and an untouched button warns and sends nothing instead of
 * firing a real command at whichever camera happened to be the default.
 */
export const UNSET = 'unset'

export interface Choice {
	id: string
	label: string
}

export function cameraChoices(cameras: Camera[], includeNone: boolean): Choice[] {
	// UNSET first, ahead of None and the cameras, so a freshly dragged button
	// cannot put a camera to air before the operator has configured it.
	const choices: Choice[] = [{ id: UNSET, label: '— select a camera —' }]
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

	// Digit-only. Number() would turn '' and '   ' into 0 — which isValidDisplayCam
	// accepts as "none" — so a blank dropdown value would send a real command
	// instead of being warned and skipped. It would also accept '0x3', '1e1',
	// '+3' and ' 3 ' as cameras. Real dropdown ids are always plain digits.
	if (!/^\d+$/.test(dropdownValue)) return null

	const parsed = Number(dropdownValue)
	return validate(parsed) ? parsed : null
}
