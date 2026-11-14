// Office settings (ported from Claw3D's SettingsPanel, voice section only: DevLabs has no
// OpenClaw gateway or remote office). Self-sufficient via window.cth.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_VOICE_PREFS, MAX_SPEED, MIN_SPEED, VOICE_CATALOG, type VoicePrefs } from "@shared/office/voiceCatalog";
import { previewVoice, setVoicePrefsCache } from "@/scene/office3d/useVoiceReplies";

export function SettingsPanel() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [hasKey, setHasKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    window.cth
      .officeVoiceStatus()
      .then(({ hasKey: k, ...p }) => {
        if (!alive) return;
        setPrefs(p);
        setHasKey(k);
        setLoaded(true);
      })
      .catch(() => alive && setMessage({ text: t("office.voicePanel.loadFailed"), error: true }));
    return () => {
      alive = false;
    };
  }, []);

  const save = async (patch: Partial<VoicePrefs>) => {
    setPrefs((p) => ({ ...p, ...patch })); // optimistic, so the slider stays smooth
    const res = await window.cth.officeVoiceSetPrefs(patch);
    if (!res.ok) return setMessage({ text: res.error, error: true });
    const { hasKey: k, ...p } = res.status;
    setPrefs(p);
    setHasKey(k);
    setVoicePrefsCache(p);
  };

  const saveKey = async () => {
    setBusy(true);
    const res = await window.cth.officeVoiceSetKey(keyDraft);
    setBusy(false);
    if (!res.ok) return setMessage({ text: res.error ?? t("office.voicePanel.saveFailed"), error: true });
    setKeyDraft("");
    setHasKey(true);
    setMessage({ text: t("office.voicePanel.keySaved") });
  };

  const clearKey = async () => {
    await window.cth.officeVoiceClearKey();
    setHasKey(false);
    setMessage({ text: t("office.voicePanel.keyRemoved") });
  };

  const preview = async (voiceId = prefs.voiceId) => {
    setBusy(true);
    setMessage(null);
    const error = await previewVoice(t("office.voicePanel.previewText"), voiceId, prefs.speed);
    setBusy(false);
    if (error) setMessage({ text: error, error: true });
  };

  const box = "mt-3 rounded-lg border border-cyan-500/10 bg-black/20 px-4 py-3";
  const btn =
    "rounded-md border border-cyan-500/20 bg-black/20 px-2.5 py-1.5 text-[11px] text-cyan-100 transition-colors hover:border-cyan-400/40 hover:text-white disabled:opacity-40";

  return (
    <div className="px-4 pb-4 pt-1">
      <div className={`${box} flex items-center justify-between gap-4`}>
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-white">{t("office.voicePanel.title")}</span>
          <span className="text-[10px] text-white/75">{t("office.voicePanel.desc")}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-label={t("office.voicePanel.title")}
          aria-checked={prefs.enabled}
          disabled={!loaded}
          onClick={() => void save({ enabled: !prefs.enabled })}
          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
            prefs.enabled ? "border-cyan-400/60 bg-cyan-500/40" : "border-cyan-500/20 bg-black/40"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${prefs.enabled ? "left-[18px]" : "left-0.5"}`}
          />
        </button>
      </div>
      {prefs.enabled && !hasKey && loaded ? (
        <div className="mt-2 text-[10px] text-amber-300/90">{t("office.voicePanel.needKey")}</div>
      ) : null}

      <div className={box}>
        <div className="text-[11px] font-medium text-white">{t("office.voicePanel.keyTitle")}</div>
        <div className="mt-1 text-[10px] text-white/75">
          {hasKey
            ? t("office.voicePanel.keySavedDesc")
            : t("office.voicePanel.keyDesc")}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyDraft.trim()) void saveKey();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={hasKey ? "••••••••••••" : t("office.voicePanel.keyPlaceholder")}
            aria-label={t("office.voicePanel.keyPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-cyan-500/15 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-cyan-400/40"
          />
          <button type="submit" className={btn} disabled={busy || !keyDraft.trim()}>
            Save
          </button>
          {hasKey ? (
            <button type="button" className={btn} onClick={() => void clearKey()} disabled={busy}>
              Remove
            </button>
          ) : null}
        </form>
      </div>

      <div className={box}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">{t("office.voicePanel.voice")}</div>
            <div className="mt-1 text-[10px] text-white/75">{t("office.voicePanel.voiceDesc")}</div>
          </div>
          <button type="button" className={btn} onClick={() => void preview()} disabled={busy || !hasKey || !loaded}>
            {busy ? t("office.voicePanel.playing") : t("office.voicePanel.preview")}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {VOICE_CATALOG.map((voice) => {
            const selected = voice.id === prefs.voiceId;
            return (
              <button
                key={voice.id}
                type="button"
                aria-pressed={selected}
                disabled={!loaded}
                onClick={() => void save({ voiceId: voice.id })}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected
                    ? "border-cyan-400/40 bg-cyan-500/10 text-white"
                    : "border-cyan-500/10 bg-black/15 text-white/80 hover:border-cyan-400/20"
                }`}
              >
                <div className="text-[11px] font-medium">{voice.label}</div>
                <div className="mt-1 text-[10px] text-white/65">{voice.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={box}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">{t("office.voicePanel.speed")}</div>
            <div className="mt-1 text-[10px] text-white/75">{t("office.voicePanel.speedDesc")}</div>
          </div>
          <span className="font-mono text-[10px] text-cyan-200/70">{prefs.speed.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={0.05}
          value={prefs.speed}
          disabled={!loaded}
          aria-label={t("office.voicePanel.speedAria")}
          onChange={(e) => void save({ speed: Number.parseFloat(e.target.value) })}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-cyan-500/15 accent-cyan-400"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
          <span>{t("office.voicePanel.slower")}</span>
          <span>{t("office.voicePanel.faster")}</span>
        </div>
      </div>

      {message ? (
        <div role="status" className={`mt-3 text-[10px] ${message.error ? "text-rose-300" : "text-emerald-300/90"}`}>
          {message.text}
        </div>
      ) : null}
    </div>
  );
}
