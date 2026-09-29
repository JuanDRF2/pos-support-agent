import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers'
import { MODEL_DIMENSIONS, MODEL_FILES, MODEL_ID, MODEL_REVISION } from '../config.js'

export class ModelError extends Error {}

const SETUP_HINT = 'Run `npm run ingest` once (it needs internet) to download and verify the embedding model.'
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024

const MODELS_ROOT = new URL('../../.cache/models/', import.meta.url).pathname
const MODEL_NAME = `minilm-${MODEL_REVISION.slice(0, 12)}`

export function defaultModelDir(): string {
  return join(MODELS_ROOT, MODEL_NAME)
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// Every file must exist and match the pinned hash. Nothing is downloaded here.
export function verifyModelFiles(dir: string = defaultModelDir(), files: Readonly<Record<string, string>> = MODEL_FILES): void {
  for (const [name, expected] of Object.entries(files)) {
    const path = join(dir, name)
    if (!existsSync(path)) throw new ModelError(`Embedding model file "${name}" is missing. ${SETUP_HINT}`)
    if (sha256(readFileSync(path)) !== expected) throw new ModelError(`Embedding model file "${name}" does not match its pinned hash. ${SETUP_HINT}`)
  }
}

export function isModelReady(dir: string = defaultModelDir(), files: Readonly<Record<string, string>> = MODEL_FILES): boolean {
  try {
    verifyModelFiles(dir, files)
    return true
  } catch {
    return false
  }
}

type DownloadOptions = { fetchFn?: typeof fetch; files?: Readonly<Record<string, string>>; baseUrl?: string }

// Only the ingest step calls this. Files come from a fixed HTTPS URL at the pinned revision
// and are written only after their sha256 matches, so a changed or tampered file is never kept.
export async function downloadModel(dir: string = defaultModelDir(), options: DownloadOptions = {}): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch
  const files = options.files ?? MODEL_FILES
  const baseUrl = options.baseUrl ?? `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/`
  if (!baseUrl.startsWith('https://')) throw new ModelError('Model downloads must use HTTPS.')
  for (const [name, expected] of Object.entries(files)) {
    let bytes: Uint8Array
    try {
      const response = await fetchFn(`${baseUrl}${name}`)
      if (!response.ok) throw new ModelError(`Downloading "${name}" failed (HTTP ${response.status}).`)
      const declared = Number(response.headers.get('content-length') ?? 0)
      if (declared > MAX_DOWNLOAD_BYTES) throw new ModelError(`"${name}" is larger than expected.`)
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      if (error instanceof ModelError) throw error
      throw new ModelError(`Could not download the embedding model "${name}". Check your internet connection and try again.`)
    }
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw new ModelError(`"${name}" is larger than expected.`)
    if (sha256(bytes) !== expected) throw new ModelError(`Downloaded "${name}" does not match its pinned hash; it was not saved.`)
    const target = join(dir, name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(`${target}.part`, bytes)
    renameSync(`${target}.part`, target)
  }
}

type Loaded = { tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>; model: Awaited<ReturnType<typeof AutoModel.from_pretrained>> }
let loading: Promise<Loaded> | undefined

// The app never downloads: remote models are off and everything loads from the verified folder.
function load(): Promise<Loaded> {
  loading ??= (async () => {
    verifyModelFiles()
    env.allowRemoteModels = false
    env.allowLocalModels = true
    env.localModelPath = MODELS_ROOT
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME)
    const model = await AutoModel.from_pretrained(MODEL_NAME, { dtype: 'q8' })
    return { tokenizer, model }
  })()
  loading.catch(() => {
    loading = undefined
  })
  return loading
}

// Mean pooling over the attention mask, then L2 normalisation.
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const { tokenizer, model } = await load()
  const inputs = await tokenizer(texts, { padding: true, truncation: true })
  const output = (await model(inputs)) as { last_hidden_state: { dims: number[]; data: ArrayLike<number> } }
  const [batch, length, dimensions] = output.last_hidden_state.dims
  if (dimensions !== MODEL_DIMENSIONS) throw new ModelError(`Unexpected embedding size ${dimensions}.`)
  const mask = inputs.attention_mask.data as ArrayLike<number | bigint>
  const vectors: number[][] = []
  for (let b = 0; b < batch; b++) {
    const vector = new Array<number>(dimensions).fill(0)
    let count = 0
    for (let t = 0; t < length; t++) {
      if (Number(mask[b * length + t]) === 0) continue
      count++
      for (let d = 0; d < dimensions; d++) vector[d] += output.last_hidden_state.data[(b * length + t) * dimensions + d]
    }
    let norm = 0
    for (let d = 0; d < dimensions; d++) {
      vector[d] /= Math.max(count, 1)
      norm += vector[d] * vector[d]
    }
    norm = Math.sqrt(norm) || 1
    vectors.push(vector.map((x) => x / norm))
  }
  return vectors
}
