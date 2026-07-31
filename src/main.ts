import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdatePresets } from './presets.js'

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

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateStatus(InstanceStatus.Ok)

		this.updateActions() // export actions
		this.updatePresets() // export Presets
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}
}
