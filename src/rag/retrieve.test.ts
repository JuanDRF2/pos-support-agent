import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_DIMENSIONS, MODEL_ID, MODEL_REVISION } from '../config.js'
import { loadGolden } from '../evals/golden.js'
import { isModelReady } from './embedder.js'
import { retrieve } from './retrieve.js'
import { IndexError, loadIndex, type VectorIndex } from './store.js'

const unit = (position: number): number[] => Array.from({ length: MODEL_DIMENSIONS }, (_, i) => (i === position ? 1 : 0))
const index: VectorIndex = {
  model: MODEL_ID,
  revision: MODEL_REVISION,
  dimensions: MODEL_DIMENSIONS,
  chunks: [
    { source: 'pos-checkout.md', heading: 'A', text: 'A\n\nbody', embedding: unit(0) },
    { source: 'pos-renewals.md', heading: 'B', text: 'B\n\nbody', embedding: unit(1) },
    { source: 'gift-renewal-pos.md', heading: 'C', text: 'C\n\nbody', embedding: unit(2) },
  ],
}

test('retrieve embeds the trimmed question once and returns the top-k with scores', async () => {
  const seen: string[][] = []
  const fakeEmbed = async (texts: string[]) => {
    seen.push(texts)
    return [unit(1)]
  }
  const results = await retrieve('  how do I renew?  ', index, 2, fakeEmbed)
  assert.deepEqual(seen, [['how do I renew?']])
  assert.equal(results.length, 2)
  assert.equal(results[0].chunk.heading, 'B')
  assert.equal(results[0].score, 1)
})

test('retrieve rejects an empty question and a missing vector', async () => {
  await assert.rejects(retrieve('   ', index, 3, async () => [unit(0)]), /empty question/)
  await assert.rejects(retrieve('q', index, 3, async () => []), /no vector/)
})

// Needs the real model and index (`npm run ingest`); reported as skipped otherwise.
const liveIndex = (() => {
  try {
    return isModelReady() ? loadIndex() : undefined
  } catch (error) {
    if (error instanceof IndexError) return undefined
    throw error
  }
})()
const live = { skip: liveIndex ? false : 'embedding model or index not built yet: run `npm run ingest`' }

test('real retrieval: every answerable golden question finds its expected section in the top 3', live, async () => {
  assert.ok(liveIndex)
  for (const entry of loadGolden()) {
    if (entry.expect !== 'answer') continue
    const top3 = await retrieve(entry.question, liveIndex, 3)
    const found = top3.some(({ chunk }) => chunk.source === entry.sourceDoc && entry.sourceHeadings.includes(chunk.heading))
    assert.ok(found, `${entry.id}: expected ${entry.sourceHeadings.join(' or ')}, got ${top3.map(({ chunk }) => chunk.heading).join('; ')}`)
  }
})

test('real retrieval: the partial refund question lands on the partial refund procedure', live, async () => {
  assert.ok(liveIndex)
  const [top] = await retrieve('how do I process a partial refund?', liveIndex, 3)
  assert.equal(top.chunk.source, 'pos-checkout.md')
  assert.equal(top.chunk.heading, 'Issuing a Partial Refund')
})
