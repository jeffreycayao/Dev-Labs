/**
 * The guided tour (driver.js, MIT): seven stops over the main screen, anchored
 * on `data-tour="…"` attributes in App.tsx and AgentStrip.tsx. Help → Take a tour
 * replays it; the first run after onboarding starts it once (localStorage flag,
 * per machine — it is a convenience, not state anyone else needs).
 */
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import i18n from 'i18next';

const SEEN_KEY = 'devlabs.tourSeen';

/** Stop key → anchor. `null` centres the popover (no element). */
const STOPS: [string, string | null][] = [
  ['welcome', null],
  ['office', '[data-tour="office"]'],
  ['sidebar', '[data-tour="sidebar"]'],
  ['strip', '[data-tour="strip"]'],
  ['addAgent', '[data-tour="add-agent"]'],
  ['settings', '[data-tour="settings"]'],
  ['theme', '[data-tour="theme"]'],
  ['help', null]
];

export function startAppTour(): void {
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(`tour.${k}`, o) as string;
  const steps: DriveStep[] = STOPS
    // A stop whose anchor is not on screen (fullscreen terminal, empty floor) is skipped, not shown centred.
    .filter(([, sel]) => sel === null || document.querySelector(sel))
    .map(([key, sel]) => ({
      element: sel ?? undefined,
      popover: { title: t(`${key}Title`), description: t(`${key}Body`) }
    }));
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private window or blocked storage */ }
  driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.55,
    nextBtnText: t('next'),
    prevBtnText: t('back'),
    doneBtnText: t('done'),
    progressText: t('progress', { current: '{{current}}', total: '{{total}}' }),
    steps
  }).drive();
}

/** First run only: give the main screen a moment to mount, then tour once. */
export function startAppTourOnce(): void {
  try { if (localStorage.getItem(SEEN_KEY)) return; } catch { return; }
  window.setTimeout(startAppTour, 1500);
}
