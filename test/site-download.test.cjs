'use strict';

// site/api/download.js: /download/:os on labs.atmt.dev redirects to that
// platform's installer in the latest public release.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const download = require(path.join(root, 'site/api/download.js'));
const { pickAsset, PLATFORMS, REPO } = download;

const asset = (name) => ({ name, browser_download_url: `https://github.com/${REPO}/releases/download/v9.9.9/${name}` });
const RELEASE = {
  tag_name: 'v9.9.9',
  assets: [
    'ATMT-Labs-9.9.9-mac-universal.dmg.blockmap',
    'ATMT-Labs-9.9.9-mac-universal.dmg',
    'ATMT-Labs-9.9.9-mac-universal.zip',
    'ATMT-Labs-9.9.9-win-x64-setup.exe.blockmap',
    'ATMT-Labs-9.9.9-win-x64-setup.exe',
    'ATMT-Labs-9.9.9-win-x64-portable.exe',
    'ATMT-Labs-9.9.9-linux-x86_64.AppImage',
    'latest.yml',
    'latest-mac.yml',
    'SHA256SUMS-mac.txt'
  ].map(asset)
};

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ?? ''; }
  };
}

async function call(os, fetchImpl) {
  const saved = global.fetch;
  global.fetch = fetchImpl;
  try {
    const res = fakeRes();
    await download({ url: `/api/download?os=${encodeURIComponent(os)}` }, res);
    return res;
  } finally {
    global.fetch = saved;
  }
}

const okFetch = (release) => async () => ({ ok: true, status: 200, json: async () => release });

test('picks the installer for each platform and skips blockmaps and metadata', () => {
  const want = {
    mac: 'ATMT-Labs-9.9.9-mac-universal.dmg',
    'mac-zip': 'ATMT-Labs-9.9.9-mac-universal.zip',
    windows: 'ATMT-Labs-9.9.9-win-x64-setup.exe',
    'windows-portable': 'ATMT-Labs-9.9.9-win-x64-portable.exe',
    linux: 'ATMT-Labs-9.9.9-linux-x86_64.AppImage'
  };
  assert.deepEqual(Object.keys(PLATFORMS).sort(), Object.keys(want).sort());
  for (const [os, name] of Object.entries(want)) {
    assert.equal(pickAsset(RELEASE, os), asset(name).browser_download_url, os);
  }
  assert.equal(pickAsset(RELEASE, 'solaris'), null);
  assert.equal(pickAsset({}, 'mac'), null);
  assert.equal(pickAsset({ assets: [asset('latest.yml')] }, 'mac'), null);
});

test('patterns match the artifact names electron-builder produces', () => {
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  const names = [...yml.matchAll(/artifactName:\s*(\S+)/g)].map((m) => m[1]);
  const render = (tpl, ext, arch) => tpl
    .replace('${version}', '1.2.3').replace('${arch}', arch).replace('${ext}', ext);
  const mac = names.find((n) => n.includes('-mac-'));
  const setup = names.find((n) => n.includes('setup'));
  const portable = names.find((n) => n.includes('portable'));
  const linux = names.find((n) => n.includes('linux'));
  assert.ok(mac && setup && portable && linux, 'artifactName entries missing from electron-builder.yml');
  assert.match(render(mac, 'dmg', 'universal'), PLATFORMS.mac);
  assert.match(render(mac, 'zip', 'universal'), PLATFORMS['mac-zip']);
  assert.match(render(setup, 'exe', 'x64'), PLATFORMS.windows);
  assert.match(render(portable, 'exe', 'x64'), PLATFORMS['windows-portable']);
  assert.match(render(linux, 'AppImage', 'x64'), PLATFORMS.linux);
});

test('points at the same public repo as the app updater', () => {
  const brand = fs.readFileSync(path.join(root, 'src/shared/brand.ts'), 'utf8');
  assert.match(brand, new RegExp(`GITHUB_REPO = '${REPO}'`));
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  const [owner, repo] = REPO.split('/');
  assert.match(yml, new RegExp(`owner: ${owner}\\s+repo: ${repo}`));
});

test('redirects to the latest installer, cached at the CDN', async () => {
  const res = await call('windows', okFetch(RELEASE));
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, asset('ATMT-Labs-9.9.9-win-x64-setup.exe').browser_download_url);
  assert.match(res.headers['cache-control'], /s-maxage=300/);
});

test('falls back to the releases page when GitHub fails or the file is missing', async () => {
  const errors = console.error;
  console.error = () => {};
  try {
    for (const f of [
      async () => { throw new Error('network down'); },
      async () => ({ ok: false, status: 404, json: async () => ({}) }),
      okFetch({ assets: [asset('latest.yml')] })
    ]) {
      const res = await call('linux', f);
      assert.equal(res.statusCode, 302);
      assert.equal(res.headers.location, `https://github.com/${REPO}/releases/latest`);
      assert.match(res.headers['cache-control'], /s-maxage=60/);
    }
  } finally {
    console.error = errors;
  }
});

test('unknown platform is a 404 and never calls GitHub', async () => {
  let called = false;
  const res = await call('__proto__', async () => { called = true; return okFetch(RELEASE)(); });
  assert.equal(res.statusCode, 404);
  assert.equal(called, false);
});

test('vercel.json routes every platform to the function', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'site/vercel.json'), 'utf8'));
  const rule = (cfg.rewrites || []).find((r) => r.destination.startsWith('/api/download'));
  assert.ok(rule, 'missing /download rewrite');
  for (const os of Object.keys(PLATFORMS)) assert.ok(rule.source.includes(os), os);
});
