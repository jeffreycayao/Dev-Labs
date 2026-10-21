#!/usr/bin/env node
'use strict';

// The release body, built from the short notes that ship in latest*.yml and the matching CHANGELOG.md section.
const fs = require('node:fs');
const path = require('node:path');

function extractSection(changelog, tag) {
  const version = tag.replace(/^v/, '');
  const candidates = [version];
  if (version.includes('-')) candidates.push(version.split('-')[0]);
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    candidates.some((v) => line === `## v${v}` || line.startsWith(`## v${v} — `)));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('## ')) end++;
  return lines.slice(start, end).join('\n').trim();
}

function renderReleaseBody(tag, version, highlights, changelog) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }
  const taggedVersion = tag.slice(1);
  if (taggedVersion !== version && !taggedVersion.startsWith(`${version}-`)) {
    throw new Error(`Release tag ${tag} does not match package.json ${version}`);
  }
  const notes = highlights.trim();
  if (!notes) throw new Error('build/release-notes.md is empty');
  const section = extractSection(changelog, tag);
  if (!section && !taggedVersion.includes('-')) {
    throw new Error(`CHANGELOG.md has no section for ${tag}`);
  }
  return `# Jepoy Floor AI ${tag}\n\n## Highlights\n\n${notes}\n${section ? `\n${section}\n` : ''}`;
}

if (require.main === module) {
  try {
    const [tag, output] = process.argv.slice(2);
    if (!tag || !output) throw new Error('Usage: render-release-body.cjs vX.Y.Z output.md');
    const root = path.resolve(__dirname, '..');
    const version = require(path.join(root, 'package.json')).version;
    const highlights = fs.readFileSync(path.join(root, 'build/release-notes.md'), 'utf8');
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const body = renderReleaseBody(tag, version, highlights, changelog);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, body, 'utf8');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { extractSection, renderReleaseBody };
