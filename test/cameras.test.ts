import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseCameraList, fetchCameras } from '../src/cameras.js'

const REAL_BODY =
	'{"cams":[{"id":1,"name":"Main Camera","address":"AA:BB:CC:DD:EE:FF","protected":true},' +
	'{"id":3,"name":"Dolly","address":"11:22:33:44:55:66","protected":false}]}'

describe('parseCameraList', () => {
	it('parses the real master payload', () => {
		expect(parseCameraList(REAL_BODY)).toEqual([
			{ id: 1, name: 'Main Camera' },
			{ id: 3, name: 'Dolly' },
		])
	})

	it('returns an empty list for an empty cams array', () => {
		expect(parseCameraList('{"cams":[]}')).toEqual([])
	})

	it('returns an empty list for malformed JSON rather than throwing', () => {
		expect(parseCameraList('not json at all')).toEqual([])
	})

	it('returns an empty list when the cams key is missing', () => {
		expect(parseCameraList('{"something":1}')).toEqual([])
	})

	it('skips entries with an unusable id', () => {
		expect(parseCameraList('{"cams":[{"id":"x","name":"Bad"},{"id":2,"name":"Good"}]}')).toEqual([
			{ id: 2, name: 'Good' },
		])
	})

	it('falls back to a generated name when name is missing', () => {
		expect(parseCameraList('{"cams":[{"id":5}]}')).toEqual([{ id: 5, name: 'Camera 5' }])
	})
})

describe('fetchCameras', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns parsed cameras on success', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(REAL_BODY, { status: 200 })))
		const cameras = await fetchCameras({ host: '192.168.0.76', port: 80, timeoutMs: 3000 })
		expect(cameras).toEqual([
			{ id: 1, name: 'Main Camera' },
			{ id: 3, name: 'Dolly' },
		])
	})

	it('returns an empty list when the master is unreachable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
		const cameras = await fetchCameras({ host: '192.168.0.76', port: 80, timeoutMs: 3000 })
		expect(cameras).toEqual([])
	})

	it('returns an empty list on a non-200', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })))
		const cameras = await fetchCameras({ host: '192.168.0.76', port: 80, timeoutMs: 3000 })
		expect(cameras).toEqual([])
	})
})
