import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildUrl, apiGet, isValidCam, isValidDisplayCam } from '../src/api.js'

describe('buildUrl', () => {
	it('builds a bare path and omits the default port', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 80 }, '/auto')).toBe('http://192.168.0.76/auto')
	})

	it('includes a non-default port', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 8080 }, '/auto')).toBe('http://192.168.0.76:8080/auto')
	})

	it('appends a single query param', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 80 }, '/set_live_cam', { cam: 3 })).toBe(
			'http://192.168.0.76/set_live_cam?cam=3',
		)
	})

	it('appends both update_display params including zero', () => {
		expect(buildUrl({ host: '192.168.0.76', port: 80 }, '/update_display', { live: 2, preview: 0 })).toBe(
			'http://192.168.0.76/update_display?live=2&preview=0',
		)
	})

	it('accepts a hostname as well as an IP', () => {
		expect(buildUrl({ host: 'tally.local', port: 80 }, '/allOff')).toBe('http://tally.local/allOff')
	})
})

describe('isValidCam', () => {
	it.each([1, 17, 32])('accepts %i', (cam) => {
		expect(isValidCam(cam)).toBe(true)
	})

	it.each([0, -1, 33, 1.5, NaN])('rejects %s', (cam) => {
		expect(isValidCam(cam)).toBe(false)
	})
})

describe('isValidDisplayCam', () => {
	it('accepts 0 because update_display treats it as none', () => {
		expect(isValidDisplayCam(0)).toBe(true)
	})

	it('still rejects out of range values', () => {
		expect(isValidDisplayCam(33)).toBe(false)
	})
})

describe('apiGet', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('reports success for a 200', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('RM Server Working!', { status: 200 })))
		const result = await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/test')
		expect(result).toEqual({ ok: true, status: 200, body: 'RM Server Working!' })
	})

	it("surfaces the master's 400 reason verbatim", async () => {
		const reason = 'Camera number must be between 1 and 32'
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(reason, { status: 400 })))
		const result = await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/set_live_cam', { cam: 99 })
		expect(result).toEqual({ ok: false, status: 400, body: reason })
	})

	it('reports a network error with a null status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
		const result = await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/test')
		expect(result).toEqual({ ok: false, status: null, body: '' })
	})

	it('passes the built URL to fetch', async () => {
		const spy = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
		vi.stubGlobal('fetch', spy)
		await apiGet({ host: '192.168.0.76', port: 80, timeoutMs: 3000 }, '/set_off_cam', { cam: 4 })
		expect(spy.mock.calls[0][0]).toBe('http://192.168.0.76/set_off_cam?cam=4')
	})
})
