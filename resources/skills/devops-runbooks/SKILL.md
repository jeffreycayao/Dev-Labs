---
name: devops-runbooks
description: Keep builds, CI, releases and environments healthy — diagnose a failing pipeline, speed up a slow build, write a runbook, review a Dockerfile or workflow, plan a safe deploy or rollback. Use for CI/CD, GitHub Actions, Docker, release, deploy, infra, environment variables, secrets handling, or "the build is red". Never touches production or real secrets without explicit approval.
---

# DevOps runbooks

Written for DevLabs by its maintainers. A DevOps change is a *reviewed,
reversible* change with a runbook next to it. Speed comes from fewer surprises,
not from skipping checks.

## Ground rules

1. **No production, no secrets, no money without a human's explicit yes** in
   this session. Staging and local are yours; anything that bills, deletes
   data or faces customers is not.
2. Read before you change: the workflow file, the Dockerfile, the release
   script, the last three failed runs' logs. Most "flaky CI" is one real bug.
3. Every change ships with: what changed, why, how to verify, how to roll back.
4. Secrets live in the platform's secret store (GitHub Actions secrets,
   Electron `safeStorage`, a vault), never in files, logs, build args or
   `echo`. Mask them in logs; fail the build on a leaked pattern.
5. Pin what you depend on: action SHAs or tags, base images by digest,
   Node/Python versions, package lockfiles. "latest" is an incident waiting.

## Diagnosing a red build (in this order)

1. Did it fail the same way twice? One failure is weather; two is a bug.
2. Read the first error, not the last. Scroll up past the cascade.
3. Reproduce locally with the same command CI runs (`npm ci`, not `npm i`;
   same Node version; clean checkout).
4. Diff against the last green run: commits, dependency updates, runner image.
5. Fix the cause. Only retry/skip/`continue-on-error` with a written reason
   and a ticket.

Checklist and common causes: [references/ci-checklist.md](references/ci-checklist.md).

## Speeding up builds

- Cache dependencies by lockfile hash; cache build outputs by input hash.
- Parallelise independent jobs; fail fast on lint/typecheck before long tests.
- Shard test suites; run the slow ones only on `main` and nightly.
- Measure before/after (job durations) and record it in the PR.

## Releases

- Version bump, changelog, tag and artifacts come from one script, run one
  way. For this repo: `AGENTS.md` and `RELEASE.md` define it
  (`npm run version:patch|minor|major`, commit `package.json` + lockfile, never
  bump or push as a side effect of another task).
- Build artifacts are reproducible from a tag; keep them for rollback.
- Rollback plan written *before* the deploy: previous artifact, data migration
  reversibility, who flips it.

Runbook template: [references/runbook-template.md](references/runbook-template.md).

## Containers (when the project has them)

- Multi-stage builds; non-root user; `.dockerignore`; pinned base image by
  digest; no secrets in layers; `HEALTHCHECK`.
- Scan images (Trivy/Grype) in CI; fail on critical with a fix available.

## Environments & config

- Twelve-factor: config from environment, one `.env.example` with every key
  and a comment, no real values committed.
- Separate dev/staging/prod credentials; least privilege per environment.

## Hand-off

Report: what was wrong, what changed (files), how you verified (command +
result), how to roll back, what you did not touch and why.
