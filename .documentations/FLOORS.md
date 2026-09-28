# Floors — import and export a whole team

A **floor** is a team of agents in one file (`*.floor.json`). Share it, and anyone can hire the same team in one click.

- **Spec and validator:** `src/shared/floor.ts`
- **Example:** [`floors/online-seller-team.floor.json`](floors/online-seller-team.floor.json)

## Import a floor

| From | How |
|---|---|
| A file | **add agent** → **import floor…** → pick the `.floor.json` |
| A link | Open `atmtlabs://floor?src=https://…/team.floor.json` (the file must be served over https) |

The review screen lists every agent with its role, goal, engine command, token cap and the connectors it uses. Nothing starts until you choose:

| Button | What happens |
|---|---|
| **hire all (N)** | Hires every agent into the project folder you picked, one after another. A failed hire doesn't stop the rest. Press **retry failed** to try again. |
| **review one by one** | Opens each agent in the Add-Agent form, where you can change it, spawn it or skip it. |
| **cancel** | Nothing is hired. |

**Connectors are never turned on by a floor.** If the team needs Pancake POS or Webcake, the review screen tells you. Add your key and switch them on in Settings → Connections **before** hiring; agents only pick up connectors when they start. See [CONNECTORS.md](CONNECTORS.md).

## Export your floor

**add agent** → **export floor…** → name it → **save file…**

| Exported | Never exported |
|---|---|
| Name, role, goal, character, color | Folders, worktrees, session ids |
| Engine and model | Keys and tokens |
| Git isolation on/off, token cap | Memory, messages, history |
| Safe command flags (`--max-turns`, `--output-format`, `--verbose`) | Any other command flag |
| Connectors you have switched on (ids only, optional) | The orchestrator and assistant (every floor already has them) |

Agents the importer would reject (for example, an unsupported engine) are listed as **Skipped** with the reason, not silently dropped.

## Reset and back up the live floor

**Settings → General → reset floor** opens a confirmation with **back up ZIP & reset**, **reset without backup** and **cancel**. This is a live floor reset, separate from the shareable `.floor.json` export and the app's **reset & start over** action. It clears the roster, hive and semantic-memory palace across all floor windows while keeping account/license state and app settings, including schedules and per-agent limits. Project repositories and worktrees outside the home folder are not deleted.

The ZIP backup includes `floor/hive`, `floor/palace`, `floor/roster.json`, `floor/roster-backups` and matching Claude Code session transcripts under `claude-projects/`. It contains `floor-backup.json` and `RESTORE.txt`. Generated Codex auth/config links and package installs are excluded; Codex session data inside the hive is included. A ZIP may contain private conversations, agent memory and task content, so store it securely. The app stops floor writers, creates the archive, then reads every ZIP entry to verify it before removing the floor. If the picker is cancelled or backup fails, no floor data is removed.

To restore: quit ATMT Labs; extract the ZIP's `floor/` contents into the original home folder listed in `floor-backup.json`, and extract `claude-projects/` into `~/.claude/projects/`; then start the app. Restore into an empty floor and keep the ZIP until you have confirmed the roster and conversations. External project source folders and account credentials are not part of the backup.

## File format (`atmt-labs/floor@1`)

```json
{
  "spec": "atmt-labs/floor@1",
  "name": "Online Seller Team",
  "description": "optional, up to 500 chars",
  "author": "optional",
  "homepage": "https://… (optional, https only)",
  "connectors": ["pancake-pos", "webcake-landing"],
  "hires": [
    {
      "name": "Maricel - Shop Manager",
      "description": "one-line role",
      "goal": "standing directive",
      "character": "pam",
      "accent": "mint",
      "provider": "claude",
      "tokenCap": 1500000,
      "mcpServers": ["pancake-pos"]
    }
  ]
}
```

Each entry in `hires` is a normal hire manifest (`atmt-labs/hire@1`). Inside a floor its `spec` line is optional.

## Rules

The app enforces these; a file that breaks one is rejected with a message saying which agent and why.

- **Size:** up to 24 agents, 256 KB per file.
- **Names:** agent names must be unique (case doesn't matter).
- **No commands:** a floor can't name a program or shell command. The app builds each command from your own engine settings plus the safe flags above.
- **Connectors:** ids must come from the built-in catalog (at most 12). They are shown to you, never switched on.
- **Links:** https only. Plain http works only for `localhost`/`127.0.0.1` while developing. Redirects to http are refused.
- **Mixed-engine teams:** fine. An agent with no `provider` uses your default engine.

## Known limits

- Per-agent connector lists (`mcpServers`) are shown at import, but the app doesn't store them per agent yet, so export carries connectors at floor level only.
- Connectors reach Claude Code agents only, for now (see CONNECTORS.md).
