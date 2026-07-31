export const MIN_CAM = 1
export const MAX_CAM = 32

export interface ApiTarget {
	host: string
	port: number
	timeoutMs: number
}

export interface ApiResult {
	/** True only for a 2xx response. */
	ok: boolean
	/** HTTP status, or null for a network error or timeout. */
	status: number | null
	body: string
}

export function buildUrl(
	target: Pick<ApiTarget, 'host' | 'port'>,
	path: string,
	params: Record<string, string | number> = {},
): string {
	const url = new URL(`http://${target.host}:${target.port}${path}`)
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, String(value))
	}
	return url.toString()
}

export function isValidCam(cam: number): boolean {
	return Number.isInteger(cam) && cam >= MIN_CAM && cam <= MAX_CAM
}

/** update_display accepts 0, meaning "none". */
export function isValidDisplayCam(cam: number): boolean {
	return Number.isInteger(cam) && cam >= 0 && cam <= MAX_CAM
}

/**
 * Performs one GET against the master.
 *
 * NEVER REJECTS. Always resolves to an ApiResult; a network error, DNS failure,
 * timeout, or an unbuildable URL all surface as `{ ok: false, status: null }`.
 * Both call sites (connect() and sendCommand() in main.ts) branch on
 * `status === null` with no try/catch and depend on this contract. In
 * particular the URL is built inside the try: config defaults `host` to '', and
 * `new URL('http://:80/test')` throws, so an unconfigured connection must
 * resolve rather than reject or init() would never register any actions.
 */
export async function apiGet(
	target: ApiTarget,
	path: string,
	params: Record<string, string | number> = {},
): Promise<ApiResult> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), target.timeoutMs)

	try {
		const response = await fetch(buildUrl(target, path, params), { signal: controller.signal })
		const body = await response.text()
		return { ok: response.ok, status: response.status, body }
	} catch {
		// Invalid URL, network error, DNS failure, or the abort above firing.
		return { ok: false, status: null, body: '' }
	} finally {
		clearTimeout(timer)
	}
}
