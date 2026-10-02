// @ts-check
//
// Gate hook (brief §4.5, generalized). Runs as
// `node .genesis/hooks/check-loop-contract.js` on every file-writing tool call and
// decides allow (exit 0) or block (exit 2). Three jobs:
//
//   1. The agent may NEVER edit an initiative's openspec/.../state.yaml — the
//      gates are human-signed via `genesis gate approve` / `genesis infra accept`,
//      so the agent can't rubber-stamp its own plan.
//   2. No code write until the plan is signed off:
//      - If there are active initiatives (openspec/changes/*), require one with
//        BOTH gates approved and its infra gate satisfied; SHARED-infra
//        initiatives hard-block (a human must proceed by hand).
//      - If there are none: new projects run the initiative flow, so block with a
//        pointer to `genesis change new`. Legacy projects — an existing project-level
//        planning/loop-contract.md — keep the original flow (blocked until it's
//        `Status: Ready`), for backward compatibility.
//   3. The guard/gate mechanism's own files may never be edited, replaced, or
//      deleted by the agent — a write to .genesis/guard/, .genesis/hooks/,
//      .claude/settings.json, or .codex/hooks.json|config.toml disables
//      enforcement for every future call, silently, which is a stronger claim
//      than "this is just another code write" and is blocked outright rather
//      than folded into the gate above (a project with no active initiative, or
//      one long since approved, would otherwise wave it straight through).
//
// Writes to planning/, .genesis/, and openspec/ (except state.yaml, and except the
// guard's own files under .genesis/guard|hooks/, see job 3) are always allowed so
// the plan can be created and reviewed before it's approved.
//
// Two agents reach this hook with different payloads. Claude Code sends one file per
// call (`tool_input.file_path`, matcher `Write|Edit`). Codex sends an `apply_patch`
// envelope in `tool_input.command` that can touch MANY files at once. Everything below
// works on the SET of paths a call writes, so one patch cannot slip a src/ change in
// beside a legitimate planning edit.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, relative, isAbsolute, join, basename } from 'node:path'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/** Files derived from the ledger by `genesis how-it-works` — never hand-edited. */
const GENERATED_DOCS = ['docs/HOW-IT-WORKS.md', 'docs/.how-it-works.cache.json', 'docs/cards-draft/.cache.json', 'docs/MANUAL.md', 'docs/.manual.cache.json']

/**
 * True when `filePath` is inside `dir` (or is `dir` itself).
 * @param {string} cwd
 * @param {string} dir
 * @param {string} filePath
 */
