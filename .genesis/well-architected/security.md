# Well-Architected — Security

Distilled from the AWS Well-Architected **Security** pillar, scoped to what
matters for a Genesis project. Consult this whenever an initiative touches
infrastructure or handles real data, before accepting the infra gate.

## Principles
- **Least privilege.** Grant the narrowest access that works — scoped IAM
  roles/policies, no wildcard `*` permissions, no long-lived root credentials.
- **No secrets in code.** Credentials, tokens, and keys come from environment
  variables or a secrets manager — never hardcoded, never committed (`.env` is
  gitignored from scaffold).
- **Validate external input.** Treat anything from outside the code as hostile:
  validate, sanitize, and use parameterized queries (never string-built SQL).
- **Encrypt in transit and at rest.** HTTPS/TLS always; never disable certificate
  verification. Turn on encryption for storage/databases that support it.
- **Reuse identity, don't invent it.** Use an existing SSO/auth system. Rolling
  your own authentication or storing passwords is a hard breakpoint.
- **Don't leak data.** Never log secrets, tokens, or personal data. Lock down
  public access on buckets/endpoints by default.

## Watch for (security breakpoints — surface these to the person)
- A **new authentication mechanism** or credential store.
- **Public exposure** of a bucket, endpoint, or database.
- **Personal or customer data** (PII) being stored, moved, or logged.
- **Broad IAM permissions** or shared/long-lived credentials.
- **Third-party services** receiving real data.

## In the infra gate
State what data is touched, who can access it, how secrets are handled, and
whether anything is exposed publicly. Any new auth, credential storage, or PII
handling is a decision for the person (and likely engineering), not a silent step.
