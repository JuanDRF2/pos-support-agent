import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KB_FILES, MODEL_DIMENSIONS } from '../config.js'
import { chunkMarkdown } from './chunker.js'
import { BATCH_SIZE, buildIndex } from './ingest.js'
import { loadDocs } from './kb.js'

test('buildIndex chunks every article in order and attaches one vector per chunk', async () => {
  const docs = loadDocs()
  const batches: number[] = []
  const fakeEmbed = async (texts: string[]) => {
    batches.push(texts.length)
    return texts.map((text) => Array.from({ length: MODEL_DIMENSIONS }, (_, i) => (i === text.length % MODEL_DIMENSIONS ? 1 : 0)))
  }
  const indexed = await buildIndex(docs, fakeEmbed)
  const expected = KB_FILES.flatMap((file) => chunkMarkdown(file, docs[file]))
  assert.deepEqual(indexed.map(({ source, heading, text }) => ({ source, heading, text })), expected)
  assert.ok(indexed.every((c) => c.embedding.length === MODEL_DIMENSIONS))
  assert.ok(batches.every((n) => n <= BATCH_SIZE), 'batches are capped')
  assert.equal(batches.reduce((a, b) => a + b, 0), expected.length)
})

test('buildIndex fails loudly if the embedder returns the wrong number of vectors', async () => {
  await assert.rejects(buildIndex(loadDocs(), async () => []), /different number of vectors/)
})
