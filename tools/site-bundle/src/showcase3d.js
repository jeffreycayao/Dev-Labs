// Feature showcase: one AI tool on its own vs a DevLabs team. In DevLabs mode
// you send requests, Ramon splits each into tasks for twelve AI tools, busy
// agents message each other and save to shared memory, and finished files fly
// back to you. "One AI tool" shrinks it to a lone session you feed by hand.
// Text (captions, counter labels, mode buttons) lives in the host's HTML; this
// only animates and counts. Used by /features and Help → Feature Manual.
import {
  AdditiveBlending, BufferGeometry, Color, EdgesGeometry, Group, IcosahedronGeometry, Line,
  LineBasicMaterial, LineLoop, LineSegments, Mesh, MeshBasicMaterial, OctahedronGeometry,
  QuadraticBezierCurve3, SphereGeometry, TorusGeometry, Vector3
} from 'three';
import { KEY, LIME, createStage, rand } from './stage.js';

const TOOLS = ['Claude Code', 'Codex', 'Gemini', 'Antigravity', 'Grok', 'Qwen',
  'OpenCode', 'Crush', 'Pi', 'Cursor', 'Copilot', 'Kimi'];
const TINTS = ['#E8A27C', '#CDF252', '#8AB4F8', '#B79CF2', '#F1F5EA', '#7FD1C7',
  '#F2C94C', '#F28DB2', '#9BE3A0', '#C1C9B6', '#7DB7E8', '#F0B37E'].map((c) => new Color(c));
const CREAM = new Color('#F1F5EA');
const WHITE = new Color('#FFFFFF');
const RING = 4.4;
// Auto tour: show the lone tool, then the team, until someone picks a mode.
const AUTO = { plain: 7, devlabs: 16 };

