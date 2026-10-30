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
