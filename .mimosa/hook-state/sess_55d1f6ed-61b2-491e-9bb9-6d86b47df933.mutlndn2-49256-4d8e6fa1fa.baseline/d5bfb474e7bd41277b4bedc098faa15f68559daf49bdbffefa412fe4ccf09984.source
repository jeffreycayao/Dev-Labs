// Hero backdrop: a night city of agent "buildings" whose windows (desks) light
// up and flicker, with a lime grid ground and slow drifting sparks. Sits behind
// the hero copy at low contrast; pauses when off screen or the tab is hidden.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, EdgesGeometry, Fog,
  GridHelper, Group, InstancedMesh, LineBasicMaterial, LineSegments, MeshBasicMaterial, Object3D,
  PerspectiveCamera, Points, PointsMaterial, Scene, WebGLRenderer
} from 'three';

const LIME = new Color('#d8ff00');
const BG = new Color('#0a0e0b');

function rand(seed) { // deterministic, so the skyline is the same every visit
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function mountHero(hero, getScroll) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-3d';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.fog = new Fog(BG, 26, 70);
  const camera = new PerspectiveCamera(42, 1, 0.1, 200);

  const city = new Group();
  scene.add(city);
  const r = rand(20260928);

  // Towers: dark bodies + faint lime edges.
  const TOWERS = 64;
  const bodyGeo = new BoxGeometry(1, 1, 1);
  bodyGeo.translate(0, 0.5, 0);
  const bodies = new InstancedMesh(bodyGeo, new MeshBasicMaterial({ color: '#10140d' }), TOWERS);
  const edges = new LineSegments(new EdgesGeometry(bodyGeo), new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.16 }));
  const edgeGroup = new Group();
  const dummy = new Object3D();
  const windowPos = [];
  const towers = [];
  for (let i = 0; i < TOWERS; i++) {
    const ring = 5 + r() * 26;
    const a = r() * Math.PI * 2;
    const x = Math.cos(a) * ring, z = Math.sin(a) * ring - 6;
    const w = 1.2 + r() * 1.8, d = 1.2 + r() * 1.8;
    const floors = 4 + Math.floor(r() * r() * 40);
    const h = floors * 0.42;
    dummy.position.set(x, 0, z); dummy.scale.set(w, h, d); dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    const e = edges.clone(); e.position.set(x, 0, z); e.scale.set(w, h, d); edgeGroup.add(e);
    towers.push({ x, z, w, d, floors });
    // Windows on the two faces that face the camera-ish (front + one side).
    for (let f = 0; f < floors; f++) {
      const y = 0.25 + f * 0.42;
      for (let k = 0; k < 4; k++) {
        const u = (k + 0.5) / 4 - 0.5;
        windowPos.push(x + u * w * 0.8, y, z + d / 2 + 0.02);
        windowPos.push(x + w / 2 + 0.02, y, z + u * d * 0.8);
      }
    }
  }
  city.add(bodies, edgeGroup);

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
  const windows = new Points(winGeo, new PointsMaterial({
    size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending
  }));
  city.add(windows);

  // Ground grid.
  const grid = new GridHelper(140, 70, LIME, LIME);
  grid.material.transparent = true; grid.material.opacity = 0.07;
  city.add(grid);

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
  const sparks = new Points(sparkGeo, new PointsMaterial({
    color: LIME, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending
  }));
  scene.add(sparks);

  // Sizing.
  const resize = () => {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(hero);

  // Pointer parallax.
  let px = 0, py = 0, tx = 0, ty = 0;
  addEventListener('pointermove', (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  // Run only while visible.
  let visible = true, raf = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); });

  let t0 = performance.now();
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const t = (now - t0) / 1000;
    px += (tx - px) * 0.04; py += (ty - py) * 0.04;
    const scroll = Math.min(getScroll(), 900);

    const ang = t * 0.035 + px * 0.25;
    const rad = 30;
    camera.position.set(Math.sin(ang) * rad, 9 + py * -1.5 + scroll * 0.012, Math.cos(ang) * rad + 4);
    camera.lookAt(0, 5 + scroll * 0.006, -6);

    // Flicker: a few windows change each frame, like agents starting/finishing.
    for (let n = 0; n < 6; n++) {
      const i = (r() * nWin) | 0;
      setWin(i, !lit[i] ? r() < 0.8 : r() < 0.35);
    }
    winGeo.attributes.color.needsUpdate = true;

    for (let i = 0; i < SPARKS; i++) {
      sp[i * 3 + 1] += speed[i];
      if (sp[i * 3 + 1] > 22) sp[i * 3 + 1] = 0;
    }
    sparkGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(() => canvas.classList.add('on'));
}
