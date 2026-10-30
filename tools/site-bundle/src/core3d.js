// Download section: a wireframe "core" (icosahedron shell, a point cloud inside,
// three orbit rings) that turns slowly and leans toward the pointer.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, EdgesGeometry, Group, IcosahedronGeometry,
  LineBasicMaterial, LineLoop, LineSegments, Points, PointsMaterial, Vector3
} from 'three';
import { LIME, createStage } from './stage.js';

export function mountCore(host) {
  const { scene, camera, pointer, start } = createStage(host, { fov: 40, className: 'core-3d' });
  const core = new Group();
  scene.add(core);

  const shell = new LineSegments(new EdgesGeometry(new IcosahedronGeometry(2.4, 1)),
    new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.45 }));
  const inner = new LineSegments(new EdgesGeometry(new IcosahedronGeometry(1.2, 0)),
    new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.8 }));
  core.add(shell, inner);

  // Fibonacci sphere of points between the two shells.
  const N = 700, pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = i * 2.399963;
    const k = 1.6 + (i % 7) * 0.08;
    pts.set([Math.cos(th) * rad * k, y * k, Math.sin(th) * rad * k], i * 3);
  }
  const cloud = new BufferGeometry();
  cloud.setAttribute('position', new BufferAttribute(pts, 3));
  core.add(new Points(cloud, new PointsMaterial({
    color: LIME, size: 0.035, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending
  })));

  const circle = (rad) => new BufferGeometry().setFromPoints(
    Array.from({ length: 128 }, (_, k) => new Vector3(Math.cos(k / 128 * Math.PI * 2) * rad, 0, Math.sin(k / 128 * Math.PI * 2) * rad)));
  const orbits = [3.3, 3.9, 4.5].map((rad, i) => {
    const o = new LineLoop(circle(rad), new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.22 - i * 0.04 }));
    o.rotation.set(0.5 + i * 0.5, 0, i * 0.7);
    scene.add(o);
    return o;
  });

  camera.position.set(0, 0, 14.5);
  start((t) => {
    core.rotation.y = t * 0.25 + pointer.x * 0.4;
    core.rotation.x = Math.sin(t * 0.3) * 0.2 + pointer.y * 0.3;
    inner.rotation.y = -t * 0.6;
    orbits.forEach((o, i) => { o.rotation.y = t * (0.15 + i * 0.08) * (i % 2 ? -1 : 1); });
    const s = 1 + Math.sin(t * 1.4) * 0.02;
    core.scale.set(s, s, s);
  });
}
