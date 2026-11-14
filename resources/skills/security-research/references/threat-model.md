# Threat modelling, step by step

## 1. Scope
One paragraph: the system, its users, what is in and out of scope, the date.

## 2. Assets
List what an attacker would want or what the owner cannot afford to lose:
credentials and keys, user data, source and signing keys, money-moving
capabilities, availability, reputation. Rate each: Critical / High / Medium / Low.

## 3. Architecture and trust boundaries
Text diagram of components and the data that crosses each boundary.
A boundary is anywhere the level of trust changes: process ↔ process, app ↔
network, user ↔ app, app ↔ third party, code we wrote ↔ code we download.

```
[User] -> [Renderer (untrusted-ish UI)] -IPC-> [Main process] -spawn-> [Agent CLI]
                                                  |                        |
                                                  +-- loopback broker -> [Vendor MCP]
                                                  +-- userData (keys, config)
[Agent CLI] <-> [Shared hive folder] <-> [Other agents]
[Agent CLI] <-> [Any repo it clones]  (hostile content)
```

## 4. Attackers
For each, their access and goal:
- Remote attacker via content the agent reads (repo, web page, MCP response) → prompt injection, planted files.
- Malicious or compromised dependency → code execution at build/run time.
- Malicious MCP server or vendor compromise → data exfiltration via tool results.
- Local attacker / stolen device → keys at rest, logs.
- Insider / another agent on the floor → impersonation, tampering with shared state.

## 5. Threats per boundary (STRIDE)
For each boundary ask: **S**poofing, **T**ampering, **R**epudiation,
**I**nformation disclosure, **D**enial of service, **E**levation of privilege.
Record: threat → existing mitigation → gap → evidence (file:line, doc).

## 6. Rank
Likelihood (H/M/L: how easy, how exposed) × Impact (H/M/L: asset rating).
H×H first. Keep "accepted" risks in the document with who accepted and when.

## 7. Recommendations
For each top gap: the smallest effective mitigation, owner, effort (S/M/L),
and how to verify it later.

## 8. Maintenance
Re-run on: new boundary (new connector, new IPC surface), new attacker class,
a real incident, or every release cycle. Diff against the previous version.
