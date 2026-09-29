# eval-suite

## Requirements

### Requirement: Golden set written after the docs
The golden set SHALL be written after the KB articles and derived from them. It SHALL contain about 20 questions: direct, paraphrased (not reusing the docs' wording), near-miss unanswerable traps, and about 5 held-out questions not used for calibration. Each answerable question SHALL list the expected source doc, the section heading(s) of that doc that answer it (any one of them counts) and its key phrases; every heading must exist in the doc.

#### Scenario: Composition
- **Given** the golden set file
- **When** it is counted by type
- **Then** it has direct, paraphrase, trap and held-out entries

### Requirement: Three deterministic categories
The eval suite SHALL score (1) retrieval (the expected section, meaning its article and one of its accepted headings, appears in the top-k; with only three articles, matching the article alone would be too easy), (2) faithfulness, and (3) correct refusal, with no LLM judge.

### Requirement: Deterministic faithfulness checks
An answer SHALL pass faithfulness only if (1) it cites the correct source doc, (2) it contains the golden key phrases, and (3) every number, amount, time period and named option in it also appears in the retrieved chunks or in the question itself. Amounts, time periods and plain numbers are compared by type, so an invented "$5.00" cannot pass because "5" appears elsewhere as part of "5-7 business days".

#### Scenario: Invented number
- **Given** an answer that adds a number absent from the retrieved chunks
- **When** it is scored
- **Then** check 3 fails

### Requirement: Pass marks set from measured results
The pass marks SHALL be set from measured results with an explicit statement of the risk of overfitting, and SHALL allow no more than one question of slack against the measured result. Held-out results are reported separately and do not gate.

#### Scenario: A second miss fails the run
- **Given** pass marks of 90% (retrieval), 85% (faithfulness) and 95% (correct refusal)
- **When** a category falls below its mark
- **Then** `npm test` exits non-zero and names the category

### Requirement: Scorecard and SKIPPED-never-fake
`npm test` SHALL print a scorecard with a percentage per category. A category that could not run SHALL show `SKIPPED` with a reason and never a made-up number.

#### Scenario: Ollama down
- **Given** Ollama is not running
- **When** `npm test` runs
- **Then** generation-dependent categories show SKIPPED with a reason and no percentage

### Requirement: Two tiers
`test:unit` and `eval:fast` SHALL need no LLM. `npm test` SHALL run the full suite. A `verify` script SHALL run typecheck, lint, `test:unit`, `eval:fast` and build, so `genesis verify` never calls the LLM tier.

#### Scenario: genesis verify without Ollama
- **Given** Ollama is not running
- **When** `npm run genesis -- verify` runs
- **Then** it passes using only the fast tier


### Requirement: Project instructions describe the local stack (AGENTS.md)
`AGENTS.md` previously stated "Claude for generation, Voyage AI for embeddings". It SHALL now state: local embeddings (transformers.js, `Xenova/all-MiniLM-L6-v2`), generation by Ollama (a small local model, `llama3.2:3b` by default, env-configured), and deterministic evals with no Claude or Voyage API. The `package.json` `description` SHALL match.

#### Scenario: No stale stack text
- **Given** the finished repo
- **When** `AGENTS.md` and `package.json` are searched for "Voyage" and "Claude for generation"
- **Then** they appear only where the change is explained, if at all
