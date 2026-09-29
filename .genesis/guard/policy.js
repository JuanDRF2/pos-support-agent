// @ts-check
//
// Genesis Guard — decision policy (brief §4.5).
//
// Shipped verbatim into generated projects as `.genesis/guard/policy.js` and
// imported by `.genesis/guard/check.js`. It has NO dependencies beyond Node
// builtins so it runs via `node .genesis/guard/check.js` with nothing installed.
//
// The POLICY (what counts as shared / risky / destructive) is a sensible generic
// default — customize SHARED_HOST below for your own production domains. The
// MECHANISM is Genesis's own, deliberately simple — no per-repo route-profile
// system, so unknown targets default to "shared" and reads are allowed.

/**
 * @typedef {{ tool_name?: string, tool_input?: { command?: string } }} PreToolUsePayload
 * @typedef {{action:'allow', reason:string}
 *   | {action:'ask', reason:string, context:string}
 *   | {action:'block', reason:string}} Decision
 */

/** Surfaced when a command provisions/changes infrastructure — infra is a gate. */
export const INFRA_GATE_MESSAGE = [
  'This provisions or changes infrastructure — infrastructure is always a gate.',
  '',
  'Before proceeding:',
  '  1. Record the scope:  genesis infra set <initiative> <project|shared>',
  '  2. If project-scoped, a human accepts it:  genesis infra accept <initiative>',
  '  3. If it affects SHARED infrastructure (not only this project), STOP — a human',
  '     must proceed by hand and validate it with engineering first.',
  '',
  'Infra must follow AWS Well-Architected: cost, security, and architecture',
  '(see .genesis/well-architected/). Confirm only if the infra gate is satisfied.',
].join('\n')

/** The org's confirmation UX, reused verbatim (brief §4.5). */
export const CONFIRMATION_FORMAT = [
  'About to make a write against a shared environment.',
  '',
  'Command target: {service/host/route}',
  'Environment: {uat/stg/prod/shared fixture}',
  'Tenant/customer scope: {known, or "unknown"}',
  'Known side effects: {what could change}',
  'Source of the values: {where they came from; no secrets}',
  "Rollback/verification plan: {how we'd detect and undo it}",
  '',
  'Confirm this exact command?',
].join('\n')

// --- Environment classification (brief §4.5 "Shared environment") ------------

/** Local / disposable targets — safe to write against. */
const LOCAL_HOST =
  /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|[\w-]+\.local|[\w-]+\.localhost)\b/i

/** Explicit shared-environment signals. */
// TODO: replace with your own production/shared-environment domain(s) before relying on this for real protection
const SHARED_HOST = /\b([\w-]+\.)*example\.com\b/i
const SHARED_ENV_WORD = /\b(uat|staging|stg|prod|production|preprod|demo)\b/i

/** Disposable / sandbox signals that make a write safe. */
const DISPOSABLE = /\b(scratch|sandbox|disposable|ephemeral|sqlite|:memory:)\b|--dry-run/i

/**
 * @param {string} cmd
 * @returns {string[]}
 */
