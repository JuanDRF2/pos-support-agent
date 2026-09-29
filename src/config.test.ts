import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfigError, loadConfig, parseOllamaUrl } from './config.js'

test('accepts the loopback Ollama URLs over http', () => {
  assert.equal(parseOllamaUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434')
  assert.equal(parseOllamaUrl('http://localhost:11434/'), 'http://localhost:11434')
  assert.equal(parseOllamaUrl('http://[::1]:11434'), 'http://[::1]:11434')
})

test('rejects bypass strings and non-local hosts', () => {
  for (const bad of [
    'http://localhost.evil.com',
    'http://127.0.0.1@evil.com',
    'http://evil.com',
    'http://127.0.0.1.evil.com:11434',
    'https://127.0.0.1:11434',
    'http://user:pw@127.0.0.1:11434',
    'ftp://localhost',
    'not a url',
    '',
  ]) {
    assert.throws(() => parseOllamaUrl(bad), ConfigError, bad)
  }
})

test('loadConfig applies defaults', () => {
  const config = loadConfig({})
  assert.equal(config.ollamaUrl, 'http://127.0.0.1:11434')
  assert.equal(config.topK, 3)
  assert.equal(config.ollamaModel, 'llama3.2:3b')
  assert.equal(config.port, 3000)
  assert.equal(config.refusalThreshold, 0.3)
})

test('loadConfig fails loudly on bad numbers and out-of-range values', () => {
  assert.throws(() => loadConfig({ REFUSAL_THRESHOLD: 'abc' }), ConfigError)
  assert.throws(() => loadConfig({ REFUSAL_THRESHOLD: '1.5' }), ConfigError)
  assert.throws(() => loadConfig({ REFUSAL_THRESHOLD: '' }), ConfigError)
  assert.throws(() => loadConfig({ TOP_K: '0' }), ConfigError)
  assert.throws(() => loadConfig({ TOP_K: '1000' }), ConfigError)
  assert.throws(() => loadConfig({ TOP_K: '2.5' }), ConfigError)
  for (const port of ['80', '70000', 'abc', '3000.5', '']) assert.throws(() => loadConfig({ PORT: port }), ConfigError, port)
  assert.equal(loadConfig({ PORT: '4321' }).port, 4321)
  assert.throws(() => loadConfig({ OLLAMA_URL: 'http://localhost.evil.com' }), ConfigError)
})
