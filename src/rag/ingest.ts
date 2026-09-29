import { pathToFileURL } from 'node:url'
import { KB_FILES } from '../config.js'
import { chunkMarkdown } from './chunker.js'
import { downloadModel, embed, isModelReady, verifyModelFiles } from './embedder.js'
import { loadDocs } from './kb.js'
import { defaultIndexPath, saveIndex, type IndexedChunk } from './store.js'

// One text at a time: the quantized model's activations are scaled per batch, so batching would make
// a chunk's vector depend on its neighbours. Questions are embedded alone at chat time, so this
// keeps both sides computed the same way (there are only about ten chunks).
export const BATCH_SIZE = 1

export async function buildIndex(
  docs: Record<string, string>,
  embedFn: (texts: string[]) => Promise<number[][]> = embed,
): Promise<IndexedChunk[]> {
  const chunks = KB_FILES.flatMap((file) => chunkMarkdown(file, docs[file] ?? ''))
  const indexed: IndexedChunk[] = []
  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const batch = chunks.slice(start, start + BATCH_SIZE)
    const vectors = await embedFn(batch.map((chunk) => chunk.text))
    if (vectors.length !== batch.length) throw new Error('The embedder returned a different number of vectors than chunks.')
    batch.forEach((chunk, i) => indexed.push({ ...chunk, embedding: vectors[i] }))
  }
  return indexed
}

async function main(): Promise<void> {
  if (!isModelReady()) {
    console.log('Downloading the embedding model (about 23 MB) over HTTPS from huggingface.co, once...')
    await downloadModel()
    verifyModelFiles()
  }
  const indexed = await buildIndex(loadDocs())
  saveIndex(defaultIndexPath(), indexed)
  console.log(`Indexed ${indexed.length} chunks from ${KB_FILES.length} articles into data/index.json`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Ingest failed.')
    process.exitCode = 1
  })
}
