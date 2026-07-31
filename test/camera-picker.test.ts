import { describe, it, expect } from 'vitest'
import { cameraChoices, resolveCam, MANUAL, NONE, UNSET } from '../src/camera-picker.js'

const CAMERAS = [
	{ id: 1, name: 'Main Camera' },
	{ id: 3, name: 'Dolly' },
]

describe('cameraChoices', () => {
	it('labels cameras as "id — name" and appends the manual option', () => {
		expect(cameraChoices(CAMERAS, false)).toEqual([
			{ id: UNSET, label: '— select a camera —' },
			{ id: '1', label: '1 — Main Camera' },
			{ id: '3', label: '3 — Dolly' },
			{ id: MANUAL, label: 'Manual entry…' },
		])
	})

	it('puts the unset sentinel first so an unconfigured button resolves to nothing', () => {
		expect(cameraChoices(CAMERAS, false)[0]).toEqual({ id: UNSET, label: '— select a camera —' })
		expect(cameraChoices(CAMERAS, true)[0]).toEqual({ id: UNSET, label: '— select a camera —' })
		expect(cameraChoices([], true)[0]).toEqual({ id: UNSET, label: '— select a camera —' })
	})

	it('prepends None after the unset sentinel when asked', () => {
		const choices = cameraChoices(CAMERAS, true)
		expect(choices[1]).toEqual({ id: NONE, label: 'None' })
		expect(choices).toHaveLength(5)
	})

	it('still offers manual entry when no cameras are known', () => {
		expect(cameraChoices([], false)).toEqual([
			{ id: UNSET, label: '— select a camera —' },
			{ id: MANUAL, label: 'Manual entry…' },
		])
	})
})

describe('resolveCam', () => {
	it('resolves a numeric dropdown value', () => {
		expect(resolveCam('3', 0, false)).toBe(3)
	})

	it('resolves the manual value when manual is selected', () => {
		expect(resolveCam(MANUAL, 12, false)).toBe(12)
	})

	it('rejects an out of range manual value', () => {
		expect(resolveCam(MANUAL, 99, false)).toBeNull()
	})

	it('rejects zero when none is not allowed', () => {
		expect(resolveCam('0', 0, false)).toBeNull()
	})

	it('resolves None to 0 when allowed', () => {
		expect(resolveCam(NONE, 0, true)).toBe(0)
	})

	it('rejects None when not allowed', () => {
		expect(resolveCam(NONE, 0, false)).toBeNull()
	})

	// The unset sentinel is the default for every picker, so this is the path a
	// never-configured button takes. Pinned rather than left incidental to the
	// "unrecognised value" fallthrough.
	it('rejects the unset sentinel even with a valid manual value', () => {
		expect(resolveCam(UNSET, 1, false)).toBeNull()
	})

	it('rejects the unset sentinel when None is allowed', () => {
		expect(resolveCam(UNSET, 1, true)).toBeNull()
	})

	it('rejects a non-numeric dropdown value', () => {
		expect(resolveCam('banana', 0, false)).toBeNull()
	})

	// Regression guards: Number('') and Number('   ') are both 0, which
	// isValidDisplayCam accepts as "none". Without a digit-only guard a blank
	// dropdown value would send a real command instead of being skipped.
	it('rejects a blank dropdown value even when None is allowed', () => {
		expect(resolveCam('', 0, true)).toBeNull()
	})

	it('rejects a whitespace dropdown value even when None is allowed', () => {
		expect(resolveCam('   ', 0, true)).toBeNull()
	})

	it.each(['0x3', '1e1', '+3', ' 3 ', 'Infinity'])('rejects the non-digit form %s', (value) => {
		expect(resolveCam(value, 0, false)).toBeNull()
	})
})