function underDir(cwd, dir, filePath) {
  if (!filePath) return false
  const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
  const rel = relative(resolve(cwd, dir), abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Tools whose whole job is writing files. If one of these arrives and we cannot work
 * out which paths it touches, we block: an unreadable write is not a safe write, and
 * this hook is the only thing standing between an unsigned plan and code on disk.
 */
const FILE_WRITE_TOOLS = new Set([
  'write',
  'edit',
  'multiedit',
  'notebookedit',
  'apply_patch',
  'applypatch',
])

/**
 * `tool_input.command` flattened to one string. Claude leaves it unset; Codex sends the
 * shell line for Bash and, for `apply_patch`, either the raw patch or the argv array
 * `["apply_patch", "<patch>"]`.
 * @param {any} input
 */
function commandText(input) {
  const c = input?.command
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.filter((part) => typeof part === 'string').join('\n')
  return ''
}

/**
 * Every path an apply_patch envelope writes to. `Move to:` counts: it names a
 * DESTINATION, and renaming planning/notes.md onto src/app.ts is still a code write.
 * @param {string} text
 */
function patchPaths(text) {
  const out = []
  if (!text.includes('*** Begin Patch')) return out
  const re = /^\*\*\*\s+(?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/gm
  let m
  while ((m = re.exec(text)) !== null) out.push(m[1])
  return out
}

/**
 * Split a command line into tokens, with redirection operators as tokens of their own and
 * quoted runs kept intact. Crude on purpose: this is not a shell, it only needs to see where
 * a write is aimed.
 * @param {string} cmd
 */
function shellTokens(cmd) {
  const out = []
  let buf = ''
  let quote = null
  const flush = () => {
    if (buf) out.push(buf)
    buf = ''
  }
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (quote) {
      buf += c
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      buf += c
      continue
    }
    if (c === '\\') {
      buf += c + (cmd[i + 1] ?? '')
      i++
      continue
    }
    if (/\s/.test(c)) {
      flush()
      continue
    }
    if ('><|;&'.includes(c)) {
      // A leading file descriptor belongs to the operator, not to the previous word.
      if (c === '>' && /^\d+$/.test(buf)) buf = ''
      flush()
      let op = c
      while (i + 1 < cmd.length && '>|&'.includes(cmd[i + 1]) && op.length < 3) op += cmd[++i]
      out.push(op)
      continue
    }
    buf += c
  }
  flush()
  return out
}

/** The operators that aim output at a FILE. `>&` is a descriptor duplicate (`2>&1`), not a write. */
const REDIRECTS_TO_FILE = new Set(['>', '>>', '>|', '&>', '&>>'])

/** @param {string} t */
function unquote(t) {
  const q = t[0]
  return (q === '"' || q === "'") && t.endsWith(q) && t.length > 1 ? t.slice(1, -1) : t
}

/**
 * Where a shell command would write. A `cat > src/app.ts` lands in the repo exactly as hard
 * as an apply_patch does, and it never reaches Write/Edit/apply_patch — so without this the
 * gate is optional for anyone who knows shell.
 *
 * This does NOT try to cover the shell's grammar. It recognizes the handful of ways an agent
 * actually puts bytes in a file, and reports `unresolved` for a write whose target it cannot
 * read (`> "$OUT"`), which the caller treats as a block: a write we cannot see is not a write
 * we can wave through. `mv`/`cp` are here because the bypass is otherwise trivial — write into
 * planning/ where it is allowed, then move it onto src/.
 * @param {string} command
 * @returns {{paths: string[], unresolved: boolean}}
 */
function shellWritePaths(command) {
  const tokens = shellTokens(command)
  /** @type {string[]} */
  const paths = []
  let unresolved = false
  /** @param {string|undefined} t */
  const take = (t) => {
    const p = t === undefined ? '' : unquote(t)
    // A substitution or a glob names a target only the shell knows. Say so rather than guess.
    if (!p || /[$`*?]/.test(p)) unresolved = true
    else paths.push(p)
  }
  /** @param {string} t */
  const isOperator = (t) => /^[><|;&]+$/.test(t)
  /** Arguments of the command starting at `i`, up to the next operator. @param {number} i */
  const argsFrom = (i) => {
    const args = []
    for (let j = i + 1; j < tokens.length && !isOperator(tokens[j]); j++) args.push(tokens[j])
    return args
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (REDIRECTS_TO_FILE.has(t)) {
      take(tokens[i + 1])
      continue
    }
    if (isOperator(t)) continue
    switch (unquote(t)) {
      case 'tee': {
        // Every non-flag argument is a file tee writes to.
        for (const a of argsFrom(i)) if (!a.startsWith('-')) take(a)
        break
      }
      case 'cp':
      case 'mv':
      case 'install': {
        // The destination is the last non-flag argument.
        const args = argsFrom(i).filter((a) => !a.startsWith('-'))
        if (args.length >= 2) take(args[args.length - 1])
        break
      }
      case 'dd': {
        for (const a of argsFrom(i)) if (a.startsWith('of=')) take(a.slice(3))
        break
      }
      case 'sed': {
        // In-place edit: every non-flag argument after the script is a file it rewrites.
        const args = argsFrom(i)
        if (!args.some((a) => a === '-i' || a.startsWith('-i'))) break
        const positional = args.filter((a) => !a.startsWith('-'))
        for (const a of positional.slice(1)) take(a)
        break
      }
      default:
        break
    }
  }
  return { paths, unresolved }
}

/**
 * The guard/gate mechanism's own files — the hook scripts and the config that wires them
 * into the agent. Not the same set as openspec's self-protection (that guards the PLAN's
 * record; this guards the mechanism enforcing it) and deliberately not all of `.genesis/`
 * (the ledger, config, and well-architected docs under it stay ordinary always-writable
 * planning artifacts — only the two directories that ARE the guard/gate are singled out).
 */
const GUARD_DIRS = ['.genesis/guard', '.genesis/hooks']
const GUARD_FILES = ['.claude/settings.json', '.codex/hooks.json', '.codex/config.toml']

/** @param {string} cwd @param {string} filePath */
function isGuardPath(cwd, filePath) {
  if (GUARD_DIRS.some((d) => underDir(cwd, d, filePath))) return true
  const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
  return GUARD_FILES.some((f) => abs === resolve(cwd, f))
}

/**
 * `rm`/`unlink` targets in a shell command. Used ONLY to catch deletion of the guard's own
 * files (see {@link isGuardPath}) — a write-path scan alone misses `rm`, since removing a
 * file is not writing one, but it disables the guard just as completely as overwriting it
 * would. Deliberately not fed into the general write-detection path above: making `rm`
 * count as "a code write" everywhere would be a much bigger behavior change than this hook
 * is asked to make, for files this narrow list doesn't need it to cover.
 * @param {string} command
 * @returns {string[]}
 */
function shellDeleteTargets(command) {
  const tokens = shellTokens(command)
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    if (unquote(tokens[i]) !== 'rm' && unquote(tokens[i]) !== 'unlink') continue
    for (let j = i + 1; j < tokens.length && !/^[><|;&]+$/.test(tokens[j]); j++) {
      const a = unquote(tokens[j])
      if (!a.startsWith('-')) out.push(a)
    }
  }
  return out
}

/**
 * Every path this tool call would write: one for Claude's Write/Edit, possibly many for
 * a Codex apply_patch. Empty when the call names no files we can read — main() decides
 * what that means, because the answer differs by tool.
 * @param {any} input
 */
function writtenPaths(input) {
  const out = []
  const fp = input?.file_path
  if (typeof fp === 'string' && fp) out.push(fp)
  out.push(...patchPaths(commandText(input)))
  return out
}

/**
 * Pull the gate/infra fields out of a state.yaml body. Key names are unique
 * across the file, so a flat per-key match is safe despite the nesting.
 * @param {string} text
 */
function parseState(text) {
  /** @param {string} k */
  const f = (k) => {
    const m = text.match(new RegExp(`^\\s*${k}:\\s*(\\S+)`, 'm'))
    return m ? m[1] : ''
  }
  return {
    proposal: f('proposal'),
    implementation: f('implementation'),
    // `design` is the gate (inside `gates:`); `need` lives in the `designSource:`
    // block. Both are absent on state.yaml files written before the design gate
    // existed, those default to "no UI", so nothing about them changes.
    design: f('design') || 'n/a',
    need: f('need') || 'none',
    scope: f('scope') || 'none',
    gate: f('gate') || 'n/a',
  }
}

/** @param {string} cwd */
function activeInitiatives(cwd) {
  const dir = resolve(cwd, 'openspec', 'changes')
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (name === 'archive') continue
    const sp = join(dir, name, 'state.yaml')
    if (existsSync(sp)) out.push({ id: name, ...parseState(readFileSync(sp, 'utf8')) })
  }
  return out
}

/** @typedef {{id?:string, proposal:string, implementation:string, design:string, need:string, scope:string, gate:string}} InitiativeState */

/** @param {string} path */
function readJson(path) {
  try {
    const v = JSON.parse(readFileSync(path, 'utf8'))
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

/**
 * Is the design gate switched on here? Same layering the CLI uses: the project's
 * `.genesis/config.json` overrides `~/.genesis/config.json`, and with nothing
 * said it follows whether a design system is named.
 *
 * Duplicated here on purpose: this hook is copied into projects and runs standalone,
 * with no imports outside node builtins.
 * @param {string} cwd
 */
function designGateOn(cwd) {
  const global = readJson(join(homedir(), '.genesis', 'config.json')) ?? {}
  const project = readJson(join(cwd, '.genesis', 'config.json')) ?? {}
  const system = { ...(global.designSystem ?? {}), ...(project.designSystem ?? {}) }
  // Both fields, not one falling back to the other: `repo: ""` alongside a url is a
  // real config (the IDE writes it), and `??` would have stopped at the empty string.
  // Same rule as `namesDesignSystem`; tests/duplication-parity.test.ts holds them to it.
  const named = String(system.repo ?? '').trim() !== '' || String(system.url ?? '').trim() !== ''
  const systemOn = named && system.enabled !== false
  const explicit = project.design?.enabled ?? global.design?.enabled
  return typeof explicit === 'boolean' ? explicit : systemOn
}

/**
 * An initiative with UI must have its DESIGN signed too: the person cannot
 * approve an implementation whose screens they never saw. Initiatives with no UI
 * (`need: none`, the default) are unaffected.
 *
 * With design switched off, the gate is not enforced: nothing will ever produce a
 * design (the skill stops at `mode: off`), so blocking on it would be a wall with
 * no door. The ledger says so too (`design: off`, written by the CLI and the IDE),
 * and either source alone is enough: the config for a file not yet synced, the file
 * for a hook that somehow reads a different config.
 * @param {InitiativeState} s
 * @param {boolean} gateOn
 */
function designSigned(s, gateOn) {
  // `waived` is settled too, and deliberately not the same thing as approved: it means a
  // human wrote down that nobody could produce screens here and took that on the record.
  // The distinction survives into the archive, which is where it matters — "we approved a
  // UI" and "nobody looked at this UI" must not read alike six months from now.
  return (
    !gateOn ||
    s.need !== 'ui' ||
    s.design === 'approved' ||
    s.design === 'off' ||
    s.design === 'waived'
  )
}

/**
 * @param {InitiativeState} s
 * @param {boolean} gateOn
 */
function approved(s, gateOn) {
  return (
    s.proposal === 'approved' &&
    s.implementation === 'approved' &&
    designSigned(s, gateOn) &&
    (s.scope !== 'project' || s.gate === 'accepted')
  )
}

/**
 * Is Genesis in charge here? The plugin form of this hook would be trusted once per
 * machine and then handed EVERY project the person opens, including repos Genesis has
 * never touched — where "no code writes until an initiative is approved" is not a
 * guardrail, it is a wall across someone else's work. `.genesis/` is the same marker
 * the CLI uses to recognize one of its own projects; `openspec/` covers a ledger whose
 * machinery was moved. Not load-bearing while this hook only ships per-project — cheap
 * insurance for if that ever changes.
 * @param {string} cwd
 */
function isGenesisProject(cwd) {
  return existsSync(resolve(cwd, '.genesis')) || existsSync(resolve(cwd, 'openspec'))
}

/** @param {string} msg */
function block(msg) {
  process.stderr.write('Genesis Guard: ' + msg + '\n')
  process.exit(2)
}

function main() {
  const raw = readStdin()
  /** @type {any} */
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = {}
  }

  const cwd = payload?.cwd || process.cwd()

  if (!isGenesisProject(cwd)) process.exit(0)

  const input = payload?.tool_input ?? {}
  const paths = writtenPaths(input)

  // 0a. A shell command puts bytes in a file without ever reaching Write/Edit/apply_patch,
  //     so `cat > src/app.ts` would otherwise make this gate optional for anyone who knows
  //     shell. Only targets landing INSIDE this project are its business: `> /dev/null` or a
  //     scratch file under /tmp is not code entering the repo, and what is dangerous about
  //     those is the guard's job, not the gate's.
  const text = commandText(input)
  if (!text.includes('*** Begin Patch')) {
    const shell = shellWritePaths(text)
    if (shell.unresolved) {
      block(
        'this command writes to a target that cannot be read here (a variable or a glob),\n' +
          'so whether it writes code cannot be decided. Blocking rather than guessing —\n' +
          'write the file with a literal path, or through a normal file edit.',
      )
    }
    for (const p of shell.paths) if (underDir(cwd, '.', p)) paths.push(p)
  }

  // 0aa. The guard/gate mechanism's own files (see isGuardPath) — blocked outright, before
  //      the "planning/.genesis/openspec is always writable" exemption below would otherwise
  //      wave a .genesis/guard/ or .genesis/hooks/ write straight through, and before any
  //      gate-state check that a project with no (or a long-approved) initiative would skip
  //      entirely. Covers deletion too (`rm .genesis/guard/check.js`), which a write-path
  //      scan alone would miss.
  const tamperTargets = [...paths, ...shellDeleteTargets(text)].filter((p) => isGuardPath(cwd, p))
  if (tamperTargets.length > 0) {
    block(
      `this touches Genesis's own guardrail files (${[...new Set(tamperTargets)].join(', ')}).\n` +
        'Editing, replacing, or deleting the guard/gate hooks or their wiring is not something\n' +
        'the agent can do here — ask the person to change it by hand, or run `genesis continue`\n' +
        'to refresh the guardrails from a clean copy.',
    )
  }

  // 0. No path we can name. For a file-writing tool that means we could not read its
  //    input, and allowing a write we cannot see defeats the entire hook — so block.
  //    For anything else it means this call is the guard's business, not ours, which
  //    is what keeps this script safe to wire on Bash too: that is the only way the
  //    shell form of apply_patch (a heredoc) is ever seen at all.
  if (paths.length === 0) {
    if (FILE_WRITE_TOOLS.has(String(payload?.tool_name ?? '').toLowerCase())) {
      block(
        `a ${payload?.tool_name} call arrived with no readable file path, so this hook cannot tell\n` +
          'whether it writes code. Blocking rather than guessing: the gate cannot be enforced\n' +
          'on a write it cannot see. Make the edit with a plain file write instead.',
      )
    }
    process.exit(0)
  }

  // 1. The gate record and decision ledger are helper-written — the agent must never
  //    edit them directly (a hand-edited ledger is exactly what drifted before).
  //    Every path is checked, not just the first: a patch that edits the proposal and
  //    the gate record together is precisely the self-approval this hook exists to stop.
  for (const filePath of paths) {
    if (!underDir(cwd, 'openspec', filePath)) continue
    const base = basename(filePath)
    if (base === 'state.yaml') {
      block(
        'openspec state.yaml is human-signed via `genesis gate approve` / `genesis infra accept`.\n' +
          'The agent cannot edit gate state directly — ask the person to sign in a terminal.',
      )
    }
    if (base === 'decisions.md') {
      block(
        'openspec decisions.md is written by `genesis decide` / `genesis reconcile`.\n' +
          'The agent cannot hand-edit the decision ledger — run the command so the staleness cascade fires.',
      )
    }
  }

  // 1b. docs/HOW-IT-WORKS.md (and its cache) are DERIVED from the decision ledger by
  //     `genesis how-it-works`. A hand edit is a second source of truth that drifts — the
  //     same reason decisions.md is helper-written. Checked on every path, like above.
  for (const filePath of paths) {
    if (GENERATED_DOCS.some((g) => resolve(cwd, g) === (isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath)))) {
      block(
        `${basename(filePath)} is generated from the decision ledger — it is never edited by hand.\n` +
          'Record the decision with `genesis decide <id> "<what>" --why ... --evidence <file>`, then run\n' +
          '`genesis how-it-works` to regenerate it.',
      )
    }
  }

  // 2. Planning artifacts + Genesis machinery are always writable (so the plan can be
  //    created and reviewed before approval): planning/, .genesis/, and openspec/
  //    (except the state.yaml handled above). EVERY path must qualify — one patch that
  //    touches the proposal and src/ together is a code write, and gets gated as one.
  const alwaysWritable = (/** @type {string} */ p) =>
    underDir(cwd, 'planning', p) || underDir(cwd, '.genesis', p) || underDir(cwd, 'openspec', p)
  if (paths.every(alwaysWritable)) {
    process.exit(0)
  }

  // 3. A code write. Gate it on the active initiatives if any exist.
  const inits = activeInitiatives(cwd)
  if (inits.length > 0) {
    const shared = inits.find((s) => s.scope === 'shared')
    if (shared) {
      block(
        `"${shared.id}" touches SHARED infrastructure — a human must proceed by hand and validate\n` +
          `with engineering first. No code writes for it. See openspec/changes/${shared.id}/.`,
      )
    }
    const gateOn = designGateOn(cwd)
    if (inits.some((s) => approved(s, gateOn))) process.exit(0)
    // Blocked only on the design signature: say exactly that, it's the most
    // actionable message a person can get (and the screens are already on disk).
    const pendingDesign = inits.find(
      (s) => s.proposal === 'approved' && s.implementation === 'approved' && !designSigned(s, gateOn),
    )
    if (pendingDesign) {
      block(
        `"${pendingDesign.id}" has UI whose design is not signed (design: ${pendingDesign.design}).\n` +
          (pendingDesign.design === 'n/a'
            ? `No design has been produced yet. Run the genesis-design skill for it, then a human signs.\n`

            : '') +
          `A human must SEE the screens and approve them:\n` +
          `  genesis ide .                                   (open it, review the Design panel, Approve)\n` +
          `  npm run genesis -- gate approve ${pendingDesign.id} design   (terminal alternative)\n` +
          `No code writes until then. See openspec/changes/${pendingDesign.id}/design/.`,
      )
    }
    const pendingInfra = inits.find((s) => s.scope === 'project' && s.gate !== 'accepted')
    if (pendingInfra) {
      block(
        `"${pendingInfra.id}" has a pending project-infra gate. A human must review cost/security/\n` +
          `architecture and run:  npm run genesis -- infra accept ${pendingInfra.id}  before any code.`,
      )
    }
    block(
      'no initiative has its gates approved yet. A human must review the docs and run:\n' +
        '  npm run genesis -- gate approve <id> proposal   AND   npm run genesis -- gate approve <id> implementation\n' +
        '  (plus  ... <id> design  when the initiative has UI)\n' +
        'Easiest: open the cockpit with `genesis ide .` and approve there.\n' +
        'No code writes until then. See openspec/changes/.',
    )
  }

  // 4. No active initiative. New projects use the initiative flow — block with a
  //    pointer to it. Legacy projects keep the original planning/loop-contract.md
  //    flow (below) only when that file actually exists, for backward compat.
  const contractPath = resolve(cwd, 'planning', 'loop-contract.md')
  if (!existsSync(contractPath)) {
    block(
      'no code writes until an initiative is approved.\n' +
        'Create one, then a human signs both gates in a terminal:\n' +
        '  npm run genesis -- change new "<title>"\n' +
        '  npm run genesis -- gate approve <id> proposal        (after the proposal is reviewed)\n' +
        '  npm run genesis -- gate approve <id> implementation  (after design/spec/tasks are reviewed)\n' +
        'No code writes until both gates read approved. See AGENTS.md.',
    )
  }
  // Legacy fallback: an existing project still driven by planning/loop-contract.md.
  const contract = readFileSync(contractPath, 'utf8')
  if (!/^\s*status:\s*ready\b/im.test(contract)) {
    block(
      'the Loop Contract exists but is not marked Ready.\n' +
        'Verify it with the person — close every open decision and confirm the\n' +
        'acceptance criteria are testable — then set its final line to "Status: Ready".\n' +
        'No code writes until then. See AGENTS.md.',
    )
  }

  process.exit(0)
}

main()
