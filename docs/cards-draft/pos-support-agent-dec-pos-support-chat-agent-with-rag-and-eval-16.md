---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-16
project: pos-support-agent
topic: Deterministic evaluation in RAG chat
format: card-v1
sources:
  - src/evals/score.ts
  - src/evals/report.ts
  - src/evals/run.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-16 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: afd1b6645c064e44 -->
## Learn
Deterministic evals (evaluation without an AI model) need no API key and cost nothing, but only detect missing facts, not subtle semantic errors.

## Choose
Q: Why did you use deterministic evaluation instead of an LLM judge like Claude?
A) Deterministic checks detect all faithfulness errors more quickly
B) No API key needed, no cost, repeatable results; they miss subtle semantic errors
C) LLM judges cannot evaluate retrieval accuracy
Correct: B
Why-not-A: Deterministic checks cannot detect subtle semantic errors.
Why-not-C: LLM judges can evaluate retrieval, but this choice prioritized no cost and local operation.

## Reveal
Answer: Deterministic evals need no API key or cost and give repeatable results. They detect missing or invented facts but miss subtle semantic errors.
Interview: We chose deterministic evals because they are free and repeatable, though they miss subtle incorrectness.

## Open
Q: Name the three types of deterministic evaluation your system performs.
Keys:
- retrieval | retrieval accuracy
- faithfulness | whether facts are supported by sources
- correct refusal | refusing out-of-scope questions

## Fill
Q: Your system checks retrieval accuracy and faithfulness to sources, plus ____ to avoid answering out-of-scope questions.
Answer: correct refusal | refusal
