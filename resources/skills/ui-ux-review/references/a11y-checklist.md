# Accessibility checklist (WCAG 2.2 AA, practical subset)

Tick each; note the file where it fails.

## Keyboard
- [ ] Every interactive element reachable with Tab in a sensible order.
- [ ] Enter/Space activate buttons; Esc closes dialogs and menus.
- [ ] Focus is visible (the shared focus ring, ≥ 3:1 against neighbours).
- [ ] Focus moves into a dialog on open and returns on close; no focus traps.
- [ ] Custom widgets (tabs, sliders, menus) follow WAI-ARIA Authoring Practices roles and arrow-key behaviour.

## Labels & semantics
- [ ] Inputs have a `<label>` or `aria-label`; icon-only buttons have `aria-label` or `title` + visually hidden text.
- [ ] Headings nest in order; landmarks (`main`, `nav`, `dialog`) exist.
- [ ] Status messages use `role="status"`/`aria-live="polite"`; errors `role="alert"`.
- [ ] Images: `alt` that says what it is for, or `alt=""` when decorative.
- [ ] Switches expose state (`role="switch"` + `aria-checked`, or a button whose text says on/off).

## Colour & contrast
- [ ] Text ≥ 4.5:1 (large text ≥ 3:1); UI borders/icons ≥ 3:1.
- [ ] Meaning never by colour alone (add an icon or word).
- [ ] Dark/light themes both pass; check `--cth-*` token pairs, not raw hex.

## Motion & time
- [ ] `prefers-reduced-motion` turns off non-essential animation (3D showcase, chatter bubbles fading is fine).
- [ ] Nothing flashes more than 3 times per second.
- [ ] Auto-dismissing toasts stay ≥ 5 s or can be paused.

## Layout & text
- [ ] Zoom to 200% / larger system font: no clipping, no horizontal scroll in panels.
- [ ] RTL (Arabic): layout mirrors, icons with direction flip, numbers stay LTR.
- [ ] Touch/click targets ≥ 24×24 CSS px (44 for primary mobile actions).
- [ ] Long names truncate with a tooltip, never overflow.

## Forms
- [ ] Errors next to the field, in words, and announced.
- [ ] Required fields marked in text, not only with colour or `*`.
- [ ] Saving never loses typed text on failure.

## Tools
- Browser devtools accessibility tree; axe DevTools; Lighthouse a11y audit.
- Manual: unplug the mouse for five minutes; use the OS screen reader on one flow.
