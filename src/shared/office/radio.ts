// Office radio: Philippine stations from the free Radio Browser directory
// (radio-browser.info, no key). Pure helpers, no Electron, so tests can load them.

export interface RadioStation {
  id: string;
  name: string;
  /** Direct stream (MP3/AAC/HLS), played by a plain <audio> in the renderer. */
  url: string;
  tags: string;
  codec: string;
  bitrate: number;
}

export const RADIO_MAX_STATIONS = 400;

function streamUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Radio Browser station JSON -> playable stations: http(s) streams only, one per
 * name (the directory lists many copies; the most voted wins), most voted first.
 */
export function parseStations(json: unknown): RadioStation[] {
  if (!Array.isArray(json)) return [];
  const best = new Map<string, { votes: number; station: RadioStation }>();
  for (const raw of json) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 120) : '';
    const url = streamUrl(r.url_resolved) ?? streamUrl(r.url);
    if (!name || !url || r.lastcheckok === 0) continue;
    const votes = Number(r.votes) || 0;
    const key = name.toLowerCase();
    const prev = best.get(key);
    if (prev && prev.votes >= votes) continue;
    best.set(key, {
      votes,
      station: {
        id: typeof r.stationuuid === 'string' ? r.stationuuid : url,
        name,
        url,
        tags: typeof r.tags === 'string' ? r.tags.slice(0, 200) : '',
        codec: typeof r.codec === 'string' ? r.codec.slice(0, 20) : '',
        bitrate: Number(r.bitrate) || 0
      }
    });
  }
  return [...best.values()]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, RADIO_MAX_STATIONS)
    .map((b) => b.station);
}
