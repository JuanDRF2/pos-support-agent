import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')

test('AC11: the page never turns text into HTML or code', () => {
  for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'setTimeout("', "setTimeout('", 'srcdoc']) {
    assert.ok(!html.includes(forbidden), forbidden)
  }
  assert.match(html, /textContent/)
  assert.match(html, /createTextNode/)
})

test('the page is self-contained: one inline script, one inline style, no external resources or inline handlers', () => {
  assert.equal((html.match(/<script/g) ?? []).length, 1)
  assert.equal((html.match(/<style/g) ?? []).length, 1)
  assert.doesNotMatch(html, /<script[^>]*\ssrc=/)
  assert.doesNotMatch(html, /<link\b/)
  assert.doesNotMatch(html, /(?:src|href|action)\s*=\s*["']?https?:/i)
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'no inline event handlers (the CSP would block them)')
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'no inline style attributes (the CSP would block them)')
})

test('the page shows what the description promised', () => {
  assert.match(html, /<h1>POS Support<\/h1>/)
  assert.match(html, /thinking\.\.\./)
  assert.match(html, /'Source: '/)
  assert.match(html, /Could not reach the server/)
  assert.match(html, /\/api\/chat/)
})
