// Office jukebox panel (port of Claw3D's soundclaw JukeboxPanel). Talks to Spotify
// only through window.cth; sign-in happens in the system browser.
// Album art is left out: the renderer CSP blocks remote images.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ListPlus, Music, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import type { SpotifyPlayback, SpotifyTrack } from "@shared/office/spotify";

type Status = { hasClientId: boolean; connected: boolean; redirectUri: string };

export type JukeboxPanelProps = {
  onClose: () => void;
  /** Called with each fresh playback read, so the office can react (dancing). */
  onPlayback?: (playback: SpotifyPlayback | null) => void;
};

const cth = () => window.cth;

export function JukeboxPanel({ onClose, onPlayback }: JukeboxPanelProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const refreshStatus = useCallback(() => cth().spotifyStatus().then(setStatus), []);
  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label="Office jukebox"
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950 shadow-2xl"
        style={{ maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <Music className="h-6 w-6 text-cyan-400" aria-hidden />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/70">Spotify</div>
              <h2 className="text-base font-semibold text-white">Office jukebox</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 68px)" }}>
          {!status ? null : status.connected ? (
            <PlayerView onPlayback={onPlayback} onDisconnected={refreshStatus} />
          ) : (
            <SetupView status={status} onConnected={refreshStatus} />
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
      {text}
    </div>
  );
}

// ─── Setup: Client ID + browser sign-in ──────────────────────────────────────
function SetupView({ status, onConnected }: { status: Status; onConnected: () => void }) {
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canConnect = !busy && (clientId.trim().length > 0 || status.hasClientId);

  const connect = async () => {
    setError(null);
    setBusy(true);
    try {
      if (clientId.trim()) {
        const saved = await cth().spotifySetClientId(clientId.trim());
        if (!saved.ok) { setError(saved.error); return; }
      }
      const r = await cth().spotifyConnect();
      if (!r.ok) { setError(r.error); return; }
      onConnected();
    } finally {
      setBusy(false);
    }
  };

  const step = (n: number) => (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-300">{n}</span>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-amber-300">Before you connect</h3>
        <ol className="space-y-3 text-sm text-slate-300">
          <li className="flex gap-2">
            {step(1)}
            <span>
              Open{" "}
              <button
                type="button"
                onClick={() => void cth().openExternal("https://developer.spotify.com/dashboard")}
                className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
              >
                developer.spotify.com/dashboard
              </button>{" "}
              and create an app. Tick <strong className="text-white">Web API</strong>.
            </span>
          </li>
          <li className="flex gap-2">
            {step(2)}
            <span>In the app settings, add this <strong className="text-white">Redirect URI</strong> exactly:</span>
          </li>
          <li className="ml-7">
            <code className="block w-full break-all rounded-lg border border-cyan-500/20 bg-slate-900 px-3 py-2 font-mono text-xs text-cyan-300">
              {status.redirectUri}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(status.redirectUri)}
              className="mt-1.5 text-xs text-slate-500 hover:text-slate-300"
            >
              Copy
            </button>
          </li>
          <li className="flex gap-2">
            {step(3)}
            <span>Copy the app's <strong className="text-white">Client ID</strong> and paste it below. No client secret is needed.</span>
          </li>
          <li className="flex gap-2">
            {step(4)}
            <span>Playback control needs <strong className="text-white">Spotify Premium</strong> and Spotify open on one of your devices.</span>
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <label htmlFor="spotify-client-id" className="block text-sm font-medium text-slate-300">Spotify Client ID</label>
        <input
          id="spotify-client-id"
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={status.hasClientId ? "Saved. Paste a new one to replace it." : "32 letters and numbers"}
          spellCheck={false}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
        />
        <p className="text-xs text-slate-500">Stored encrypted on this computer. Only sent to Spotify.</p>
      </div>

      <ErrorBox text={error} />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canConnect}
          onClick={() => void connect()}
          className="flex-1 rounded-xl bg-[#1DB954] py-3 text-sm font-semibold text-black transition hover:bg-[#1ed760] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Finish signing in in your browser…" : "Connect with Spotify"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => void cth().spotifyDisconnect()}
            className="rounded-xl border border-white/10 px-4 text-sm text-slate-300 hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Player: now playing, transport, search, queue ───────────────────────────
function PlayerView({
  onPlayback,
  onDisconnected
}: {
  onPlayback?: (p: SpotifyPlayback | null) => void;
  onDisconnected: () => void;
}) {
  const [playback, setPlayback] = useState<SpotifyPlayback | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPlaybackRef = useRef(onPlayback);
  onPlaybackRef.current = onPlayback;

  const refresh = useCallback(async () => {
    const r = await cth().spotifyPlayback();
    setLoaded(true);
    if (!r.ok) { setError(r.error); return; }
    setPlayback(r.playback);
    onPlaybackRef.current?.(r.playback);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  /** Runs a control, then re-reads playback once Spotify has caught up. */
  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) => {
    setError(null);
    setNotice(null);
    const r = await action();
    if (!r.ok) { setError(r.error); return; }
    if (done) setNotice(done);
    window.setTimeout(() => void refresh(), 600);
  };

  const onSearch = (value: string) => {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (!value.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const r = await cth().spotifySearch(value);
      setSearching(false);
      if (!r.ok) { setError(r.error); return; }
      setResults(r.tracks);
    }, 400);
  };

  const disconnect = async () => {
    await cth().spotifyDisconnect();
    onPlaybackRef.current?.(null);
    onDisconnected();
  };

  const track = playback?.track;

  return (
    <div className="flex flex-col gap-4 p-6">
      <ErrorBox text={error} />
      {notice && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-sm text-cyan-200">{notice}</div>}

      <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Now playing</div>
        {!loaded ? (
          <p className="text-sm text-slate-500">Loading player…</p>
        ) : track ? (
          <div className="min-w-0">
            <div className="truncate font-semibold text-white">{track.name}</div>
            <div className="truncate text-sm text-slate-400">{track.artists.join(", ")}</div>
            <div className="truncate text-xs text-slate-600">
              {track.album}{playback?.deviceName ? ` · on ${playback.deviceName}` : ""}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nothing is playing. Open Spotify on a device, then press play or pick a song below.</p>
        )}

        <div className="mt-4 flex items-center justify-center gap-4">
          <ControlButton label="Previous" onClick={() => void run(() => cth().spotifyPrevious())}>
            <SkipBack className="h-4 w-4" />
          </ControlButton>
          {playback?.isPlaying ? (
            <ControlButton label="Pause" large onClick={() => void run(() => cth().spotifyPause())}>
              <Pause className="h-5 w-5" />
            </ControlButton>
          ) : (
            <ControlButton label="Play" large onClick={() => void run(() => cth().spotifyPlay())}>
              <Play className="h-5 w-5" />
            </ControlButton>
          )}
          <ControlButton label="Next" onClick={() => void run(() => cth().spotifyNext())}>
            <SkipForward className="h-4 w-4" />
          </ControlButton>
        </div>
      </div>

      <div>
        <label htmlFor="spotify-search" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Search songs
        </label>
        <input
          id="spotify-search"
          type="text"
          value={query}
          maxLength={200}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Artist, song or album…"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
        />
        {searching && <p className="mt-2 text-xs text-slate-500">Searching…</p>}
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5 bg-slate-900/60">
            {results.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{t.name}</div>
                  <div className="truncate text-xs text-slate-400">{t.artists.join(", ")} · {t.album}</div>
                </div>
                <button
                  type="button"
                  title="Add to queue"
                  aria-label={`Add ${t.name} to queue`}
                  onClick={() => void run(() => cth().spotifyQueue(t.uri), `Added "${t.name}" to the queue.`)}
                  className="shrink-0 rounded-full border border-white/10 p-1.5 text-slate-300 transition hover:bg-white/10"
                >
                  <ListPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void run(() => cth().spotifyPlay(t.uri))}
                  className="shrink-0 rounded-full border border-cyan-500/30 px-3 py-1 text-xs font-medium text-cyan-400 transition hover:bg-cyan-500/10"
                >
                  Play
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => void disconnect()}
          className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-400"
        >
          Disconnect Spotify
        </button>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  large,
  children
}: {
  label: string;
  onClick: () => void;
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex items-center justify-center rounded-full border border-white/10 text-white transition hover:bg-white/10 active:scale-95 ${
        large ? "h-11 w-11" : "h-9 w-9"
      }`}
    >
      {children}
    </button>
  );
}
