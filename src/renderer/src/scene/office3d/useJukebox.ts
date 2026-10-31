// Office jukebox state for the 3D floor: opens the Spotify panel from the jukebox
// object and reports whether music is playing (so agents can dance).
import { createElement, useCallback, useEffect, useState, type ReactNode } from 'react';
import { JukeboxPanel } from '@/features/office/components/JukeboxPanel';
import type { SpotifyPlayback } from '@shared/office/spotify';

const POLL_MS = 15_000;

export function useJukebox(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  panel: ReactNode | null;
  isPlaying: boolean;
} {
  const [open, setOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const onPlayback = useCallback((p: SpotifyPlayback | null) => setIsPlaying(!!p?.isPlaying), []);

  // The open panel polls every 5 s itself; this slower poll keeps isPlaying fresh when it's closed.
  useEffect(() => {
    if (open) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const s = await window.cth.spotifyStatus();
        if (!s.connected) { if (alive) setIsPlaying(false); return; }
        const r = await window.cth.spotifyPlayback();
        if (alive && r.ok) onPlayback(r.playback);
      } catch { /* keep the last known state */ }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [open, onPlayback]);

  const panel = open ? createElement(JukeboxPanel, { onClose: () => setOpen(false), onPlayback }) : null;
  return { open, setOpen, panel, isPlaying };
}
