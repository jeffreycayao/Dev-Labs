// Hero backdrop: a night city of agent "buildings" whose windows (desks) flicker
// on and off, a holographic spire at the centre with rotating floor rings, a
// scan ring sweeping up the skyline, data packets arcing between towers, and
// slow rising sparks over a lime grid.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, EdgesGeometry, Fog, GridHelper,
  Group, InstancedMesh, LineBasicMaterial, LineLoop, LineSegments, Mesh, MeshBasicMaterial, Object3D,
  Points, PointsMaterial, QuadraticBezierCurve3, RingGeometry, Vector3, DoubleSide
} from 'three';
import { BG, KEY, LIME, createStage, rand } from './stage.js';

const SPIRE = new Vector3(0, 0, -6);

export function mountHero(hero, getScroll) {
  const { scene, camera, pointer, spin, enableGestures, start } = createStage(hero, { className: 'hero-3d' });
  enableGestures(hero);
  scene.fog = new Fog(BG, 26, 72);
  const city = new Group();
  scene.add(city);
  const r = rand(20260928);

  // Towers: dark bodies + faint lime edges, kept clear of the spire.
  const TOWERS = 64;
  const bodyGeo = new BoxGeometry(1, 1, 1);
  bodyGeo.translate(0, 0.5, 0);
  const bodies = new InstancedMesh(bodyGeo, new MeshBasicMaterial({ color: '#1d221c' }), TOWERS);
  const edgeMat = new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.16 });
  const edgeGeo = new EdgesGeometry(bodyGeo);
  const dummy = new Object3D();
  const windowPos = [];
  const tops = [];
  for (let i = 0; i < TOWERS; i++) {
    const ring = 7 + r() * 26;
    const a = r() * Math.PI * 2;
    const x = Math.cos(a) * ring + SPIRE.x, z = Math.sin(a) * ring + SPIRE.z;
    const w = 1.2 + r() * 1.8, d = 1.2 + r() * 1.8;
    const floors = 4 + Math.floor(r() * r() * 40);
    const h = floors * 0.42;
    dummy.position.set(x, 0, z); dummy.scale.set(w, h, d); dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    const e = new LineSegments(edgeGeo, edgeMat);
    e.position.set(x, 0, z); e.scale.set(w, h, d);
    city.add(e);
    tops.push(new Vector3(x, h, z));
    for (let f = 0; f < floors; f++) {
      const y = 0.25 + f * 0.42;
      for (let k = 0; k < 4; k++) {
        const u = (k + 0.5) / 4 - 0.5;
        windowPos.push(x + u * w * 0.8, y, z + d / 2 + 0.02);
        windowPos.push(x + w / 2 + 0.02, y, z + u * d * 0.8);
      }
    }
  }
  city.add(bodies);

  // Windows as points, with per-window brightness we flicker over time.
  const nWin = windowPos.length / 3;
  const winGeo = new BufferGeometry();
  winGeo.setAttribute('position', new BufferAttribute(new Float32Array(windowPos), 3));
  const winCol = new Float32Array(nWin * 3);
  const lit = new Uint8Array(nWin);
  const setWin = (i, on) => {
    lit[i] = on ? 1 : 0;
    const k = on ? 0.55 + r() * 0.45 : 0.06;
    winCol[i * 3] = LIME.r * k; winCol[i * 3 + 1] = LIME.g * k; winCol[i * 3 + 2] = LIME.b * k;
  };
  for (let i = 0; i < nWin; i++) setWin(i, r() < 0.55);
  winGeo.setAttribute('color', new BufferAttribute(winCol, 3));
  city.add(new Points(winGeo, new PointsMaterial({
    size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending
  })));

  // Ground grid.
  const grid = new GridHelper(140, 70, LIME, LIME);
  grid.material.transparent = true; grid.material.opacity = 0.07;
  city.add(grid);

  // Holographic spire: a vertical beam wrapped in hexagonal floor rings.
  const spire = new Group();
  spire.position.copy(SPIRE);
  city.add(spire);
  const beamGeo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 20, 0)]);
  spire.add(new LineSegments(beamGeo, new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.5 })));
  const hex = (rad) => new BufferGeometry().setFromPoints(
    Array.from({ length: 6 }, (_, k) => new Vector3(Math.cos(k / 6 * Math.PI * 2) * rad, 0, Math.sin(k / 6 * Math.PI * 2) * rad)));
  const rings = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const ring = new LineLoop(hex(2.6 - t * 1.6), new LineBasicMaterial({
      color: LIME, transparent: true, opacity: 0.25 + (1 - t) * 0.35, blending: AdditiveBlending
    }));
    ring.position.y = 0.6 + i * 0.95;
    ring.userData.spin = (i % 2 ? 1 : -1) * (0.15 + t * 0.35);
    spire.add(ring);
    rings.push(ring);
  }

  // Scan ring sweeping up through the skyline.
  const scan = new Mesh(new RingGeometry(3, 34, 96, 1), new MeshBasicMaterial({
    color: LIME, transparent: true, opacity: 0.05, side: DoubleSide, depthWrite: false, blending: AdditiveBlending
  }));
  scan.rotation.x = -Math.PI / 2;
  scan.position.copy(SPIRE);
  city.add(scan);

  // Data packets: each one travels an arc from a tower top to the spire.
  const ARCS = 26;
  const arcs = [];
  const arcMat = new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.12, blending: AdditiveBlending });
  const pkt = new Float32Array(ARCS * 3);
  for (let i = 0; i < ARCS; i++) {
    const from = tops[(r() * tops.length) | 0];
    const to = new Vector3(SPIRE.x, 3 + r() * 14, SPIRE.z);
    const mid = from.clone().lerp(to, 0.5); mid.y += 4 + r() * 6;
    const curve = new QuadraticBezierCurve3(from, mid, to);
    city.add(new LineSegments(new BufferGeometry().setFromPoints(curve.getPoints(40).flatMap((p, k, all) => k ? [all[k - 1], p] : [])), arcMat));
    arcs.push({ curve, t: r(), speed: 0.12 + r() * 0.25 });
  }
  const pktGeo = new BufferGeometry();
  pktGeo.setAttribute('position', new BufferAttribute(pkt, 3));
  city.add(new Points(pktGeo, new PointsMaterial({
    color: KEY, size: 0.34, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending
  })));

  // Rising sparks.
  const SPARKS = 420;
  const sp = new Float32Array(SPARKS * 3);
  const speed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) {
    sp[i * 3] = (r() - 0.5) * 70; sp[i * 3 + 1] = r() * 22; sp[i * 3 + 2] = (r() - 0.5) * 60 - 6;
    speed[i] = 0.004 + r() * 0.012;
  }
  const sparkGeo = new BufferGeometry();
  sparkGeo.setAttribute('position', new BufferAttribute(sp, 3));
  scene.add(new Points(sparkGeo, new PointsMaterial({
    color: LIME, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending
  })));

  const tmp = new Vector3();
  let last = 0;
  start((t) => {
    const dt = Math.min(t - last, 0.05); last = t;
    const scroll = Math.min(getScroll(), 900);
    const ang = t * 0.035 + pointer.x * 0.25 + spin.angle;
    camera.position.set(Math.sin(ang) * 30, 9 + pointer.y * -1.5 + scroll * 0.012, Math.cos(ang) * 30 + 4);
    camera.lookAt(0, 6 + scroll * 0.006, -6);

    // Flicker: a few windows change each frame, like agents starting/finishing.
    for (let n = 0; n < 6; n++) {
      const i = (r() * nWin) | 0;
      setWin(i, !lit[i] ? r() < 0.8 : r() < 0.35);
    }
    winGeo.attributes.color.needsUpdate = true;

    for (const ring of rings) ring.rotation.y += ring.userData.spin * dt;
    const s = (t * 0.12) % 1;
    scan.position.y = s * 20;
    scan.material.opacity = 0.07 * Math.sin(s * Math.PI);

    arcs.forEach((a, i) => {
      a.t = (a.t + a.speed * dt) % 1;
      a.curve.getPoint(a.t, tmp);
      pkt[i * 3] = tmp.x; pkt[i * 3 + 1] = tmp.y; pkt[i * 3 + 2] = tmp.z;
    });
    pktGeo.attributes.position.needsUpdate = true;

    for (let i = 0; i < SPARKS; i++) {
      sp[i * 3 + 1] += speed[i];
      if (sp[i * 3 + 1] > 22) sp[i * 3 + 1] = 0;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  });
}
