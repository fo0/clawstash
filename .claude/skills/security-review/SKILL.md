---
name: security-review
description: "Use when the user wants a focused security audit of the current diff or recent changes. Triggered by /security-review, 'security review', 'audit this for security', 'check for vulnerabilities', 'OWASP review'. Runs deeper checks than the generic review — OWASP Top 10, secrets scanning, injection vectors, auth/authz boundaries, crypto usage. Independent of the generic review skill."
---

# Security Review — Focused Vulnerability Audit

## When to Use

- User says "/security-review", "security review", "audit for security", "check for vulnerabilities", "OWASP review"
- After implementing auth, payment, file-upload, deserialization, dynamic-code, or external-integration code
- Before merging high-risk PRs (auth, billing, admin endpoints, public APIs)

## Scope

Diff-based by default. Full-codebase only on explicit user request (`/security-review --full` or "audit the whole codebase").

## Workflow

```
1. git status + git diff                              -> identify changed files
2. Read CLAUDE.md "Architecture Principles" + env vars -> understand trust boundaries
3. (If GitNexus available) gitnexus_impact on changed auth/input symbols
4. Read every changed file completely
5. Evaluate against the OWASP-focused checklist below
6. Run security-relevant automated checks (see Tooling)
7. Fix findings inline (prefer over defer; security debt compounds)
8. Output standard Security Review Results table
9. For NOT-fixed findings -> BACKLOG.md with explicit Sev: P0/P1
```

## Checklist — OWASP Top 10 + Common Pitfalls

### A01 Broken Access Control

- [ ] Every write/delete endpoint checks ownership / role
- [ ] No `IDOR` — direct object refs in URLs validated against caller
- [ ] No "security through obscurity" — hidden routes still authenticated
- [ ] Admin functionality gated by explicit role check, not just hidden UI

### A02 Cryptographic Failures

- [ ] Secrets not in source / not in commits / not in logs
- [ ] No DIY crypto — use platform/library primitives
- [ ] TLS for all external traffic; HSTS where applicable
- [ ] Password storage: argon2 / scrypt / bcrypt with appropriate cost; never MD5/SHA1
- [ ] No predictable IDs for security-sensitive resources (use UUIDv4 / ULID)

### A03 Injection

- [ ] SQL: parameterized queries / ORM with bound params; never string concat
- [ ] OS: no `shell=True` / unescaped `exec` / template-injected commands
- [ ] LDAP / NoSQL / GraphQL: equivalent param-binding patterns
- [ ] HTML: contextual escaping; no `dangerouslySetInnerHTML` with user input
- [ ] Template engines run with autoescape ON

### A04 Insecure Design

- [ ] Auth flow has rate limiting on login / password-reset / 2FA verify
- [ ] Account-enumeration paths return same response for valid/invalid users
- [ ] Sensitive operations require recent re-auth (step-up)

### A05 Security Misconfiguration

- [ ] No debug mode / stack traces in production responses
- [ ] CORS allowlist explicit; no `*` for credentialed requests
- [ ] HTTP security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- [ ] Default credentials changed; no test accounts in prod config

### A06 Vulnerable Components

- [ ] Dep audit run (`npm audit` / `pip-audit` / `cargo audit` / etc.) — no high/critical
- [ ] No deps from unverified sources / typosquats
- [ ] Lock files committed; reproducible installs

### A07 Identification & Auth Failures

- [ ] Session tokens: cryptographically random, rotated on privilege change
- [ ] Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax|Strict`
- [ ] No JWT secrets in client bundle; algorithm pinned (no `none`)
- [ ] Logout invalidates server-side session (not just deletes cookie)

### A08 Software & Data Integrity Failures

- [ ] Deserialization of user input uses safe formats (no `pickle` / `unserialize` of user data)
- [ ] CI/CD pipeline can't be triggered to publish from forks without review
- [ ] Subresource Integrity (SRI) on third-party scripts

### A09 Security Logging & Monitoring

- [ ] Auth failures logged with enough context to detect brute force
- [ ] PII / secrets NOT logged in plaintext
- [ ] Log forwarding has auth (no open Elasticsearch / Loki)

### A10 SSRF

- [ ] Outbound requests from server use allowlist for hosts/IPs
- [ ] No fetching arbitrary URLs supplied by user
- [ ] Cloud metadata endpoint (169.254.169.254) blocked from app egress where not needed

### Project-Specific

- [ ] No prompt injection sinks if app uses LLMs (validate user content before passing to model context)
- [ ] No insecure deserialization in queue payloads
- [ ] File upload: type allowlist, size limit, scanned, served from non-executable origin

## Tooling (run if available, never gate on availability)

| Tool                                                                           | Command                              | What it catches                    |
| ------------------------------------------------------------------------------ | ------------------------------------ | ---------------------------------- |
| `gitleaks` / `trufflehog`                                                      | `gitleaks detect --source .`         | Committed secrets                  |
| `npm audit` / `pip-audit` / `cargo audit` / `bundler-audit` / `composer audit` | per language                         | Vulnerable deps                    |
| `semgrep`                                                                      | `semgrep --config auto`              | Pattern-based code vulnerabilities |
| Language-specific SAST                                                         | bandit / brakeman / phpstan-security | Per-language SAST                  |

If a tool isn't available locally -> note in report, do NOT block the review.

## Severity & Fixing Rules

- **All security findings default to P0 or P1.** P2 only for clearly informational items.
- **Never defer a P0** without explicit user override + BACKLOG entry naming the user as the deferring party.
- **Fix inline** — security tech debt compounds.

## Report

```
### Security Review Results

| # | OWASP / Area | Sev | Status | Finding | Action |
|---|--------------|-----|--------|---------|--------|
| 1 | A03 Injection | P0 | Fixed | Unparameterized SQL in users.search() | Switched to bound params |
| ... |

Tools run: <list>
Summary: X findings | Y fixed | Z deferred (with explicit user override) -> Backlog
```

Footer:

```
security-review skill -- independent of generic /review
```

## Rules

- **Do not run automatically.** On-demand only.
- **Do not skip OWASP categories** even if "looks fine" — checklist coverage > intuition.
- **Do not silently lower severity.** If unsure, default to higher.
- **Do not commit fixes without re-running the affected tests** (autonomy + zero-cost rule still applies).
