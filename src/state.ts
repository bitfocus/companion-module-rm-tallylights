/**
 * The module's view of the master, and the pure functions that read it.
 *
 * No I/O and no Companion imports live here on purpose: this is the part of
 * the module whose logic can be wrong, so it is the part that is unit tested.
 */

export type CameraMode = 'live' | 'preview' | 'idle' | 'off'

export interface CameraState {
	id: number
	mode: CameraMode
}

/**
 * One `state` frame from the master's /ws. Shape is owned by the firmware spec
 * (2026-08-01-firmware-v1.3.0-websocket-push-design.md, section 3.2).
 *
 * `cameras` holds only cameras configured on the master, so an id can be
 * absent. `live` and `preview` are 0 for "none", and the firmware derives them
 * from the same list, so they can never name a camera missing from `cameras`.
 */
export interface StateSnapshot {
	onair: 'onair' | 'offair'
	live: number
	preview: number
	cameras: CameraState[]
}

export interface ModuleState {
	connected: boolean
	snapshot: StateSnapshot | null
}

export const initialState: ModuleState = { connected: false, snapshot: null }

/** Replaces the whole view. Snapshots are complete, so there is nothing to merge. */
export function applySnapshot(state: ModuleState, snapshot: StateSnapshot): ModuleState {
	return { ...state, snapshot }
}

/**
 * The last snapshot is deliberately kept when the socket drops. A stale tally
 * is more useful to an operator than a blank one, and the `connected` feedback
 * is what reports the connection itself.
 */
export function setConnected(state: ModuleState, connected: boolean): ModuleState {
	return { ...state, connected }
}

export function cameraMode(state: ModuleState, camId: number): CameraMode | null {
	const camera = state.snapshot?.cameras.find((c) => c.id === camId)
	return camera ? camera.mode : null
}

export function isLive(state: ModuleState, camId: number): boolean {
	return cameraMode(state, camId) === 'live'
}

export function isPreview(state: ModuleState, camId: number): boolean {
	return cameraMode(state, camId) === 'preview'
}

export function isOnAir(state: ModuleState): boolean {
	return state.snapshot?.onair === 'onair'
}

/**
 * True when the master reports a camera the module has no name for — which
 * means its cached camera list is stale and should be re-fetched.
 */
export function hasUnknownCamera(state: ModuleState, knownIds: number[]): boolean {
	if (!state.snapshot) return false
	return state.snapshot.cameras.some((c) => !knownIds.includes(c.id))
}
