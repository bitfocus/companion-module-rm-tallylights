import { describe, it, expect } from 'vitest'
import { cameraChoices, resolveCam, MANUAL, NONE } from '../src/camera-picker.js'

const CAMERAS = [
	{ id: 1, name: 'Main Camera' },
	{ id: 3, name: 'Dolly' },
]

describe('cameraChoices', () => {
	it('labels cameras as "id — name" and appends the manual option', () => {
		expect(cameraChoices(CAMERAS, false)).toEqual([
			{ id: '1', label: '1 — Main Camera' },
			{ id: '3', label: '3 — Dolly' },
			{ id: MANUAL, label: 'Manual entry…' },
		])
	})

	it('prepends None when asked', () => {
		const choices = cameraChoices(CAMERAS, true)
		expect(choices[0]).toEqual({ id: NONE, label: 'None' })
		expect(choices).toHaveLength(4)
	})

	it('still offers manual entry when no cameras are known', () => {
		expect(cameraChoices([], false)).toEqual([{ id: MANUAL, label: 'Manual entry…' }])
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

	it('rejects a non-numeric dropdown value', () => {
		expect(resolveCam('banana', 0, false)).toBeNull()
	})
})
