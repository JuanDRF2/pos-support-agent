import { OllamaError, checkOllama } from './agent/ollama.js'
import { createPipeline } from './agent/pipeline.js'
import { loadConfig } from './config.js'
import { embed, verifyModelFiles } from './rag/embedder.js'
import { createApp, startServer } from './server/server.js'

async function main(): Promise<void> {
  const config = loadConfig()
  verifyModelFiles()
  const ask = createPipeline(config)
  await embed(['warm up'])

  // Ollama may be started after the app, so this only warns: the page shows a plain error until it is ready.
  try {
    await checkOllama(config.ollamaUrl, config.ollamaModel)
  } catch (error) {
    if (!(error instanceof OllamaError)) throw error
    console.warn(`Warning: ${error.message}`)
  }

  const server = createApp({ ask, log: (line) => console.log(`[${new Date().toISOString()}] ${line}`) })
  await startServer(server, config.port)
  console.log(`POS Support is running at http://localhost:${config.port} (only this computer can reach it). Press Ctrl+C to stop.`)
}

// Startup errors (missing model or index, bad settings, port in use) are written for the person running the app.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Startup failed.')
  process.exitCode = 1
})
