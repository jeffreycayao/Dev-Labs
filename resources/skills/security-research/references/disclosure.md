# Responsible disclosure and advisories

## Principles
- Report privately first; give the vendor time to fix (coordinated disclosure, commonly 90 days, shorter if actively exploited, longer by agreement).
- Share only what is needed to reproduce; never share live credentials or customer data.
- The owner decides what is published and when. Draft, do not send.
- Follow the target's own policy (`SECURITY.md`, `/.well-known/security.txt`, bug bounty terms).

## Template: report to a vendor
```
Subject: Security issue in <product> <version>: <one-line summary>

Summary: <what an attacker can do, in one sentence>
Affected: <versions/components>
Impact: <confidentiality / integrity / availability; who is affected>
Preconditions: <what the attacker needs>
Steps to reproduce (safe): <numbered, no live targets>
Suggested fix: <if known>
Disclosure plan: We intend to publish on <date> (90 days) unless you request otherwise.
Contact: <owner's contact, not yours>
```

## Template: internal advisory (for this project)
```
# Advisory <YYYY-NNN>: <title>
Severity: Critical / High / Medium / Low (CVSS vector optional)
Affected versions: <range>  Fixed in: <version>
What happened: <plain words>
Who is affected: <users/configs>
What to do: <upgrade / setting / check>
Credit: <reporter, if they agree>
```

## Template: public changelog line (plain words, how this repo writes them)
`- **Security: <what could happen, in the user's words>.** <what changed>. <what the user should do, if anything>.`

## Timeline conventions
- Day 0: report sent. Acknowledge within 7 days.
- Day 30: status check.
- Day 90: publish (coordinate the date if a fix is close).
- Actively exploited: publish mitigation guidance immediately, details later.
