# Release drops

A **drop** is an authored release page — shown centered, at full size, the first
time a user's app sees the release. It replaces the corner toast's three-bullet
digest with whatever you design.

Releases without a drop are unaffected: they still get the digest toast. This is
additive, so no past release changes behaviour.

## Authoring

Put HTML between two markers anywhere in the GitHub release body:

```markdown
## What's new in 0.5.0

Regular markdown, for people reading this on github.com.

<!-- drop -->
<section class="hero">
  <h1>Windows agents can finally talk to each other.</h1>
  <p>Half our downloads. Silently broken. Not any more.</p>
  <video src="https://…/demo.mp4" autoplay muted loop playsinline></video>
</section>
<style>
  .hero { padding: 48px 40px; background: linear-gradient(160deg,#1b1524,#2e2140); color:#f4efe6; }
  .hero h1 { font-size: 2.4rem; letter-spacing:-.02em; }
</style>
<!-- /drop -->
```

Everything between the markers becomes the page. The markdown around it is left
alone, so the github.com release page still reads well.

Both markers must be present and in order. An unbalanced pair is ignored and the
release falls back to the digest — a half-parsed drop would render as broken
markup for every user, so it is treated as no drop at all.

## What you can use

Images, video, audio, web fonts, gradients, transforms, grid, flexbox, keyframe
animations, `prefers-color-scheme`, `prefers-reduced-motion`. Remote assets must
be **https** (or `data:`/`blob:`).

A small token palette is pre-defined — `--ink`, `--ink-soft`, `--paper`,
`--cream`, `--lemon`, `--mint`, `--coral` — so a drop can match the app without
restating its colours. Ignore them entirely for a bespoke look.

## What you cannot use, and why

**No JavaScript. No forms. No working links.**

The drop is remote, author-controlled markup. The renderer it would otherwise
land in has `window.cth` bridged onto it — `spawnPty`, `writeFileText`,
`updateConfig`. Script execution there is not a styling bug, it is arbitrary code
execution on the user's machine with the app's full authority, available to
anyone who can publish a release or intercept the fetch.

So the drop renders inside an iframe with `sandbox=""` (no scripts, no
same-origin, no forms, no popups, no top-level navigation) and its own
`default-src 'none'` CSP. Two independent controls, either sufficient alone.

Because nothing in the frame can navigate, **the modal's own buttons carry every
action** — "open releases", "restart to update", the star link, "later". Design
around them; don't put a call-to-action link in the drop expecting a click to
work.

If a drop ever genuinely needs scripting, the change is `allow-scripts` on the
iframe — and it must **never** be paired with `allow-same-origin`, because that
combination lets the frame remove its own sandbox.

## Previewing before you publish

The update path only runs in packaged builds, so dev has a simulate hook:

```js
await window.cth.updateSimulate({ version: '0.5.0', notes: '<paste the body>' })
```

Run it in DevTools (⌥⌘I → Console). Dev-only — hard-gated on `!app.isPackaged`.

To see the star ask again after it has been spent:

```js
localStorage.removeItem('cth.updateStarAsked')
```

## One thing to know about pre-release tags

`/releases/latest` excludes pre-releases and electron-updater's `latest` channel
skips them, so a `-rc` tag never triggers the toast or the drop for stable users.
Only a plain higher `X.Y.Z` does. Test drops with `updateSimulate`, not by
publishing an rc.
