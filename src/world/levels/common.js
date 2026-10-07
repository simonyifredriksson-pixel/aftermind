/* common.js - building blocks shared by the level files: floor slabs with
   holes, two-skin exterior walls with windows, glass, debris, lamps that
   come with their light, puddles with fake neon reflections, signs. */
import * as THREE from '../../../lib/three.module.js';
import { prop } from '../../art/Art.js';
import { Mat, Glow } from '../../core/Textures.js';

/** rectangle minus holes -> list of rects [x0,z0,x1,z1] */
export function subtract(r, holes) {
  const xs = new Set([r[0], r[2]]);
  for (const h of holes) { if (h[0] > r[0] && h[0] < r[2]) xs.add(h[0]); if (h[2] > r[0] && h[2] < r[2]) xs.add(h[2]); }
  const X = [...xs].sort((a, b) => a - b), out = [];
  for (let i = 0; i < X.length - 1; i++) {
    const x0 = X[i], x1 = X[i + 1], mx = (x0 + x1) / 2;
    const cuts = holes.filter(h => mx > h[0] && mx < h[2]).map(h => [Math.max(r[1], h[1]), Math.min(r[3], h[3])]).filter(c => c[1] > c[0]).sort((a, b) => a[0] - b[0]);
    let z = r[1];
    for (const c of cuts) { if (c[0] > z) out.push([x0, z, x1, c[0]]); z = Math.max(z, c[1]); }
    if (z < r[3]) out.push([x0, z, x1, r[3]]);
  }
  return out;
}
/** a floor slab: walkable top skin at y (floor material), body below (ceiling material) */
export function slab(B, x0, z0, x1, z1, y, floorMat, ceilMat, holes = [], t = 0.25) {
  for (const r of subtract([x0, z0, x1, z1], holes)) {
    B.box(r[0], y - t, r[1], r[2], y - 0.01, r[3], ceilMat, { faces: ['ny', 'px', 'nx', 'pz', 'nz'] });
    B.box(r[0], y - 0.01, r[1], r[2], y, r[3], floorMat, { faces: ['py'] });
  }
}
/** exterior wall with an outside skin and an inside skin, same openings */
export function extWall(B, ax, az, bx, bz, y, h, outMat, inMat, openings, outSide) {
  // outSide: which side of the line is outside: 'n','s','e','w'
  const t = 0.16, alongX = Math.abs(az - bz) < 1e-6;
  const o = outSide === 'n' || outSide === 'w' ? -1 : 1;
  if (alongX) { B.wall(ax, az + o * t / 2, bx, bz + o * t / 2, y, h, outMat, { t, openings }); B.wall(ax, az - o * t / 2, bx, bz - o * t / 2, y, h, inMat, { t, openings }); }
  else { B.wall(ax + o * t / 2, az, bx + o * t / 2, bz, y, h, outMat, { t, openings }); B.wall(ax - o * t / 2, az, bx - o * t / 2, bz, y, h, inMat, { t, openings }); }
}
/** glass in an opening (optionally broken: a few shards left in the frame) */
export function pane(B, x, y, z, w, h, axis, broken = false, mat = 'glassDirty') {
  const g = new THREE.Group();
  const m = typeof mat === 'string' ? Mat(mat) : mat;
  const frame = Mat('steel');
  if (!broken) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); g.add(p); }
  else {
    for (let i = 0; i < 4; i++) { const s = new THREE.Shape(); const bx = (i % 2 ? 1 : -1) * w / 2, by = (i < 2 ? -1 : 1) * h / 2; s.moveTo(bx, by); s.lineTo(bx - Math.sign(bx) * w * (0.2 + Math.random() * 0.3), by); s.lineTo(bx, by - Math.sign(by) * h * (0.2 + Math.random() * 0.4)); s.lineTo(bx, by); const p = new THREE.Mesh(new THREE.ShapeGeometry(s), m); g.add(p); }
  }
  const bar = (bw, bh, px, py) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), frame); b.position.set(px, py, 0); g.add(b); };
  bar(w + 0.06, 0.05, 0, h / 2); bar(w + 0.06, 0.05, 0, -h / 2); bar(0.05, h, -w / 2, 0); bar(0.05, h, w / 2, 0);
  g.position.set(x, y, z); if (axis === 'z') g.rotation.y = Math.PI / 2;
  B.add(g);
  return g;
}
/** a lamp prop on the ceiling plus its pooled light */
export function lamp(B, x, y, z, color = 0xfff0dc, intensity = 6, dist = 9, o = {}) {
  const pr = prop('ceilingLight', { kind: o.kind || 'panel' });
  pr.userData.lights = []; // we register our own light below
  B.prop(() => pr, x, y, z, o.rot || 0, { solid: false });
  if (o.dead) { pr.traverse(c => { if (c.isMesh && (c.material.isMeshBasicMaterial || c.material.emissiveIntensity > 0)) { c.material = c.material.clone(); if (c.material.isMeshBasicMaterial) c.material.color.setRGB(0.05, 0.05, 0.05); else c.material.emissiveIntensity = 0; } }); return null; }
  return B.light(x, y - 0.35, z, color, intensity, dist, { flicker: o.flicker || 0, power: o.power || null });
}
/** a red emergency lamp on a wall with its glow */
export function emergency(B, x, y, z, rot = 0, o = {}) {
  const pr = prop('emergencyLight'); pr.userData.lights = [];
  B.prop(() => pr, x, y, z, rot, { solid: false });
  return B.light(x + Math.sin(rot) * 0.3, y, z + Math.cos(rot) * 0.3, o.color || 0xff2a1a, o.intensity ?? 3, o.dist ?? 7, { flicker: o.flicker ?? 0.1, power: o.power || null });
}
/** concrete chunks and a bent rebar or two */
export function debris(B, x, y, z, spread = 2, n = 8, seed = 1) {
  let s = seed * 9301 + 49297; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) {
    const w = 0.2 + r() * 0.7, h = 0.12 + r() * 0.45, d = 0.2 + r() * 0.7;
    const cx = x + (r() - 0.5) * spread * 2, cz = z + (r() - 0.5) * spread * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Mat(r() < 0.8 ? 'concrete' : 'concreteDark'));
    m.position.set(cx, y + h / 2 - 0.03, cz); m.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5); m.castShadow = m.receiveShadow = true;
    B.add(m);
  }
  for (let i = 0; i < Math.ceil(n / 4); i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1 + r() * 1.5, 5), Mat('rust'));
    m.position.set(x + (r() - 0.5) * spread, y + 0.3, z + (r() - 0.5) * spread); m.rotation.set(r() * 1.4, r() * 3, r() * 1.4); B.add(m);
  }
}
/** a big solid rubble heap (blocks a passage) */
export function rubble(B, x0, y0, z0, x1, y1, z1, seed = 3) {
  B.box(x0 + 0.2, y0, z0 + 0.2, x1 - 0.2, y1 - 0.3, z1 - 0.2, 'concrete', { solid: true });
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 16; i++) {
    const w = 0.4 + r() * 1.2, h = 0.3 + r() * 0.8, d = 0.4 + r() * 1.2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Mat(r() < 0.7 ? 'concrete' : 'concreteDark'));
    m.position.set(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), z0 + r() * (z1 - z0)); m.rotation.set(r() * 1, r() * 3, r() * 1); m.castShadow = m.receiveShadow = true; B.add(m);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, Math.hypot(x1 - x0, z1 - z0)), Mat('rust'));
  beam.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); beam.rotation.set(0.5, Math.atan2(x1 - x0, z1 - z0), 0.3); B.add(beam);
}
/** a puddle that mirrors the sky, with a streak of a neon colour under a sign */
export function puddle(B, x, y, z, w, d, neon = null) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.02, metalness: 0.6, envMapIntensity: 1.4 }));
  m.scale.set(w, d, 1); m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.012, z); m.receiveShadow = true; B.add(m);
  if (neon) streak(B, x, y + 0.02, z, neon, w * 0.6, d * 1.6);
}
/** the long vertical smear a neon sign leaves on wet ground (additive, fades with distance) */
export function streak(B, x, y, z, color, w, len, rot = 0) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
  const gx = g.createLinearGradient(0, 0, 32, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(color).multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y + 0.015, z); m.renderOrder = 3; B.add(m);
  return m;
}
/** neon tube text sign (glows, lights the street through a pooled light) */
export function neonSign(B, x, y, z, rot, text, color, size = 0.6, o = {}) {
  const W = Math.max(1, text.length * size * 0.62), H = size * 1.25;
  B.sign(x, y, z, rot, W, H, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const c = '#' + new THREE.Color(color).getHexString();
    g.font = `${o.italic ? 'italic ' : ''}700 ${Math.round(h * 0.62)}px ${o.font || '"Rajdhani", sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = c; g.shadowBlur = h * 0.25; g.strokeStyle = c; g.lineWidth = h * 0.05; g.strokeText(text, w / 2, h / 2);
    g.fillStyle = '#ffffff'; g.shadowBlur = h * 0.1; g.fillText(text, w / 2, h / 2);
  }, { transparent: true, glow: o.glow ?? 2.2, res: 128, additive: true });
  if (o.light !== false) B.light(x + Math.sin(rot) * 0.8, y, z + Math.cos(rot) * 0.8, color, o.intensity ?? 4, o.dist ?? 10, { flicker: o.flicker || 0 });
  if (o.streak) streak(B, x + Math.sin(rot) * 1.2, o.groundY ?? 0, z + Math.cos(rot) * 1.2, color, W * 0.8, o.streak, rot);
}
/** a wall screen with a looping message drawn by draw(ctx, w, h, t); returns the mesh */
export function screen(B, x, y, z, rot, w, h, draw, o = {}) {
  const m = B.sign(x, y, z, rot, w, h, (g, cw, ch) => draw(g, cw, ch, 0), { glow: o.glow ?? 1.3, res: o.res || 256 });
  if (o.animate !== false) {
    let t = 0, acc = 0; const c = m.userData.canvas, g = c.getContext('2d');
    const holder = new THREE.Object3D(); holder.userData.update = (dt) => { t += dt; acc += dt; if (acc < (o.every || 0.25)) return; acc = 0; if (!m.visible) return; draw(g, c.width, c.height, t); m.userData.tex.needsUpdate = true; };
    B.add(holder); B.zone.updaters.push(holder);
  }
  if (o.light) B.light(x + Math.sin(rot) * 0.8, y, z + Math.cos(rot) * 0.8, o.light, o.intensity ?? 2, o.dist ?? 6, { flicker: o.flicker || 0 });
  return m;
}
/** the Conductor's glyph: a ring with three inward ticks */
export function glyph(g, cx, cy, r, color = '#ff3424', lw = 0) {
  g.save(); g.strokeStyle = color; g.lineWidth = lw || r * 0.12; g.shadowColor = color; g.shadowBlur = r * 0.4;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55); g.stroke(); }
  g.restore();
}
/** canvas text helper: wraps lines */
export function wrap(g, text, x, y, maxW, lh) { const words = text.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t; } g.fillText(line, x, y); return y + lh; }
export { prop, Mat, Glow };
