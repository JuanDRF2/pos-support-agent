// Manual check from the terminal: npx tsx src/agent/try.ts "how do I process a partial refund?"
import { loadConfig } from '../config.js'
import { createPipeline } from './pipeline.js'

const question = process.argv.slice(2).join(' ').trim()
if (question === '') {
  console.error('Usage: npx tsx src/agent/try.ts "your question"')
  process.exit(1)
}

try {
  const config = loadConfig()
  const started = performance.now()
  const result = await createPipeline(config)(question)
  console.log(JSON.stringify(result, null, 2))
  console.log(`(${Math.round(performance.now() - started)} ms, model ${config.ollamaModel})`)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Something went wrong.')
  process.exitCode = 1
}
