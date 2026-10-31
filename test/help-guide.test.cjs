// The offline user guide (Help → How to use) must exist, be packaged, keep its
// 20 FAQs, and read the version from ?v= instead of hard-coding it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'resources/help/index.html'), 'utf8');

test('guide ships its logo and is packaged as an extra resource', () => {
  assert.ok(fs.existsSync(path.join(root, 'resources/help/logo.png')));
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.match(yml, /- from: resources\/help\s+to: help/);
});

test('guide has exactly 20 numbered FAQs', () => {
  const faq = html.slice(html.indexOf('id="faqs"'), html.indexOf('id="empty"'));
  assert.equal((faq.match(/<details>/g) || []).length, 20);
});

test('version comes from the app, not the page', () => {
  assert.match(html, /URLSearchParams\(location\.search\)\.get\('v'\)/);
  assert.doesNotMatch(html, /v0\.\d+\.\d+/);
});

// Help → Feature Manual: a second offline page in the same window.
const manual = fs.readFileSync(path.join(root, 'resources/help/features.html'), 'utf8');

test('feature manual opens from the Help menu and links back to the guide', () => {
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
  assert.match(main, /label: 'Feature Manual', click: \(\) => openHelpWindow\(undefined, 'features\.html'\)/);
  assert.match(html, /href="features\.html"/);
  assert.match(manual, /href="index\.html"/);
});

test('feature manual leads with the comparison to a plain AI tool', () => {
  const firstH2 = /<h2 id="([^"]+)"/.exec(manual);
  assert.equal(firstH2 && firstH2[1], 'compare');
  assert.match(manual, /<h2 id="engines-compare"/);
});

test('every feature manual nav link points at a section that exists', () => {
  const ids = new Set([...manual.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const broken = [...manual.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => !ids.has(id));
  assert.deepEqual(broken, []);
});

test('feature manual reads its version from the app and keeps the guide CSP', () => {
  assert.match(manual, /URLSearchParams\(location\.search\)\.get\('v'\)/);
  assert.match(manual, /Content-Security-Policy" content="default-src 'none'/);
});

test('feature manual runs its 3D showcase from a local file only', () => {
  assert.ok(fs.existsSync(path.join(root, 'resources/help/showcase.js')), 'run `npm run build` in tools/site-bundle');
  assert.match(manual, /<script src="showcase\.js"><\/script>/);
  assert.match(manual, /script-src 'self' 'unsafe-inline'/);
  assert.match(manual, /<section class="teamsim"[^>]*data-caption-plain="[^"]+"[^>]*data-caption-devlabs="[^"]+"/);
});

test('the site features page is the manual, regenerated', () => {
  const { render, OUT } = require('../tools/sync-site-features.cjs');
  assert.equal(fs.readFileSync(OUT, 'utf8'), render(), 'run `node tools/sync-site-features.cjs`');
  // The site CSP allows no inline styles or scripts.
  assert.doesNotMatch(fs.readFileSync(OUT, 'utf8'), /\sstyle="|<style|<script(?![^>]*\ssrc=)/);
});
