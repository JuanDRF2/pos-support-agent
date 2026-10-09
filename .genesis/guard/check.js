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
//
// FAILS CLOSED. A hook that crashes exits 1, which Claude Code treats as non-blocking, so anything that
// goes wrong here (a policy file that does not load, a failed self-test, an unreadable call, a git error
// while scanning a push) ends in exit 2 with a reason, never in a silent allow.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

/** @param {string} why */
function failClosed(why) {
  process.stderr.write(`Genesis Guard failed closed (${why}). Nothing was run. The guard files next to this script are broken or incomplete: restore them with \`genesis continue\` (or from a clean checkout of Genesis).\n`)
  process.exit(2)
}

// Dynamic imports, so a syntax or regex error in policy.js or hardening.js (or a file that went missing) is caught
// here and ends in exit 2, instead of crashing the process with exit 1.
let policy
let hardening
try {
  hardening = await import('./hardening.js')
  policy = await import('./policy.js')
} catch (e) {
  failClosed(`policy.js or hardening.js did not load: ${String(e && /** @type {any} */ (e).message).slice(0, 120)}`)
}
const { commandText, decide, findPush, scanForSecrets, sensitiveFiles, secretsBlockMessage } = policy
const { parsePush, pushSendsNothing } = hardening

// Startup self-test: a policy that allows an obviously destructive or credential-reading command, that cannot
// recognise a push, or that finds no secret in a textbook key is broken, not safe.
try {
  const bash = (/** @type {string} */ command) => decide({ tool_name: 'Bash', tool_input: { command } })
  if (bash('rm -rf /')?.action !== 'block') failClosed('self-test: "rm -rf /" was not blocked')
  if (bash('cat .env')?.action !== 'block') failClosed('self-test: "cat .env" was not blocked')
  if (bash('git -C . push --mirror')?.action !== 'block') failClosed('self-test: "git -C . push --mirror" was not blocked')
  if (!parsePush('git -C . push origin main')) failClosed('self-test: a push with -C was not recognised')
  if (!findPush('bash -c "git push origin main"')) failClosed('self-test: a push inside bash -c was not recognised')
  if (scanForSecrets('key=' + 'AKIA' + 'ABCDEFGHIJKLMNOP').length === 0) failClosed('self-test: the secret scan found nothing in an AWS key shape')
  if (sensitiveFiles(['.env']).length !== 1) failClosed('self-test: .env was not recognised as a sensitive file')
} catch (e) {
  failClosed(`self-test threw: ${String(e && /** @type {any} */ (e).message).slice(0, 120)}`)
}

/** The folder the call runs in: the payload's `cwd` when it is a folder that exists, else this process's own. @param {any} payload */
function callDir(payload) {
  const given = payload && typeof payload.cwd === 'string' ? payload.cwd : ''
  try {
    if (given && existsSync(given) && statSync(given).isDirectory()) return given
  } catch {
    // fall through to the process folder
  }
  return process.cwd()
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8') // fd 0 = stdin
  } catch {
    return ''
  }
}

const CANNOT_SAY =
  'Git could not say what this push would send (not a repository, an unknown branch, a history too large to read, or a git error), so it is blocked rather than waved through. Check the repository, or push by hand.'

/**
 * Run git in `dir`, never throwing. `ok` is false on a non-zero exit, a spawn error or a buffer overflow.
 * @param {string[]} args @param {string} dir
 */
function git(args, dir) {
  try {
    const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, cwd: dir || undefined })
    return { ok: !r.error && r.status === 0, out: String(r.stdout || '') }
  } catch {
    return { ok: false, out: '' }
  }
}

/** Added lines (`+`, not the `+++` header) out of `git log -p` text: the new content leaving the machine. @param {string} text */
const addedLines = (text) =>
  text
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n')

/**
 * The revisions a push names, for `git log`: each refspec's source (a `+` only forces it), the current branch when it
 * names none, every branch for `--all`, every tag for `--tags`. `tag <name>` is git's shorthand for `refs/tags/<name>`.
 * @param {NonNullable<ReturnType<typeof parsePush>>} push
 */
