import { continueRender, delayRender } from 'remotion';

// Load JetBrains Mono via a plain stylesheet link (matches the landing page).
// We avoid @remotion/google-fonts because its esbuild web-fonts plugin crashes
// on Node 22 during bundling.
const FAMILY = 'JetBrains Mono';

if (typeof document !== 'undefined' && !document.getElementById('jb-mono-font')) {
  const handle = delayRender('Loading JetBrains Mono');
  const link = document.createElement('link');
  link.id = 'jb-mono-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap';
  link.onload = () => {
    // Make sure glyphs are actually ready before the first frame is captured.
    const ready = (document as any).fonts?.ready as Promise<unknown> | undefined;
    if (ready) ready.then(() => continueRender(handle));
    else continueRender(handle);
  };
  link.onerror = () => continueRender(handle);
  document.head.appendChild(link);
}

export const press = FAMILY;
export const vt = FAMILY;
export const pixelify = FAMILY;
export const jb = FAMILY;
