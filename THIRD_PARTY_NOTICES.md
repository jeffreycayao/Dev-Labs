# Third-Party Notices

DevLabs is open-source software released under the MIT License (see LICENSE).
It incorporates third-party components that are licensed under their own terms, reproduced
below as those licenses require.

---

## Original application — Munder Difflin by Chaitanya Giri (MIT License)

DevLabs is a fork of **Munder Difflin** (https://github.com/chaitanyagiri/munder-difflin,
https://munderdiffl.in/), the open-source multi-agent desktop harness created by
**Chaitanya Giri**. Thank you, Chaitanya. It is used under the following license:

```
MIT License

Copyright (c) 2026 Chaitanya Giri

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3D office — Claw3D by Luke The Dev (MIT License)

The 3D office (src/renderer/src/features/retro-office, src/renderer/src/lib/avatars/profile.ts
and the furniture models in src/renderer/public/office-assets) is ported from **Claw3D**.
The furniture `.glb` models appear to come from Kenney's Furniture Kit (CC0), and 3D labels
use Kenney's `kenpixel.ttf` font (CC0), bundled with three.js. Claw3D is used under the
following license:

```
MIT License

Copyright (c) 2026 Luke The Dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Online services used by optional office features

The jukebox uses the Spotify Web API and is subject to the Spotify Developer Terms; Spotify content and trademarks belong to Spotify. Spoken replies use the ElevenLabs API. The Fireflies.ai connector uses Fireflies' hosted MCP server under Fireflies' terms. None is bundled; each runs only after you connect your own account.

---

## Git tools (used, not bundled)

DevLabs runs **Git** (https://git-scm.com/, GPL-2.0, by Linus Torvalds, Junio C Hamano and the
Git community), **Git for Windows** (https://gitforwindows.org/), **Git LFS**
(https://git-lfs.com/, MIT) and the **GitHub CLI** (https://cli.github.com/, MIT) from the copies
installed on your computer. DevLabs does not ship, modify or link any of them, so their licenses
are not reproduced here.

---

## Brand colors

The DevLabs brand colors are by **Vee Trimidal** (https://www.facebook.com/veetrimidal).

---

## Pixel-art assets — LimeZu

Office tilesets and interiors: "Modern Interiors - RPG Tileset [16X16]" by LimeZu
(https://limezu.itch.io/), used under the LimeZu license, which permits commercial use
with credit. See LICENSE-ASSETS.

---

## Bundled agent skills

These skills are copied unmodified, at the commits pinned in `tools/third-party-skills.json`,
into `resources/skills/` and given to every agent. Each skill folder carries its project's
full license text in a `LICENSE` file.

- **skill-inspector** from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
  Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES, Apache License 2.0.
- **ponytail**, **ponytail-audit**, **ponytail-debt**, **ponytail-gain**, **ponytail-help**,
  **ponytail-review** from ponytail (https://github.com/DietrichGebert/ponytail),
  Copyright (c) 2026 DietrichGebert, MIT License.
- **security-audit** from Cloudflare security-audit-skill
  (https://github.com/cloudflare/security-audit-skill), Copyright (c) 2025-2026 Cloudflare, Inc.,
  MIT License.

---

## Other open-source components

DevLabs is built with Electron, React, PixiJS, xterm.js, node-pty, better-sqlite3 and
other open-source packages. Each is distributed under its own license (MIT, Apache-2.0,
BSD or similar), included with the package in the application bundle.
