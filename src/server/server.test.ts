import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { request, type IncomingHttpHeaders, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { OllamaError } from '../agent/ollama.js'
import { MAX_BODY_BYTES, MAX_QUESTION_CHARS } from '../config.js'
import { IndexError } from '../rag/store.js'
import type { ChatResult } from '../types.js'
import { HOST, contentSecurityPolicy, createApp, startServer } from './server.js'

type Reply = { status: number; headers: IncomingHttpHeaders; body: string }
type Ask = (question: string) => Promise<ChatResult>

const answerResult: ChatResult = { kind: 'answer', text: 'Tap **Refund**.', source: 'pos-checkout.md' }
const okAsk: Ask = async () => answerResult

async function withApp(ask: Ask, run: (ctx: { port: number; logs: string[]; asked: string[]; server: Server }) => Promise<void>, extra: { requestTimeoutMs?: number; headersTimeoutMs?: number } = {}) {
  const logs: string[] = []
  const asked: string[] = []
  const server = await startServer(createApp({ ask: async (q) => (asked.push(q), ask(q)), log: (line) => logs.push(line), ...extra }), 0)
  const port = (server.address() as AddressInfo).port
  try {
    await run({ port, logs, asked, server })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function send(port: number, options: { method?: string; path?: string; headers?: Record<string, string>; body?: string; host?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: HOST, port, method: options.method ?? 'GET', path: options.path ?? '/', headers: { host: options.host ?? `127.0.0.1:${port}`, ...options.headers } },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => (body += chunk.toString()))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.end(options.body)
  })
}

const post = (port: number, payload: unknown, headers: Record<string, string> = {}, host?: string) =>
  send(port, { method: 'POST', path: '/api/chat', headers: { 'content-type': 'application/json', ...headers }, body: typeof payload === 'string' ? payload : JSON.stringify(payload), host })

test('AC7: the server listens on 127.0.0.1 only', async () => {
  await withApp(okAsk, async ({ server }) => {
    assert.equal((server.address() as AddressInfo).address, '127.0.0.1')
  })
})

test('serves the page on / and /index.html with a CSP that pins the inline script and style, and nosniff', async () => {
  await withApp(okAsk, async ({ port }) => {
    for (const path of ['/', '/index.html', '/?anything=1']) {
      const reply = await send(port, { path })
      assert.equal(reply.status, 200, path)
      assert.match(String(reply.headers['content-type']), /^text\/html/)
      assert.equal(reply.headers['x-content-type-options'], 'nosniff')
      assert.equal(reply.headers['content-security-policy'], contentSecurityPolicy(reply.body))
      assert.doesNotMatch(String(reply.headers['content-security-policy']), /unsafe-inline|unsafe-eval|\*/)
      assert.match(reply.body, /POS Support/)
    }
  })
})

test('every other URL is a 404: no file path is ever built from the request', async () => {
  await withApp(okAsk, async ({ port }) => {
    for (const path of ['/package.json', '/src/config.ts', '/../package.json', '/%2e%2e/package.json', '/index.html/', '//index.html', '/api', '/api/chat/', '/.env', '/data/index.json']) {
      const reply = await send(port, { path })
      assert.equal(reply.status, 404, path)
      assert.doesNotMatch(reply.body, /"name"|OLLAMA|pos-support-agent/)
    }
  })
})

test('wrong methods get 405', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    assert.equal((await send(port, { method: 'POST', path: '/' })).status, 405)
    assert.equal((await send(port, { method: 'GET', path: '/api/chat' })).status, 405)
    assert.equal((await send(port, { method: 'PUT', path: '/api/chat' })).status, 405)
    assert.equal((await send(port, { method: 'OPTIONS', path: '/api/chat', headers: { origin: 'https://evil.example' } })).status, 405)
    assert.deepEqual(asked, [])
  })
})

test('AC7: a foreign Host header (DNS rebinding) is refused with 403 and nothing is asked', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    for (const host of ['evil.example', 'localhost', '127.0.0.1', `127.0.0.1:${port}.evil.com`, `evil.com:${port}`, `localhost:${port + 1}`]) {
      assert.equal((await send(port, { host })).status, 403, `GET Host: ${host}`)
      assert.equal((await post(port, { question: 'q' }, {}, host)).status, 403, `POST Host: ${host}`)
    }
    assert.equal((await send(port, { host: `localhost:${port}` })).status, 200)
    assert.equal((await send(port, { host: `LOCALHOST:${port}` })).status, 200)
    assert.deepEqual(asked, [])
  })
})

