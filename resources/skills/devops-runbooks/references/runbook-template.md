# Runbook: <operation name>

**Owner:** <team/agent> · **Last verified:** <date> · **Risk:** low / medium / high

## When to run this
One paragraph: the situation that calls for it, and how you recognise it (alert, symptom, schedule).

## Preconditions
- [ ] Access needed (which account/role), and that it is NOT production unless approved by <name>.
- [ ] Backups/snapshots taken: <command or console path>.
- [ ] Nobody else mid-deploy (check <channel/board>).

## Steps
1. `<command>` — what it does, expected output.
2. `<command>` — …
3. Verify: `<command or URL>` shows <expected>.

## Rollback
1. `<command>` restores <previous artifact/version>.
2. Verify the same way as above.
Time to roll back: ~<n> minutes. Data written in between: <kept/lost/migrated how>.

## Known failure modes
| Symptom | Cause | Fix |
|---|---|---|
| … | … | … |

## After
- Record in the change log / board card: what, when, who, outcome.
- If anything surprised you, update this runbook before closing the task.
