// Office radio: loads the Philippine station list from Radio Browser here,
// because the renderer CSP blocks external fetches. Playback is a plain <audio>
// in the renderer (media-src allows http/https streams).
import { app, ipcMain } from 'electron';
import { parseStations, type RadioStation } from '../../shared/office/radio';

// The round-robin host first, then a fixed server in case its DNS is down.
const HOSTS = ['https://all.api.radio-browser.info', 'https://de1.api.radio-browser.info'];
const PH_STATIONS = '/json/stations/bycountrycodeexact/PH?hidebroken=true';
const HTTP_TIMEOUT_MS = 10_000;
const CACHE_MS = 6 * 60 * 60_000;

let cache: { at: number; stations: RadioStation[] } | null = null;

async function fetchStations(): Promise<RadioStation[]> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + PH_STATIONS, {
        // Radio Browser asks every client to send a descriptive User-Agent.
        headers: { 'User-Agent': `DevLabs/${app.getVersion()}` },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
      });
      if (!res.ok) continue;
      const stations = parseStations(await res.json());
      if (stations.length) return stations;
    } catch {
      /* try the next host */
    }
  }
  throw new Error('Could not load the radio stations. Check your internet connection and try again.');
}

export function registerRadioIpc(): void {
  ipcMain.handle('radio:stations', async () => {
    try {
      if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), stations: await fetchStations() };
      return { ok: true, stations: cache.stations };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
