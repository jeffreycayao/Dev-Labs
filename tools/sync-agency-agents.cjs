#!/usr/bin/env node
'use strict';
// Vendor the agency-agents roster (github.com/msitarzewski/agency-agents, MIT)
// into resources/agency-agents at the commit pinned in tools/agency-agents.json.
//
//   node tools/sync-agency-agents.cjs
//
// Writes, replacing what was there:
//   resources/agency-agents/<division>/<agent>.md   the persona files, verbatim
//   resources/agency-agents/divisions.json           upstream division labels
//   resources/agency-agents/LICENSE                  upstream MIT text
//   resources/agency-agents/index.json               what the app lists (see shared/agencyAgents.ts)
//
// Only files under a division dir (divisions.json keys) with a `name:` frontmatter
// are agents; READMEs, runbooks and conversion outputs are skipped. Every blob is
// checked against the git blob sha from the pinned tree, so a tampered or
// half-downloaded file never lands.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const pin = require('./agency-agents.json');
const OUT = path.join(__dirname, '..', 'resources', 'agency-agents');
const RAW = `https://raw.githubusercontent.com/${pin.repo}/${pin.commit}/`;
const CONCURRENCY = 8;

async function getText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'devlabs-sync-agency-agents' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function blobSha(text) {
  const buf = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

/** `---\nkey: value\n---` → { key: value }, or null when the file has no frontmatter. */
function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[kv[1]] = v;
  }
  return out;
}

async function main() {
  const tree = JSON.parse(await getText(`https://api.github.com/repos/${pin.repo}/git/trees/${pin.commit}?recursive=1`));
  if (tree.truncated) throw new Error('tree listing truncated; vendor by division instead');
  const divisionsJson = await getText(`${RAW}divisions.json`);
  const divisions = JSON.parse(divisionsJson).divisions;
  const license = await getText(`${RAW}LICENSE`);
  if (!/MIT License/.test(license)) throw new Error('upstream LICENSE is no longer MIT; stop and review');

  const wanted = tree.tree.filter((b) =>
    b.type === 'blob' && /^([a-z-]+)\/[^/]+\.md$/.test(b.path) && divisions[b.path.split('/')[0]]
  );

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const index = [];
  const skipped = [];
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < wanted.length) {
      const b = wanted[i++];
      const md = await getText(RAW + b.path);
      if (blobSha(md) !== b.sha) throw new Error(`sha mismatch for ${b.path}`);
      const fm = frontmatter(md);
      if (!fm || !fm.name) { skipped.push(b.path); continue; }
      const [division, base] = b.path.split('/');
      const file = path.join(OUT, division, base);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, md);
      index.push({
        id: base.replace(/\.md$/, ''),
        division,
        name: fm.name,
        description: fm.description || '',
        emoji: fm.emoji || '',
        vibe: fm.vibe || '',
        file: `${division}/${base}`
      });
    }
  }));

  index.sort((a, b) => a.division.localeCompare(b.division) || a.name.localeCompare(b.name));
  const ids = new Set();
  for (const e of index) {
    if (ids.has(e.id)) throw new Error(`duplicate id ${e.id}`);
    ids.add(e.id);
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ source: pin, agents: index }, null, 1) + '\n');
  fs.writeFileSync(path.join(OUT, 'divisions.json'), divisionsJson);
  fs.writeFileSync(path.join(OUT, 'LICENSE'), license);
  console.log(`agency-agents @ ${pin.commit.slice(0, 7)}: ${index.length} agents in ${new Set(index.map((e) => e.division)).size} divisions`);
  if (skipped.length) console.log(`skipped (no agent frontmatter): ${skipped.join(', ')}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
