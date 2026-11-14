# CI checklist and common causes

## Workflow hygiene (GitHub Actions and similar)
- [ ] `permissions:` set to the minimum (`contents: read` by default).
- [ ] Third-party actions pinned to a full commit SHA with a version comment.
- [ ] `concurrency:` cancels superseded runs on the same branch.
- [ ] `timeout-minutes` on every job.
- [ ] Secrets only via `${{ secrets.X }}`; never interpolated into `run:` strings that are logged; never passed to forks' PRs.
- [ ] `pull_request_target` avoided unless you know exactly why.
- [ ] Caches keyed by lockfile hash (`hashFiles('**/package-lock.json')`).
- [ ] Matrix covers the OSes you ship (this app: Windows, macOS, Linux build).
- [ ] Artifacts uploaded with a retention period; release assets signed where the platform supports it.

## Common red-build causes
| Symptom | Usual cause | Check |
|---|---|---|
| Works locally, fails in CI | different Node/Python version; `npm i` vs `npm ci`; case-sensitive paths on Linux | `.nvmrc`/`engines`, lockfile drift, file name case |
| Native module build error (node-pty, better-sqlite3) | missing toolchain or Python; Electron ABI mismatch | build tools install step, `electron-rebuild`, matching Electron version |
| Random test failures | shared state, time/timezone, network, port collisions, test order | run the test alone and 20× in a loop; freeze time; use ephemeral ports |
| Timeout | hung process waiting on stdin or a prompt; waiting on a network | `CI=true`, non-interactive flags, `--yes`, timeouts in tests |
| Permission denied / 403 | token scope, `permissions:` block, protected branch | job permissions, which token the step uses |
| Cache restored but still slow | cache key never matches (path or hash wrong) | print the key; check `cache-hit` output |
| Lint/typecheck passes locally | stale local cache or different config resolution | run the exact CI command from a clean clone |

## Before merging a workflow change
- Run it on a branch; link the green run in the PR.
- Diff the job durations against the last run on `main`.
- Confirm no new secret or permission was added without a sentence saying why.
