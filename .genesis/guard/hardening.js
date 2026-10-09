// @ts-check
//
// Genesis Guard — hardening checks.
//
// Ported from the workspace guard (`.claude/hooks/guard/hardening.js`, itself ported in spirit from the fixes Genesis
// made after its 2026-10-03 security audit) so there is ONE engine. Pure functions used by policy.js and check.js:
// shell-aware parsing of `git push`, refusing to read credential files, flagging commands whose first word is a
// variable, and protecting the guard's own files by prefix. Like the rest of this guard it is best effort: it stops
// accidents and obvious bypasses, it is NOT a boundary against an agent with a shell. No dependencies beyond Node
// builtins, so it ships verbatim into generated projects next to policy.js.
//
// Differences from the workspace copy: GUARD_PREFIXES also lists Genesis's own layout, and `pushSendsNothing` is new
// (a delete-only push sends no commits). Everything else is the same API and the same behaviour.

/** Split a command into shell segments (on ; & | newline, outside quotes), plus `$(...)` / backtick bodies. */
export function splitSegments(cmd) {
  const text = String(cmd || '')
  /** @type {string[]} */
  const out = []
  let cur = ''
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      cur += ch
      if (ch === '\\' && quote === '"') cur += text[++i] ?? ''
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '\\') {
      cur += ch + (text[++i] ?? '')
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      cur += ch
      continue
    }
    // `2>&1`, `>&2` and `&>file` are redirects, not command separators.
    if (ch === '&' && (text[i - 1] === '>' || text[i + 1] === '>')) {
      cur += ch
      continue
    }
    if (ch === ';' || ch === '&' || ch === '|' || ch === '\n') {
      if (cur.trim()) out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  const subs = []
  for (const m of text.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) subs.push(m[1] ?? m[2] ?? '')
  for (const s of subs) if (s.trim()) out.push(...splitSegments(s))
  return out
}

/** Split a segment into words and remove quotes, so `r""m` and `"git" "push"` read as `rm` and `git push`. */
export function tokenize(segment) {
  /** @type {string[]} */
  const tokens = []
  let cur = ''
  let quote = ''
  let started = false
  const s = String(segment || '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      if (ch === quote) quote = ''
      else if (ch === '\\' && quote === '"' && i + 1 < s.length) cur += s[++i]
      else cur += ch
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      started = true
      continue
    }
    if (ch === '\\' && i + 1 < s.length) {
      cur += s[++i]
      started = true
      continue
    }
    if (/\s/.test(ch)) {
      if (started || cur) tokens.push(cur)
      cur = ''
      started = false
      continue
    }
    cur += ch
    started = true
  }
  if (started || cur) tokens.push(cur)
  return tokens
}

