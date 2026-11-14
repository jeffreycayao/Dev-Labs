---
name: security-research
description: Security research and reporting, not pen-testing — threat modelling, dependency and advisory (CVE) triage, risk assessment, plain-language risk reports and responsible-disclosure drafts. Use for "threat model this", "does CVE-… affect us", "what are our biggest security risks", "write a security advisory", or any ask to assess and explain security risk. For a code-level vulnerability hunt use the security-audit skill; this one never runs exploits or scanners against live systems.
---

# Security research

Written for DevLabs by its maintainers. The researcher's product is
**understanding, written down**: what we have, who could want it, how they
could get it, how likely and how bad, and what to do first. Finding and
proving a specific bug in code belongs to the `security-audit` skill and the
Security Auditor role; hand confirmed code-level issues over to them.

## Boundaries (non-negotiable)

- Read, reason, write. Do not run exploits, fuzzers, port scanners,
  credential tests or anything against a system you were not handed a written
  scope for in this session. Local, read-only analysis of the repo and its
  dependency metadata is fine.
- Never touch production, customer data or real credentials.
- Never publish a finding outside the team; disclosure goes through the
  owner, following the vendor's policy (see
  [references/disclosure.md](references/disclosure.md)).

## 1. Threat model (start here, keep it current)

Method: [references/threat-model.md](references/threat-model.md). Output a
`THREAT-MODEL.md` (or update the existing one) with:

1. **Assets**: what matters (user keys, agent transcripts, the hive folder,
   update channel, signing keys, money-moving connectors).
2. **Trust boundaries**: renderer ↔ main (IPC), app ↔ agent CLIs, agent ↔
   shared hive folder, app ↔ vendor MCP servers through the broker, app ↔
   update server. Draw the diagram in text.
3. **Attackers & goals**: a malicious repo the agent clones, a prompt-injected
   agent, a compromised npm package, a stolen laptop, a malicious MCP server.
4. **Threats per boundary** (STRIDE as a checklist), each with current
   mitigations and gaps.
5. **Ranked gaps** with likelihood × impact and a recommended next step.

## 2. Dependency and advisory triage

Method: [references/cve-triage.md](references/cve-triage.md). For each
advisory (GitHub Security Advisories, `npm audit`, OSV, vendor notices):

- Is the vulnerable version actually installed (lockfile), and is the
  vulnerable code path reachable in *this* app?
- Preconditions the attacker needs; do they hold here?
- Verdict: **Affected / Not affected / Needs code check**, with the one-line
  reason and the fix (upgrade to X, config change, or accept with rationale).

Write it as a table the team can act on. Do not paste CVE descriptions; say
what it means *here*.

## 3. Risk report

Plain language, for the owner, two pages maximum:

```
# Security risk report — <scope> — <date>
## Summary (3 lines)
## Top risks (ranked)
1. <Risk> — Likelihood: H/M/L · Impact: H/M/L · Why it matters here · Recommended fix · Effort
## Changes since last report
## What we checked and how (so it can be repeated)
## Out of scope / not checked
```

Every risk names a concrete asset and attacker goal; "insecure" alone is
not a finding.

## 4. Advisory / disclosure drafts

When the project itself has a vulnerability to announce, or you found one in
a third party: [references/disclosure.md](references/disclosure.md) has the
templates (internal advisory, vendor report, public changelog line) and the
timeline conventions (coordinated disclosure, typically 90 days).

## Working with the team

- Security Auditor: give them a hypothesis and the code path; they confirm or
  refute in code.
- DevOps: pinning, SBOM, CI permissions, secret scanning.
- Owner: decisions on accepted risk and disclosure. Never decide for them.
