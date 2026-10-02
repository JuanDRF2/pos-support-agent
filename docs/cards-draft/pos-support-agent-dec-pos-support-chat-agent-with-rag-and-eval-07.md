---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-07
project: pos-support-agent
topic: RAG agent system prompts
format: card-v1
sources:
  - src/agent/answer.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-07 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: f090925039654a26 -->
## Learn
Changing a RAG agent's system prompt from "concisely" to "answer completely" improved recall from 0.36 to 0.86, meaning it retrieved and stated more facts. RAG is retrieval-augmented generation: the model retrieves relevant documents before generating answers.

## Choose
Q: What improved recall from 0.36 to 0.86?
A) Increased token limit to fix early stopping at 55 tokens
B) Upgraded the document retrieval algorithm
C) Changed system prompt from 'concisely' to 'answer completely'
Correct: C
Why-not-A: Model stopped at 55 tokens intentionally, not due to a limit.
Why-not-B: No retriever changes documented between V0 and V2.

## Reveal
Answer: V2 changed the system prompt to 'answer completely' instead of 'concisely,' preventing the model from stopping early and missing facts.
Interview: We changed the system prompt from 'concisely' to 'answer completely' to make the model state all relevant information.

## Open
Q: How did V2 improve quality beyond recall?
Keys:
- Invented numbers dropped from 1 to 0 | Zero hallucinated numbers in V2
- Traps refused increased to 6 of 6 | All misleading prompts correctly rejected

## Fill
Q: The system ____ from 'concisely' to 'answer completely' eliminated invented facts.
Answer: prompt changed | prompt shift
