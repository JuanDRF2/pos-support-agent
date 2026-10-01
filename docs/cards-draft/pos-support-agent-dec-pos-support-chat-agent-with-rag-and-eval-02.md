---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-02
project: pos-support-agent
topic: Two-layer refusal in RAG agents
format: card-v1
sources:
  - src/agent/answer.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-02 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: 3a3306d06fab2152 -->
## Learn
In a RAG (Retrieval-Augmented Generation) system where a model answers questions from documents, your agent decides refusals using two code layers: first, a retrieval score threshold rejects low-confidence matches without calling the model; second, if documents pass, the model outputs NOT_IN_DOCS to refuse unanswerable questions. Code-based refusal is deterministic and testable, avoiding hallucination.

## Choose
Q: To handle refusals in your RAG agent, what approach did you take?
A) Single layer: only check if the retrieval score exceeds a threshold
B) Two layers: check the retrieval score threshold, then check if the model outputs NOT_IN_DOCS
C) Single layer: rely entirely on the model to decide when to refuse
Correct: B
Why-not-A: The threshold alone was measured to refuse only 2 of 8 must-refuse questions, so a second layer was needed.
Why-not-C: Small local models hallucinate easily, so leaving refusal to the model alone risks false answers.

## Reveal
Answer: Two layers make refusal deterministic and testable. The threshold alone caught only 2 of 8 must-refuse questions; the model's NOT_IN_DOCS signal caught the other 6, so both were kept.
Interview: We use a retrieval score threshold, and if documents pass that, we check if the model outputs NOT_IN_DOCS to refuse.

## Open
Q: Why did measuring the threshold-only approach lead to keeping both layers instead of removing one?
Keys:
- The threshold alone refused only 2 of 8 must-refuse questions | The threshold was insufficient by itself
- The model's NOT_IN_DOCS signal refused the other 6 cases | The model layer caught additional cases the threshold missed

## Fill
Q: The two-layer approach uses a retrieval ____ that filters low-confidence results with a model NOT_IN_DOCS signal to prevent hallucination.
Answer: score | threshold | similarity
