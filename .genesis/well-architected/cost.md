# Well-Architected — Cost

Distilled from the AWS Well-Architected **Cost Optimization** pillar, scoped to
what matters for a Genesis project. Consult this whenever an initiative touches
infrastructure, before accepting the infra gate.

## Principles
- **Pay only for what you use.** Prefer serverless / managed / on-demand over
  always-on servers for spiky or low-traffic workloads. A prototype almost never
  needs a 24/7 instance.
- **Right-size from the start.** Pick the smallest tier that works; scale up only
  with evidence. Dev/free tiers for anything not in production.
- **Make cost visible.** Estimate the monthly cost of any new resource *before*
  provisioning it, and write that estimate into the proposal. Tag resources so
  spend is attributable.
- **Kill what you don't use.** No orphaned resources, no idle environments.

## Watch for (cost breakpoints — surface these to the person)
- Any resource with a **recurring monthly charge** the person hasn't signed off on.
- **Always-on compute** (EC2/RDS/containers running 24/7) for a prototype.
- **Data egress** and cross-region/cross-AZ transfer.
- **Per-request / per-token** pricing that scales with usage (APIs, LLM calls).
- **Storage that only grows** (logs, backups, uploads) with no lifecycle policy.
- **Managed services with a high floor** (a cluster, a NAT gateway, a load balancer).

## In the infra gate
State the expected monthly cost, what drives it, and the cheapest option that
still meets the goal. If cost is non-trivial or open-ended, that's a decision for
the person — not something to proceed with silently.
