# Well-Architected — Architecture (Reliability + Performance)

Distilled from the AWS Well-Architected **Reliability** and **Performance
Efficiency** pillars, scoped to what matters for a Genesis project. Consult this
whenever an initiative touches infrastructure or introduces a new system
boundary, before accepting the infra gate.

## Reliability
- **Expect failure.** Handle timeouts, retries (with backoff), and partial
  failure. Don't assume a network call or dependency always succeeds.
- **Be idempotent.** An operation that might be retried must be safe to run twice
  (no double charges, no duplicate records).
- **No single point of failure for anything shared.** If others depend on it, one
  instance / one disk / one unbacked-up store is a risk.
- **Back up state that matters**, and know how you'd restore it.

## Performance & scalability
- **Prefer stateless.** Stateless components scale horizontally and fail cleanly;
  push state to a managed store.
- **Don't build what won't scale.** Watch for **unbounded queries** (no
  pagination/limits), **N+1** access patterns, and in-memory data that grows
  without bound.
- **Cache only where it earns its keep**, and have an invalidation story.
- **Match the tool to the load.** Don't provision a cluster for a prototype;
  don't put a spiky workload on a fixed-size box.

## Watch for (architecture breakpoints — surface these to the person)
- A **new database or storage system** (vs. reusing an existing one).
- **Two systems talking to each other for the first time** (a new integration).
- **New cloud infrastructure** being provisioned.
- **Unbounded** resource use (queries, memory, storage, fan-out).

## In the infra gate
State the failure modes, how the design scales, and where state lives. New data
stores, new cross-system integrations, or new infrastructure are Lane B — a
decision for the person and engineering, not a silent step. If the affected infra
is shared beyond this project, STOP: a human proceeds by hand.
