---
name: ui-ux-review
description: Review a screen, flow or component for usability, consistency and accessibility, and propose the smallest fixes. Use when a task says UI, UX, design review, "does this look right", accessibility, a11y, contrast, keyboard, empty state, onboarding, or "make it easier to use". Review and recommend first; change only what is approved.
---

# UI/UX review

Written for DevLabs by its maintainers. A review is a ranked list of problems
a real user would hit, each with the smallest fix. It is not a redesign.

## Before you look

1. Who uses this screen and what are they trying to finish? Write it in one
   line. (DevLabs: a business owner or developer running AI agents; many are
   not engineers. Plain words beat jargon.)
2. Read the app's design rules first: in this repo `DESIGN.md`, the
   `--cth-*` tokens, `PixelButton`/`PixelPanel`, and the i18n rule (every
   string in `en`, `zh-CN`, `ar`; RTL must work).
3. Open the real screen (dev build, screenshot or the component story). Do not
   review from code alone when you can see it.

## The pass, in order

1. **Can I tell what this is and what to do first?** Title, primary action,
   one obvious next step. Dead ends and "now what?" moments go first in the list.
2. **States**: empty, loading, error, partial, success, disabled, offline.
   Each needs words that say what happened and what to do next.
3. **Consistency**: same words for the same thing across screens, same button
   order (primary right/last), same spacing scale and tokens, same capitalisation
   as the rest of the app.
4. **Hierarchy & density**: one visual level per importance; nothing competes
   with the primary action; long screens have sections with headings.
5. **Copy**: short, specific, no blame ("Couldn't save. Check the folder is
   writable." not "Error 13"). Buttons name the result ("Save key", not "OK").
6. **Accessibility** (see [references/a11y-checklist.md](references/a11y-checklist.md)):
   keyboard reach and order, visible focus, labels for inputs and icon buttons,
   contrast ≥ 4.5:1 for text, no colour-only meaning, reduced-motion respected,
   RTL mirrors layout, text resizes without clipping.
7. **Performance as UX**: anything over ~300 ms needs feedback; anything over
   ~2 s needs progress or a way out.
8. **Destructive actions**: confirm with the consequence named; prefer undo.

## Report format

Ranked, each item 2–3 lines:

```
1. [High] Settings → Connections: the key field has no label, screen readers say "edit text".
   Who it hurts: anyone with a screen reader; also keyboard users (no focus ring).
   Fix: aria-label from the connector label; add the shared focus style. (2 lines, McpDefaultsSettings.tsx)
```

Severity: **High** blocks or misleads; **Medium** slows or confuses;
**Low** polish. Finish with "What I would not change" (two lines) so the team
knows what already works.

## Implementing fixes

- Only the approved items. Smallest diff; reuse existing components and tokens.
- New strings go into all locale files; test RTL if layout changed.
- Before/after screenshots in the hand-off.

## Anti-patterns

- Rewriting the visual language ("let's go glassmorphism").
- Adding a library for one component.
- Fixing colours by hand instead of using tokens.
- Reporting taste ("I'd prefer blue") as a finding.
