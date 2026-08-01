import { describe, it, expect } from 'vitest'
import { parseStateFrame, RECONNECT_MIN_MS, RECONNECT_MAX_MS } from '../src/socket.js'

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
})

describe('reconnect bounds', () => {
	it('backs off from one second to at most thirty', () => {
		expect(RECONNECT_MIN_MS).toBe(1000)
		expect(RECONNECT_MAX_MS).toBe(30000)
		expect(RECONNECT_MIN_MS).toBeLessThan(RECONNECT_MAX_MS)
	})
})
