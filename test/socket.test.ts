import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseStateFrame, StateSocket, RECONNECT_MIN_MS, RECONNECT_MAX_MS } from '../src/socket.js'
import type { StateSocketHandlers } from '../src/socket.js'

const VALID =
	'{"type":"state","onair":"onair","live":2,"preview":1,"cameras":[{"id":1,"mode":"preview"},{"id":2,"mode":"live"}]}'

describe('parseStateFrame', () => {
	it('parses a real frame from the master', () => {
		expect(parseStateFrame(VALID)).toEqual({
			onair: 'onair',
			live: 2,
			preview: 1,
			cameras: [
				{ id: 1, mode: 'preview' },
				{ id: 2, mode: 'live' },
			],
		})
	})

	it('accepts an empty camera list', () => {
		const frame = '{"type":"state","onair":"offair","live":0,"preview":0,"cameras":[]}'
		expect(parseStateFrame(frame)).toEqual({ onair: 'offair', live: 0, preview: 0, cameras: [] })
	})

	it('rejects malformed JSON without throwing', () => {
		expect(parseStateFrame('not json')).toBeNull()
	})

	it('rejects a bare null, which is valid JSON', () => {
		expect(parseStateFrame('null')).toBeNull()
	})

	it('rejects a frame whose type is not state', () => {
		expect(parseStateFrame('{"type":"hello","onair":"onair","live":0,"preview":0,"cameras":[]}')).toBeNull()
	})

	it('rejects a missing type', () => {
		expect(parseStateFrame('{"onair":"onair","live":0,"preview":0,"cameras":[]}')).toBeNull()
	})

	it('rejects an unknown onair value', () => {
		expect(parseStateFrame('{"type":"state","onair":"maybe","live":0,"preview":0,"cameras":[]}')).toBeNull()
	})

	it('rejects non-integer live or preview', () => {
		expect(parseStateFrame('{"type":"state","onair":"onair","live":"2","preview":0,"cameras":[]}')).toBeNull()
		expect(parseStateFrame('{"type":"state","onair":"onair","live":0,"preview":1.5,"cameras":[]}')).toBeNull()
	})

	it('rejects a missing cameras array', () => {
		expect(parseStateFrame('{"type":"state","onair":"onair","live":0,"preview":0}')).toBeNull()
	})

	it('rejects a camera with an unknown mode', () => {
		const frame = '{"type":"state","onair":"onair","live":0,"preview":0,"cameras":[{"id":1,"mode":"sleeping"}]}'
		expect(parseStateFrame(frame)).toBeNull()
	})

	it('rejects a camera with a non-integer id', () => {
		const frame = '{"type":"state","onair":"onair","live":0,"preview":0,"cameras":[{"id":"1","mode":"live"}]}'
		expect(parseStateFrame(frame)).toBeNull()
	})

	it('rejects a non-string input', () => {
		expect(parseStateFrame(42)).toBeNull()
		expect(parseStateFrame(undefined)).toBeNull()
	})

	it('ignores unexpected extra fields rather than rejecting the frame', () => {
		const frame = '{"type":"state","onair":"offair","live":0,"preview":0,"cameras":[],"future":"value"}'
		expect(parseStateFrame(frame)).toEqual({ onair: 'offair', live: 0, preview: 0, cameras: [] })
	})

	it('rejects a camera entry that is null', () => {
		expect(parseStateFrame('{"type":"state","onair":"onair","live":0,"preview":0,"cameras":[null]}')).toBeNull()
	})

	it('rejects a camera entry that is not an object', () => {
		expect(parseStateFrame('{"type":"state","onair":"onair","live":0,"preview":0,"cameras":[5]}')).toBeNull()
	})

	it('rejects a cameras value that is not an array', () => {
		expect(parseStateFrame('{"type":"state","onair":"onair","live":0,"preview":0,"cameras":{}}')).toBeNull()
	})

	it('rejects a top-level JSON array', () => {
		expect(parseStateFrame('[]')).toBeNull()
	})
})

describe('reconnect bounds', () => {
	it('backs off from one second to at most thirty', () => {
		expect(RECONNECT_MIN_MS).toBe(1000)
		expect(RECONNECT_MAX_MS).toBe(30000)
		expect(RECONNECT_MIN_MS).toBeLessThan(RECONNECT_MAX_MS)
	})
})

/**
 * A hand-written fake of the global WebSocket, just enough for StateSocket:
 * a constructor that records the url and the instance, settable handler
 * properties, and a close() that only flips a flag -- tests fire onopen /
 * onmessage / onclose themselves, exactly like the browser would asynchronously.
 */
class FakeSocket {
	static instances: FakeSocket[] = []

	url: string
	onopen: (() => void) | null = null
	onmessage: ((event: { data: unknown }) => void) | null = null
	onerror: (() => void) | null = null
	onclose: (() => void) | null = null
	closed = false

