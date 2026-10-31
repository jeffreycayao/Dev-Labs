'use strict';

/**
 * Builds site/features.html (devlabs.atmt.dev/features) from the app's offline
 * feature manual, resources/help/features.html, so the two never drift:
 * edit the manual, then run `node tools/sync-site-features.cjs`.
 * test/help-guide.test.cjs fails when the site copy is out of date.
 *
 * The site's CSP allows no inline styles or scripts, so the page takes the
 * manual's markup only; its look comes from site/assets/site.css and the 3D
 * showcase from site/assets/js/site.js (built in tools/site-bundle).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MANUAL = path.join(ROOT, 'resources', 'help', 'features.html');
const GUIDE = path.join(ROOT, 'site', 'guide.html');
const OUT = path.join(ROOT, 'site', 'features.html');

function between(s, from, to, where) {
  const a = s.indexOf(from);
  const b = s.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`${where}: cannot find ${JSON.stringify(from)} … ${JSON.stringify(to)}`);
  return s.slice(a, b);
}

function render(manual = fs.readFileSync(MANUAL, 'utf8'), guide = fs.readFileSync(GUIDE, 'utf8')) {
  // The guide supplies the site shell (head, nav, footer) so all pages match.
  const head = guide.slice(0, guide.indexOf('<main'))
    .replace(/<title>[^<]*<\/title>/, '<title>Features · DevLabs</title>')
    .replace(/(<meta name="description" content=")[^"]*/, '$1Every DevLabs feature in plain words: what it is, why you would use it and how to turn it on, plus how DevLabs compares to running an AI coding tool on its own.')
    .replace(/(<meta property="og:title" content=")[^"]*/, '$1Features · DevLabs')
    .replace(/(<meta property="og:url" content=")[^"]*/, '$1https://devlabs.atmt.dev/features')
    .replace(/(<link rel="canonical" href=")[^"]*/, '$1https://devlabs.atmt.dev/features');
  const foot = guide.slice(guide.indexOf('</main>'));

  const showcase = between(manual, '<section class="teamsim"', '<!-- ─', 'showcase').trimEnd();
  // From the comparison through the reference table; the manual's search
  // "nothing matched" line and its app-only links stay behind.
  const body = between(manual, '<h2 id="compare">', '<p class="empty"', 'content').trimEnd();
  const toc = [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)]
    .map(([, id, text]) => `        <li><a href="#${id}">${text}</a></li>`).join('\n');

  return `${head}<main class="page">
  <article class="wrap doc features">
    <div class="eyebrow"><span class="dot"></span>Features</div>
    <h1>What DevLabs can do</h1>
    <p class="lead"><strong>Every feature in plain words: what it is, why you'd use it, and how to turn it on.</strong></p>
    <p>DevLabs runs the AI coding tools you already use (Claude Code, Codex, Gemini and more) as a team in a 3D office on your computer. Below, see the difference, compare it with running one AI tool on its own, then find any feature. The same manual is inside the app under <strong>Help → Feature Manual</strong>.</p>

    ${showcase.replace(/\n/g, '\n    ')}

    <nav class="toc" aria-label="Contents">
      <h4>Contents</h4>
      <ol>
${toc}
      </ol>
    </nav>

${body}
  </article>
${foot}`;
}

if (require.main === module) {
  fs.writeFileSync(OUT, render());
  console.log(`[site] wrote ${path.relative(ROOT, OUT)}`);
}

module.exports = { render, OUT };
