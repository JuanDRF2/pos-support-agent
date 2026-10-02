---
id: pos-support-agent-dec-pos-support-chat-agent-with-rag-and-eval-01
project: pos-support-agent
topic: Performance-driven model selection
format: card-v1
sources:
  - src/config.ts
  - .env.example
---
<!-- DRAFT generated from DEC-pos-support-chat-agent-with-rag-and-eval-01 by `genesis cards-draft`. Validate and import with Product Brain. -->
<!-- decision-hash: ce17550215b3fa20 -->
## Learn
Measured load time (51 s vs 7 s) and token generation speed (6-7 s per token vs 25 tokens/s) showed llama3.1:8b exceeded the 60 s Ollama timeout, prompting a switch to llama3.2:3b on 8 GB RAM.

## Choose
Q: Why was the 8B model rejected?
A) Load time and token generation speed exceeded the 60 s Ollama timeout
B) The 3B model is a newer version
C) The 8B model requires more than 8 GB of RAM
Correct: A
Why-not-B: Model age was not the deciding factor.
Why-not-C: The issue was speed to meet the timeout, not RAM.

## Reveal
Answer: The 8B model took 51 s to load and 6-7 s per token, exceeding 60 s. The 3B loaded in 7 s and generated 25 tokens/s.
Interview: We measured the 8B model couldn't respond fast enough within 60 seconds on 8 GB RAM.

## Open
Q: How did they approach selecting between the 8B, intermediate, and 3B models?
Keys:
- Measured performance metrics | Measured load time and token generation speed | Measured response time constraints
- Skipped intermediate models | Went straight to the 3B model | Did not test Phi-3.5-mini or similar

## Fill
Q: The 8B model's 51 s load and 6-7 s per token generation could not satisfy the 60 s ____ maximum response time.
Answer: Ollama | inference
