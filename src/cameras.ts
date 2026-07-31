import { apiGet, type ApiTarget } from './api.js'

export interface Camera {
	id: number
	name: string
}

/**
 * Parses the master's /api/cameras payload.
 * Returns [] for anything unusable — an empty list is a valid state that
 * callers already handle by falling back to manual camera entry.
 */
export function parseCameraList(body: string): Camera[] {
	let parsed: unknown
	try {
		parsed = JSON.parse(body)
	} catch {
		return []
	}

	const cams = (parsed as { cams?: unknown })?.cams
	if (!Array.isArray(cams)) return []

	const cameras: Camera[] = []
	for (const entry of cams) {
		const id = (entry as { id?: unknown })?.id
		if (typeof id !== 'number' || !Number.isInteger(id)) continue

		const rawName = (entry as { name?: unknown })?.name
		const name = typeof rawName === 'string' && rawName.length > 0 ? rawName : `Camera ${id}`

		cameras.push({ id, name })
	}
	return cameras
}

export async function fetchCameras(target: ApiTarget): Promise<Camera[]> {
	const result = await apiGet(target, '/api/cameras')
	if (!result.ok) return []
	return parseCameraList(result.body)
}
