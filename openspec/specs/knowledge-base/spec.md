# knowledge-base

## Requirements

### Requirement: Three synthetic help articles
The system SHALL ship a knowledge base of exactly three synthetic Markdown articles in `docs/kb/`: `pos-checkout.md`, `pos-renewals.md` and `gift-renewal-pos.md`. Each procedure SHALL sit under its own `##` heading and contain no real customer or employer content.

#### Scenario: Articles exist and are structured
- **Given** the repo is checked out
- **When** the KB folder is listed and parsed
- **Then** the three files exist and every procedure has its own `##` heading

### Requirement: Chunk by heading, never split numbered steps
The chunker SHALL produce one chunk per `##` section, and SHALL NOT end a chunk in the middle of a numbered list.

#### Scenario: Numbered steps stay together
- **Given** the three articles and a list-heavy fixture
- **When** they are chunked
- **Then** no chunk ends mid-numbered-list

### Requirement: Local embedding index
The ingest command SHALL embed chunks locally with `Xenova/all-MiniLM-L6-v2` (exact pinned revision) through `@huggingface/transformers` (exact pinned version), cache the model in `.cache/`, and write `data/index.json` recording the model name and revision. Remote model downloads SHALL be allowed only in ingest/first run; the chat server SHALL never download anything. Loading an index whose shape or model revision does not match SHALL fail with a plain "re-run ingest" message. It SHALL need no API key.

#### Scenario: Ingest without keys
- **Given** no API-key env vars are set
- **When** `npm run ingest` runs
- **Then** `data/index.json` is written and the run makes no call to a hosted API
