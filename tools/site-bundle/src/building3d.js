// "Agents make a floor, floors make a building": a glass tower that assembles
// floor by floor as the section scrolls into view. setProgress(0..1) is driven
// by Motion's scroll() in site.js; each floor drops into place with its desks lit.
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, EdgesGeometry, GridHelper, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Points, PointsMaterial
} from 'three';
import { LIME, createStage, rand } from './stage.js';

const FLOORS = 22;
const GAP = 0.62;
const W = 5.2, D = 3.6;

const ease = (x) => 1 - Math.pow(1 - x, 3);

export function mountBuilding(host) {
  const { scene, camera, pointer, start } = createStage(host, { fov: 36, className: 'building-3d' });
  const tower = new Group();
  scene.add(tower);
  const r = rand(4012);

  const slabGeo = new BoxGeometry(W, 0.08, D);
  const edgeGeo = new EdgesGeometry(slabGeo);
  const floors = [];
  for (let i = 0; i < FLOORS; i++) {
    const g = new Group();
    const glass = new Mesh(slabGeo, new MeshBasicMaterial({ color: '#2a3317', transparent: true, opacity: 0, depthWrite: false }));
    const edge = new LineSegments(edgeGeo, new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0 }));
    // Desks: a 6×3 grid of points on the slab, some lit.
    const pos = [], col = [];
    for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) {
      pos.push((a + 0.5) / 6 * W * 0.86 - W * 0.43, 0.12, (b + 0.5) / 3 * D * 0.8 - D * 0.4);
      const k = r() < 0.7 ? 0.6 + r() * 0.4 : 0.08;
      col.push(LIME.r * k, LIME.g * k, LIME.b * k);
    }
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    dg.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    const desks = new Points(dg, new PointsMaterial({
      size: 0.2, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending
    }));
    g.add(glass, edge, desks);
    g.visible = false;
    tower.add(g);
    floors.push({ g, glass, edge, desks });
  }

  // Vertical corner rails grow with the tower.
  const railMat = new LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.35 });
  const rails = new LineSegments(new BufferGeometry(), railMat);
  const railPos = new Float32Array(4 * 2 * 3);
  rails.geometry.setAttribute('position', new BufferAttribute(railPos, 3));
  tower.add(rails);

  const grid = new GridHelper(30, 30, LIME, LIME);
  grid.material.transparent = true; grid.material.opacity = 0.08;
  grid.position.y = -0.1;
  scene.add(grid);

  let progress = 0, shown = 0;
  start((t) => {
    shown += (progress - shown) * 0.08; // smooth out wheel steps
    const built = shown * (FLOORS + 1);
    let top = 0;
    floors.forEach((f, i) => {
      const a = Math.max(0, Math.min(1, built - i));
      f.g.visible = a > 0.001;
      if (!f.g.visible) return;
      const e = ease(a);
      f.g.position.y = i * GAP + (1 - e) * 2.2;
      f.g.rotation.y = (1 - e) * 0.6;
      f.glass.material.opacity = 0.35 * e;
      f.edge.material.opacity = 0.25 + 0.55 * e;
      f.desks.material.opacity = e;
      top = Math.max(top, f.g.position.y);
    });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], k) => {
      railPos.set([sx * W / 2, 0, sz * D / 2, sx * W / 2, top, sz * D / 2], k * 6);
    });
    rails.geometry.attributes.position.needsUpdate = true;
    rails.geometry.computeBoundingSphere();

    tower.rotation.y = t * 0.12 + shown * Math.PI * 0.5 + pointer.x * 0.25;
    const h = Math.max(top, 3);
    camera.position.set(0, h * 0.6 + 3 - pointer.y * 1.2, 18 + h * 0.9);
    camera.lookAt(0, h * 0.5, 0);
  });

  return {
    setProgress(p) { progress = Math.max(0, Math.min(1, p)); }
  };
}
