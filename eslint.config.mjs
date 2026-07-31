import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

export default [
	...(await generateEslintConfig({
		enableTypescript: true,
	})),
	{
		// Test files may import devDependencies (e.g. vitest) freely.
		files: ['test/**/*.ts'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
