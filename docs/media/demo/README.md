# Demo videos — hero tab switcher (docs/index.html)

The landing page's multi-section demo (below the hero text) is a sliding tab switcher
with five narrated videos, click-to-play with sound. Files live in THIS folder:

| Tab | Video | Poster | Source recording |
|-----|-------|--------|------------------|
| Introduction | `intro.mp4` | `intro-poster.jpg` | `../MunderDifflin001.mp4` |
| Setup & installation | `setup.mp4` | `setup-poster.jpg` | `../MunderDifflin002.mp4` |
| Adding new agents | `agents.mp4` | `agents-poster.jpg` | `../MunderDifflin003.mp4` |
| Talking to the orchestrator | `orchestrator.mp4` | `orchestrator-poster.jpg` | `../MunderDifflin004.mp4` |
| Other features & configs | `features.mp4` | `features-poster.jpg` | `../MunderDifflin005.mp4` |

## Updating a video

Re-encode the new recording with faststart (required — without it the browser
downloads the ENTIRE file before playback starts) and moderate CRF:

```sh
ffmpeg -i NewRecording.mov \
  -vf "scale='min(1440,iw)':-2" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart \
  docs/media/demo/<name>.mp4

# refresh the poster (frame at 1.5s)
ffmpeg -y -ss 1.5 -i docs/media/demo/<name>.mp4 -frames:v 1 -q:v 4 docs/media/demo/<name>-poster.jpg
```

Then update the duration badge (`<span class="dur">`) for that panel in
`docs/index.html` if the length changed.

Notes:
- Target 16:10-ish, ≤1440px wide. CRF 26 keeps screen-recording text crisp at ~1/6
  the size of a raw recording (the five originals were 88 MB; these are ~17 MB total).
- Do NOT commit the raw `MunderDifflin00*.mp4` originals — they're gitignored so the
  repo and the deployed GitHub Pages site stay small.
- Loading strategy (in index.html): every `<video>` is `preload="none"` with a poster;
  the active tab lazily attaches `src` and fetches metadata only. Bytes stream on play.
