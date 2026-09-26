import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT } from './theme';
import { press, vt } from './fonts';
import { Panel, Terminal, Avatar, Envelope, Caption } from './components';

const Floor: React.FC = () => (
  <div style={{
    position: 'absolute', inset: 0,
    backgroundColor: C.woodL,
    backgroundImage:
      `linear-gradient(45deg, ${C.wood} 25%, transparent 25%, transparent 75%, ${C.wood} 75%),
       linear-gradient(45deg, ${C.wood} 25%, transparent 25%, transparent 75%, ${C.wood} 75%)`,
    backgroundSize: '96px 96px',
    backgroundPosition: '0 0, 48px 48px',
    opacity: 0.5,
  }} />
);

const Station: React.FC<{ x: number; y: number; label: string; fill: string }> = ({ x, y, label, fill }) => (
  <Panel x={x} y={y} w={170} h={120} fill={fill} border="#8B6F47" bw={6} shadow={false}>
    <div style={{ fontFamily: `${FONT.mono}, ${vt}, monospace`, fontSize: 26, color: C.ink900, textAlign: 'center', marginTop: 42 }}>{label}</div>
  </Panel>
);

export const HowAgents: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.ink900 }}>
      <Floor />

      {/* three live terminals */}
      <Terminal x={120} y={120} w={460} h={300} title="agent.coder · live"
        lines={[
          { t: '$ claude', c: C.mint },
          { t: 'reading SPEC.md …', c: C.termFg },
          { t: 'edit App.tsx', c: C.termFg },
          { t: 'running tests', c: C.lemon },
          { t: '✉ → agent.qa', c: C.muted },
        ]} startFrame={6} />

      <Terminal x={730} y={120} w={460} h={300} title="agent.research · live"
        lines={[
          { t: '$ claude', c: C.mint },
          { t: 'grep router/*', c: C.termFg },
          { t: 'web.fetch docs', c: C.sky },
          { t: 'recall 4 memories', c: C.lilacL },
          { t: '✉ → agent.coder', c: C.muted },
        ]} startFrame={20} />

      <Terminal x={1340} y={120} w={460} h={300} title="agent.qa · live"
        lines={[
          { t: '$ claude', c: C.mint },
          { t: 'bash: npm test', c: C.termFg },
          { t: 'todo: 3 → 1', c: C.termFg },
          { t: 'thinking …', c: C.lemon },
          { t: '✓ all green', c: C.mint },
        ]} startFrame={34} />

      {/* avatars beneath each desk */}
      <Avatar x={330} y={440} color={C.coral} phase={0} />
      <Avatar x={940} y={440} color={C.sky} phase={1} />
      <Avatar x={1550} y={440} color={C.lemon} phase={2} />

      {/* envelopes flying between desks, recurring */}
      <Envelope x1={560} y1={470} x2={930} y2={470} from={50} dur={45} tint={C.lemonL} />
      <Envelope x1={1170} y1={470} x2={580} y2={470} from={95} dur={50} tint={C.mintL} />
      <Envelope x1={960} y1={470} x2={1560} y2={470} from={130} dur={45} tint={C.skyL} />

      {/* station row */}
      <Station x={120} y={640} label="file shelf" fill={C.woodL} />
      <Station x={330} y={640} label="terminal" fill={C.woodL} />
      <Station x={540} y={640} label="web portal" fill={C.lilacL} />
      <Station x={750} y={640} label="task board" fill={C.woodL} />
      <Station x={960} y={640} label="mailbox" fill={C.lemonL} />

      <Caption x={120} y={800} kicker="MANAGED & VISUALIZED"
        title="Every terminal is an agent."
        sub="Real claude sessions — walking to a station for every tool they run." from={6} />

      <div style={{ position: 'absolute', right: 60, bottom: 60, fontFamily: `${FONT.display}, ${press}, monospace`, fontSize: 16, color: C.gold }}>
        MUNDER DIFFLIN
      </div>
    </AbsoluteFill>
  );
};
