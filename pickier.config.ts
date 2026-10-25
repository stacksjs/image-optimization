import type { PickierConfig } from 'pickier'

export default {
  ignores: ['**/node_modules/**', '**/dist/**', '**/.stx/**', '**/pantry/**', '**/storage/**', '**/bun.lock'],
  rules: { noConsole: 'off', noDebugger: 'error' },
  pluginRules: { 'ts/no-top-level-await': 'off' },
} satisfies Partial<PickierConfig>
