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

export async function apiGet(
	target: ApiTarget,
	path: string,
	params: Record<string, string | number> = {},
): Promise<ApiResult> {
	const url = buildUrl(target, path, params)
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), target.timeoutMs)

	try {
		const response = await fetch(url, { signal: controller.signal })
		const body = await response.text()
		return { ok: response.ok, status: response.status, body }
	} catch {
		// Network error, DNS failure, or the abort above firing.
		return { ok: false, status: null, body: '' }
	} finally {
		clearTimeout(timer)
	}
}
