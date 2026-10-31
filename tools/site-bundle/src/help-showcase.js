// Offline build of the feature showcase for the app's Help → Feature Manual
// window (resources/help/showcase.js, one classic script: the help window loads
// pages from file://, where module scripts and the site's chunks aren't used).
// Without WebGL, or with reduced motion, the page keeps its static caption.
import { mountShowcase } from './showcase3d.js';

const host = document.querySelector('.teamsim');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let webgl = false;
try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* no WebGL */ }
if (host && !reduced && webgl) {
  try { mountShowcase(host); host.classList.add('has-3d'); } catch { /* static caption stays */ }
}
