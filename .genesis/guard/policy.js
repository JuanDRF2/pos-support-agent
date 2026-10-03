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

/** The confirmation format shown with every `ask` (brief §4.5). */
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

/**
 * A URL's host is local only if the WHOLE host is. `LOCAL_HOST` above matches inside free text,
 * which is right there but wrong for a host: `localhost.evil.com` contains "localhost".
 */
const LOCAL_HOST_ONLY = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|[\w-]+\.local|[\w-]+\.localhost)(:\d+)?$/i

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
    if (hosts.every((h) => LOCAL_HOST_ONLY.test(h))) return 'local'
    // Any shared or otherwise-unknown remote host → treat as shared.
    if (hosts.some((h) => SHARED_HOST.test(h) || !LOCAL_HOST_ONLY.test(h))) return 'shared'
  }
  if (LOCAL_HOST.test(cmd) || DISPOSABLE.test(cmd)) return 'local'
  if (SHARED_HOST.test(cmd) || SHARED_ENV_WORD.test(cmd)) return 'shared'
  return 'unknown'
}

// --- Risky-command detection (brief §4.5 "Risky commands") -------------------

/** @param {string} cmd */
function isHttpWrite(cmd) {
  if (!/(?:^|[\s;|&("'`])(curl|wget|xh|https?ie|http)(?=\s)/i.test(cmd)) return false
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

const VERBS = String.raw`migrate|migration|deploy|release|rollout|import|bulk[-\s]?update|token[-\s]?refresh|refresh[-\s]?token`

/** A verb anywhere in a word — for a program's own name (`./scripts/deploy.sh`). */
const RISKY_VERB = new RegExp(String.raw`\b(${VERBS})\b`, 'i')

/**
 * A verb standing as its own argument (`npm run deploy`, `db:migrate`, `release.yml`) — not a
 * piece of a path, branch or slug (`src/deploy/`, `feat/import-wizard`, `add-import-flow`).
 */
const RISKY_VERB_ARG = new RegExp(String.raw`(?<![\w./-])(${VERBS})(?![\w/])`, 'i')

/**
 * Anything that runs text as code: a shell or wrapper (also by path, or at the end of a pipe),
 * an interpreter given inline code, or command/process substitution. Its presence means no
 * segment is skipped — nothing in the line can be assumed to be data.
 */
const RUNS_CODE = new RegExp(
  [
    /(?:^|[\s;|&(/])(sh|bash|zsh|dash|ksh|fish|eval|exec|source|ssh|watch|parallel|script)(?=\s|$)/.source,
    /(?:^|[\s;|&(/])(node|deno|bun|python[\d.]*|ruby|perl|php)\s(?:[^;|&\n]*\s)?-[ecp]\b/.source,
    /\bnpm\s+exec\b|\bnpx\s(?:[^;|&\n]*\s)?-c\b/.source,
    /`|\$\(|[<>]\(/.source,
  ].join('|'),
  'i',
)

/**
 * Programs that only read. A verb in their arguments is a search term or a label
 * (`grep "aws-deploy"`, `git log --grep release`), not an action. `sed` is not here: its `e`
 * and `w` commands run and write, even under `-n`.
 */
const READ_ONLY_SEGMENT =
  /^(?:xargs\s+(?:-\S+\s+)*)?(grep|egrep|fgrep|rg|ag|cat|head|tail|less|more|wc|sort|uniq|cut|tr|column|ls|echo|printf|jq|yq|diff|stat|file|which|pwd|true|find\b(?![\s\S]*\s-(delete|exec|execdir|ok|okdir|fprint\w*|fls)\b)|git\s+(status|log|diff|show|branch|grep|rev-parse|ls-files|blame|describe|shortlog|reflog)|gh\s+(pr|run|release|issue|workflow|repo)\s+(view|list|checks|status|diff)|(npx\s+)?prisma\s+migrate\s+status)\b/i

/** A quoted value of a message/label flag (`git commit -m "…"`, `gh pr create --title "…"`). */
const MESSAGE_VALUE = /(\s(?:-m|--message|--grep|--title|--body|--notes|--subject)(?:\s+|=))("(?:[^"\\]|\\[\s\S])*"|'[^']*')/g

/** The `-m "$(cat <<'EOF' … EOF)"` form agents use for multi-line commit messages. */
const HEREDOC_MESSAGE = /^"\$\(cat\s+<<-?\s*'?(\w+)'?\n[\s\S]*\n\s*\1\s*\n?\s*\)\s*"$/

/** @param {string} cmd */
function blankMessageValues(cmd) {
  return cmd.replace(MESSAGE_VALUE, (whole, flag, value) =>
    /`|\$\(/.test(value) && !HEREDOC_MESSAGE.test(value) ? whole : `${flag}""`,
  )
}

/**
 * Split a command line into its segments on `;`, `|`, `||`, `&&`, `&` and newlines that sit
 * outside quotes — `grep -E "a|b"` is one segment, and `2>&1` / `&>` are redirections.
 * @param {string} cmd
 */
function segments(cmd) {
  const out = []
  let current = ''
  let quote = ''
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (quote) {
      if (ch === '\\' && quote === '"') {
        current += ch + (cmd[++i] ?? '')
        continue
      }
      if (ch === quote) quote = ''
      current += ch
      continue
    }
    if (ch === '\\') {
      current += ch + (cmd[++i] ?? '')
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    const redirect = ch === '&' && (cmd[i - 1] === '>' || cmd[i + 1] === '>')
    if ((ch === ';' || ch === '|' || ch === '&' || ch === '\n') && !redirect) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** Prefixes that hand the rest of a segment to another program. */
const PREFIX = /^(?:(?:sudo|env|time|nohup|nice|command|exec|timeout\s+\S+|[A-Za-z_]\w*=\S*)\s+)*/

/**
 * The programs a segment runs: its leading program, and what `xargs` or `find -exec` runs.
 * @param {string} segment
 */
function programs(segment) {
  const found = [segment.replace(PREFIX, '').split(/\s+/)[0] ?? '']
  const handedOff = /(?:\bxargs\s+(?:-\S+\s+)*|\s-exec(?:dir)?\s+)(\S+)/g
  let m
  while ((m = handedOff.exec(segment))) found.push(m[1])
  return found
}

/**
 * The segments of a command line that would actually run. Word-based checks match against
 * these, not the raw line. Only two things are dropped: the quoted value of a message/label
 * flag, and segments led by a read-only program. Every other quoted argument is kept —
 * `npm run "deploy"` and `gh workflow run "Deploy to production"` are still deploys. A line
 * that runs text as code (a shell, `-e`/`-c`, `$(…)`) keeps every segment.
 * @param {string} cmd
 */
function executedSegments(cmd) {
  const line = blankMessageValues(cmd)
  const all = segments(line)
  if (RUNS_CODE.test(line)) return all
  return all.filter((segment) => !READ_ONLY_SEGMENT.test(segment))
}

/** @param {string} cmd */
function executedText(cmd) {
  return executedSegments(cmd).join(' ; ')
}

/**
 * Sync/deploy/migration/release/import/bulk verbs (brief §4.5).
 *
 * These are plain words, so matching them anywhere in the line fired on searches, commit
 * messages, paths and branch names — and a guard that asks every other command trains people
 * to click Yes without reading. The verb counts where it would run: as a standalone argument of
 * an executed segment, or in the name of the program itself.
 * @param {string} cmd
 */
function isRiskyCliVerb(cmd) {
  // Where text runs as code (`ssh host "./deploy.sh"`), every mention counts, as it always did.
  const line = blankMessageValues(cmd)
  if (RUNS_CODE.test(line)) return RISKY_VERB.test(line)
  return executedSegments(cmd).some(
    (segment) => RISKY_VERB_ARG.test(segment) || programs(segment).some((p) => RISKY_VERB.test(p)),
  )
}

/** @param {string} cmd */
function isRiskyWrite(cmd) {
  // HTTP and SQL read every segment (`echo "UPDATE …" | psql`), minus message values only.
  const line = blankMessageValues(cmd)
  return isHttpWrite(line) || isDbWrite(line) || isCloudMutation(executedText(cmd)) || isRiskyCliVerb(cmd)
}

// --- Unambiguously destructive (block regardless of environment) -------------

/** @param {string} t */
function isDangerTarget(t) {
  if (!t) return true
  if (t === '*' || t === '.' || t === './' || t === '..' || t === '../') return true
  if (t === './*' || t === './.*' || t === '.*') return true // the whole working folder
  if (/^(\.\/)?\.git\/?$/.test(t)) return true // the repository itself: all history
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
 * One `rm -rf` operand, judged by what the shell will actually delete. The shell strips quotes,
 * so `rm -rf "/Users/x"` removes exactly what the unquoted form does — compare the target, not
 * its quote characters (a quoted path with a space arrives as pieces; the first still starts
 * with the `/`).
 *
 * A quoted variable gets one deliberate allowance. An unquoted `$DIR` has always counted as an
 * unknown root, but `rm -rf "$SCRATCH"` and `rm -rf "$tmpdir"` are how scripts clean up their own
 * scratch directories, and the guard's block is never waived, so blocking every one would stall
 * autonomous runs. What is blocked is the shape that turns an empty variable into the filesystem
 * root: the variable on its own followed by a slash (`"$DIR/"`, `"${DIR}/"`, `"$DIR"/*`), which
 * expands to `/` or `/*` when DIR is unset. A named subpath (`"$DIR/build"`) and the bare variable
 * (`"$DIR"`, which becomes an empty operand and does nothing) stay allowed. HOME is always a real
 * root, so it stays blocked however it is written. Replaying real command history, no command
 * used the blocked shape.
 * @param {string} operand
 */
function isDangerousRmOperand(operand) {
  const target = operand.replace(/["']/g, '')
  const quoted = target !== operand
  if (quoted && target.startsWith('$')) {
    if (/^\$\{?HOME\b/.test(target)) return true
    if (/^\$\{?\w+\}?\/+\*?$/.test(target)) return true
    return false
  }
  return isDangerTarget(target)
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
    // Flags are whole words: anchoring them keeps a hyphen inside a path (`store-outreach`)
    // from reading as `-r`.
    if (!/(?:^|\s)(?:-[a-z]*r[a-z]*|--recursive)(?=\s|$)/i.test(args)) continue
    if (!/(?:^|\s)(?:-[a-z]*f[a-z]*|--force)(?=\s|$)/i.test(args)) continue
    const operands = args.replace(/(?:^|\s)-{1,2}[a-zA-Z]+/g, ' ').trim()
    const tokens = operands ? operands.split(/\s+/) : []
    if (tokens.length === 0) return true
    if (tokens.some(isDangerousRmOperand)) return true
  }
  return false
}

/**
 * `git` followed by its GLOBAL options, then a subcommand. `git -C . push` and `git -c k=v push`
 * are the same push as `git push`; matching only the adjacent spelling let both skip the
 * force-push block and the secret scan. Build the pattern for any subcommand with {@link gitCmd}.
 */
const GIT_GLOBALS = String.raw`(?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?))*`
/** @param {string} sub */
const gitCmd = (sub) => new RegExp(String.raw`\bgit${GIT_GLOBALS}\s+${sub}\b`, 'i')
const GIT_PUSH = gitCmd('push')

/** @param {string} cmd */
function isForcePushToProtected(cmd) {
  // Judge each push on its own: a `-d` or a `main` elsewhere in the line (`git branch -d x`,
  // `git checkout main`) belongs to another command and says nothing about this push.
  return cmd.split(/&&|\|\||[;|\n]/).some((seg) => {
    if (!GIT_PUSH.test(seg)) return false
    const forced = /(--force\b|--force-with-lease\b|(?:^|\s)-f\b)/i.test(seg) || /\s\+[\w/-]*\b(main|master)\b/i.test(seg)
    // Deleting a protected branch on the remote rewrites shared history just as a force does.
    const deletes = /(?:^|\s)(--delete|-d)(?=\s)/i.test(seg) || /\s:(main|master)\b/i.test(seg)
    return (forced || deletes) && /\b(main|master)\b/i.test(seg)
  })
}

/**
 * Commands that are neither unambiguously destructive nor ordinary: they throw away work that
 * may not exist anywhere else, or run code nobody looked at. A human answers; with nobody to
 * ask they are refused; the unattended loop is not stalled by the recoverable ones.
 * @param {string} cmd
 * @returns {string|null}
 */
function askReason(cmd) {
  // A shell takes the script from stdin whatever its flags (`| sh -s -- --yes`); an interpreter only
  // when it is given no script at all. `| python3 -c "..."` parses the download, it does not run it.
  if (/\b(curl|wget|xh)\b[^\n]*\|\s*(?:sudo\s+)?(?:(?:ba|z|da|k)?sh\b|(?:python[\d.]*|node|perl|ruby)\s*(?:$|[;&|)\n]|-\s*(?:$|[;&|)\n])))/i.test(cmd)) {
    return 'pipes a download straight into a shell or interpreter: it runs code nobody has read'
  }
  if (new RegExp(String.raw`\bgit${GIT_GLOBALS}\s+reset\b[^\n;&|]*--hard\b`, 'i').test(cmd)) {
    return 'git reset --hard discards uncommitted work'
  }
  const clean = cmd.match(new RegExp(String.raw`\bgit${GIT_GLOBALS}\s+clean\b([^\n;&|]*)`, 'i'))
  if (clean && /(?:^|\s)-[a-z]*f/i.test(clean[1]) && !/(?:^|\s)(-[a-z]*n|--dry-run)\b/i.test(clean[1])) {
    return 'git clean -f deletes untracked files, including ones git cannot bring back'
  }
  if (new RegExp(String.raw`\bgit${GIT_GLOBALS}\s+(?:checkout\s+(?:--\s+)?|restore\s+(?!--staged)(?:--worktree\s+)?)\.(?:\s|$|[;&|])`, 'i').test(cmd)) {
    return 'this overwrites every modified file in the working folder with the committed version'
  }
  return null
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
  if (isInfraProvisioning(executedText(command))) {
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

  // 1c. Destroys unrecoverable work or runs unseen code → a human decides. Not "block": these
  //     have legitimate uses. Autonomous mode auto-approves so the loop is not stalled.
  const asked = askReason(command)
  if (asked) {
    if (autonomous()) return { action: 'allow', reason: `${asked} — auto-approved (autonomous mode)` }
    if (nobodyToAsk(payload)) return { action: 'block', reason: `${asked}, and this session cannot ask a human` }
    return { action: 'ask', reason: asked, context: `This command ${asked}. Confirm you want it.` }
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
  return GIT_PUSH.test(String(cmd || ''))
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
