// @ts-check
//
// Genesis Guard — PreToolUse hook entry (brief §4.5).
//
// Runs as `node .genesis/guard/check.js` with a Claude Code PreToolUse payload on
// stdin. Maps the pure decision from policy.js to the hook contract:
//   allow -> exit 0, no output (Claude Code's own permission flow decides);
//            with GENESIS_AUTONOMOUS=1, exit 0 + an explicit allow
//   ask   -> exit 0 + JSON on stdout (permissionDecision: "ask")
//   block -> exit 2 + reason on stderr
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { commandText, decide, isGitPush, scanForSecrets, sensitiveFiles, secretsBlockMessage } from './policy.js'

function readStdin() {
  try {
    return readFileSync(0, 'utf8') // fd 0 = stdin
  } catch {
    return ''
  }
}

/** Run git, returning stdout on success or null on any failure (so a missing repo/branch
 *  never crashes the hook — the secret scan then fails OPEN rather than blocking a push). */
function git(args) {
  try {
    const r = spawnSync('git', args, { encoding: 'utf8' })
    return r.status === 0 ? String(r.stdout || '') : null
  } catch {
    return null
  }
}

/** The commit range a push would send: `upstream..HEAD`, else the merge-base with the
 *  remote default branch. Null when it can't be determined. */
function pushRange() {
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  if (upstream && upstream.trim()) return `${upstream.trim()}..HEAD`
  for (const base of ['origin/main', 'origin/master', 'main', 'master']) {
    const mb = git(['merge-base', base, 'HEAD'])
    if (mb && mb.trim()) return `${mb.trim()}..HEAD`
  }
  return null
}

/** Scan what a push would send for secrets + sensitive files. Returns a block message, or
 *  null when nothing risky is found (or the diff can't be read — fail open). */
function scanPushForSecrets() {
  const range = pushRange()
  const diff = git(range ? ['diff', '--no-color', '--unified=0', range] : ['diff', '--no-color', '--unified=0', 'HEAD'])
  const names = git(range ? ['diff', '--name-only', range] : ['diff', '--name-only', 'HEAD'])
  // Only the ADDED lines (`+`, not the `+++` file header) are new content leaving the machine.
  const added = (diff || '')
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n')
  const findings = scanForSecrets(added)
  const files = sensitiveFiles((names || '').split('\n').filter(Boolean))
  return findings.length || files.length ? secretsBlockMessage(findings, files) : null
}

function main() {
  const raw = readStdin()
  /** @type {any} */
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = undefined
  }
  // A call this hook cannot read is refused, not waved through as an empty command.
  if (typeof payload !== 'object' || payload === null) {
    process.stderr.write('Genesis Guard blocked this command: the tool call could not be read, so it cannot be judged.\n')
    process.exit(2)
  }

  const decision = decide(payload)

  if (decision.action === 'block') {
    process.stderr.write(`Genesis Guard blocked this command: ${decision.reason}\n`)
    process.exit(2)
  }

  // Security gate: before a push (the moment secrets leave the machine), scan what would be
  // pushed. A positive detection BLOCKS; an unreadable git state fails open (never blocks).
  const command = commandText(payload?.tool_input)
  if (isGitPush(command)) {
    const secretBlock = scanPushForSecrets()
    if (secretBlock) {
      process.stderr.write(`Genesis Guard blocked this push — ${secretBlock}\n`)
      process.exit(2)
    }
  }

  if (decision.action === 'ask') {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: decision.reason,
          additionalContext: decision.context,
        },
      }),
    )
    process.exit(0)
  }

  // allow: the guard has no objection. It says NOTHING, so Claude Code's own permission flow decides
  // (the allow-list in settings for routine commands, a question for anything else). Emitting
  // `allow` here turned "ask unless allow-listed" into "allow unless flagged", which is the wrong
  // default for people who cannot judge a command. Only the unattended loop, where someone chose
  // to let it run without prompts, gets an explicit allow.
  if (process.env.GENESIS_AUTONOMOUS !== '1') process.exit(0)
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: decision.reason,
        // Codex rejects an `allow` that carries no `updatedInput` — it treats the decision as
        // the "rewrite the tool's input" path and marks the hook Failed without it. Echoing the
        // input back is the no-op rewrite that satisfies both agents; `command` is the normalized
        // string form, since an argv array is not the "string command field" Codex requires here.
        updatedInput: { ...(payload?.tool_input ?? {}), command },
      },
    }),
  )
  process.exit(0)
}

main()