export function mountShowcase(host) {
  const { scene, camera, pointer, spin, enableGestures, start } = createStage(host, { fov: 38, className: 'teamsim-3d' });
  enableGestures(host);
  const world = new Group();
  scene.add(world);
  const R = rand(20261101);
  const pick = (list) => list[Math.floor(R() * list.length)];

  const labels = host.querySelector('.sc-labels');
  const caption = host.querySelector('[data-caption]');
  const buttons = [...host.querySelectorAll('[data-mode]')];
  const statEls = Object.fromEntries([...host.querySelectorAll('[data-stat]')].map((e) => [e.dataset.stat, e]));
  const stats = { tasks: 0, messages: 0, deliveries: 0 };
  const bump = (k) => { stats[k]++; if (statEls[k]) statEls[k].textContent = String(stats[k]); };

  // ── nodes ───────────────────────────────────────────────────────────────
  const halo = new SphereGeometry(1, 16, 12);
  const nodes = [];
  function node(name, pos, color, geo, size, cls) {
    const g = new Group();
    g.position.copy(pos);
    const coreMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
    const core = new Mesh(geo, coreMat);
    const wire = new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    const glow = new Mesh(halo, new MeshBasicMaterial({
      color, transparent: true, opacity: 0.1, blending: AdditiveBlending, depthWrite: false
    }));
    g.add(core, wire, glow);
    world.add(g);
    const label = document.createElement('span');
    label.className = `sc-label${cls ? ` ${cls}` : ''}`;
    label.textContent = name;
    labels?.append(label);
    const n = { g, core, coreMat, wire, glow, label, size, color: color.clone(), home: pos.clone(), place: pos.clone(),
      scale: 0, target: 1, pulse: 0, busy: false, spin: 0.4 };
    nodes.push(n);
    return n;
  }
  const ico = new IcosahedronGeometry(1, 0);
  const you = node('You', new Vector3(0, 2.7, 0), LIME, new IcosahedronGeometry(1, 1), 0.3, 'you');
  const ramon = node('Ramon', new Vector3(0, 0.25, 0), KEY, new OctahedronGeometry(1, 0), 0.42, 'ramon');
  const agents = TOOLS.map((name, i) => {
    const a = (i / TOOLS.length) * Math.PI * 2;
    return node(name, new Vector3(Math.cos(a) * RING, -0.35 + Math.sin(a * 3) * 0.25, Math.sin(a) * RING), TINTS[i], ico, 0.22);
  });
  const lone = agents[0];

  // Shared memory: a glowing ring under the floor that agents save into.
  const memory = node('shared memory', new Vector3(0, -1.9, 0), LIME, new TorusGeometry(1, 0.022, 6, 72), 1.35, 'memory');
  memory.core.rotation.x = memory.wire.rotation.x = Math.PI / 2;
  memory.wire.visible = false;
  memory.glow.visible = false;

  // Floor: concentric rings, faint, like the office floor plan seen from above.
  [2.2, 3.6, 5.2, 6.6].forEach((rad, i) => {
    const ring = new LineLoop(new BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, k) =>
      new Vector3(Math.cos(k / 96 * Math.PI * 2) * rad, -2.25, Math.sin(k / 96 * Math.PI * 2) * rad))),
    new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.12 - i * 0.02 }));
    world.add(ring);
  });

  // Ramon → agent links, brightened while a task travels along them.
  const arc = (a, b, lift) => new QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new Vector3(0, lift, 0)), b);
  const links = agents.map((ag) => {
    const mat = new LineBasicMaterial({ color: KEY, transparent: true, opacity: 0 });
    const line = new Line(new BufferGeometry().setFromPoints(arc(ramon.home, ag.home, 0.9).getPoints(24)), mat);
    world.add(line);
    return { mat, flash: 0 };
  });

  // ── packets: work moving between nodes ──────────────────────────────────
  const dot = new SphereGeometry(1, 10, 8);
  const pool = [];
  const flying = [];
  function send(from, to, color, size, speed, done) {
    const p = pool.pop() || (() => {
      const m = new Mesh(dot, new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false }));
      world.add(m);
      return { m };
    })();
    const a = from.g.position.clone(), b = to.g.position.clone();
    p.curve = arc(a, b, 0.8 + a.distanceTo(b) * 0.18);
    p.m.material.color.copy(color);
    p.m.scale.setScalar(size);
    p.m.visible = true;
    p.t = 0;
    p.speed = speed;
    p.done = done;
    flying.push(p);
  }
  function landAll() { while (flying.length) { const p = flying.pop(); p.m.visible = false; pool.push(p); } }

  // ── a tiny scheduler on scene time ──────────────────────────────────────
  let now = 0;
  const queue = [];
  const later = (s, fn) => queue.push({ at: now + s, fn });

  function work(a, solo) {
    a.busy = true;
    a.pulse = 1;
    const dur = solo ? 4.2 : 2.2 + R() * 2.8;
    a.until = now + dur;
    if (!solo) {
      if (R() < 0.75) later(dur * 0.35, () => {
        const peers = agents.filter((b) => b !== a && b.target > 0);
        const b = pick(peers);
        if (!b) return;
        send(a, b, CREAM, 0.05, 0.75, () => { b.pulse = Math.max(b.pulse, 0.6); bump('messages'); });
      });
      if (R() < 0.6) later(dur * 0.65, () => send(a, memory, LIME, 0.045, 0.9, () => { memory.pulse = 0.7; }));
    }
    later(dur, () => {
      a.busy = false;
      send(a, you, a.color, 0.09, solo ? 0.45 : 0.55, () => { you.pulse = 1; bump('deliveries'); });
      if (solo) later(2.4, plainLoop);
    });
  }
  function devlabsLoop() {
    if (mode !== 'devlabs') return;
    send(you, ramon, LIME, 0.1, 0.9, () => {
      ramon.pulse = 1;
      const k = 1 + Math.floor(R() * 3);
      for (let i = 0; i < k; i++) later(i * 0.2, () => {
        const free = agents.filter((x) => !x.busy && x.target > 0);
        if (!free.length) return;
        const ag = pick(free);
        ag.busy = true;
        links[agents.indexOf(ag)].flash = 1;
        bump('tasks');
        send(ramon, ag, KEY, 0.08, 0.85, () => work(ag, false));
      });
    });
    later(1.1 + R() * 0.7, devlabsLoop);
  }
  function plainLoop() {
    if (mode !== 'plain') return;
    bump('tasks');
    send(you, lone, LIME, 0.1, 0.5, () => work(lone, true));
  }

  // ── modes ───────────────────────────────────────────────────────────────
  let mode = '', auto = true, autoAt = 0;
  const loneSpot = new Vector3(0, 0, 0);
  function setMode(m, byUser) {
    if (byUser) auto = false;
    if (m === mode) return;
    mode = m;
    autoAt = now + AUTO[m];
    queue.length = 0;
    landAll();
    for (const k of Object.keys(stats)) { stats[k] = 0; if (statEls[k]) statEls[k].textContent = '0'; }
    for (const n of nodes) { n.busy = false; n.target = 1; }
    if (m === 'plain') { ramon.target = 0; memory.target = 0; for (const a of agents) if (a !== lone) a.target = 0; }
    lone.place.copy(m === 'plain' ? loneSpot : lone.home);
    if (caption) caption.textContent = host.dataset[m === 'plain' ? 'captionPlain' : 'captionDevlabs'] || '';
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    host.dataset.active = m;
    later(0.9, m === 'plain' ? plainLoop : devlabsLoop);
  }
  for (const b of buttons) b.addEventListener('click', () => setMode(b.dataset.mode, true));
  setMode('plain', false);

  // ── frame ───────────────────────────────────────────────────────────────
  const v = new Vector3();
  let last = 0;
  // Aim below the middle so the scene sits in the upper part, clear of the captions.
  camera.position.set(0, 6.4, 12.8);
  camera.lookAt(0, -1.1, 0);
  start((t) => {
    const dt = Math.min(t - last, 0.05);
    last = t;
    now += dt;
    if (auto && now >= autoAt) setMode(mode === 'plain' ? 'devlabs' : 'plain', false);
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].at <= now) { const { fn } = queue[i]; queue.splice(i, 1); fn(); }
    }

    world.rotation.y = t * 0.07 + spin.angle + pointer.x * 0.22;
    world.rotation.x = pointer.y * 0.05;

    for (let i = flying.length - 1; i >= 0; i--) {
      const p = flying[i];
      p.t += dt * p.speed;
      if (p.t >= 1) {
        flying.splice(i, 1);
        p.m.visible = false;
        pool.push(p);
        p.done();
        continue;
      }
      const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - (-2 * p.t + 2) ** 2 / 2;
      p.curve.getPoint(e, p.m.position);
    }

    for (const l of links) {
      l.flash = Math.max(0, l.flash - dt * 1.4);
      l.mat.opacity = (mode === 'devlabs' ? 0.08 : 0) + l.flash * 0.5;
    }

    const w = host.clientWidth, h = host.clientHeight;
    for (const n of nodes) {
      n.scale += (n.target - n.scale) * Math.min(1, dt * 4);
      n.g.position.lerp(n.place, Math.min(1, dt * 2.5));
      n.pulse = Math.max(0, n.pulse - dt * 1.6);
      const working = n.busy && n.until > now;
      n.spin += ((working ? 2.6 : 0.4) - n.spin) * Math.min(1, dt * 3);
      n.wire.rotation.y += dt * n.spin;
      n.wire.rotation.x += dt * n.spin * 0.4;
      const s = n.scale * n.size * (1 + n.pulse * 0.35 + (working ? Math.sin(t * 9) * 0.06 : 0));
      n.core.scale.setScalar(s);
      n.wire.scale.setScalar(s * 1.45);
      n.glow.scale.setScalar(s * (1.9 + n.pulse * 0.7));
      n.glow.material.opacity = 0.06 + n.pulse * 0.14 + (working ? 0.07 : 0);
      n.coreMat.color.copy(n.color).lerp(WHITE, n.pulse * 0.5);
      n.g.visible = n.scale > 0.02;

      if (!n.label) continue;
      n.g.getWorldPosition(v).project(camera);
      const show = n.scale > 0.45 && v.z < 1;
      n.label.style.opacity = show ? String(Math.min(1, (n.scale - 0.45) * 3)) : '0';
      if (show) n.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -190%)`;
    }
    memory.core.rotation.z = t * 0.3;
  });
}
