import type { CameraMode, CameraState, StateSnapshot } from './state.js'

export const RECONNECT_MIN_MS = 1000
export const RECONNECT_MAX_MS = 30000

const MODES: CameraMode[] = ['live', 'preview', 'idle', 'off']

/**
 * Validates one text frame against the firmware's protocol
 * (2026-08-01-firmware-v1.3.0-websocket-push-design.md, section 3.2).
 *
 * NEVER THROWS. Returns null for anything unusable, which the caller logs and
 * discards. Because snapshots are complete, discarding a bad frame costs
 * nothing — the next good one restores correctness with no reconciliation.
 *
 * Unknown extra fields are ignored rather than rejected, so the firmware can
 * add one without breaking a module that predates it.
 */
export function parseStateFrame(raw: unknown): StateSnapshot | null {
	if (typeof raw !== 'string') return null

	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return null
	}

	// JSON.parse('null') succeeds, so this guard is load-bearing, not defensive
	// noise: without it the property reads below throw.
	if (typeof parsed !== 'object' || parsed === null) return null

	const frame = parsed as Record<string, unknown>
	if (frame.type !== 'state') return null

	const onair = frame.onair
	if (onair !== 'onair' && onair !== 'offair') return null

	const live = frame.live
	const preview = frame.preview
	if (!Number.isInteger(live) || !Number.isInteger(preview)) return null

	if (!Array.isArray(frame.cameras)) return null

	const cameras: CameraState[] = []
	for (const entry of frame.cameras) {
		if (typeof entry !== 'object' || entry === null) return null
		const { id, mode } = entry as Record<string, unknown>
		if (!Number.isInteger(id)) return null
		if (typeof mode !== 'string' || !MODES.includes(mode as CameraMode)) return null
		cameras.push({ id: id as number, mode: mode as CameraMode })
	}

	return { onair, live: live as number, preview: preview as number, cameras }
}

export interface StateSocketHandlers {
	onSnapshot: (snapshot: StateSnapshot) => void
	onConnected: (connected: boolean) => void
	log: (level: 'debug' | 'info' | 'warn', message: string) => void
}

/**
 * Owns one connection to the master's /ws and nothing else.
 *
 * The socket is receive-only: the master ignores inbound frames by design
 * (firmware spec section 3.4) and commands continue to go over HTTP.
 */
export class StateSocket {
	private socket: WebSocket | null = null
	private retryMs = RECONNECT_MIN_MS
	private timer: ReturnType<typeof setTimeout> | null = null
	private stopped = false

	constructor(
		private readonly url: string,
		private readonly handlers: StateSocketHandlers,
	) {}

	start(): void {
		this.stopped = false
		this.open()
	}

	/**
	 * Companion destroys and recreates an instance on every config change, so a
	 * leaked socket or timer per edit is a real leak in a long-running process.
	 */
	stop(): void {
		this.stopped = true
		if (this.timer !== null) {
			clearTimeout(this.timer)
			this.timer = null
		}
		if (this.socket) {
			// Detach first: close() fires onclose, which would otherwise schedule a
			// reconnect for a socket we are deliberately discarding.
			this.socket.onopen = null
			this.socket.onmessage = null
			this.socket.onclose = null
			this.socket.onerror = null
			try {
				this.socket.close()
			} catch {
				// Already closing or never opened; nothing to do.
			}
			this.socket = null
		}
		this.handlers.onConnected(false)
	}

	private open(): void {
		if (this.stopped) return

		let socket: WebSocket
		try {
			socket = new WebSocket(this.url)
		} catch (e) {
			// An unparseable URL throws synchronously; without this the reconnect
			// chain would end here and the module would go permanently silent.
			this.handlers.log('warn', `Could not open ${this.url}: ${String(e)}`)
			this.scheduleReconnect()
			return
		}
		this.socket = socket

		socket.onopen = () => {
			this.handlers.log('debug', `State socket open: ${this.url}`)
			this.handlers.onConnected(true)
		}

		socket.onmessage = (event: MessageEvent) => {
			const snapshot = parseStateFrame(event.data)
			if (!snapshot) {
				this.handlers.log('debug', 'Discarded an unrecognised frame from the master')
				return
			}
			// Reset the backoff on a received frame rather than on open: a master at
			// its client limit accepts and then drops, and resetting on open alone
			// would spin at the minimum interval forever.
			this.retryMs = RECONNECT_MIN_MS
			this.handlers.onSnapshot(snapshot)
		}

		socket.onerror = () => {
			// Always followed by onclose, which owns the reconnect. Logged only so a
			// failed handshake is not silent.
			this.handlers.log('debug', 'State socket error')
		}

		socket.onclose = () => {
			this.socket = null
			this.handlers.onConnected(false)
			this.scheduleReconnect()
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.timer !== null) return
		const delay = this.retryMs
		this.timer = setTimeout(() => {
			this.timer = null
			this.open()
		}, delay)
		this.retryMs = Math.min(this.retryMs * 2, RECONNECT_MAX_MS)
	}
}
