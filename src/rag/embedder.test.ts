import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODEL_DIMENSIONS } from '../config.js'
import { cosine } from './store.js'
import { ModelError, downloadModel, embed, isModelReady, verifyModelFiles } from './embedder.js'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const FILES = { 'a.json': sha('alpha'), 'sub/b.bin': sha('beta') }
const tempDir = () => mkdtempSync(join(tmpdir(), 'pos-model-'))
const bodies: Record<string, string> = { 'a.json': 'alpha', 'sub/b.bin': 'beta' }
const fakeFetch = (overrides: Record<string, string> = {}, status = 200) =>
  (async (url: string | URL | Request) => {
    const name = String(url).split('/resolve/x/')[1]
    return new Response(overrides[name] ?? bodies[name], { status })
  }) as typeof fetch
const options = (extra: object = {}) => ({ files: FILES, baseUrl: 'https://example.test/resolve/x/', ...extra })

test('verifyModelFiles accepts matching files, rejects missing and tampered ones', () => {
  const dir = tempDir()
  assert.throws(() => verifyModelFiles(dir, FILES), ModelError)
  writeFileSync(join(dir, 'a.json'), 'alpha')
  mkdirSync(join(dir, 'sub'))
  writeFileSync(join(dir, 'sub/b.bin'), 'beta')
  assert.doesNotThrow(() => verifyModelFiles(dir, FILES))
  assert.equal(isModelReady(dir, FILES), true)
  writeFileSync(join(dir, 'a.json'), 'tampered')
  assert.throws(() => verifyModelFiles(dir, FILES), /pinned hash.*npm run ingest/)
  assert.equal(isModelReady(dir, FILES), false)
})

test('downloadModel saves files only after their hash matches', async () => {
  const dir = tempDir()
  await downloadModel(dir, options({ fetchFn: fakeFetch() }))
  verifyModelFiles(dir, FILES)
})

test('downloadModel refuses a file with the wrong hash and keeps nothing on disk', async () => {
  const dir = tempDir()
  await assert.rejects(downloadModel(dir, options({ fetchFn: fakeFetch({ 'a.json': 'evil' }) })), /does not match its pinned hash/)
  assert.equal(existsSync(join(dir, 'a.json')), false)
  assert.equal(existsSync(join(dir, 'a.json.part')), false)
  assert.deepEqual(readdirSync(dir), [])
})

test('downloadModel rejects plain http, HTTP errors, network failures and oversized files', async () => {
  const dir = tempDir()
  await assert.rejects(downloadModel(dir, options({ baseUrl: 'http://example.test/', fetchFn: fakeFetch() })), /HTTPS/)
  await assert.rejects(downloadModel(dir, options({ fetchFn: fakeFetch({}, 404) })), /HTTP 404/)
  const offline = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch
  await assert.rejects(downloadModel(dir, options({ fetchFn: offline })), /internet connection/)
  const huge = (async () => new Response('x', { headers: { 'content-length': String(500 * 1024 * 1024) } })) as typeof fetch
  await assert.rejects(downloadModel(dir, options({ fetchFn: huge })), /larger than expected/)
})

// These need the real model folder (created by `npm run ingest`); otherwise they are reported as skipped.
const live = { skip: isModelReady() ? false : 'embedding model not downloaded yet: run `npm run ingest`' }

test('embeds to 384-dimension unit vectors', live, async () => {
  const [vector] = await embed(['how do I process a partial refund?'])
  assert.equal(vector.length, MODEL_DIMENSIONS)
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-6, 'normalised')
})

test('similar sentences score above unrelated ones; batching only changes vectors by quantization noise', live, async () => {
  const [question, related, unrelated] = await embed([
    'how do I process a partial refund?',
    'Issuing a Partial Refund: tap Refund, then Partial, and confirm the partial refund.',
    'A subscription in Past Due status moves to Cancelled after 7 days.',
  ])
  assert.ok(cosine(question, related) > cosine(question, unrelated) + 0.1)
  const [alone] = await embed(['how do I process a partial refund?'])
  // Measured 0.9988: the q8 model scales activations per batch, so a padded batch shifts vectors a
  // little. A broken attention mask would drop this far below 0.995. This is why ingest embeds one
  // chunk at a time.
  assert.ok(cosine(alone, question) > 0.995, 'same vector alone or in a padded batch, up to quantization noise')
})