	constructor(url: string) {
		this.url = url
		FakeSocket.instances.push(this)
	}

	close(): void {
		this.closed = true
	}
}

function makeHandlers(): StateSocketHandlers {
	return {
		onSnapshot: vi.fn(),
		onConnected: vi.fn(),
		log: vi.fn(),
	}
}

describe('StateSocket lifecycle', () => {
	beforeEach(() => {
		FakeSocket.instances = []
		vi.stubGlobal('WebSocket', FakeSocket)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it('opens exactly one socket on start(), and a second start() opens no more', () => {
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()
		expect(FakeSocket.instances).toHaveLength(1)

		socket.start()
		expect(FakeSocket.instances).toHaveLength(1)
	})

	it('delivers a parsed frame to onSnapshot and reports connected on open', () => {
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()
		const instance = FakeSocket.instances[0]

		instance.onopen?.()
		expect(handlers.onConnected).toHaveBeenCalledWith(true)

		instance.onmessage?.({ data: VALID })
		expect(handlers.onSnapshot).toHaveBeenCalledWith({
			onair: 'onair',
			live: 2,
			preview: 1,
			cameras: [
				{ id: 1, mode: 'preview' },
				{ id: 2, mode: 'live' },
			],
		})
	})

	it('schedules exactly one reconnect on close, and the delay opens exactly one new socket', () => {
		vi.useFakeTimers()
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()

		FakeSocket.instances[0].onclose?.()
		expect(vi.getTimerCount()).toBe(1)

		vi.advanceTimersByTime(RECONNECT_MIN_MS)
		expect(FakeSocket.instances).toHaveLength(2)
	})

	it('grows the backoff from one second and caps it at thirty across repeated failures', () => {
		vi.useFakeTimers()
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()

		const delays: number[] = []
		for (let i = 0; i < 6; i++) {
			const current = FakeSocket.instances[FakeSocket.instances.length - 1]
			current.onclose?.()
			const call = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1]
			const delay = call[1] as number
			delays.push(delay)
			vi.advanceTimersByTime(delay)
		}

		expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000])
	})

	it('resets the backoff to the minimum when a frame is received', () => {
		vi.useFakeTimers()
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()

		// Fail twice so the backoff grows past the minimum.
		FakeSocket.instances[0].onclose?.()
		vi.advanceTimersByTime(1000)
		FakeSocket.instances[1].onclose?.()
		vi.advanceTimersByTime(2000)

		// The third instance receives a good frame instead of closing.
		FakeSocket.instances[2].onmessage?.({ data: VALID })
		FakeSocket.instances[2].onclose?.()

		const call = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1]
		expect(call[1]).toBe(RECONNECT_MIN_MS)
	})

	it('clears a pending reconnect timer on stop(), and advancing timers afterwards opens nothing', () => {
		vi.useFakeTimers()
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()

		FakeSocket.instances[0].onclose?.()
		expect(vi.getTimerCount()).toBe(1)

		socket.stop()
		expect(vi.getTimerCount()).toBe(0)

		vi.advanceTimersByTime(RECONNECT_MAX_MS)
		expect(FakeSocket.instances).toHaveLength(1)
	})

	it('detaches all four handlers and closes the socket on stop(), and a late close event schedules nothing', () => {
		vi.useFakeTimers()
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()
		const instance = FakeSocket.instances[0]
		instance.onopen?.()

		socket.stop()
		expect(instance.closed).toBe(true)
		expect(instance.onopen).toBeNull()
		expect(instance.onmessage).toBeNull()
		expect(instance.onclose).toBeNull()
		expect(instance.onerror).toBeNull()

		// A close event arriving late, after detachment, is a no-op: the handler
		// itself is gone, so there is nothing left to schedule a reconnect.
		instance.onclose?.()
		expect(vi.getTimerCount()).toBe(0)
	})

	it('schedules only one reconnect if the close handler somehow fires twice', () => {
		vi.useFakeTimers()
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()
		const instance = FakeSocket.instances[0]

		instance.onclose?.()
		instance.onclose?.()
		expect(vi.getTimerCount()).toBe(1)
	})

	it('does not report a connection change when stop() is called with nothing to stop', () => {
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)

		socket.stop()
		expect(handlers.onConnected).not.toHaveBeenCalled()
	})

	it('does not report a second connection change when stop() is called twice', () => {
		const handlers = makeHandlers()
		const socket = new StateSocket('ws://host/ws', handlers)
		socket.start()
		FakeSocket.instances[0].onopen?.()

		socket.stop()
		expect(handlers.onConnected).toHaveBeenCalledTimes(2) // true on open, false on stop
		socket.stop()
		expect(handlers.onConnected).toHaveBeenCalledTimes(2)
	})
})
