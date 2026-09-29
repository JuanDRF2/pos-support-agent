import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODEL_DIMENSIONS, MODEL_ID, MODEL_REVISION } from '../config.js'
import { IndexError, cosine, loadIndex, parseIndex, saveIndex, topK, type IndexedChunk, type VectorIndex } from './store.js'

const unit = (position: number): number[] => Array.from({ length: MODEL_DIMENSIONS }, (_, i) => (i === position ? 1 : 0))
const chunk = (heading: string, embedding: number[], source: IndexedChunk['source'] = 'pos-checkout.md'): IndexedChunk => ({ source, heading, text: `${heading}\n\nBody`, embedding })
const validIndex = (): VectorIndex => ({ model: MODEL_ID, revision: MODEL_REVISION, dimensions: MODEL_DIMENSIONS, chunks: [chunk('A', unit(0)), chunk('B', unit(1))] })

test('cosine on hand-made vectors', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1)
  assert.equal(cosine([1, 0], [0, 1]), 0)
  assert.equal(cosine([1, 0], [-1, 0]), -1)
  assert.ok(Math.abs(cosine([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-12)
  assert.equal(cosine([0, 0], [1, 0]), 0, 'zero vector scores 0, not NaN')
  assert.throws(() => cosine([1], [1, 2]), IndexError)
})

test('topK ranks by score, breaks ties by index order, and respects k', () => {
  const index: VectorIndex = { ...validIndex(), chunks: [chunk('far', unit(5)), chunk('near', unit(0)), chunk('tie-1', unit(7)), chunk('tie-2', unit(7))] }
  const results = topK(index, unit(0), 3)
  assert.deepEqual(results.map((r) => r.chunk.heading), ['near', 'far', 'tie-1'])
  assert.equal(results[0].score, 1)
  assert.equal(topK(index, unit(0), 0).length, 0)
  assert.equal(topK(index, unit(7), 10).length, 4)
})

test('save then load round-trips', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'pos-index-')), 'nested', 'index.json')
  saveIndex(path, validIndex().chunks)
  assert.deepEqual(loadIndex(path), validIndex())
})

test('a corrupt or stale index fails with a plain "re-run ingest" message', () => {
  const good = validIndex()
  const cases: [string, unknown][] = [
    ['not an object', []],
    ['other model', { ...good, model: 'someone/else' }],
    ['other revision', { ...good, revision: 'deadbeef' }],
    ['other dimensions', { ...good, dimensions: 3 }],
    ['no chunks', { ...good, chunks: [] }],
    ['chunks not a list', { ...good, chunks: {} }],
    ['unknown source', { ...good, chunks: [{ ...good.chunks[0], source: 'evil.md' }] }],
    ['empty text', { ...good, chunks: [{ ...good.chunks[0], text: '' }] }],
    ['short embedding', { ...good, chunks: [{ ...good.chunks[0], embedding: [1, 2, 3] }] }],
    ['NaN in embedding', { ...good, chunks: [{ ...good.chunks[0], embedding: [...unit(0).slice(1), Number.NaN] }] }],
    ['string in embedding', { ...good, chunks: [{ ...good.chunks[0], embedding: [...unit(0).slice(1), '1'] }] }],
  ]
  for (const [name, raw] of cases) {
    assert.throws(() => parseIndex(raw), (error: unknown) => error instanceof IndexError && /npm run ingest/.test(error.message), name)
  }
})

test('loadIndex reports a missing file and invalid JSON plainly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pos-index-'))
  assert.throws(() => loadIndex(join(dir, 'missing.json')), /not found.*npm run ingest/)
  writeFileSync(join(dir, 'bad.json'), '{ not json')
  assert.throws(() => loadIndex(join(dir, 'bad.json')), /not valid JSON.*npm run ingest/)
})
