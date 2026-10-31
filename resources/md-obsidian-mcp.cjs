'use strict';
/**
 * DevLabs' Obsidian connector: an MCP server over plain files in ONE folder, the
 * vault the user picked in Settings → Connections (env OBSIDIAN_VAULT). Agents
 * save notes, learnings and decisions as Markdown with YAML frontmatter, tags
 * and [[wiki-links]], keep a daily log, read notes back and search them.
 *
 * Safety rules, all enforced here (tested in test/obsidian-connector.test.cjs):
 *   - every path stays inside the vault, symlinks included;
 *   - dot-folders (.obsidian, .trash, .git) are never read or written;
 *   - nothing is ever overwritten or deleted: saving to an existing note appends
 *     an "Update" section, and a new note is created with an exclusive open.
 *
 * Obsidian itself does not need to be running.
 */
const fs = require('node:fs');
const path = require('node:path');

const MAX_READ_BYTES = 256 * 1024;
const MAX_SCAN_FILES = 5000;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A title as a file name Obsidian and every OS accept. */
function safeName(title, what = 'title') {
  const name = String(title ?? '')
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
    .trim();
  if (!name) throw new Error(`${what} is required`);
  return WINDOWS_RESERVED.test(name) ? `_${name}` : name;
}

/** A folder path relative to the vault, each segment made safe; `.`/`..` dropped.
 *  '' = vault root. */
function safeFolder(folder) {
  return String(folder ?? '').split(/[\\/]+/).filter((s) => s.replace(/[.\s]/g, '')).map((s) => safeName(s, 'folder name')).join('/');
}

/** A tag without '#', limited to the characters Obsidian treats as a tag. */
function safeTag(tag) {
  return String(tag ?? '').trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_/-]+/gu, '-').replace(/^-+|-+$/g, '');
}

