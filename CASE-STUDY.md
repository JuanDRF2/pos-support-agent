# Case Study: Building a Support Agent I Could Actually Trust

## The problem I was actually solving

Four years into product management, I kept getting turned down for the same reason, stated
explicitly by three different companies: no shipped agentic-AI artifact. AgileEngine wanted "shipped
agentic AI product in production." Applaudo wanted "AI/ML-native product work: RAG, semantic
search." Truelogic wanted "deep LLM/agent-memory systems fluency." That's not a seniority gap or a
communication gap. It's a specific, nameable thing I hadn't built yet.

So I built it, but I didn't want to build a demo that just *looked* like it worked. I wanted to
build something I'd actually trust, and the only way to know if I trusted it was to test it hard
enough to find out where it didn't hold up.

## What it is

A support chat for a POS (point-of-sale) product. A merchant asks a question (how to process a
partial refund, how to renew a subscription, how to gift a renewal) and the agent answers from
three real help articles using actual retrieval-augmented generation (RAG), not a scripted FAQ
bot. It runs entirely on my own machine: local embeddings for retrieval, a local model (Ollama)
for generation, no paid or keyed API of any kind. The full build (architecture, setup, source) is
in the repo's own README; this document is about the decisions, not the code.

The knowledge base draws its domain and naming (POS Checkout, POS Renewals, Gift Renewal POS)
from **Signal to Ship**, an AI orchestrator I built and use for my own product work, which takes a
PM from a raw signal (a complaint, a bug, a competitive gap) through seven gated phases to a
shipped, measured outcome. Same underlying discipline in both: don't skip a step, don't guess when
you can measure, and don't hide the parts that didn't work perfectly.

## The decisions that actually mattered

**I planned for a bigger model, then let my own hardware overrule me.** The original plan called
for a 7-8B parameter model, reasoning that larger models follow "don't answer outside the context"
instructions more reliably, which directly affects one of the three things this project measures.
I ran it on my actual machine (8GB of RAM) before committing to it. Load time: 51 seconds.
Generation: roughly 6-7 seconds *per token*. A single real answer would have blown through every
timeout in the system. I switched to a 3B model, measured it the same way (7 seconds load, ~25
tokens per second), and documented both sets of numbers as the reason: a measured constraint, not
a preference.

**The refusal logic has two layers, and the data told me which one was actually doing the work.**
I didn't want the model deciding on its own whether it knew something. That's exactly where small
models invent things. So refusal is decided in code first: if retrieval confidence is below a
threshold, the question never reaches the model at all. The model's own reply is a second,
independent check. When I ran the real eval suite against all 8 questions that should be refused,
only 2 were caught by the code threshold. The other 6 needed the model's own judgment. I would not
have known that without measuring it, and it's the reason I kept both layers instead of trusting
just the one I engineered myself.

**I found and fixed two bugs in my own eval scorer, in opposite directions.** The faithfulness
check (does the answer invent a number that isn't in the source?) had two real problems. One let
a fabricated dollar amount slip through undetected, because the digit happened to also appear
somewhere unrelated in the source text; that's a false negative, the dangerous direction, since it
would have made the eval look stricter than it actually was. The other flagged the model as
"inventing" a number that the *user* had typed in their own question; that's a false positive,
unfairly penalizing a correct answer. I fixed both. Only fixing the one that was making my numbers
look worse would have been easy to justify and wrong to do.

**The limits are in the README, not hidden from it.** The faithfulness check is a deterministic
proxy. It catches missing or invented specifics, but it doesn't understand meaning, so a fluent
sentence that's subtly wrong in a way that doesn't touch a number could still pass. With 23
questions total and one author writing both the help articles and the test questions, a clean
scorecard says less about general reliability than it would with a bigger, more independent test
set. I'd rather a hiring manager read that from me than discover it themselves and wonder what
else got left out.

## The result

A real `npm test` run, not a cherry-picked one:

| Category | All 23 questions | Held-out (6, never used to tune anything) | Pass mark |
|---|---|---|---|
| Retrieval (correct section, not just correct document) | 15/15 (100%) | 4/4 | 90% |
| Faithfulness (cites the source, invents nothing) | 14/15 (93%) | 3/4 | 85% |
| Correct refusal | 23/23 (100%) | 6/6 | 95% |

Zero `npm audit` vulnerabilities. Zero paid or keyed API anywhere in the code, confirmed with a
repo search, not just a claim. 103 unit tests. Verified on a clean clone of the repo, not just on
the machine that built it: install, ingest, test, the same result a stranger would get.

## What it would take to run this on a real POS

This is a demo, deliberately: no auth, no real customer data, no production deploy, by design from
the original proposal. If a real company wanted to actually ship this, here's the honest list of
what changes, not a hand-wave:

- **A real, live content source, not 3 static files.** A production knowledge base has hundreds or
  thousands of articles, changes constantly, and needs to stay in sync with the actual product. The
  RAG source would need to pull from a real help-center CMS or the product's own documentation API,
  not markdown files I wrote once.
- **A real vector store at scale.** A JSON file with 10 chunks works for a demo. Thousands of
  articles need an actual vector database, and retrieval tuning becomes its own project at that
  size, not a threshold I calibrated by hand on 23 questions.
- **Account-specific answers need account-specific data.** "What's the status of my refund"
  requires the agent to safely query the real order system for that specific merchant, with proper
  access control and audit logging, which is a different (and much higher-stakes) problem than
  answering from a static help article.
- **The model choice gets re-evaluated under real load.** A local 3B model on my laptop was the
  right call for one user testing it by hand. Real concurrent traffic changes the cost/latency math
  entirely; that might mean a hosted API, or a properly resourced self-hosted model, not the same
  answer by default.
- **A real human handoff, not a text string.** "Contact support" as plain text is fine for a demo.
  Production needs an actual path to a live agent when the bot can't help, with the conversation
  context carried over, not lost.
- **The eval suite needs to keep growing after I stop touching it.** A golden set someone else
  maintains, sampled human review layered on top of the deterministic checks, and monitoring for
  when refusal rates or retrieval quality drift, none of which a one-person, one-week demo needs.

None of this is a criticism of the demo. It's the difference between proving the mechanism works
and being ready to bet a real support queue on it, and I'd rather be able to name that gap clearly
than pretend a weekend project is production-ready.

## What this says about how I work

I don't ship an AI feature because it demoed well once. I measure the parts that are supposed to
be safe, I keep the parts that turn out to matter even when I didn't expect them to, and I write
down the parts that don't hold up instead of quietly cutting them from the story. That's the same
instinct behind Signal to Ship, applied to a harder, more technical problem, and it's the thing I'd
want a team to know about how I build before they hire me to do more of it.