const WRAPPERS = new Set(['command', 'builtin', 'env', 'sudo', 'time', 'nohup', 'exec', 'nice', 'xargs'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/** Drop leading `VAR=x` words and wrapper commands, returning the real program and its arguments. */
export function programAndArgs(tokens) {
  let i = 0
  while (i < tokens.length && (ASSIGNMENT.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++
  return { program: tokens[i] ?? '', args: tokens.slice(i + 1) }
}

const baseName = (/** @type {string} */ p) => String(p).split('/').pop() || ''

// --- git ----------------------------------------------------------------------------------------

const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix'])
const PUSH_OPTS_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])

/** The git subcommand and its arguments, skipping global options (`-C dir`, `-c k=v`, `--no-pager`). @param {string[]} args */
function gitSub(args) {
  let i = 0
  let dir = ''
  while (i < args.length && args[i].startsWith('-')) {
    if (args[i] === '-C' && args[i + 1]) dir = args[i + 1]
    i += GIT_OPTS_WITH_VALUE.has(args[i]) ? 2 : 1
  }
  return { sub: args[i] ?? '', rest: args.slice(i + 1), dir }
}

/**
 * Parse every `git push` in a command, whatever sits between `git` and `push`
 * (`git -C dir push`, `git -c k=v push`, `git "push"`, `FOO=1 git push`).
 * `dir` is the repository the push runs in: the `-C` directory, else the target of a `cd` earlier in the command.
 * @returns {null | {force:boolean, forceFlag:boolean, mirror:boolean, deleteFlag:boolean, all:boolean, tags:boolean, remote:string, refspecs:string[], dir:string}}
 */
export function parsePush(cmd) {
  let found = null
  let cdTarget = ''
  for (const segment of splitSegments(cmd)) {
    const { program, args } = programAndArgs(tokenize(segment))
    if (program === 'cd') cdTarget = args[0] ?? ''
    if (baseName(program) !== 'git') continue
    const { sub, rest, dir } = gitSub(args)
    if (sub !== 'push') continue
    const push = { dir: dir || cdTarget, force: false, forceFlag: false, mirror: false, deleteFlag: false, all: false, tags: false, remote: '', refspecs: /** @type {string[]} */ ([]) }
    const positional = []
    for (let j = 0; j < rest.length; j++) {
      const a = rest[j]
      if (/^(\d*>>?|&>>?|\d*<)$/.test(a)) {
        j++ // a bare redirect operator (`> file`): its target is not an argument either
        continue
      }
      if (/^(\d*[<>]|&>)/.test(a)) continue // a redirect such as 2>&1 or >/dev/null is not an argument
      if (PUSH_OPTS_WITH_VALUE.has(a)) {
        j++
        continue
      }
      if (a === '--') continue
      if (a.startsWith('--')) {
        if (a === '--force' || a.startsWith('--force-with-lease') || a === '--force-if-includes') push.forceFlag = true
        else if (a === '--mirror') push.mirror = true
        else if (a === '--delete') push.deleteFlag = true
        else if (a === '--all' || a === '--branches') push.all = true
        else if (a === '--tags') push.tags = true
        continue
      }
      if (a.startsWith('-') && a.length > 1) {
        if (/^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)) push.forceFlag = true
        if (/^-[a-zA-Z]*d[a-zA-Z]*$/.test(a)) push.deleteFlag = true
        continue
      }
      positional.push(a)
    }
    push.remote = positional[0] ?? ''
    push.refspecs = positional.slice(1)
    push.force = push.forceFlag || push.refspecs.some((r) => r.startsWith('+'))
    if (!found) found = push
    else {
      found.dir ||= push.dir
      found.force ||= push.force
      found.forceFlag ||= push.forceFlag
      found.mirror ||= push.mirror
      found.deleteFlag ||= push.deleteFlag
      found.all ||= push.all
      found.tags ||= push.tags
      found.refspecs.push(...push.refspecs)
    }
  }
  return found
}

const PROTECTED_BRANCH = /^(?:refs\/heads\/)?(main|master)$/

/** The branch a refspec writes to: `+a:b` -> b, `:b` -> b, `b` -> b. */
function refspecTarget(r) {
  const s = r.replace(/^\+/, '')
  const parts = s.split(':')
  return parts.length > 1 ? parts[1] : parts[0]
}

/**
 * Verdict for a parsed push: block (never allowed), ask (a person must confirm) or null.
 * @param {ReturnType<typeof parsePush>} push
 * @returns {{action:'block'|'ask', reason:string} | null}
 */
export function pushVerdict(push) {
  if (!push) return null
  if (push.mirror) return { action: 'block', reason: 'git push --mirror overwrites and deletes remote refs' }
  const targets = push.refspecs.map(refspecTarget)
  const toProtected = targets.some((t) => PROTECTED_BRANCH.test(t))
  const deletes = push.deleteFlag || push.refspecs.some((r) => r.startsWith(':'))
  if (deletes && toProtected) return { action: 'block', reason: 'deleting a protected branch (main/master) on the remote' }
  if (push.force && toProtected) return { action: 'block', reason: 'force-push to a protected branch rewrites shared history' }
  if (deletes) return { action: 'ask', reason: 'deleting a remote branch or tag' }
  if (push.force) return { action: 'ask', reason: 'force-push rewrites history on the remote' }
  return null
}

/**
 * What a push would send, as git arguments: every commit reachable from the pushed tips and not yet on any
 * remote. With no remote at all this is the whole history, so an unknown range can no longer fail open.
 * @param {NonNullable<ReturnType<typeof parsePush>>} push
 * @returns {string[]} the tips plus `--not --remotes`
 */
export function pushRevisionArgs(push) {
  const tips = []
  if (push.all) tips.push('--branches')
  if (push.tags) tips.push('--tags')
  for (const r of push.deleteFlag ? [] : push.refspecs) {
    const src = r.replace(/^\+/, '').split(':')[0]
    if (src) tips.push(src)
  }
  if (tips.length === 0) tips.push('HEAD')
  return [...tips, '--not', '--remotes']
}

/**
 * True when the push only deletes refs (`--delete b`, `:b`): no commit is sent, so there is nothing to scan for secrets.
 * `--all`, `--tags` and `--mirror` always send something, and so does any refspec that has a source.
 * (Genesis addition: the workspace copy scans `HEAD --not --remotes` for these.)
 * @param {NonNullable<ReturnType<typeof parsePush>>} push
 */
export function pushSendsNothing(push) {
  if (push.all || push.tags || push.mirror) return false
  if (push.deleteFlag) return push.refspecs.length > 0
  return push.refspecs.length > 0 && push.refspecs.every((r) => r.startsWith(':'))
}

// --- reading credential files -----------------------------------------------------------------

const SENSITIVE_NAMES = [
  '.env', '.env.local', '.env.development', '.env.production', '.env.staging', '.env.test',
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'credentials', 'credentials.json',
  '.npmrc', '.pypirc', '.netrc', '.git-credentials', 'signing-key.blob', 'seal.key',
]
const SENSITIVE_EXT = /\.(pem|p12|pfx|jks|keystore)$/i
const SAFE_SUFFIX = /\.(example|sample|template|dist)$/i

/** @param {string} token */
function isSensitiveToken(token) {
  const base = baseName(token)
  if (!base) return false
  if (SAFE_SUFFIX.test(base)) return false
  if (SENSITIVE_EXT.test(base)) return true
  if (/(^|\/)\.ssh\//.test(token) && !/\.pub$/.test(base) && !/^(known_hosts|config)$/.test(base)) return true
  if (SENSITIVE_NAMES.includes(base)) return true
  // A glob only counts when it starts with a literal character, as `.e*` or `id_*` do. A bare `*` never
  // matches dotfiles in a shell, and flagging it would block every `grep ... */references/*`.
  if (/[*?[]/.test(base) && /^[A-Za-z0-9._-]{2,}/.test(base)) {
    const re = new RegExp(`^${base.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
    return SENSITIVE_NAMES.some((n) => re.test(n))
  }
  return false
}

const READERS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'tac', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed',
  'cut', 'sort', 'uniq', 'xxd', 'od', 'hexdump', 'strings', 'base64', 'openssl', 'cp', 'tar', 'zip', 'scp',
  'rsync', 'source', '.', 'diff', 'comm', 'paste', 'wc', 'file', 'jq', 'yq',
])

/** Programs whose first plain argument is a pattern or script, not a file. */
const PATTERN_FIRST = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed'])

/**
 * True when a command would read a file that holds credentials (.env, private keys, ~/.ssh, the Keychain).
 * Globs and quoting tricks are expanded (`cat .e*`, `cat ".en""v"`); a path built any other way is not caught.
 * @param {string} cmd
 */
export function readsSecretFile(cmd) {
  for (const segment of splitSegments(cmd)) {
    const { program, args } = programAndArgs(tokenize(segment))
    const prog = baseName(program)
    if (prog === 'security' && /\b(find-generic-password|find-internet-password)\b/.test(segment) && args.some((a) => /^-[a-zA-Z]*w/.test(a))) return true
    if (prog === 'security' && args.includes('dump-keychain')) return true
    let operands = args
    if (prog === 'git') {
      const { sub, rest } = gitSub(args)
      if (!['show', 'cat-file', 'blame', 'diff', 'grep', 'log'].includes(sub)) continue
      operands = rest.flatMap((a) => (a.includes(':') ? [a, a.split(':').pop() ?? a] : [a]))
    } else if (!READERS.has(prog)) {
      continue
    }
    let plain = operands.filter((a) => !a.startsWith('-'))
    if (PATTERN_FIRST.has(prog)) plain = plain.slice(1)
    if (plain.some(isSensitiveToken)) return true
  }
  return false
}

/**
 * Inline interpreter source (`python -c`, a heredoc into python/node) that names a credential file as a
 * quoted path. Prose that merely mentions ".env" is not flagged. @param {string} cmd
 */
export function inlineSourceTouchesSecret(cmd) {
  const text = String(cmd || '')
  if (!/\b(python3?|node|deno|ruby|perl|php)\b[^\n|&;]*(\s-[ce]\s|<<)/i.test(text)) return false
  return (
    /['"][^'"\s]*\.env(\.(local|development|production|staging|test))?['"]/.test(text) ||
    /['"][^'"\s]*\bid_(rsa|dsa|ecdsa|ed25519)['"]/.test(text) ||
    /signing-key\.blob|seal\.key|['"][^'"\s]*\/\.ssh\/(?!known_hosts|config)[^'"\s]+['"]/.test(text)
  )
}

// --- commands that hide what they run, or delete in bulk ---------------------------------------------

/**
 * Reason to ask when the real command is hidden behind a variable or substitution
 * (`$CMD x`, `"$(which rm)" -rf`, `eval "$X"`, `bash -c "$X"`), or when `find` deletes in bulk.
 * @param {string} cmd
 * @returns {string|null}
 */
export function hiddenOrBulkReason(cmd) {
  for (const segment of splitSegments(cmd)) {
    const { program, args } = programAndArgs(tokenize(segment))
    if (!program) continue
    if (/^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(program) || program.startsWith('$(') || program.startsWith('`')) {
      return 'the command name is a variable or a substitution, so the guard cannot see what runs'
    }
    const prog = baseName(program)
    if (prog === 'eval') return 'eval runs text the guard cannot read'
    if (['bash', 'sh', 'zsh'].includes(prog)) {
      const c = args.indexOf('-c')
      if (c >= 0 && /^\$/.test(args[c + 1] ?? '')) return 'a shell -c whose script is a variable'
    }
    if (prog === 'find') {
      if (args.includes('-delete')) return 'find -delete removes files in bulk'
      const e = args.findIndex((a) => a === '-exec' || a === '-execdir' || a === '-ok')
      if (e >= 0 && ['rm', 'rmdir', 'unlink', 'shred'].includes(baseName(args[e + 1] ?? ''))) return 'find -exec rm removes files in bulk'
    }
  }
  return null
}

// --- the guard's own files ------------------------------------------------------------------------

/**
 * What enforces the rules: the guard folder, the loop-contract gate and its test, the settings that wire the hooks
 * (project and global, `settings.json` and `settings.local.json`) and the MCP wiring. Other files in
 * `.claude/hooks/` (for example a session greeting) stay editable on purpose: they report, they do not enforce.
 * Both layouts are listed: the workspace's (`.claude/hooks/...`) and Genesis's own (`.genesis/...`). The Genesis gate
 * hook protects its layout structurally too; the two layers stack.
 */
export const GUARD_PREFIXES = [
  '.claude/hooks/guard',
  '.claude/hooks/check-loop-contract',
  '.claude/hooks/test-loop-contract',
  '.claude/settings',
  '.mcp.json',
  '.genesis/guard',
  '.genesis/hooks',
  '.genesis/seals',
]

/** @param {string} text */
export function mentionsGuardPath(text) {
  const t = String(text || '').replace(/\\/g, '/').toLowerCase()
  if (GUARD_PREFIXES.some((p) => t.includes(p))) return true
  // The hooks folder itself (`rm -rf .claude/hooks`, `mv .claude/hooks/ x`)
  return /\.claude\/hooks\/?(?=[\s"')]|$)/.test(t)
}

/** Commands that change what is on disk, beyond plain redirects: permissions, links, VCS rewrites, patches. */
export const EXTRA_MUTATION_SIGNAL = /\b(chmod|chown|chflags|ln|dd|install|rsync|patch|ed|ex|truncate|shred)\b|\bgit\s+(checkout|restore|reset|stash|clean|apply|am|cherry-pick|revert|rebase|merge|pull)\b|\b(perl|ruby)\b[^|&;\n]*\s-[a-z]*i\b/i

/**
 * Inline interpreter source (`-c`, `-e`, heredoc) can write anywhere, so when the command names a guard
 * path or runs from inside one, it is treated as a tamper attempt. Running a script FILE
 * (`node .claude/hooks/guard/test-policy.mjs`) is fine.
 * @param {string} rawCommand @param {string} cwd
 */
export function inlineInterpreterTouchesGuard(rawCommand, cwd) {
  const text = String(rawCommand || '')
  const inline = /\b(python3?|node|deno|ruby|perl|php)\b[^\n|&;]*(\s-[ce]\s|<<)/i.test(text) || (/\bawk\b/i.test(text) && /(>|system\()/.test(text))
  if (!inline) return false
  return mentionsGuardPath(text) || mentionsGuardPath(cwd)
}
