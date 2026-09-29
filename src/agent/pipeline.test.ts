import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_DIMENSIONS, MODEL_ID, MODEL_REVISION, loadConfig } from '../config.js'
import type { VectorIndex } from '../rag/store.js'
import { REFUSAL_TEXT, type Prompt } from './answer.js'
import { createPipeline } from './pipeline.js'

const unit = (position: number): number[] => Array.from({ length: MODEL_DIMENSIONS }, (_, i) => (i === position ? 1 : 0))
const index: VectorIndex = {
  model: MODEL_ID,
  revision: MODEL_REVISION,
  dimensions: MODEL_DIMENSIONS,
  chunks: [
    { source: 'pos-checkout.md', heading: 'Alpha', text: 'Alpha\n\nalpha body', embedding: unit(0) },
    { source: 'pos-renewals.md', heading: 'Beta', text: 'Beta\n\nbeta body', embedding: unit(1) },
  ],
}

test('the pipeline retrieves, applies the configured threshold and top-k, and generates', async () => {
  const prompts: Prompt[] = []
  const config = { ...loadConfig({}), topK: 1, refusalThreshold: 0.5 }
  const ask = createPipeline(config, {
    index,
    embedFn: async () => [unit(0)],
    generate: async (prompt) => {
      prompts.push(prompt)
      return 'Do the alpha thing.'
    },
  })
  assert.deepEqual(await ask('what is alpha?'), { kind: 'answer', text: 'Do the alpha thing.', source: 'pos-checkout.md' })
  assert.match(prompts[0].user, /\[1\] Alpha/)
  assert.doesNotMatch(prompts[0].user, /Beta/, 'topK=1 sends only the best chunk')
})

test('a question far from every chunk is refused without calling the generator', async () => {
  let calls = 0
  const ask = createPipeline({ ...loadConfig({}), refusalThreshold: 0.5 }, {
    index,
    embedFn: async () => [unit(9)],
    generate: async () => {
      calls++
      return 'should not happen'
    },
  })
  assert.deepEqual(await ask('reset my password'), { kind: 'refusal', text: REFUSAL_TEXT })
  assert.equal(calls, 0)
})
