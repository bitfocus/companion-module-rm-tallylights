import { describe, it, expect } from 'vitest'
import {
	initialState,
	applySnapshot,
	setConnected,
	cameraMode,
	isLive,
	isPreview,
	isOnAir,
	type StateSnapshot,
} from '../src/state.js'

const SNAP: StateSnapshot = {
	onair: 'onair',
	live: 2,
	preview: 1,
	cameras: [
		{ id: 1, mode: 'preview' },
		{ id: 2, mode: 'live' },
	],
}

describe('initialState', () => {
	it('starts disconnected with no snapshot', () => {
		expect(initialState).toEqual({ connected: false, snapshot: null })
	})
})

describe('applySnapshot', () => {
	it('stores the snapshot', () => {
		expect(applySnapshot(initialState, SNAP).snapshot).toEqual(SNAP)
	})

	it('replaces a previous snapshot rather than merging', () => {
		const first = applySnapshot(initialState, SNAP)
		const second: StateSnapshot = { onair: 'offair', live: 0, preview: 0, cameras: [{ id: 5, mode: 'idle' }] }
		expect(applySnapshot(first, second).snapshot).toEqual(second)
	})

	it('does not mutate the state it is given', () => {
		const before = { ...initialState }
		applySnapshot(initialState, SNAP)
		expect(initialState).toEqual(before)
	})

	it('leaves connected untouched', () => {
		const connected = setConnected(initialState, true)
		expect(applySnapshot(connected, SNAP).connected).toBe(true)
	})
})

describe('setConnected', () => {
	it('sets the flag', () => {
		expect(setConnected(initialState, true).connected).toBe(true)
	})

	it('keeps the last snapshot when the socket drops', () => {
		const withSnap = applySnapshot(setConnected(initialState, true), SNAP)
		const dropped = setConnected(withSnap, false)
		expect(dropped.connected).toBe(false)
		expect(dropped.snapshot).toEqual(SNAP)
	})
})

describe('cameraMode', () => {
	it('returns the mode of a known camera', () => {
		expect(cameraMode(applySnapshot(initialState, SNAP), 2)).toBe('live')
	})

	it('returns null for a camera absent from the snapshot', () => {
		expect(cameraMode(applySnapshot(initialState, SNAP), 9)).toBeNull()
	})

	it('returns null before any snapshot has arrived', () => {
		expect(cameraMode(initialState, 1)).toBeNull()
	})
})

describe('isLive / isPreview / isOnAir', () => {
	const s = applySnapshot(initialState, SNAP)

	it('reports the live camera', () => {
		expect(isLive(s, 2)).toBe(true)
		expect(isLive(s, 1)).toBe(false)
	})

	it('reports the preview camera', () => {
		expect(isPreview(s, 1)).toBe(true)
		expect(isPreview(s, 2)).toBe(false)
	})

	it('is false for every camera before a snapshot arrives', () => {
		expect(isLive(initialState, 1)).toBe(false)
		expect(isPreview(initialState, 1)).toBe(false)
	})

	it('reports On Air', () => {
		expect(isOnAir(s)).toBe(true)
		expect(isOnAir(applySnapshot(s, { ...SNAP, onair: 'offair' }))).toBe(false)
		expect(isOnAir(initialState)).toBe(false)
	})
})
