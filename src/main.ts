import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdatePresets } from './presets.js'
import { apiGet, type ApiTarget } from './api.js'
import { fetchCameras, type Camera } from './cameras.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	// v1 has no feedbacks or variables. These keys are required by the
	// @companion-module/base InstanceTypes constraint (InstanceBase<TManifest
	// extends InstanceTypes>), so they stay as empty records rather than being
	// removed outright.
	feedbacks: Record<string, never>
	variables: Record<string, never>
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()
	private cameras: Camera[] = []

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.connect()
	}
	// When module gets deleted
	async destroy(): Promise<void> {
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

		this.updateActions()
		this.updatePresets()
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

	/**
	 * Fire-and-forget command. Deliberately does not retry: the master runs a
	 * synchronous web server that wedges under connection pressure, so a
	 * visibly failed press the operator can repeat beats hammering the device.
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
}