function extractHosts(cmd) {
  const hosts = []
  const re = /https?:\/\/([^/\s"'`)]+)/gi
  let m
  while ((m = re.exec(cmd))) hosts.push(m[1].toLowerCase())
  return hosts
}

/**
 * @param {string} cmd
 * @returns {'local'|'shared'|'unknown'}
 */
function classifyEnvironment(cmd) {
  const hosts = extractHosts(cmd)
  if (hosts.length) {
    if (hosts.every((h) => LOCAL_HOST.test(h))) return 'local'
    // Any shared or otherwise-unknown remote host → treat as shared.
    if (hosts.some((h) => SHARED_HOST.test(h) || !LOCAL_HOST.test(h))) return 'shared'
  }
  if (LOCAL_HOST.test(cmd) || DISPOSABLE.test(cmd)) return 'local'
  if (SHARED_HOST.test(cmd) || SHARED_ENV_WORD.test(cmd)) return 'shared'
  return 'unknown'
}

// --- Risky-command detection (brief §4.5 "Risky commands") -------------------

/** @param {string} cmd */
function isHttpWrite(cmd) {
  if (!/\b(curl|wget|xh|https?ie|http)\b/i.test(cmd)) return false
  if (/-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(cmd)) return true
  if (/--request\s*(POST|PUT|PATCH|DELETE)\b/i.test(cmd)) return true
  // Data-upload flags imply a write (curl defaults to POST when given data).
  if (
    /(-d\b|--data\b|--data-raw\b|--data-binary\b|-F\b|--form\b|-T\b|--upload-file\b|--post-data\b|--post-file\b)/i.test(
      cmd,
    )
  ) {
    return true
  }
  return false
}

const WRITE_SQL =
  /\b(insert\s+into|update\s+[\w."`]+\s+set|delete\s+from|alter\s+table|create\s+(table|database|schema|index)|merge\s+into|upsert|truncate\s+table|grant\b|revoke\b)/i

/** @param {string} cmd */
function isDbWrite(cmd) {
  return WRITE_SQL.test(cmd)
}

/** @param {string} cmd */
function isCloudMutation(cmd) {
  if (
    /\baws\b/i.test(cmd) &&
    /\b(s3\s+(cp|mv|rm|sync)|create-|update-|delete-|put-|start-|stop-|terminate-|deploy|invoke)\b/i.test(cmd)
  ) {
    return true
  }
  if (/\bgcloud\b/i.test(cmd) && /\b(deploy|create|delete|update|remove|set)\b/i.test(cmd)) return true
  if (/\baz\b/i.test(cmd) && /\b(create|delete|update|deploy|set)\b/i.test(cmd)) return true
  if (
    /\b(sf|sfdx)\b/i.test(cmd) &&
    /\b(deploy|push|data\s+(import|update|delete)|apex\s+run|org\s+delete)\b/i.test(cmd) &&
    !DISPOSABLE.test(cmd)
  ) {
    return true
  }
  if (/\bterraform\s+(apply|destroy)\b/i.test(cmd)) return true
  if (/\bpulumi\s+(up|destroy)\b/i.test(cmd)) return true
  if (/\bkubectl\s+(apply|delete|patch|scale|replace|rollout)\b/i.test(cmd)) return true
  if (/\bhelm\s+(install|upgrade|uninstall|rollback)\b/i.test(cmd)) return true
  if (/\b(serverless|sls)\s+deploy\b/i.test(cmd)) return true
  if (/\bdocker\s+push\b/i.test(cmd)) return true
  return false
}

/**
 * Infrastructure provisioning/teardown — always surfaced as a gate, regardless of
 * environment (the scope, and whether a human accepted it, live in the openspec
 * initiative; the guard can't see that, so it surfaces the gate).
 * @param {string} cmd
 */
function isInfraProvisioning(cmd) {
  return (
    /\bterraform\s+(apply|destroy|import)\b/i.test(cmd) ||
    /\bcdk\s+(deploy|destroy)\b/i.test(cmd) ||
    /\bpulumi\s+(up|destroy)\b/i.test(cmd) ||
    /\baws\s+cloudformation\s+(deploy|create-stack|update-stack|delete-stack|execute-change-set)\b/i.test(cmd) ||
    /\b(serverless|sls)\s+(deploy|remove)\b/i.test(cmd) ||
    /\baws\b[^|&;]*\bcreate-(bucket|db-instance|db-cluster|cluster|function|table|distribution|vpc|instance|load-balancer|user-pool|queue|topic|api|stack)\b/i.test(
      cmd,
    ) ||
    /\b(gcloud|az)\b[^|&;]*\bcreate\b/i.test(cmd)
  )
}

/** Sync/deploy/migration/release/import/bulk verbs (brief §4.5). */
function isRiskyCliVerb(cmd) {
  return /\b(migrate|migration|deploy|release|rollout|import|bulk[-\s]?update|token[-\s]?refresh|refresh[-\s]?token)\b/i.test(
    cmd,
  )
}

/** @param {string} cmd */
function isRiskyWrite(cmd) {
  return isHttpWrite(cmd) || isDbWrite(cmd) || isCloudMutation(cmd) || isRiskyCliVerb(cmd)
}

// --- Unambiguously destructive (block regardless of environment) -------------

/** @param {string} t */
function isDangerTarget(t) {
  if (!t) return true
  if (t === '*' || t === '.' || t === './' || t === '..' || t === '../') return true
  if (t.includes('..')) return true // path traversal out of the project
  if (t.startsWith('$')) return true // env-expanded, unknown root
  if (t.startsWith('~')) return true // home directory
  if (t.startsWith('/')) {
    // Absolute paths are risky, except clearly-scratch temp locations.
    if (/^\/(tmp|private\/tmp|var\/folders|private\/var\/folders)\b/i.test(t)) return false
    return true
  }
  return false // relative project path (node_modules, dist, ...) is recoverable
}

/**
 * `rm -rf` is only blocked when the target is dangerous (root, home, absolute,
 * wildcard, traversal). Project-local `rm -rf node_modules` stays allowed —
 * this reads the brief's "rm -rf → block" as "unambiguously destructive rm -rf".
 * @param {string} cmd
 */
function isDangerousRmRf(cmd) {
  const re = /\brm\b([^&|;\n]*)/gi
  let m
  while ((m = re.exec(cmd))) {
    const args = m[1]
    if (!/(-\w*r|--recursive)/i.test(args)) continue
    if (!/(-\w*f|--force)/i.test(args)) continue
    const operands = args.replace(/(?:^|\s)-{1,2}[a-zA-Z]+/g, ' ').trim()
    const tokens = operands ? operands.split(/\s+/) : []
    if (tokens.length === 0) return true
    if (tokens.some(isDangerTarget)) return true
  }
  return false
}

/** @param {string} cmd */
function isForcePushToProtected(cmd) {
  if (!/\bgit\s+push\b/i.test(cmd)) return false
  const forced =
    /(--force\b|--force-with-lease\b|(?:^|\s)-f\b)/i.test(cmd) || /\s\+[\w/-]*\b(main|master)\b/i.test(cmd)
  const toProtected = /\b(main|master)\b/i.test(cmd)
  return forced && toProtected
}

/**
 * @param {string} cmd
 * @returns {string|null} reason if destructive
 */
function destructiveReason(cmd) {
  if (isDangerousRmRf(cmd)) return 'recursive force-delete of a dangerous path (rm -rf)'
  if (/\bdrop\s+(table|database|schema)\b/i.test(cmd)) return 'DROP is irreversible'
  if (isForcePushToProtected(cmd)) return 'force-push to a protected branch rewrites shared history'
  if (/\bmkfs(\.\w+)?\b/i.test(cmd)) return 'mkfs formats a filesystem'
  if (/\bdd\b[^|&;]*\bof=\/dev\/[a-z]/i.test(cmd)) return 'dd to a device overwrites a disk'
  if (/:\s*\(\s*\)\s*\{[^}]*\|[^}]*\}\s*;/.test(cmd)) return 'fork bomb'
  if (/>\s*\/dev\/(sd|nvme|disk)/i.test(cmd)) return 'writing to a raw disk device'
  return null
}

/**
 * General-purpose scripting interpreters whose `-c`/`-e` flag takes a source-code string in a
 * DIFFERENT language than the shell — as opposed to CLIs like `psql -c "UPDATE ..."` /
 * `mysql -e "DROP ..."`, where `-c`/`-e` IS the command and must stay scannable (a DB write
 * hiding in an interpreter one-liner is still a DB write; the risk lives in the flag's
 * semantics per-binary, not the flag spelling).
 *
 * `bash`/`sh`/`zsh` deliberately do NOT belong on this list, and used to: their `-c` argument
 * IS a shell command, in the same language every other check here already scans, not foreign
 * source. Stripping it (as this used to) made `bash -c "rm -rf /"` read as clean — the
 * destructive-command block, the infra gate, and the shared-environment ask all evaporated the
 * moment the exact same command was wrapped in `bash -c`, which takes no attacker sophistication
 * to do. Left unstripped, the inner command stays exposed to every check below for free: regex
 * matching isn't quote-aware, so the existing patterns already find `rm -rf`, `DROP TABLE`, etc.
 * inside the quotes once nothing deletes them first.
 */
const SOURCE_ARG_INTERPRETER = /\b(python3?|node|deno|ruby|perl|php)\b/i

/**
 * Interpreter one-liners (`python3 -c "..."`, `node -e "..."`, etc.) embed source code in a
 * different language as a quoted string argument. Language keywords in that source — Python's
 * `import` being the recurring case — are not shell-level CLI verbs and must not be scanned as
 * one; doing so flags routine, read-only scripts (e.g. `python3 -c "import json; ..."`) as risky
 * writes. Replace each such quoted argument with a placeholder before any risk-verb/mutation scan
 * runs — scoped to known scripting interpreters only (see {@link SOURCE_ARG_INTERPRETER}), so
 * `psql -c`/`mysql -e`, shell `-c`, and similar keep their `-c`/`-e` argument scanned as the real
 * command it is. Leaves the real shell-level command (interpreter name, any real flags, pipes,
 * redirects) intact for every other check.
 * @param {string} cmd
 * @returns {string}
 */
function stripInlineInterpreterSource(cmd) {
  if (!SOURCE_ARG_INTERPRETER.test(cmd)) return cmd
  return cmd.replace(
    /\b(python3?|node|deno|ruby|perl|php)(\s+(?:\S+\s+)*?)(-c|-e)(\s+)(["'])(?:(?!\5)[\s\S])*\5/gi,
    '$1$2$3$4<inline-source-omitted>',
  )
}

/**
 * Heredoc bodies (`git commit -m "$(cat <<'EOF' ... EOF)"`, common for multi-line commit
 * messages) are free-form prose, not shell-level CLI invocation — a commit message describing a
 * fix that mentions "deploy"/"import"/"prod" as ordinary words is not a command to deploy or
 * import anything against prod. Same problem as inline interpreter source, different syntax.
 * Replace each heredoc body with a placeholder before any risk-verb, mutation or environment
 * scan runs.
 * @param {string} cmd
 * @returns {string}
 */
function stripHeredocBodies(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1\r?\n[\s\S]*?\r?\n\s*\2(?=\s|$)/g,
    (_, quote, delim) => `<<${quote}${delim}${quote}\n<heredoc-body-omitted>\n${delim}`,
  )
}

/** Placeholder tenant values must never persist against a shared env (§4.5). */
const PLACEHOLDER_TENANT =
  /\b(tenant|customer|account|org|client|company)\s*[=:]\s*["']?(test|demo|placeholder|example|dummy|sample|foo|bar|changeme)\b/i

/** @param {string} cmd @param {'local'|'shared'|'unknown'} env */
function summarizeTarget(cmd, env) {
  const host = extractHosts(cmd)[0] ?? 'unknown target'
  const kind = isHttpWrite(cmd)
    ? 'HTTP write'
    : isDbWrite(cmd)
      ? 'database write'
      : isCloudMutation(cmd)
        ? 'cloud mutation'
        : 'state-changing command'
  return `Detected: ${kind} against ${host} (${env} environment).`
}

/**
 * Autonomous mode — set by the Genesis IDE on its own embedded terminal
 * (GENESIS_AUTONOMOUS=1). When on, the guard auto-approves the writes it would otherwise
 * PAUSE to ask about (writes against shared/unknown environments, infra provisioning) so the
 * build loop never stalls on a permission prompt. The hard BLOCKS below (destructive commands,
 * placeholder tenants against shared, secrets on push) are unaffected — they fire in every mode.
 */
function autonomous() {
  return process.env.GENESIS_AUTONOMOUS === '1'
}

/**
 * True when this session has nobody who could answer an `ask`.
 *
 * `ask` is the guard's middle verdict — "a human decides this one" — and it only means
 * anything if a human is reachable. A session running with permissions bypassed has no
 * such person, and an agent that cannot be asked does not stop: it proceeds.
 *
 * Both agents' hooks carry the same `permission_mode` field. Claude sends `bypassPermissions`
 * for its bypass mode. OpenAI's own Codex hooks documentation (developers.openai.com/codex/hooks
 * and .../agent-approvals-security) describes Codex (`--ask-for-approval never` / `approval_policy
 * = "never"`) as sending `dontAsk` for the same condition — but the actual openai/codex source
 * (codex-rs/core/src/hook_runtime.rs, `hook_permission_mode()`, read directly off GitHub since
 * codex-cli isn't installed on this machine) maps `AskForApproval::Never` to `"bypassPermissions"`,
 * the same string Claude uses — `dontAsk` is declared as a valid value in the hooks JSON schema
 * (codex-rs/hooks/src/schema.rs) but, as of that reading, is never actually constructed or
 * returned anywhere in the Rust codebase. So the pre-existing `bypassPermissions` check already
 * covered Codex's `-a never` case; `dontAsk` is checked here only as defense-in-depth against
 * that mapping changing to match its own docs (and its own declared schema) in a future release
 * — cheap to keep, since it costs nothing if it never fires. Docs and code disagreeing like this
 * is itself worth knowing: trust the source over the docs when the two conflict, and re-verify
 * against the source (or a live Codex session) if this ever needs to be relied on again.
 *
 * This is NOT the same as autonomous mode. There, someone chose to let the loop run
 * unattended and the guard auto-approves on purpose. Here nobody chose anything — the
 * question simply has no route to a person, so the honest answer is no.
 * @param {PreToolUsePayload} payload
 */
function nobodyToAsk(payload) {
  return payload?.permission_mode === 'bypassPermissions' || payload?.permission_mode === 'dontAsk'
}

/**
 * `tool_input.command` as one command line. Claude sends a string; Codex may send an argv
 * array. `String(array)` joins on commas, which quietly turns a real command into something
 * the patterns below no longer recognize — the failure mode being a destructive command that
 * reads as harmless. Joined on spaces, an argv array reads as what it is.
 * @param {any} input
 */
export function commandText(input) {
  const c = input?.command
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.filter((part) => typeof part === 'string').join(' ')
  return ''
}

/**
 * Core decision. Reads only process env (autonomous flag) beyond its argument, so it stays
 * unit-testable directly; the default (flag unset) path is the original ask/allow/block policy.
 *
 * KNOWN LIMIT, not covered by anything below: this only inspects Bash. Any MCP tool a project
 * wires in (`.mcp.json`) — a database client, a deploy tool, anything with a mutating call —
 * is allowed through unconditionally, whatever it does. There is no generic way to classify an
 * arbitrary third-party tool's risk the way a shell command's text can be pattern-matched, so
 * this is a documented gap rather than an attempted (and likely unreliable) fix: if you wire a
 * mutating MCP server into a project, its calls are NOT covered by this guard.
 * @param {PreToolUsePayload} payload
 * @returns {Decision}
 */
export function decide(payload) {
  const toolName = payload?.tool_name ?? ''
  if (toolName && toolName !== 'Bash') {
    return { action: 'allow', reason: `not a Bash command (${toolName})` }
  }

  const rawCommand = commandText(payload?.tool_input)
  if (!rawCommand.trim()) return { action: 'allow', reason: 'empty command' }
  const command = stripInlineInterpreterSource(stripHeredocBodies(rawCommand))

  // 1. Unambiguously destructive → block, regardless of environment.
  const destructive = destructiveReason(command)
  if (destructive) return { action: 'block', reason: destructive }

  // 1b. Infrastructure provisioning → a gate (ask), surfaced regardless of env. In autonomous
  //     mode it auto-approves so the IDE loop isn't blocked on a prompt.
  if (isInfraProvisioning(command)) {
    if (autonomous()) {
      return { action: 'allow', reason: 'infrastructure provisioning — auto-approved (autonomous mode)' }
    }
    if (nobodyToAsk(payload)) {
      return {
        action: 'block',
        reason: 'infrastructure provisioning, and this session cannot ask a human',
        context: INFRA_GATE_MESSAGE,
      }
    }
    return { action: 'ask', reason: 'infrastructure provisioning — this is a gate', context: INFRA_GATE_MESSAGE }
  }

  // 2. Non-mutating (reads, builds, tests, ...) → allow.
  if (!isRiskyWrite(command)) {
    return { action: 'allow', reason: 'read-only or non-mutating command' }
  }

  const env = classifyEnvironment(command)

  // 3. Local / disposable writes → allow.
  if (env === 'local') {
    return { action: 'allow', reason: 'write against a local/disposable target' }
  }

  // 4. Placeholder tenant values that could persist against shared → block.
  if (PLACEHOLDER_TENANT.test(command)) {
    return {
      action: 'block',
      reason: 'placeholder tenant/customer value in a write against a shared environment',
    }
  }

  // 5. Risky write against shared/unknown → ask, with the org confirmation format. In
  //    autonomous mode it auto-approves so the IDE loop isn't blocked on a prompt.
  if (autonomous()) {
    return { action: 'allow', reason: 'write against shared/unknown — auto-approved (autonomous mode)' }
  }
  if (nobodyToAsk(payload)) {
    return {
      action: 'block',
      reason: 'write against a shared (or unknown) environment, and this session cannot ask a human',
      context: `${summarizeTarget(command, env)}\n\n${CONFIRMATION_FORMAT}`,
    }
  }
  return {
    action: 'ask',
    reason: 'write against a shared (or unknown) environment',
    context: `${summarizeTarget(command, env)}\n\n${CONFIRMATION_FORMAT}`,
  }
}

// --- Secrets / sensitive-data scan before push (security check) --------------
//
// A push is the moment secrets leave the machine, so the guard scans what a push would
// send and BLOCKS when it finds exposed credentials or sensitive files. The patterns are
// pure + unit-tested here; check.js does the git plumbing (the diff to be pushed).

/** True when the command pushes to a git remote. @param {string} cmd */
export function isGitPush(cmd) {
  return /\bgit\s+push\b/i.test(String(cmd || ''))
}

/**
 * High-signal secret patterns — [label, regex]. Deliberately conservative (well-known token
 * shapes + private-key blocks) so legitimate pushes aren't blocked by noise.
 * @type {[string, RegExp][]}
 */
const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{22,}\b/],
  ['OpenAI/Anthropic API key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Slack webhook', /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe secret key', /\b(?:sk|rk)_live_[0-9A-Za-z]{24,}\b/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/],
]

/** Values that are clearly NOT real secrets — env references, placeholders, masks. */
const NOT_A_SECRET =
  /(\$\{?[A-Za-z_]|process\.env|os\.(environ|getenv)|import\.meta\.env|<[^>]+>|\{\{|example|placeholder|change[-_ ]?me|your[-_ ]?|xxxx|\*{3,}|redacted|dummy|sample|fake|todo|none|null|undefined)/i

/** Assignment of a secret-named key to a hardcoded literal (password=, api_key: "…"). */
const SECRET_ASSIGNMENT =
  /\b(pass(?:word|wd)?|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|db[_-]?pass(?:word)?|encryption[_-]?key)\b\s*[:=]\s*["']?([^\s"'`]{6,})/i

/** A value that actually looks like an opaque credential — not a function call, dotted
 *  reference, or template expression (those are code, not a leaked secret). */
const CREDENTIAL_VALUE = /^[A-Za-z0-9_\-+/=]{6,}$/

/** Redact a matched value so a finding never echoes the full secret. @param {string} raw */
function redact(raw) {
  const s = String(raw)
  if (s.length <= 8) return `${s.slice(0, 2)}***`
  return `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`
}

/**
 * Scan text (the diff a push would send) for exposed secrets. Pure; returns findings with
 * the value REDACTED. @param {string} text @returns {{type:string, sample:string}[]}
 */
export function scanForSecrets(text) {
  const src = String(text || '')
  /** @type {{type:string, sample:string}[]} */
  const findings = []
  const seen = new Set()
  /** @param {string} type @param {string} raw */
  const add = (type, raw) => {
    const key = `${type}:${raw.slice(0, 16)}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push({ type, sample: redact(raw) })
  }
  for (const [label, re] of SECRET_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
    let m
    while ((m = g.exec(src))) add(label, m[0])
  }
  // Assignment form — line by line, skipping placeholders / env refs / code expressions.
  for (const line of src.split('\n')) {
    const m = SECRET_ASSIGNMENT.exec(line)
    if (m && CREDENTIAL_VALUE.test(m[2]) && !NOT_A_SECRET.test(m[2]) && !NOT_A_SECRET.test(line)) {
      add('hardcoded credential', m[2])
    }
  }
  return findings
}

/**
 * Given the file paths a push would send, return the ones that are sensitive by nature
 * (real secrets stores, keys, credential files). @param {string[]} paths @returns {string[]}
 */
export function sensitiveFiles(paths) {
  return (paths || []).filter((p) => {
    const base = String(p).split('/').pop() || ''
    if (/^\.env(\.|$)/i.test(base) && !/\.(example|sample|template|dist)$/i.test(base)) return true
    if (/^id_(rsa|dsa|ecdsa|ed25519)$/i.test(base)) return true
    if (/\.(pem|p12|pfx|keystore|jks)$/i.test(base)) return true
    if (/^credentials(\.json)?$/i.test(base) || /^service-account.*\.json$/i.test(base)) return true
    if (base === '.npmrc' || base === '.pypirc') return true
    return false
  })
}

/**
 * Build the block message for a push that would expose secrets or sensitive files.
 * @param {{type:string, sample:string}[]} findings @param {string[]} files
 */
export function secretsBlockMessage(findings, files) {
  const lines = ['This push would expose secrets or sensitive data.', '']
  if (findings.length) {
    lines.push('Detected secrets in the changes to be pushed:')
    for (const f of findings) lines.push(`  • ${f.type} — ${f.sample}`)
  }
  if (files && files.length) {
    if (findings.length) lines.push('')
    lines.push('Sensitive files staged to push:')
    for (const p of files) lines.push(`  • ${p}`)
  }
  lines.push(
    '',
    'Before pushing:',
    '  1. Remove the secret from the code — load it from an environment variable or a secrets manager.',
    '  2. If a file should never be tracked (e.g. .env), add it to .gitignore and untrack it.',
    '  3. If it was already committed, purge it from history AND rotate the credential — assume it is compromised.',
    '',
    'This is a security gate: secrets must never leave the machine.',
  )
  return lines.join('\n')
}
