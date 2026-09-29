// npx tsx src/evals/run.ts --fast   (no LLM: retrieval, plus refusals decided by the threshold alone)
// npx tsx src/evals/run.ts --full   (uses Ollama: retrieval, faithfulness and correct refusal)
import { OllamaError, checkOllama } from '../agent/ollama.js'
import { createPipeline } from '../agent/pipeline.js'
import { loadConfig } from '../config.js'
import { verifyModelFiles } from '../rag/embedder.js'
import { retrieve } from '../rag/retrieve.js'
import { loadIndex, type ScoredChunk } from '../rag/store.js'
import { checkAgainstDocs, loadDocs, loadGolden } from './golden.js'
import { PASS_MARKS } from './passmarks.js'
import { evaluate, exitCode, renderScorecard, type Mode, type Probe, type RetrievedLite } from './report.js'

const lite = (chunks: ScoredChunk[]): RetrievedLite[] => chunks.map(({ chunk, score }) => ({ source: chunk.source, heading: chunk.heading, text: chunk.text, score }))

async function main(): Promise<number> {
  const flag = process.argv.slice(2)
  const mode: Mode | undefined = flag.includes('--full') ? 'full' : flag.includes('--fast') ? 'fast' : undefined
  if (mode === undefined) {
    console.error('Usage: tsx src/evals/run.ts --fast | --full')
    return 1
  }

  const config = loadConfig()
  const entries = loadGolden()
  checkAgainstDocs(entries, loadDocs())
  // Without the model files and the index there is nothing honest to score, so stop loudly.
  verifyModelFiles()
  const index = loadIndex()

  let skipReason: string | undefined
  if (mode === 'full') {
    try {
      await checkOllama(config.ollamaUrl, config.ollamaModel)
    } catch (error) {
      if (!(error instanceof OllamaError)) throw error
      skipReason = error.message
    }
  }

  let last: ScoredChunk[] = []
  const pipeline = mode === 'full' && skipReason === undefined ? createPipeline(config, { index, onRetrieved: (chunks) => (last = chunks) }) : undefined
  const probe = async (question: string): Promise<Probe> => {
    if (pipeline === undefined) return { retrieved: lite(await retrieve(question, index, config.topK)) }
    last = []
    const started = performance.now()
    try {
      const result = await pipeline(question)
      return { retrieved: lite(last), result, ms: performance.now() - started }
    } catch (error) {
      return { retrieved: lite(last), ms: performance.now() - started, error: error instanceof Error ? error.message : 'unknown error' }
    }
  }

  const report = await evaluate({
    mode,
    model: config.ollamaModel,
    threshold: config.refusalThreshold,
    topK: config.topK,
    entries,
    probe,
    passMarks: PASS_MARKS,
    skipReason,
    onProgress: mode === 'full' && pipeline ? (line) => console.log(`  ${line}`) : undefined,
  })
  console.log(`\n${renderScorecard(report)}`)
  return exitCode(report)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'The eval failed to start.')
    process.exitCode = 1
  })
