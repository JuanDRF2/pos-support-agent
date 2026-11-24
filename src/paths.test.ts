import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveFromModule } from './paths.js'

test('resolveFromModule decodes a space in the module path', () => {
  const resolved = resolveFromModule('../../data/index.json', 'file:///tmp/my project/src/rag/store.ts')
  assert.ok(resolved.includes('my project'))
  assert.ok(!resolved.includes('%20'))
  assert.ok(resolved.endsWith('index.json'))
})
