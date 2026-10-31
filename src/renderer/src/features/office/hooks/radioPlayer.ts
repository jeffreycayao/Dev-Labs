// The office radio's single audio element. It lives at module level so the
// station keeps playing while the jukebox panel is closed.
import { useSyncExternalStore } from "react";
import type { RadioStation } from "@shared/office/radio";

export type RadioState = {
  station: RadioStation | null;
  status: "stopped" | "loading" | "playing" | "error";
  volume: number;
};

const VOLUME_KEY = "office.radio.volume";

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return v > 0 && v <= 1 ? v : 0.6;
  } catch {
    return 0.6;
  }
}

const audio = new Audio();
let state: RadioState = { station: null, status: "stopped", volume: readVolume() };
/** The full station list, for previous/next (set when the jukebox loads it). */
let stations: RadioStation[] = [];
audio.volume = state.volume;

const listeners = new Set<() => void>();
const set = (patch: Partial<RadioState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

audio.addEventListener("playing", () => set({ status: "playing" }));
audio.addEventListener("waiting", () => { if (state.status === "playing") set({ status: "loading" }); });
audio.addEventListener("error", () => { if (state.status !== "stopped") set({ status: "error" }); });

export const radio = {
  play(station: RadioStation) {
    set({ station, status: "loading" });
    audio.src = station.url;
    audio.play().catch((e: unknown) => {
      // AbortError: another station was picked before this one started.
      if (state.station === station && (e as Error)?.name !== "AbortError") set({ status: "error" });
    });
  },
  setStations(list: RadioStation[]) {
    stations = list;
  },
  /** Plays the station `delta` places away in the list, wrapping around. */
  step(delta: number) {
    if (!stations.length) return;
    const i = stations.findIndex((s) => s.id === state.station?.id);
    radio.play(stations[i < 0 ? 0 : (i + delta + stations.length) % stations.length]);
  },
  stop() {
    set({ status: "stopped" });
    audio.pause();
    audio.removeAttribute("src");
    audio.load(); // drops the live connection
  },
  setVolume(volume: number) {
    audio.volume = volume;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* per-viewer nicety only */ }
    set({ volume });
  }
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useRadio(): RadioState {
  return useSyncExternalStore(subscribe, () => state);
}
