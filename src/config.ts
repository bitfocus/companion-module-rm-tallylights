import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	timeout: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Master address',
			width: 8,
			regex: Regex.HOSTNAME,
			default: '',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 80,
		},
		{
			type: 'number',
			id: 'timeout',
			label: 'Request timeout (ms)',
			width: 4,
			min: 500,
			max: 30000,
			// /allOff and /allIdle loop over every camera on the master, blocking
			// ~100ms per online camera and ~240ms per offline one before replying —
			// 32 offline cameras is ~7.7s. A shorter default aborted the request
			// after the master had already executed the command, reporting a red
			// "unreachable" connection and dropping a client mid-response on the
			// wedge-prone synchronous server.
			default: 10000,
		},
	]
}
