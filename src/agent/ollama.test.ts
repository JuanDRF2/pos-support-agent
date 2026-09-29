import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ConfigError } from '../config.js'
import { OllamaError, checkOllama, createGenerator } from './ollama.js'

type Seen = { method?: string; url?: string; contentType?: string; body: string }
type Handler = (req: IncomingMessage, res: ServerResponse, seen: Seen) => void

async function startServer(handler: Handler) {
  const seen: Seen[] = []
  const server = createServer((req, res) => {
    const entry: Seen = { method: req.method, url: req.url, contentType: req.headers['content-type'], body: '' }
    seen.push(entry)
    req.on('data', (chunk: Buffer) => (entry.body += chunk.toString()))
    req.on('end', () => handler(req, res, entry))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  return { url, seen, close }
}

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
const prompt = { system: 'SYSTEM TEXT', user: 'USER TEXT' }

async function closedPortUrl(): Promise<string> {
  const server = await startServer(() => undefined)
  const url = server.url
  await server.close()
  return url
}

test('sends one non-streamed chat request with temperature 0, a fixed seed and a token cap', async () => {
  const server = await startServer((_req, res) => json(res, { message: { role: 'assistant', content: ' hello ' } }))
  try {
    const reply = await createGenerator({ baseUrl: server.url, model: 'llama3.2:3b' })(prompt)
    assert.equal(reply, ' hello ')
    assert.equal(server.seen.length, 1)
    const [request] = server.seen
    assert.equal(request.method, 'POST')
    assert.equal(request.url, '/api/chat')
    assert.equal(request.contentType, 'application/json')
    assert.deepEqual(JSON.parse(request.body), {
      model: 'llama3.2:3b',
      stream: false,
      options: { temperature: 0, seed: 7, num_predict: 400 },
      messages: [
        { role: 'system', content: 'SYSTEM TEXT' },
        { role: 'user', content: 'USER TEXT' },
      ],
    })
  } finally {
    await server.close()
  }
})

test('a missing model says how to install it', async () => {
  const server = await startServer((_req, res) => json(res, { error: 'model not found' }, 404))
  try {
    await assert.rejects(createGenerator({ baseUrl: server.url, model: 'llama3.2:3b' })(prompt), (error: unknown) => {
      return error instanceof OllamaError && error.code === 'model_missing' && error.message.includes('ollama pull llama3.2:3b')
    })
  } finally {
    await server.close()
  }
})

test('an HTTP error never leaks the server body, the prompt or the question into the message', async () => {
  const server = await startServer((_req, res) => json(res, { error: 'SECRET-BODY' }, 500))
  try {
    await assert.rejects(createGenerator({ baseUrl: server.url, model: 'm' })(prompt), (error: unknown) => {
      return error instanceof OllamaError && error.code === 'http' && !/SECRET|SYSTEM TEXT|USER TEXT/.test(error.message)
    })
  } finally {
    await server.close()
  }
})

test('replies in the wrong shape, invalid JSON or too large are rejected', async () => {
  const replies: unknown[] = ['not json at all', {}, { message: { content: 5 } }, { message: 'text' }, [], 'x'.repeat(1_000_001)]
  for (const reply of replies) {
    const server = await startServer((_req, res) => {
      res.writeHead(200)
      res.end(typeof reply === 'string' ? reply : JSON.stringify(reply))
    })
    try {
      await assert.rejects(createGenerator({ baseUrl: server.url, model: 'm' })(prompt), (error: unknown) => error instanceof OllamaError && error.code === 'bad_response', JSON.stringify(reply)?.slice(0, 40))
    } finally {
      await server.close()
    }
  }
})

test('a server that never answers hits the timeout', async () => {
  const server = await startServer(() => undefined)
  try {
    const started = Date.now()
    await assert.rejects(createGenerator({ baseUrl: server.url, model: 'm', timeoutMs: 150 })(prompt), (error: unknown) => error instanceof OllamaError && error.code === 'timeout')
    assert.ok(Date.now() - started < 3000)
  } finally {
    await server.close()
  }
})

test('Ollama not running gives a plain "start it" message', async () => {
  await assert.rejects(createGenerator({ baseUrl: await closedPortUrl(), model: 'm' })(prompt), (error: unknown) => {
    return error instanceof OllamaError && error.code === 'unreachable' && error.message.includes('ollama serve')
  })
})

test('redirects are never followed', async () => {
  const target = await startServer((_req, res) => json(res, { message: { content: 'from the redirect target' } }))
  const redirector = await startServer((_req, res) => {
    res.writeHead(302, { location: `${target.url}/api/chat` })
    res.end()
  })
  try {
    await assert.rejects(createGenerator({ baseUrl: redirector.url, model: 'm' })(prompt), OllamaError)
    assert.equal(target.seen.length, 0, 'the redirect target received nothing')
  } finally {
    await redirector.close()
    await target.close()
  }
})

test('the client refuses to be built for a non-local URL', () => {
  for (const baseUrl of ['http://localhost.evil.com', 'http://127.0.0.1@evil.com', 'https://127.0.0.1:11434', 'http://example.com']) {
    assert.throws(() => createGenerator({ baseUrl, model: 'm' }), ConfigError, baseUrl)
  }
})

test('checkOllama passes when the model is installed (a name without a tag means :latest)', async () => {
  const server = await startServer((_req, res) => json(res, { models: [{ name: 'llama3.2:3b', model: 'llama3.2:3b' }, { name: 'tiny:latest', model: 'tiny:latest' }] }))
  try {
    await checkOllama(server.url, 'llama3.2:3b')
    await checkOllama(server.url, 'tiny')
    assert.equal(server.seen[0].url, '/api/tags')
    await assert.rejects(checkOllama(server.url, 'llama3.1:8b'), (error: unknown) => error instanceof OllamaError && error.code === 'model_missing' && error.message.includes('ollama pull llama3.1:8b'))
  } finally {
    await server.close()
  }
})

test('checkOllama reports Ollama not running, and refuses a non-local URL', async () => {
  await assert.rejects(checkOllama(await closedPortUrl(), 'llama3.2:3b'), (error: unknown) => error instanceof OllamaError && error.code === 'unreachable')
  await assert.rejects(checkOllama('http://evil.example', 'm'), ConfigError)
})