test('AC7: a request with no Host header at all is refused (raw socket, since http clients always add one)', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    const rawStatus = (text: string) =>
      new Promise<string>((resolve, reject) => {
        const socket = connect(port, HOST, () => socket.write(text))
        let data = ''
        socket.on('data', (chunk: Buffer) => (data += chunk.toString()))
        socket.on('close', () => resolve(data.split('\r\n')[0]))
        socket.on('error', reject)
      })
    assert.match(await rawStatus('GET / HTTP/1.0\r\n\r\n'), / 403 /, 'HTTP/1.0 without Host reaches our check')
    assert.match(await rawStatus('GET / HTTP/1.1\r\nConnection: close\r\n\r\n'), / 400 /, 'HTTP/1.1 without Host is rejected by Node itself')
    assert.deepEqual(asked, [])
  })
})

test('AC7: a foreign Origin is refused; the server\'s own origin works', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    for (const origin of ['https://evil.example', 'http://evil.example', 'null', `http://127.0.0.1:${port + 1}`, `https://127.0.0.1:${port}`, `http://localhost:${port}.evil.com`]) {
      assert.equal((await post(port, { question: 'q' }, { origin })).status, 403, origin)
    }
    assert.deepEqual(asked, [])
    assert.equal((await post(port, { question: 'q' }, { origin: `http://127.0.0.1:${port}` })).status, 200)
    assert.equal((await post(port, { question: 'q' }, { origin: `http://localhost:${port}` })).status, 200)
    assert.equal((await post(port, { question: 'q' })).status, 200, 'no Origin header (curl, same-origin GET-less fetch) is fine')
  })
})

test('AC7: Content-Type must be application/json', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonx', 'application/json-patch', 'multipart/form-data']) {
      const reply = await send(port, { method: 'POST', path: '/api/chat', headers: { 'content-type': type }, body: '{"question":"q"}' })
      assert.equal(reply.status, 415, type)
    }
    assert.equal((await send(port, { method: 'POST', path: '/api/chat', body: '{"question":"q"}' })).status, 415, 'missing')
    assert.deepEqual(asked, [])
    assert.equal((await post(port, { question: 'q' }, { 'content-type': 'application/json; charset=utf-8' })).status, 200)
  })
})

test('AC7: no CORS headers on any response', async () => {
  await withApp(okAsk, async ({ port }) => {
    const replies = [await send(port), await post(port, { question: 'q' }), await post(port, { question: 'q' }, { origin: 'https://evil.example' }), await send(port, { path: '/nope' }), await send(port, { method: 'OPTIONS', path: '/api/chat' })]
    for (const reply of replies) {
      assert.deepEqual(Object.keys(reply.headers).filter((name) => name.startsWith('access-control-')), [])
    }
  })
})

test('the request body is validated: one string "question" field, trimmed, non-empty, within the length cap', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    const bad: unknown[] = ['not json', '[]', '"text"', 'null', {}, { question: 5 }, { question: null }, { question: 'q', extra: true }, { question: '' }, { question: '   ' }, { question: 'x'.repeat(MAX_QUESTION_CHARS + 1) }, { q: 'x' }]
    for (const payload of bad) {
      const reply = await post(port, payload)
      assert.equal(reply.status, 400, JSON.stringify(payload)?.slice(0, 50))
      assert.ok(typeof JSON.parse(reply.body).error === 'string')
    }
    assert.deepEqual(asked, [])
    assert.equal((await post(port, { question: 'x'.repeat(MAX_QUESTION_CHARS) })).status, 200)
    assert.equal((await post(port, { question: '  padded  ' })).status, 200)
    assert.equal(asked[1], 'padded', 'the question is trimmed before it is used')
  })
})

test('AC7: a body over 10 KB gets 413 (declared or streamed) and is never asked', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    const declared = await post(port, { question: 'x'.repeat(MAX_BODY_BYTES * 2) })
    assert.equal(declared.status, 413)
    assert.equal(declared.headers.connection, 'close')

    const streamed = await new Promise<number>((resolve, reject) => {
      const req = request({ host: HOST, port, method: 'POST', path: '/api/chat', headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.write('{"question":"' + 'a'.repeat(MAX_BODY_BYTES))
      req.write('b'.repeat(MAX_BODY_BYTES))
    })
    assert.equal(streamed, 413)
    assert.deepEqual(asked, [])
  })
})

