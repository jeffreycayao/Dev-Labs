import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { C, FONT } from './theme';
import { press, vt } from './fonts';

// A chunky SNES-style three-edge panel (no border-radius, hard shadow).
export const Panel: React.FC<{
  x: number; y: number; w: number; h: number;
  fill?: string; border?: string; bw?: number; shadow?: boolean;
  children?: React.ReactNode; style?: React.CSSProperties;
}> = ({ x, y, w, h, fill = C.ink2, border = C.maroonD, bw = 5, shadow = true, children, style }) => (
  <div style={{
    position: 'absolute', left: x, top: y, width: w, height: h,
    background: fill, border: `${bw}px solid ${border}`,
    boxShadow: shadow ? `8px 8px 0 ${C.maroonD}` : undefined,
    boxSizing: 'border-box', ...style,
  }}>{children}</div>
);

// A small bobbing avatar (head + body), pixel proportions.
export const Avatar: React.FC<{ x: number; y: number; color: string; phase?: number }> = ({ x, y, color, phase = 0 }) => {
  const frame = useCurrentFrame();
  const bob = Math.round(Math.sin((frame + phase * 9) * 0.4) * 2);
  return (
    <div style={{ position: 'absolute', left: x, top: y + bob }}>
      <div style={{ width: 18, height: 12, background: C.skin, border: `3px solid ${C.ink900}`, marginLeft: 6 }} />
      <div style={{ width: 30, height: 34, background: color, border: `3px solid ${C.ink900}`, marginTop: -3 }} />
    </div>
  );
};

// A flying envelope that travels from (x1,y1) to (x2,y2) over a window of frames.
export const Envelope: React.FC<{
  x1: number; y1: number; x2: number; y2: number; from: number; dur: number; tint?: string;
}> = ({ x1, y1, x2, y2, from, dur, tint = C.lemonL }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const visible = frame >= from && frame <= from + dur;
  // arc with a little lift
  const x = x1 + (x2 - x1) * t;
  const y = y1 + (y2 - y1) * t - Math.sin(t * Math.PI) * 36;
  const rot = interpolate(t, [0, 1], [-12, 12]);
  if (!visible) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `rotate(${rot}deg)`, opacity: t < 0.06 ? t / 0.06 : 1 }}>
      <div style={{ width: 40, height: 26, background: tint, border: `3px solid ${C.ink900}`, position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0,
          borderTop: `13px solid ${tint}`, borderLeft: '20px solid transparent', borderRight: '20px solid transparent',
          boxSizing: 'border-box',
        }} />
        <svg width="40" height="26" style={{ position: 'absolute', inset: 0 }}>
          <path d="M0 0 L20 14 L40 0" fill="none" stroke={C.ink900} strokeWidth={3} />
        </svg>
      </div>
    </div>
  );
};

// A terminal panel that types out the given lines progressively.
export const Terminal: React.FC<{
  x: number; y: number; w: number; h: number;
  lines: { t: string; c?: string }[]; startFrame?: number; cps?: number; title?: string;
}> = ({ x, y, w, h, lines, startFrame = 0, cps = 26, title }) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - startFrame);
  const totalChars = Math.floor((elapsed / 30) * cps);
  let budget = totalChars;
  const shown = lines.map((ln) => {
    if (budget <= 0) return { ...ln, t: '' };
    const take = Math.min(ln.t.length, budget);
    budget -= ln.t.length + 1;
    return { ...ln, t: ln.t.slice(0, take) };
  });
  const blink = Math.floor(frame / 15) % 2 === 0;
  return (
    <Panel x={x} y={y} w={w} h={h} fill={C.termBg} border={C.maroonD} bw={4} shadow={false}>
      <div style={{ padding: 12, fontFamily: `${FONT.mono}, ${vt}, monospace`, fontSize: 22, lineHeight: '26px', color: C.termFg }}>
        {title && <div style={{ color: C.muted, fontSize: 16, marginBottom: 6, borderBottom: `2px dashed ${C.ink900}`, paddingBottom: 4 }}>{title}</div>}
        {shown.map((ln, i) => (
          <div key={i} style={{ color: ln.c ?? C.termFg, whiteSpace: 'pre' }}>
            {ln.t}
            {i === shown.findIndex((s) => s.t.length < lines[shown.indexOf(s)]?.t.length) && blink ? '▋' : ''}
          </div>
        ))}
      </div>
    </Panel>
  );
};

// Big pixel caption that pops in with a spring.
export const Caption: React.FC<{ x: number; y: number; kicker?: string; title: string; sub?: string; from?: number }> = ({ x, y, kicker, title, sub, from = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const ty = interpolate(s, [0, 1], [24, 0]);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: s, transform: `translateY(${ty}px)` }}>
      {kicker && <div style={{ fontFamily: `${FONT.display}, ${press}, monospace`, fontWeight: 700, letterSpacing: '0.12em', fontSize: 18, color: C.gold, marginBottom: 14 }}>{kicker}</div>}
      <div style={{ fontFamily: `${FONT.display}, ${press}, monospace`, fontWeight: 700, letterSpacing: '0.02em', fontSize: 34, color: C.cream, lineHeight: '46px' }}>{title}</div>
      {sub && <div style={{ fontFamily: `${FONT.mono}, ${vt}, monospace`, fontSize: 28, color: C.muted, marginTop: 14 }}>{sub}</div>}
    </div>
  );
};
