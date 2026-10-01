---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-12
project: pos-support-agent
topic: Sentinel Token Refusal in RAG Systems
format: card-v1
sources:
  - src/agent/answer.ts
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-12 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: bbe352f42984bb44 -->
## Learn
When using RAG (retrieval-augmented generation, where an AI model answers using external documents), add a sentinel token like NOT_IN_DOCS to signal answers outside the knowledge base. Detect this token anywhere in the response, not just on exact match, because small models often add words around the token.

## Choose
Q: When using NOT_IN_DOCS as a sentinel token for RAG refusal, when should you trigger a refusal?
A) Only when the entire response is exactly NOT_IN_DOCS
B) Whenever NOT_IN_DOCS appears anywhere in the response
C) Only when NOT_IN_DOCS is the first token of the response
Correct: B
Why-not-A: Exact match misses cases where the model wraps the token with surrounding words.
Why-not-C: Position-only detection at the start misses tokens appearing elsewhere in the response.

## Reveal
Answer: Check for the token anywhere in the response to catch refusals even when the model adds surrounding text.
Interview: We detect NOT_IN_DOCS anywhere in the output because small models often add words around the sentinel.

## Open
Q: Why check for the sentinel token based on its presence rather than its position?
Keys:
- small models add surrounding words | the model wraps the token with text | models add content around the token
- showing wrong information is worse than false refusal | false negatives are more harmful than extra refusals | missed refusals are the worst outcome

## Fill
Q: When a small language model includes your sentinel token among surrounding words, a position-____ detection strategy ensures you catch the refusal signal.
Answer: independent | agnostic | flexible
