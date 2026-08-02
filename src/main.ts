import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdatePresets } from './presets.js'
import { apiGet, type ApiTarget } from './api.js'
import { fetchCameras, type Camera } from './cameras.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdateVariables, variableValues, type VariablesSchema } from './variables.js'
import { StateSocket } from './socket.js'
import { initialState, applySnapshot, setConnected, type ModuleState } from './state.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()
	private cameras: Camera[] = []
	private state: ModuleState = initialState
	private socket: StateSocket | null = null
	private destroyed = false
	// Guards a slow connect() against being superseded by a later one (an
	// overlapping config edit) or outliving destroy() -- see connect() below.
	private connectGeneration = 0
	private refreshInFlight = false
	/** Ids the master has reported that a refresh failed to resolve. Prevents a
	 *  camera the list will never contain from re-triggering a fetch every frame. */
	private unresolvedCameraIds = new Set<number>()

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.connect()
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		// Companion destroys and recreates an instance on every config change, so a
		// leaked socket or reconnect timer per edit is a real leak in a
		// long-running process. v1's destroy() only logged because v1 held nothing.
		// Set before stopSocket(): its onConnected(false) calls pushState(), which
		// must see this instance as already torn down.
		this.destroyed = true
		this.stopSocket()
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.connect()
	}

	/**
	 * Exactly two requests. Nothing polls — see the v1 design spec, section 4.
	 */
	private async connect(): Promise<void> {
		// connect() runs from init() and from configUpdated(); without this, editing
		// the host leaves a socket connected to the old one.
		this.stopSocket()

		// The awaits below can take up to ~2x config.timeout. If another connect()
		// starts before this one finishes (an overlapping config edit) or destroy()
		// runs first, this run must not act on its stale results -- see the guard
		// after the awaits.
		const generation = ++this.connectGeneration

		// A previous master's tally must not linger after the host changes to a
		// different device. state.ts's "keep the last snapshot across a drop" is
		// about the *same* master reconnecting, not a config edit pointing
		// elsewhere -- reset unconditionally, since connect() only runs on init()
		// and on a config save.
		this.state = initialState

		this.updateStatus(InstanceStatus.Connecting)

		const target = this.getApiTarget()
		const probe = await apiGet(target, '/test')

		if (probe.status === null) {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'Master unreachable')
			this.cameras = []
		} else if (!probe.ok) {
			// Something answered, but not an RM Tally Lights master — a router admin
			// page or a printer will 404 /test. Distinct from "unreachable" because
			// it calls for a different fix: check the address, not the network.
			this.updateStatus(
				InstanceStatus.ConnectionFailure,
				`Unexpected response from /test (HTTP ${probe.status}) — is this an RM Tally Lights master?`,
			)
			this.cameras = []
		} else {
			this.updateStatus(InstanceStatus.Ok)
			// A camera-list failure is not a connection failure: the master
			// answered the probe, so we stay Ok and fall back to manual entry.
			this.cameras = await fetchCameras(target)
			if (this.cameras.length === 0) {
				this.log('info', 'No camera list available — actions will use manual camera entry')
			}
		}

		// Superseded by a later connect() that started before this one finished, or
		// the instance was destroyed while these awaits were pending -- either way,
		// acting now would run against stale results on a stale or torn-down
		// instance.
		if (this.destroyed || generation !== this.connectGeneration) return

		this.updateActions()
		this.updatePresets()
		this.updateFeedbacks()
		this.updateVariables()
		this.pushState()
		this.startSocket()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	getApiTarget(): ApiTarget {
		return {
			host: this.config.host,
			port: this.config.port,
			timeoutMs: this.config.timeout,
		}
	}

	getCameras(): Camera[] {
		return this.cameras
	}

	getState(): ModuleState {
		return this.state
	}

	/**
	 * Fire-and-forget command. Deliberately does not retry: a visibly failed
	 * press the operator can repeat is better than a silent retry storm during a
	 * show, and the state socket reports the master's real state either way.
	 */
	async sendCommand(path: string, params: Record<string, string | number> = {}): Promise<void> {
		const target = this.getApiTarget()
		const addr = `${target.host}:${target.port}${path}`
		const result = await apiGet(target, path, params)

		if (result.status === null) {
			// A timeout and an unreachable host are indistinguishable in ApiResult,
			// and /allOff and /allIdle can legitimately take seconds on the master —
			// so don't claim the command was not executed.
			this.log(
				'warn',
				`Request to ${addr} got no response within ${target.timeoutMs}ms — the master may still have executed it`,
			)
			this.updateStatus(InstanceStatus.ConnectionFailure)
			return
		}

		if (!result.ok) {
			// The master answered, so the connection is fine — we sent something
			// it rejected. Its error strings are already human-readable. Clear any
			// stale ConnectionFailure: a 400 is not a success, but it is proof of
			// reachability.
			this.log('warn', `Master rejected ${addr}: ${result.body}`)
			this.updateStatus(InstanceStatus.Ok)
			return
		}

		this.log('debug', `${addr} OK`)
		this.updateStatus(InstanceStatus.Ok)
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	private startSocket(): void {
		const { host, port } = this.config
		if (!host) {
			this.log('info', 'No master address configured — feedbacks and variables will stay inactive')
			return
		}

		this.socket = new StateSocket(`ws://${host}:${port}/ws`, {
			onSnapshot: (snapshot) => {
				this.state = applySnapshot(this.state, snapshot)

				// The snapshot carries ids, not names. An id we have never seen -- and
				// that a previous refresh did not resolve -- means the cached camera
				// list is stale, so refresh it so live_cam_name and the picker's
				// labels catch up. Filtering out ids already known unresolvable is
				// what bounds this: without it, a camera the list will never contain
				// (deleted on the device, skipped by parseCameraList, or an
				// out-of-range id -- parseStateFrame deliberately does not
				// range-check) would retrigger a fetch on every single frame.
				const knownIds = this.cameras.map((c) => c.id)
				const unknown = snapshot.cameras
					.map((c) => c.id)
					.filter((id) => !knownIds.includes(id) && !this.unresolvedCameraIds.has(id))
				if (unknown.length > 0) void this.refreshCameras(unknown)

				this.pushState()
			},
			onConnected: (connected) => {
				this.state = setConnected(this.state, connected)
				if (connected) {
					// D3: a reconnect is when a rename or a newly added camera is
					// picked up, not only an unknown id in a snapshot.
					this.unresolvedCameraIds.clear()
					void this.refreshCameras()
				}
				this.pushState()
			},
			log: (level, message) => this.log(level, message),
		})
		this.socket.start()
	}

	private stopSocket(): void {
		if (this.socket) {
			this.socket.stop()
			this.socket = null
		}
	}

	/**
	 * Re-reads the camera list after the master reports an id we do not know, or
	 * after a reconnect, then rebuilds everything whose labels depend on it.
	 *
	 * Guarded against re-entry: the firmware coalesces at 100ms, so an unresolved
	 * id in every snapshot could otherwise fire this several times a second
	 * indefinitely.
	 */
	private async refreshCameras(triggeredBy: number[] = []): Promise<void> {
		if (this.refreshInFlight) return
		this.refreshInFlight = true
		try {
			const cameras = await fetchCameras(this.getApiTarget())
			// The instance may have been torn down while this await was pending.
			if (this.destroyed) return

			if (cameras.length > 0) {
				this.cameras = cameras
				this.updateActions()
				this.updateFeedbacks()
				this.updatePresets()
				this.pushState()
			}

			// Whatever this refresh did not resolve must not trigger another one.
			// Cleared on reconnect, so a camera genuinely added later is picked up.
			const ids = this.cameras.map((c) => c.id)
			for (const id of triggeredBy) {
				if (!ids.includes(id)) this.unresolvedCameraIds.add(id)
			}
		} finally {
			this.refreshInFlight = false
		}
	}

	/** Pushes the current state into Companion. Cheap enough to call on every frame. */
	private pushState(): void {
		if (this.destroyed) return
		this.checkFeedbacks('camera_live', 'camera_preview', 'onair', 'connected')
		this.setVariableValues(variableValues(this.state, this.cameras))
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariables(): void {
		UpdateVariables(this)
	}
}