function isOutside(root, target) {
  const rel = path.relative(root, target);
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

/** Resolve a vault-relative path, refusing anything that would land outside the
 *  vault (traversal, absolute paths, symlinks) or inside a dot-folder. */
function resolveInVault(vault, rel) {
  if (typeof rel !== 'string' || !rel.trim()) throw new Error('path is required');
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new Error('path must be relative to the vault');
  const root = fs.realpathSync(vault);
  const full = path.resolve(root, rel);
  if (isOutside(root, full)) throw new Error('that path is outside the vault');
  if (path.relative(root, full).split(path.sep).some((seg) => seg.startsWith('.'))) {
    throw new Error('hidden folders such as .obsidian are off limits');
  }
  let probe = full;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  if (isOutside(root, fs.realpathSync(probe))) throw new Error('that path is outside the vault');
  return full;
}

function checkVault(vault) {
  if (!vault) throw new Error('No Obsidian vault is set. Choose one in DevLabs: Settings → Connections → Obsidian.');
  let st;
  try { st = fs.statSync(vault); } catch { st = null; }
  if (!st || !st.isDirectory()) throw new Error(`The Obsidian vault folder was not found: ${vault}. Choose it again in Settings → Connections → Obsidian.`);
  return vault;
}

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function frontmatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      if (!v.length) continue;
      lines.push(`${k}:`, ...v.map((x) => `  - ${JSON.stringify(x)}`));
    } else if (v !== undefined && v !== '') {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

/** Tags from a note: frontmatter `tags:` (list or inline) plus inline #tags. */
function noteTags(text) {
  const tags = new Set();
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fm) {
    const block = /^tags:\s*(.*)$((?:\r?\n\s+-\s*.*)*)/m.exec(fm[1]);
    if (block) {
      const inline = block[1].replace(/^\[|\]$/g, '');
      for (const t of inline.split(',')) if (t.trim()) tags.add(safeTag(t.replace(/["']/g, '')));
      for (const m of block[2].matchAll(/-\s*(.+)/g)) tags.add(safeTag(m[1].replace(/["']/g, '')));
    }
  }
  const body = fm ? text.slice(fm[0].length) : text;
  for (const m of body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) if (!/^\d+$/.test(m[1])) tags.add(m[1]);
  tags.delete('');
  return [...tags];
}

const linksLine = (links) => {
  const names = (links ?? []).map((l) => String(l).replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
  return names.length ? `\n\nRelated: ${names.map((n) => `[[${n}]]`).join(' · ')}` : '';
};

/**
 * Save a note. New: frontmatter + heading + body + Related links. Existing: an
 * "Update" section is appended, so earlier content is never lost.
 */
function saveNote(vault, args, now = new Date()) {
  checkVault(vault);
  const title = safeName(args.title);
  const body = String(args.body ?? '').trim();
  if (!body) throw new Error('body is required');
  const folder = safeFolder(args.folder ?? 'DevLabs');
  const rel = folder ? `${folder}/${title}.md` : `${title}.md`;
  const full = resolveInVault(vault, rel);
  const tags = [...new Set(['devlabs', ...(args.tags ?? []).map(safeTag)].filter(Boolean))];
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (fs.existsSync(full)) {
    const extra = tags.length ? `\n\n${tags.map((t) => `#${t}`).join(' ')}` : '';
    fs.appendFileSync(full, `\n\n## Update ${localDate(now)} ${localTime(now)}\n\n${body}${linksLine(args.links)}${extra}\n`);
    return { path: rel, created: false };
  }
  const head = frontmatter({ title: String(args.title).trim(), kind: args.kind || 'note', tags, created: now.toISOString(), source: 'devlabs' });
  fs.writeFileSync(full, `${head}# ${String(args.title).trim()}\n\n${body}${linksLine(args.links)}\n`, { flag: 'wx' });
  return { path: rel, created: true };
}

/** Add a timestamped line to today's daily note, creating it if needed. */
function appendDaily(vault, args, now = new Date()) {
  checkVault(vault);
  const text = String(args.text ?? '').replace(/\s*\n\s*/g, ' ').trim();
  if (!text) throw new Error('text is required');
  const day = localDate(now);
  const folder = safeFolder(args.folder ?? 'Daily');
  const rel = folder ? `${folder}/${day}.md` : `${day}.md`;
  const full = resolveInVault(vault, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (!fs.existsSync(full)) {
    try { fs.writeFileSync(full, `${frontmatter({ date: day, tags: ['daily'], source: 'devlabs' })}# ${day}\n\n`, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  const tags = (args.tags ?? []).map(safeTag).filter(Boolean).map((t) => ` #${t}`).join('');
  fs.appendFileSync(full, `- ${localTime(now)} ${text}${tags}\n`);
  return { path: rel };
}

function readNote(vault, args) {
  checkVault(vault);
  let rel = String(args.path ?? '').trim();
  if (rel && !/\.md$/i.test(rel)) rel += '.md';
  const full = resolveInVault(vault, rel);
  const st = fs.statSync(full);
  if (!st.isFile()) throw new Error('not a note');
  const text = fs.readFileSync(full, 'utf8');
  return st.size > MAX_READ_BYTES ? `${text.slice(0, MAX_READ_BYTES)}\n\n[truncated: the note is larger than ${MAX_READ_BYTES / 1024} KB]` : text;
}

/** Every .md note under `dir`, skipping dot-folders, capped at MAX_SCAN_FILES. */
function listNotes(root, dir = root, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (out.length >= MAX_SCAN_FILES) break;
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listNotes(root, p, out);
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** Notes matching a text query and/or tag, newest first. No query = most recent. */
function searchNotes(vault, args) {
  checkVault(vault);
  const root = fs.realpathSync(vault);
  const start = args.folder ? resolveInVault(vault, safeFolder(args.folder)) : root;
  const q = String(args.query ?? '').trim().toLowerCase();
  const tag = safeTag(args.tag ?? '').toLowerCase();
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  const hits = [];
  for (const file of listNotes(root, start)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const rel = path.relative(root, file).split(path.sep).join('/');
    const tags = noteTags(text);
    if (tag && !tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().startsWith(`${tag}/`))) continue;
    const lower = text.toLowerCase();
    const at = q ? lower.indexOf(q) : 0;
    if (q && at < 0 && !rel.toLowerCase().includes(q)) continue;
    const snippet = text.slice(Math.max(0, at - 80), Math.max(0, at) + 160).replace(/\s+/g, ' ').trim();
    hits.push({ path: rel, title: path.basename(rel, '.md'), tags, modified: fs.statSync(file).mtimeMs, snippet });
  }
  hits.sort((a, b) => b.modified - a.modified);
  return hits.slice(0, limit).map((h) => ({ ...h, modified: new Date(h.modified).toISOString() }));
}

function tools(vault) {
  const str = (description) => ({ type: 'string', description });
  const list = (description) => ({ type: 'array', items: { type: 'string' }, description });
  return [
    {
      name: 'save_note',
      description: 'Save a note to the Obsidian vault as Markdown with frontmatter and tags. Use it for learnings, decisions and anything worth remembering. If a note with that title already exists, the text is appended as an update; nothing is overwritten.',
      inputSchema: {
        type: 'object',
        properties: {
          title: str('Note title; also the file name.'),
          body: str('Markdown content. You can link other notes with [[Note title]].'),
          kind: { type: 'string', enum: ['note', 'learning', 'decision', 'topic'], description: 'What this note is. Default: note.' },
          tags: list('Tags without #, e.g. ["project-x", "bug"]. "devlabs" is always added.'),
          links: list('Titles of related notes; added as [[wiki-links]].'),
          folder: str('Folder inside the vault. Default: DevLabs.')
        },
        required: ['title', 'body']
      },
      run: (a) => saveNote(vault, a)
    },
    {
      name: 'append_daily',
      description: "Add a timestamped line to today's daily note (Daily/YYYY-MM-DD.md), creating it if needed.",
      inputSchema: {
        type: 'object',
        properties: { text: str('One line of text.'), tags: list('Tags without #.'), folder: str('Daily notes folder. Default: Daily.') },
        required: ['text']
      },
      run: (a) => appendDaily(vault, a)
    },
    {
      name: 'read_note',
      description: 'Read a note from the vault by its path relative to the vault (as returned by search_notes).',
      inputSchema: { type: 'object', properties: { path: str('e.g. "DevLabs/Release checklist.md"') }, required: ['path'] },
      run: (a) => readNote(vault, a)
    },
    {
      name: 'search_notes',
      description: 'Find notes by text and/or tag, newest first. With no query or tag, lists the most recently changed notes.',
      inputSchema: {
        type: 'object',
        properties: {
          query: str('Text to look for (case-insensitive).'),
          tag: str('Only notes with this tag (without #).'),
          folder: str('Only search this folder.'),
          limit: { type: 'number', description: 'Max results (1-100, default 20).' }
        }
      },
      run: (a) => searchNotes(vault, a)
    }
  ];
}

module.exports = { safeName, safeFolder, safeTag, resolveInVault, noteTags, saveNote, appendDaily, readNote, searchNotes, tools };

if (require.main === module) {
  require('./md-mcp-stdio.cjs').serve({ name: 'devlabs-obsidian', version: '1.0.0', tools: tools(process.env.OBSIDIAN_VAULT || '') });
}