test('AC7: a slow-dripped body is cut off by the request timeout', async () => {
  await withApp(okAsk, async ({ port, asked }) => {
    const outcome = await new Promise<string>((resolve) => {
      const req = request({ host: HOST, port, method: 'POST', path: '/api/chat', headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', 'content-length': '200' } }, (res) => {
        res.resume()
        resolve(`status ${res.statusCode}`)
      })
      req.on('error', () => resolve('connection closed'))
      req.write('{"question":')
      setTimeout(() => resolve('still open after 4 s'), 4000).unref()
    })
    assert.notEqual(outcome, 'still open after 4 s')
    assert.deepEqual(asked, [])
  }, { requestTimeoutMs: 400, headersTimeoutMs: 300 })
})

test('AC7: only one generation at a time; the second request gets 429 and the app recovers', async () => {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  let calls = 0
  const slowAsk: Ask = async () => {
    calls++
    if (calls === 1) await gate
    return answerResult
  }
  await withApp(slowAsk, async ({ port }) => {
    const first = post(port, { question: 'first' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const second = await post(port, { question: 'second' })
    assert.equal(second.status, 429)
    assert.ok(second.headers['retry-after'])
    release()
    assert.equal((await first).status, 200)
    assert.equal((await post(port, { question: 'third' })).status, 200)
  })
})

test('an answer and a refusal come back as JSON with only the expected fields', async () => {
  const results: ChatResult[] = [answerResult, { kind: 'refusal', text: 'No idea, contact support.' }]
  for (const result of results) {
    await withApp(async () => result, async ({ port }) => {
      const reply = await post(port, { question: 'q' })
      assert.equal(reply.status, 200)
      assert.match(String(reply.headers['content-type']), /application\/json/)
      assert.deepEqual(JSON.parse(reply.body), result)
    })
  }
})

test('errors: Ollama, model and index problems get a plain 503; anything else is a generic 500 with no internals', async () => {
  const cases: [Error, number, RegExp][] = [
    [new OllamaError('Could not reach Ollama. Start it with `ollama serve`.', 'unreachable'), 503, /ollama serve/],
    [new IndexError('The index file was not found. Run `npm run ingest` to rebuild it.'), 503, /npm run ingest/],
    [new Error('SECRET internal detail at /Users/someone/file.ts'), 500, /Something went wrong/],
  ]
  for (const [error, status, message] of cases) {
    await withApp(async () => Promise.reject(error), async ({ port }) => {
      const reply = await post(port, { question: 'q' })
      assert.equal(reply.status, status)
      assert.match(JSON.parse(reply.body).error, message)
      assert.doesNotMatch(reply.body, /SECRET|\/Users\//)
    })
  }
})

test('AC8: the question never appears in the logs, not even when the pipeline fails with it in the message', async () => {
  const marker = 'UNIQUE-MARKER-9f3a71'
  for (const ask of [okAsk, async () => Promise.reject(new Error(`failed on ${marker}`)), async () => Promise.reject(new OllamaError(`broke ${marker}`, 'http'))] as Ask[]) {
    await withApp(ask, async ({ port, logs }) => {
      await post(port, { question: `how do I refund? ${marker}` })
      await post(port, `{"question": "${marker}", "extra": 1}`)
      await post(port, `not json ${marker}`)
      assert.ok(logs.length > 0, 'something is logged')
      assert.ok(logs.every((line) => /^chat (kind|error)=\S+ ms=\d+$/.test(line)), logs.join(' | '))
      assert.ok(!logs.join('\n').includes(marker))
    })
  }
})

test('the server is configured with header and request timeouts and a small header limit', async () => {
  await withApp(okAsk, async ({ server }) => {
    assert.ok(server.headersTimeout > 0 && server.headersTimeout <= 15_000)
    assert.ok(server.requestTimeout > 0 && server.requestTimeout <= 30_000)
  })
  const source = readFileSync(new URL('./server.ts', import.meta.url), 'utf8')
  assert.match(source, /maxHeaderSize/)
})
