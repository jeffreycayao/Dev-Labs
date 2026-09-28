// GET /download/:os → 302 to that platform's installer in the latest public
// release. vercel.json rewrites /download/:os here. Nothing is updated on the
// site at release time: publishing a stable release to the public repo is
// enough, and the CDN caches each redirect for a few minutes.
//
// Asset names come from electron-builder.yml (artifactName). If those change,
// update PLATFORMS below; test/site-download.test.cjs checks both stay in sync.

const REPO = 'jeffreycayao/ATMT_LABS_FLOOR-releases';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

const PLATFORMS = {
  mac: /^ATMT-Labs-.+-mac-universal\.dmg$/,
  'mac-zip': /^ATMT-Labs-.+-mac-universal\.zip$/,
  windows: /^ATMT-Labs-.+-win-x64-setup\.exe$/,
  'windows-portable': /^ATMT-Labs-.+-win-x64-portable\.exe$/,
  linux: /^ATMT-Labs-.+-linux-x86_64\.AppImage$/
};

/** The download URL for `os` in a GitHub release object, or null. */
function pickAsset(release, os) {
  const pattern = PLATFORMS[os];
  if (!pattern || !release || !Array.isArray(release.assets)) return null;
  const asset = release.assets.find((a) => a && typeof a.name === 'string' && pattern.test(a.name));
  return asset && typeof asset.browser_download_url === 'string' ? asset.browser_download_url : null;
}

async function fetchLatestRelease() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'labs.atmt.dev-download' };
  // Optional: a read-only token raises GitHub's rate limit (60/h per IP without one).
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

function redirect(res, location, cache) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', cache);
  res.end();
}

async function handler(req, res) {
  const os = new URL(req.url, 'https://labs.atmt.dev').searchParams.get('os') || '';
  if (!Object.prototype.hasOwnProperty.call(PLATFORMS, os)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.end('Unknown platform. Try /download/mac, /download/windows or /download/linux.');
    return;
  }
  try {
    const url = pickAsset(await fetchLatestRelease(), os);
    if (url) return redirect(res, url, 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  } catch (err) {
    console.error('[download]', os, err && err.message);
  }
  // No release yet, no matching file, or GitHub unreachable: send people to the
  // releases page rather than a dead end. Cached briefly so it recovers fast.
  redirect(res, RELEASES_PAGE, 'public, max-age=0, s-maxage=60');
}

module.exports = handler;
module.exports.pickAsset = pickAsset;
module.exports.PLATFORMS = PLATFORMS;
module.exports.REPO = REPO;