function pushedRevs(push) {
  const revs = []
  const specs = push.deleteFlag ? [] : push.refspecs
  for (let i = 0; i < specs.length; i++) {
    let r = specs[i].replace(/^\+/, '')
    if (r === 'tag' && specs[i + 1]) r = `refs/tags/${specs[++i].replace(/^\+/, '')}`
    const src = r.split(':')[0]
    if (!src) continue // `:branch` deletes; nothing is sent
    revs.push(src.includes('*') ? `--glob=${src}` : src)
  }
  if (push.all) revs.push('--branches')
  if (push.tags) revs.push('--tags')
  return revs.length ? revs : ['HEAD']
}

/** True for a valid repository that has no commit at all: there is nothing that could leave the machine. @param {string} dir */
function repoWithoutCommits(dir) {
  return git(['rev-parse', '--git-dir'], dir).ok && !git(['rev-parse', '--verify', '-q', 'HEAD'], dir).ok && git(['for-each-ref', '--count=1'], dir).out.trim() === ''
}

/**
 * Scan every commit in `range` (git revision arguments): all the lines they add, and the files they add or change.
 * Reading `git log -p` rather than a net diff matters: a secret committed and "removed" later is still in the pushed
 * history. A deleted file is not a file being sent (`--diff-filter=d`).
 * Returns a block message, or null when nothing risky is found. When git cannot answer, that is a block too.
 * @param {string[]} range @param {string} dir
 */
function scanRange(range, dir) {
  const patch = git(['log', '--no-color', '-p', '--unified=0', '--format=', ...range, '--'], dir)
  const names = git(['log', '--no-color', '--name-only', '--diff-filter=d', '--format=', ...range, '--'], dir)
  if (!patch.ok || !names.ok) return repoWithoutCommits(dir) ? null : CANNOT_SAY
  const findings = scanForSecrets(addedLines(patch.out))
  const files = sensitiveFiles([...new Set(names.out.split('\n').filter(Boolean))])
  return findings.length || files.length ? secretsBlockMessage(findings, files) : null
}

/**
 * Scan what a push would send for secrets and sensitive files. Returns a block message, or null when nothing risky is found.
 *  - A push that only deletes refs sends no commit: nothing to scan (its verdict, an ask, comes from policy.js).
 *  - A plain `git push` onto a known upstream sends `upstream..HEAD`: that is all that is scanned.
 *  - Anything else cannot be trusted to be that range (no upstream to compare with, a forced refspec that replaces the
 *    remote's history, explicit refspecs, `--all`, `--tags`): everything reachable from the pushed refs is scanned.
 * The repository is the one the push runs in: `git -C dir push`, or the target of a `cd`, else the call's own folder.
 * @param {NonNullable<ReturnType<typeof parsePush>>} push @param {string} baseDir
 */
function scanPushForSecrets(push, baseDir) {
  if (pushSendsNothing(push)) return null
  const dir = push.dir ? resolve(baseDir, push.dir.replace(/^~(?=\/|$)/, homedir())) : baseDir
  const plain = push.refspecs.length === 0 && !push.all && !push.tags
  if (plain && !push.force) {
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], dir)
    if (upstream.ok && upstream.out.trim()) return scanRange([`${upstream.out.trim()}..HEAD`], dir)
  }
  return scanRange(pushedRevs(push), dir)
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
  // A Bash call whose command is neither text nor an argv array (Codex) has nothing to judge: refused, not allowed.
  const rawCommand = payload?.tool_input?.command
  if (payload.tool_name === 'Bash' && typeof rawCommand !== 'string' && !Array.isArray(rawCommand)) {
    process.stderr.write('Genesis Guard blocked this command: the Bash call carries no command text, so it cannot be judged.\n')
    process.exit(2)
  }

  const decision = decide(payload)

  if (decision.action === 'block') {
    process.stderr.write(`Genesis Guard blocked this command: ${decision.reason}\n`)
    process.exit(2)
  }

  // Security gate: before a push (the moment secrets leave the machine), scan what would be
  // pushed. A positive detection BLOCKS, and so does a git state the scan cannot read.
  const command = commandText(payload?.tool_input)
  const push = findPush(command)
  if (push) {
    const secretBlock = scanPushForSecrets(push, callDir(payload))
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

try {
  main()
} catch (e) {
  failClosed(`unexpected error: ${String(e && /** @type {any} */ (e).message).slice(0, 120)}`)
}
