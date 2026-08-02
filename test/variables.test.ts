import { describe, it, expect } from 'vitest'
import { VARIABLE_DEFINITIONS, variableValues } from '../src/variables.js'
import { initialState, applySnapshot, type StateSnapshot } from '../src/state.js'
import type { Camera } from '../src/cameras.js'

const CAMERAS: Camera[] = [
	{ id: 1, name: 'Main Camera' },
	{ id: 2, name: 'Canon' },
]

const SNAP: StateSnapshot = {
	onair: 'onair',
	live: 2,
	preview: 1,
	cameras: [
		{ id: 1, mode: 'preview' },
		{ id: 2, mode: 'live' },
	],
}

describe('VARIABLE_DEFINITIONS', () => {
	it('defines exactly the five variables, each with a name', () => {
		expect(Object.keys(VARIABLE_DEFINITIONS).sort()).toEqual([
			'live_cam',
			'live_cam_name',
			'onair',
			'preview_cam',
			'preview_cam_name',
		])
		for (const def of Object.values(VARIABLE_DEFINITIONS)) {
			expect(typeof def.name).toBe('string')
			expect(def.name.length).toBeGreaterThan(0)
		}
	})
})

describe('variableValues', () => {
	it('reports numbers and names from a snapshot', () => {
		expect(variableValues(applySnapshot(initialState, SNAP), CAMERAS)).toEqual({
			live_cam: '2',
			preview_cam: '1',
			live_cam_name: 'Canon',
			preview_cam_name: 'Main Camera',
			onair: 'onair',
		})
	})

	it('reports zeroes and empty names before any snapshot arrives', () => {
		expect(variableValues(initialState, CAMERAS)).toEqual({
			live_cam: '0',
			preview_cam: '0',
			live_cam_name: '',
			preview_cam_name: '',
			onair: 'offair',
		})
	})

	it('reports an empty name when nothing is live', () => {
		const snap: StateSnapshot = { onair: 'offair', live: 0, preview: 1, cameras: [{ id: 1, mode: 'preview' }] }
		const values = variableValues(applySnapshot(initialState, snap), CAMERAS)
		expect(values.live_cam).toBe('0')
		expect(values.live_cam_name).toBe('')
		expect(values.preview_cam_name).toBe('Main Camera')
	})

	it('reports an empty name when the cached camera list does not know the id', () => {
		const snap: StateSnapshot = { onair: 'offair', live: 7, preview: 0, cameras: [{ id: 7, mode: 'live' }] }
		const values = variableValues(applySnapshot(initialState, snap), CAMERAS)
		expect(values.live_cam).toBe('7')
		expect(values.live_cam_name).toBe('')
	})

	it('reports offair as text', () => {
		const snap: StateSnapshot = { ...SNAP, onair: 'offair' }
		expect(variableValues(applySnapshot(initialState, snap), CAMERAS).onair).toBe('offair')
	})

	it('produces a value for every declared variable', () => {
		const values = variableValues(applySnapshot(initialState, SNAP), CAMERAS)
		expect(Object.keys(values).sort()).toEqual(Object.keys(VARIABLE_DEFINITIONS).sort())
	})
})
