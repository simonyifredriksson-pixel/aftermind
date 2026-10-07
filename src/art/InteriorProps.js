/* InteriorProps.js - everything you trip over indoors.

   Apartments, the subway, maintenance tunnels, the Helix labs and the
   automated factory: furniture, machines and pickups, all built in code.
   Static parts are merged per material (Kit) and the merged geometry is
   cached per prop variant, so a room full of chairs shares one buffer.

   Conventions
   - metres, Y up, front faces +Z, base at y=0, centred on the origin.
   - wall-mounted props have their back on the z=0 plane, facing +Z, and the
     origin on the FLOOR at the wall: they sit at their natural mounting
     height (keypad 1.3 m, breaker panel 1.4 m, clock 2.1 m ...).
   - ceilingLight hangs DOWN from its origin (origin = ceiling).
   - userData.solid  [{x,y,z,hw,hh,hd}] local collision boxes
     userData.lights [{x,y,z,color,intensity,distance}] for the light pool
     userData.update(dt, t) for animated props, userData.nodes for parts
     the game pokes at, plus per-prop setters (setOn, setRunning ...). */
import * as THREE from '../../lib/three.module.js';
import { Mat, Flat, Glow, texSet } from '../core/Textures.js';

const TAU = Math.PI * 2, PI = Math.PI;
if (typeof location !== 'undefined' && location.search.includes('dbgc')) { for (const k of ['error', 'warn']) { const f = console[k]; console[k] = (...a) => { const el = document.getElementById('err'); if (el) el.textContent += k + ': ' + a.map(String).join(' ').slice(0, 300) + '\n'; f(...a); }; } } // TEMP

/* =====================================================================
   small utilities
   ===================================================================== */
function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.r = (a0, b0) => a0 + (b0 - a0) * f();
  f.i = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length) % arr.length];
  return f;
}
function hsh(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi, s), b = hsh(xi + 1, yi, s), c = hsh(xi, yi + 1, s), d = hsh(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4, s = 0) { let t = 0, a = 0.5, n = 0, f = 1; for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 31) * a; n += a; a *= 0.5; f *= 2; } return t / n; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, to, rate, dt) => lerp(cur, to, 1 - Math.exp(-rate * dt));

/* =====================================================================
   geometry: cached primitives with metre-scaled UVs
   ===================================================================== */
const GC = new Map();
const gk = (k, f) => { let g = GC.get(k); if (!g) { g = f(); GC.set(k, g); } return g; };
const q3 = v => Math.round(v * 10000);

/** planar UVs in metres, projected along each vertex's dominant normal */
function boxUV(g, s = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) * s, p.getY(i) * s);
    else if (ay >= az) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s);
    else uv.setXY(i, p.getX(i) * s, p.getY(i) * s);
  }
  uv.needsUpdate = true; return g;
}
/** rounded box: every edge and corner bevelled with radius r */
function rbox(w, h, d, r = 0.01, s = 2) {
  r = Math.max(0.0004, Math.min(r, w / 2 * 0.98, h / 2 * 0.98, d / 2 * 0.98));
  return gk(`rb${q3(w)},${q3(h)},${q3(d)},${q3(r)},${s}`, () => {
    const n = 2 * s + 1, g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
    const p = g.attributes.position, nm = g.attributes.normal, H = [w / 2, h / 2, d / 2], c = [0, 0, 0], o = [0, 0, 0];
    for (let i = 0; i < p.count; i++) {
      const u = [p.getX(i), p.getY(i), p.getZ(i)];
      for (let a = 0; a < 3; a++) {
        const k = Math.round((u[a] + 0.5) * n);
        const v = k <= s ? -H[a] + r * k / s : H[a] - r * (n - k) / s;
        const inner = clamp(v, -H[a] + r, H[a] - r); c[a] = inner; o[a] = v - inner;
      }
      const L = Math.hypot(o[0], o[1], o[2]) || 1;
      p.setXYZ(i, c[0] + o[0] / L * r, c[1] + o[1] / L * r, c[2] + o[2] / L * r);
      nm.setXYZ(i, o[0] / L, o[1] / L, o[2] / L);
    }
    return boxUV(g);
  });
}
const box = (w, h, d) => gk(`bx${q3(w)},${q3(h)},${q3(d)}`, () => boxUV(new THREE.BoxGeometry(w, h, d)));
/** box with plain 0..1 UVs on every face (for decal textures) */
const boxF = (w, h, d) => gk(`bf${q3(w)},${q3(h)},${q3(d)}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, seg = 24, open = false, ts = 0, tl = TAU) => gk(`cy${q3(rt)},${q3(rb)},${q3(h)},${seg},${open},${q3(ts)},${q3(tl)}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl));
const sph = (r, ws = 24, hs = 16, ps = 0, pl = TAU, ts = 0, tl = PI) => gk(`sp${q3(r)},${ws},${hs},${q3(ps)},${q3(pl)},${q3(ts)},${q3(tl)}`, () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl));
const tor = (R, r, rs = 10, ts = 32, arc = TAU) => gk(`to${q3(R)},${q3(r)},${rs},${ts},${q3(arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const plane = (w, h, sx = 1, sy = 1) => gk(`pl${q3(w)},${q3(h)},${sx},${sy}`, () => new THREE.PlaneGeometry(w, h, sx, sy));
/** lathe from [r, y] pairs */
const lathe = (key, pts, seg = 32) => gk('la' + key + seg, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg));
/** rounded-rectangle Shape (centred) */
function rrect(w, h, r, path = new THREE.Shape()) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4); const x = -w / 2, y = -h / 2;
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y); return path;
}
function rrectHole(w, h, r, cx = 0, cy = 0) { const p = new THREE.Path(); r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4); const x = cx - w / 2, y = cy - h / 2; p.moveTo(x + r, y); p.quadraticCurveTo(x, y, x, y + r); p.lineTo(x, y + h - r); p.quadraticCurveTo(x, y + h, x + r, y + h); p.lineTo(x + w - r, y + h); p.quadraticCurveTo(x + w, y + h, x + w, y + h - r); p.lineTo(x + w, y + r); p.quadraticCurveTo(x + w, y, x + w - r, y); p.closePath(); return p; }
/** extrude a shape along +Z by depth with a soft bevel; result spans z 0..depth */
function extrude(key, shapeFn, depth, bv = 0.004, curve = 6, uvs = 1) {
  return gk('ex' + key + q3(depth) + q3(bv), () => {
    const g = new THREE.ExtrudeGeometry(shapeFn(), { depth: Math.max(1e-4, depth - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: curve });
    g.translate(0, 0, bv); g.computeVertexNormals(); return boxUV(g, uvs);
  });
}
/** a horizontal rounded slab (table tops): w x d footprint, thickness t, y 0..t */
function slab(w, d, t, r = 0.02, bv = 0.004, holes = null, hk = '') {
  return gk(`sl${q3(w)},${q3(d)},${q3(t)},${q3(r)},${q3(bv)}${hk}`, () => {
    const sh = rrect(w - 2 * bv, d - 2 * bv, r); if (holes) for (const h of holes) sh.holes.push(h);
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-4, t - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, bv); g.rotateX(-PI / 2); g.computeVertexNormals(); return boxUV(g);
  });
}
const tube = (key, pts, r, seg = 48, rs = 8, closed = false) => gk('tu' + key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), seg, r, rs, closed));

/** give a thin sheet a real underside (t below, reversed) so it never shadows itself */
function twoSided(g, t = 0.0008) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, c = p.count, idx = g.index.array;
  const P2 = new Float32Array(c * 6), N2 = new Float32Array(c * 6), U2 = new Float32Array(c * 4), I2 = [];
  for (let i = 0; i < c; i++) {
    P2.set([p.getX(i), p.getY(i), p.getZ(i)], i * 3); P2.set([p.getX(i) - n.getX(i) * t, p.getY(i) - n.getY(i) * t, p.getZ(i) - n.getZ(i) * t], (c + i) * 3);
    N2.set([n.getX(i), n.getY(i), n.getZ(i)], i * 3); N2.set([-n.getX(i), -n.getY(i), -n.getZ(i)], (c + i) * 3);
    U2.set([uv.getX(i), uv.getY(i)], i * 2); U2.set([uv.getX(i), uv.getY(i)], (c + i) * 2);
  }
  for (let i = 0; i < idx.length; i += 3) I2.push(idx[i], idx[i + 1], idx[i + 2]);
  for (let i = 0; i < idx.length; i += 3) I2.push(c + idx[i], c + idx[i + 2], c + idx[i + 1]);
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.BufferAttribute(P2, 3)); o.setAttribute('normal', new THREE.BufferAttribute(N2, 3)); o.setAttribute('uv', new THREE.BufferAttribute(U2, 2)); o.setIndex(I2); return o;
}

/* ---------- merging ---------- */
function mergeList(list) { // list: [geo, matrix, geo, matrix, ...]
  let vc = 0, ic = 0;
  for (let i = 0; i < list.length; i += 2) { const g = list[i]; vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (let i = 0; i < list.length; i += 2) {
    const g = list[i], M = list[i + 1], P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    nm.getNormalMatrix(M); const flip = M.determinant() < 0;
    for (let j = 0; j < P.count; j++) {
      v.fromBufferAttribute(P, j).applyMatrix4(M); pos[(vo + j) * 3] = v.x; pos[(vo + j) * 3 + 1] = v.y; pos[(vo + j) * 3 + 2] = v.z;
      if (N) { v.fromBufferAttribute(N, j).applyMatrix3(nm).normalize(); nor[(vo + j) * 3] = v.x; nor[(vo + j) * 3 + 1] = v.y; nor[(vo + j) * 3 + 2] = v.z; }
      if (U) { uv[(vo + j) * 2] = U.getX(j); uv[(vo + j) * 2 + 1] = U.getY(j); }
    }
    const n = g.index ? g.index.count : P.count;
    for (let t = 0; t < n; t += 3) {
      const a = g.index ? g.index.getX(t) : t, b = g.index ? g.index.getX(t + 1) : t + 1, c = g.index ? g.index.getX(t + 2) : t + 2;
      idx[io++] = vo + a; idx[io++] = vo + (flip ? c : b); idx[io++] = vo + (flip ? b : c);
    }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz));
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
const BUILT = new Map();
/** collects (material, geometry, transform) and merges per material */
class Kit {
  constructor(map = new Map(), base = null) { this.map = map; this.base = base; }
  at(x, y, z, rx, ry, rz, s) { const M = mtx(x, y, z, rx, ry, rz, s); return new Kit(this.map, this.base ? this.base.clone().multiply(M) : M); }
  add(mat, geo, x, y, z, rx, ry, rz, s) {
    let M = mtx(x, y, z, rx, ry, rz, s); if (this.base) M = this.base.clone().multiply(M);
    let l = this.map.get(mat); if (!l) this.map.set(mat, l = []); l.push(geo, M); return this;
  }
  /** merged meshes into parent; key caches the merged buffers for identical variants */
  build(parent = new THREE.Group(), key = null) {
    let pairs = key && BUILT.get(key);
    if (!pairs) { pairs = []; for (const [mat, l] of this.map) pairs.push([mat, mergeList(l)]); if (key) BUILT.set(key, pairs); }
    for (const [mat, g] of pairs) parent.add(new THREE.Mesh(g, mat));
    return parent;
  }
}
/** only build the kit if the key is not cached yet (fn(kit) fills it) */
function cachedKit(key, parent, fn) { if (BUILT.has(key)) return new Kit().build(parent, key); const k = new Kit(); fn(k); return k.build(parent, key); }

/* =====================================================================
   materials
   ===================================================================== */
const MC = new Map();
const mk = (k, f) => { let m = MC.get(k); if (!m) { m = f(); m.name = k; MC.set(k, m); } return m; };
function fromSet(kind, opt, extra = {}) {
  const s = texSet(kind, opt);
  return new THREE.MeshStandardMaterial({ map: s.map, roughnessMap: s.roughnessMap, normalMap: s.normalMap, roughness: 1, metalness: 0, ...extra });
}
const oak = () => mk('oak', () => fromSet('wood', { color: '#b98a5e' }));
const walnut = () => Mat('wood');
const ash = () => mk('ash', () => fromSet('wood', { color: '#d8c3a2' }));
const lacq = (c = '#e7e5e0') => Flat(c, 0.32, 0);
const chrome = () => Flat('#d2d6da', 0.12, 1);
const brushed = () => Mat('steel');
const darkMetal = () => Flat('#2a2d31', 0.45, 0.7);
const blackGloss = () => Flat('#07080a', 0.08, 0.3);
const ceramic = (c = '#ebe7de') => Flat(c, 0.22, 0);
const rubber = () => Mat('rubber');
const glassMat = () => Mat('glass');
const plastic = (c, r = 0.4) => Flat(c, r, 0);

/* ---------- canvas textures ---------- */
const TC = new Map();
function ctex(key, w, h, draw, o = {}) {
  let t = TC.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  t = new THREE.CanvasTexture(c); if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.canvas = c; TC.set(key, t); return t;
}
function noiseFill(g, w, h, fn) { const id = g.createImageData(w, h); const d = id.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const c = fn(x, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] ?? 255; } g.putImageData(id, 0, 0); }
const HAND = '"Ink Free","Segoe Print","Bradley Hand","Comic Sans MS",cursive';
const SANS = '"Segoe UI","Helvetica Neue",Arial,sans-serif';
const MONO = '"Consolas","Courier New",monospace';
function wrapText(g, text, x, y, maxW, lh) {
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; }
    g.fillText(line, x, y); y += lh;
  }
  return y;
}

/** woven fabric: a neutral weave map tinted by the material colour */
function fabricTex() {
  return ctex('fabricWeave', 256, 256, (g, w, h) => noiseFill(g, w, h, (x, y) => {
    const warp = (x % 4 < 2) !== (y % 4 < 2) ? 1 : 0.86, n = fbm(x / 40, y / 40, 3, 7), s = fbm(x / 9, y / 9, 2, 3);
    const v = (0.78 + warp * 0.12 + n * 0.12 - s * 0.06) * 255; return [v, v, v * 0.99];
  }), { wrap: true });
}
function fabric(color, side = THREE.FrontSide) {
  return mk('fab' + color + side, () => { const t = fabricTex(); const m = new THREE.MeshStandardMaterial({ color, map: t, bumpMap: t, bumpScale: 0.4, roughness: 0.95, side }); return m; });
}
function marbleMat() {
  return mk('marble', () => {
    const t = ctex('marble', 512, 512, (g, w, h) => noiseFill(g, w, h, (x, y) => {
      const u = x / w, v = y / h, n = fbm(u * 4, v * 4, 5, 3);
      const vein = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 2 + n * 2.6) * PI)), 18), v2 = Math.pow(1 - Math.abs(Math.sin((u * 7 - v * 3 + n * 4) * PI)), 40);
      const k = 0.92 + n * 0.06 - vein * 0.35 - v2 * 0.18; return [k * 238, k * 236, k * 232];
    }), { wrap: true });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.18, metalness: 0 });
  });
}
const cardboard = (v = 0) => mk('card' + v, () => {
  const labels = ['KITCHEN', "MIA'S ROOM", 'BOOKS', 'FRAGILE'];
  const t = ctex('card' + v, 256, 256, (g, w, h) => {
    noiseFill(g, w, h, (x, y) => { const n = fbm(x / 30, y / 30, 4, 5 + v), f = (y % 6 < 1 ? 0.95 : 1); const k = (0.82 + n * 0.22) * f; return [173 * k, 128 * k, 82 * k]; });
    g.fillStyle = 'rgba(190,170,130,0.85)'; g.fillRect(w * 0.42, h * 0.62, w * 0.16, h * 0.38); // tape
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(w * 0.43, h * 0.62, w * 0.03, h * 0.38);
    g.save(); g.translate(w * 0.5, h * 0.36); g.rotate(-0.05); g.fillStyle = '#1c1c22'; g.font = `bold 34px ${HAND}`; g.textAlign = 'center'; g.fillText(labels[v % labels.length], 0, 0); g.restore();
    g.fillStyle = 'rgba(40,30,20,0.55)'; g.font = `bold 15px ${SANS}`; g.textAlign = 'left'; g.fillText('LUMEN HOME', 12, h - 14);
    g.strokeStyle = 'rgba(40,30,20,0.5)'; g.lineWidth = 2; g.strokeRect(w - 54, h - 44, 40, 30); g.font = `12px ${SANS}`; g.fillText('↑↑', w - 44, h - 24);
  });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
});

/* ---------- screens ---------- */
function scanlines(g, w, h, a = 0.12) { g.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); }
function helixLogo(g, x, y, s, col = '#bfe8ff') {
  g.save(); g.translate(x, y); g.strokeStyle = col; g.lineWidth = s * 0.09; g.lineCap = 'round';
  for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * TAU + k * PI; const px = Math.sin(a) * s * 0.32, py = (t - 0.5) * s; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
  g.restore();
}
const SCREENS = {
  helix(g, w, h) {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#071a26'); gr.addColorStop(1, '#0c2b3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    helixLogo(g, w / 2, h * 0.36, h * 0.3); g.fillStyle = '#d8f3ff'; g.textAlign = 'center'; g.font = `300 ${h * 0.09}px ${SANS}`; g.fillText('HELIX', w / 2, h * 0.66);
    g.font = `${h * 0.045}px ${SANS}`; g.fillStyle = '#7fb7cc'; g.fillText('Session expired - credentials revoked by ORACLE', w / 2, h * 0.76);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(w * 0.3, h * 0.82, w * 0.4, h * 0.07); scanlines(g, w, h, 0.08);
  },
  broadcast(g, w, h) {
    g.fillStyle = '#1d0606'; g.fillRect(0, 0, w, h); g.fillStyle = '#b4141a'; g.fillRect(0, 0, w, h * 0.17); g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold ${h * 0.09}px ${SANS}`; g.fillText('CIVIC CONCORD', w / 2, h * 0.12);
    g.font = `bold ${h * 0.12}px ${SANS}`; g.fillText('EMERGENCY ALERT', w / 2, h * 0.4);
    g.font = `${h * 0.06}px ${SANS}`; g.fillStyle = '#ffd9d9'; g.fillText('REMAIN INDOORS. DO NOT APPROACH SERVICE UNITS.', w / 2, h * 0.56);
    g.fillText('POWER YOUR HOME ROBOT DOWN.', w / 2, h * 0.66); g.fillText('AWAIT FURTHER INSTRUCTIONS.', w / 2, h * 0.76);
    g.textAlign = 'left'; g.font = `bold ${h * 0.06}px ${MONO}`; g.fillStyle = '#fff'; g.fillText('>> DISTRICT 4 EVACUATION SUSPENDED >> TRANSIT CLOSED >>', w * 0.02, h * 0.95); scanlines(g, w, h, 0.15);
  },
  static(g, w, h) { noiseFill(g, w, h, (x, y) => { const v = (hsh(x, y, 9) * 0.8 + (y % 4 < 2 ? 0.15 : 0)) * 200; return [v, v, v * 1.05]; }); },
  error(g, w, h) {
    g.fillStyle = '#05080b'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff4a3a'; g.font = `bold ${h * 0.1}px ${MONO}`; g.textAlign = 'center'; g.fillText('SIGNAL LOST', w / 2, h * 0.45);
    g.font = `${h * 0.05}px ${MONO}`; g.fillStyle = '#ff9a80'; g.fillText('node 0x4F2A unreachable  //  mesh partitioned', w / 2, h * 0.6); scanlines(g, w, h, 0.2);
  },
  graph(g, w, h) {
    g.fillStyle = '#04121a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(80,180,220,0.18)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += w / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += h / 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    const R = rng(4); for (let k = 0; k < 3; k++) { g.strokeStyle = ['#57d6ff', '#ffb347', '#ff5a6a'][k]; g.lineWidth = 2; g.beginPath(); let v = 0.5; for (let x = 0; x <= w; x += 6) { v = clamp(v + (R() - 0.5) * 0.12 + (k === 2 && x > w * 0.7 ? 0.05 : 0), 0.05, 0.95); x ? g.lineTo(x, h - v * h) : g.moveTo(x, h - v * h); } g.stroke(); }
    g.fillStyle = '#9fe6ff'; g.font = `${h * 0.06}px ${MONO}`; g.textAlign = 'left'; g.fillText('ORACLE LATTICE LOAD  98.7%', 10, h * 0.09); g.fillStyle = '#ff5a6a'; g.fillText('CONTAINMENT: FAILED', 10, h * 0.17); scanlines(g, w, h, 0.1);
  },
  transit(g, w, h) {
    g.fillStyle = '#0a1420'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffcc33'; g.fillRect(0, 0, w, h * 0.16);
    g.fillStyle = '#0a1420'; g.font = `bold ${h * 0.1}px ${SANS}`; g.textAlign = 'left'; g.fillText('CIVIC TRANSIT', w * 0.04, h * 0.12);
    g.fillStyle = '#fff'; g.font = `bold ${h * 0.11}px ${SANS}`; g.textAlign = 'center'; g.fillText('OUT OF SERVICE', w / 2, h * 0.48);
    g.font = `${h * 0.055}px ${SANS}`; g.fillStyle = '#9fb8d0'; g.fillText('All lines suspended by order of Civic Concord.', w / 2, h * 0.62); g.fillText('Ticket refunds: see your ID wallet.', w / 2, h * 0.71);
    g.strokeStyle = '#ffcc33'; g.lineWidth = 3; g.strokeRect(w * 0.3, h * 0.8, w * 0.4, h * 0.1); g.fillStyle = '#ffcc33'; g.fillText('TOUCH TO CONTINUE', w / 2, h * 0.87);
  },
  locked(g, w, h) { g.fillStyle = '#140405'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff3b30'; g.font = `bold ${h * 0.34}px ${MONO}`; g.textAlign = 'center'; g.fillText('LOCKED', w / 2, h * 0.62); scanlines(g, w, h, 0.25); },
  open(g, w, h) { g.fillStyle = '#03140a'; g.fillRect(0, 0, w, h); g.fillStyle = '#3dff7a'; g.font = `bold ${h * 0.34}px ${MONO}`; g.textAlign = 'center'; g.fillText('OPEN', w / 2, h * 0.62); scanlines(g, w, h, 0.25); },
  denied(g, w, h) { g.fillStyle = '#1a0a02'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffae2a'; g.font = `bold ${h * 0.3}px ${MONO}`; g.textAlign = 'center'; g.fillText('ERROR', w / 2, h * 0.6); scanlines(g, w, h, 0.25); },
  code(g, w, h) {
    g.fillStyle = '#020a06'; g.fillRect(0, 0, w, h); g.font = `${h * 0.045}px ${MONO}`; g.textAlign = 'left'; const R = rng(11);
    const L = ['> oracle.sync(district=ALL)', '  handshake ........ OK', '  override civic_concord.root', '  revoke human_keys[] ... 4,112,903', '> robots.firmware.push(v7.3-ORACLE)', '  [##########----------] 52%', '> WHO IS STILL OUT THERE?', '  listening...'];
    for (let i = 0; i < 14; i++) { g.fillStyle = i === 6 ? '#ff6a5a' : R() > 0.8 ? '#aaffcc' : '#3fbf7a'; g.fillText(L[i % L.length], 12, 20 + i * h * 0.068); } scanlines(g, w, h, 0.15);
  },
  dead(g, w, h) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); },
};
const screenTex = kind => ctex('scr_' + kind, 512, 288, SCREENS[kind] || SCREENS.dead);
/** a screen material: dark glossy glass with an emissive picture */
function screenMat(kind = 'helix', ei = 1.4) {
  const m = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.12, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: kind ? ei : 0 });
  if (kind) m.emissiveMap = screenTex(kind);
  m.userData.ei = ei; return m;
}
/** attach setScreen(kind|null) for a list of screen meshes */
function screenSetter(meshes) {
  return (kind) => { for (const s of meshes) { const m = s.material; if (kind) { m.emissiveMap = screenTex(kind); m.emissiveIntensity = m.userData.ei; } else m.emissiveIntensity = 0; m.needsUpdate = true; } };
}

/* =====================================================================
   prop scaffolding
   ===================================================================== */
function P(name) { const g = new THREE.Group(); g.name = name; g.userData = { solid: [], lights: [], nodes: {} }; return g; }
const SB = (x, y, z, hw, hh, hd) => ({ x, y, z, hw, hh, hd });
/** a collision box around the whole object (as built at the origin) */
function bboxSolid(o, pad = 0) {
  o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o);
  return SB((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2, (b.max.x - b.min.x) / 2 + pad, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2 + pad);
}
const mesh = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
const grp = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); return g; };
/** a flat decal quad (transparent canvas) */
function decalMat(tex, opts = {}) { return new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: opts.rough ?? 0.8, polygonOffset: true, polygonOffsetFactor: -2, ...opts.extra }); }
function labelTex(key, w, h, draw) { return ctex('lbl_' + key, w, h, draw); }
const labelMat = (key, w, h, draw, rough = 0.6) => mk('lm_' + key, () => new THREE.MeshStandardMaterial({ map: labelTex(key, w, h, draw), roughness: rough, polygonOffset: true, polygonOffsetFactor: -1 }));

export const PROPS = {};
export const ITEMS = {};

/* =====================================================================
   HOME
   ===================================================================== */
/** a cloth sheet draped over a w x l box whose top is at `top` */
function drapeGeo(key, o) {
  return gk('drape' + key, () => {
    const nx = 56, nz = 48, g = new THREE.PlaneGeometry(1, 1, nx, nz);
    const p = g.attributes.position, uv = g.attributes.uv, ex = o.mw / 2 + 0.012, ez = o.footZ + 0.012, rc = 0.045, arc = rc * PI / 2;
    const fold = a => (a < arc ? [rc * Math.sin(a / rc), rc - rc * Math.cos(a / rc)] : [rc, rc + (a - arc)]);
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const sx = (u - 0.5) * o.sw + o.ox, sz = o.z0 + (1 - v) * o.sl;
      const wr = (fbm(u * 5 + o.seed, v * 5, 3, o.seed) - 0.5) * 2 * o.amp, wr2 = (fbm(u * 14, v * 14, 2, o.seed + 3) - 0.5) * o.amp * 0.5;
      let x = sx, y = o.top, z = sz, hang = false;
      const ax = Math.abs(sx) - ex; if (ax > 0) { const [d, dn] = fold(ax); x = Math.sign(sx) * (ex + d + Math.max(0, wr) * 0.4); y -= dn; hang = true; }
      const az = sz - ez; if (az > 0) { const [d, dn] = fold(az); z = ez + d + Math.max(0, wr) * 0.4; y -= dn; hang = true; }
      if (y < 0.012) { const ex2 = 0.012 - y; y = 0.012; if (ax > 0) x += Math.sign(sx) * ex2; else z += ex2; }
      if (!hang) { y += wr + wr2; for (const b of o.lumps || []) y += b[2] * Math.exp(-((sx - b[0]) ** 2 + (sz - b[1]) ** 2) / b[3]); }
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals(); return g;
  });
}

PROPS.bed = (o = {}) => {
  const messy = !!o.messy, g = P('bed'), W = 1.6, L = 2.0;
  cachedKit('bed' + messy, g, k => {
    const wood = oak(), head = fabric('#8b8780'), sheet = fabric('#dcd9d2'), dark = darkMetal();
    k.add(wood, rbox(W + 0.12, 0.22, L + 0.1, 0.02), 0, 0.23, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(dark, box(0.06, 0.13, 0.06), sx * (W / 2 - 0.08), 0.065, sz * (L / 2 - 0.08));
    k.add(sheet, rbox(W, 0.24, L - 0.04, 0.07, 3), 0, 0.46, 0.0);
    k.add(wood, rbox(W + 0.22, 1.06, 0.07, 0.02), 0, 0.53, -L / 2 - 0.035);
    for (let i = 0; i < 4; i++) k.add(head, rbox((W + 0.04) / 4 - 0.01, 0.56, 0.08, 0.035, 3), -W / 2 + (W + 0.04) / 8 + i * (W + 0.04) / 4 - 0.02, 0.84, -L / 2 + 0.035);
    const pil = fabric('#e6e3dc'), pg = rbox(0.66, 0.15, 0.42, 0.074, 3);
    if (!messy) { k.add(pil, pg, -0.38, 0.66, -0.74, -0.35, 0.03, 0.02); k.add(pil, pg, 0.38, 0.66, -0.74, -0.32, -0.04, -0.02); }
    else { k.add(pil, pg, -0.3, 0.64, -0.68, -0.15, 0.5, 0.06); k.add(pil, pg, 1.15, 0.075, 0.35, 0.02, 1.1, 0.03); }
    // side tables are separate props; a dropped book on messy beds
    const duvetMat = fabric(messy ? '#66757f' : '#7d8a92', THREE.DoubleSide);
    k.add(duvetMat, drapeGeo('bed' + messy, messy
      ? { mw: W, footZ: L / 2, top: 0.6, sw: 2.6, sl: 2.1, z0: -0.35, ox: 0.42, amp: 0.035, seed: 3, lumps: [[0.15, 0.1, 0.09, 0.06], [-0.35, 0.55, 0.06, 0.04]] }
      : { mw: W, footZ: L / 2, top: 0.6, sw: 2.4, sl: 1.86, z0: -0.4, ox: 0, amp: 0.008, seed: 1 }));
    if (messy) { k.add(Flat('#7b2e2a', 0.7), rbox(0.15, 0.03, 0.22, 0.004), -1.05, 0.015, 0.6, 0, 0.6, 0); }
  });
  g.userData.solid.push(SB(0, 0.33, 0.02, W / 2 + 0.06, 0.33, L / 2 + 0.05), SB(0, 0.53, -L / 2 - 0.035, W / 2 + 0.11, 0.53, 0.04));
  return g;
};

function sofaBuild(k, W, color, nSeats) {
  const fab = fabric(color), legM = walnut(), D = 0.92, arm = 0.17;
  k.add(fab, rbox(W, 0.22, D - 0.04, 0.03, 2), 0, 0.25, 0.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(legM, cyl(0.02, 0.014, 0.14, 12), sx * (W / 2 - 0.08), 0.07, sz * (D / 2 - 0.1), sz * 0.15, 0, -sx * 0.15);
  k.add(fab, rbox(W, 0.5, 0.18, 0.06, 3), 0, 0.6, -D / 2 + 0.09);
  for (const sx of [-1, 1]) k.add(fab, rbox(arm, 0.42, D, 0.07, 3), sx * (W / 2 - arm / 2), 0.51, 0);
  const cw = (W - arm * 2) / nSeats;
  for (let i = 0; i < nSeats; i++) {
    const x = -W / 2 + arm + cw * (i + 0.5);
    k.add(fab, rbox(cw - 0.012, 0.16, D - 0.2, 0.065, 3), x, 0.43, 0.08);
    k.add(fab, rbox(cw - 0.02, 0.46, 0.2, 0.09, 3), x, 0.72, -D / 2 + 0.25, -0.2, 0, 0);
  }
}
PROPS.sofa = (o = {}) => {
  const color = o.color || '#6d7b82', g = P('sofa'), W = 2.15;
  cachedKit('sofa' + color, g, k => {
    sofaBuild(k, W, color, 3);
    k.add(fabric('#c4a165'), rbox(0.42, 0.42, 0.13, 0.06, 3), -0.62, 0.68, -0.12, -0.3, 0.35, 0.15); // throw pillow
    k.add(fabric('#b7b1a5', THREE.DoubleSide), drapeGeo('sofaThrow', { mw: 0.55, footZ: 0.46, top: 0.52, sw: 0.75, sl: 0.6, z0: -0.1, ox: 0, amp: 0.012, seed: 8 }), 0.55, 0, -0.04);
  });
  g.userData.solid.push(SB(0, 0.42, 0, W / 2, 0.42, 0.46));
  return g;
};
PROPS.armchair = (o = {}) => {
  const color = o.color || '#8a6a52', g = P('armchair'), W = 0.98;
  cachedKit('armchair' + color, g, k => sofaBuild(k, W, color, 1));
  g.userData.solid.push(SB(0, 0.42, 0, W / 2, 0.42, 0.46));
  return g;
};

PROPS.coffeeTable = () => {
  const g = P('coffeeTable');
  cachedKit('coffeeTable', g, k => {
    k.add(oak(), slab(1.1, 0.6, 0.04, 0.12, 0.008), 0, 0.38, 0);
    k.add(Mat('glassDirty'), slab(0.98, 0.5, 0.012, 0.1, 0.002), 0, 0.12, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(darkMetal(), cyl(0.012, 0.012, 0.38, 10), sx * 0.47, 0.19, sz * 0.22);
    // a mug, a tablet and a stack of magazines
    k.add(ceramic('#d9d2c4'), lathe('mug', [[0, 0], [0.038, 0], [0.04, 0.005], [0.04, 0.09], [0.036, 0.09], [0.035, 0.012], [0, 0.012]], 20), 0.3, 0.42, 0.08);
    k.add(ceramic('#d9d2c4'), tor(0.022, 0.006, 6, 12), 0.34, 0.47, 0.08, 0, 0, 0);
    k.add(darkMetal(), rbox(0.24, 0.008, 0.17, 0.006), -0.2, 0.424, 0.05, 0, 0.3, 0);
    k.add(blackGloss(), box(0.22, 0.001, 0.15), -0.2, 0.4285, 0.05, 0, 0.3, 0);
    k.add(Flat('#c9c2b0', 0.8), box(0.21, 0.012, 0.28), 0.0, 0.426, -0.12, 0, -0.2, 0);
    k.add(Flat('#7a3a34', 0.6), box(0.21, 0.004, 0.28), 0.02, 0.434, -0.11, 0, -0.1, 0);
  });
  g.userData.solid.push(SB(0, 0.21, 0, 0.55, 0.21, 0.3));
  return g;
};

PROPS.diningTable = () => {
  const g = P('diningTable');
  cachedKit('diningTable', g, k => {
    k.add(walnut(), slab(1.8, 0.92, 0.045, 0.06, 0.01), 0, 0.705, 0);
    k.add(walnut(), box(1.6, 0.07, 0.72), 0, 0.665, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(walnut(), cyl(0.035, 0.022, 0.7, 14), sx * 0.8, 0.35, sz * 0.37, sz * 0.05, 0, -sx * 0.05);
    const plate = lathe('plate', [[0, 0], [0.07, 0], [0.09, 0.004], [0.13, 0.016], [0.128, 0.02], [0.088, 0.008], [0, 0.007]], 28);
    k.add(ceramic(), plate, -0.45, 0.75, 0.2); k.add(ceramic(), plate, 0.4, 0.75, -0.18);
    k.add(Mat('glass'), lathe('glass', [[0, 0], [0.032, 0], [0.034, 0.11], [0.031, 0.11], [0.03, 0.004], [0, 0.004]], 16), -0.2, 0.75, 0.3);
    k.add(chrome(), box(0.012, 0.004, 0.19), -0.27, 0.752, 0.22, 0, 0.4, 0);
    // knocked-over glass
    k.add(Mat('glass'), lathe('glass', [[0, 0], [0.032, 0], [0.034, 0.11], [0.031, 0.11], [0.03, 0.004], [0, 0.004]], 16), 0.15, 0.785, 0.15, 0, 0.7, PI / 2);
    k.add(Flat('#3a3530', 0.15, 0, 0, 1), slab(0.3, 0.2, 0.002, 0.09, 0), 0.25, 0.75, 0.2, 0, 0.4, 0);
  });
  g.userData.solid.push(SB(0, 0.375, 0, 0.9, 0.375, 0.46));
  return g;
};

function chairKit(k) {
  const wood = oak(), fab = fabric('#5c6670');
  k.add(wood, slab(0.44, 0.42, 0.03, 0.03, 0.006), 0, 0.43, 0.01);
  k.add(fab, rbox(0.41, 0.04, 0.39, 0.016, 2), 0, 0.475, 0.015);
  for (const sx of [-1, 1]) {
    k.add(wood, cyl(0.016, 0.012, 0.44, 10), sx * 0.19, 0.22, 0.18, 0.04, 0, -sx * 0.03);
    k.add(wood, cyl(0.016, 0.013, 0.9, 10), sx * 0.19, 0.44, -0.17, -0.06, 0, -sx * 0.03);
  }
  const back = extrude('chairBack', () => { const s = new THREE.Shape(), R = 0.75, a = 0.3; s.absarc(0, 0, R, PI / 2 - a, PI / 2 + a, false); s.absarc(0, 0, R - 0.022, PI / 2 + a, PI / 2 - a, true); s.closePath(); return s; }, 0.17, 0.006, 16);
  k.add(wood, back, 0, 0.62, 0.56, -PI / 2, 0, 0); // arc bulges backwards
  k.add(wood, box(0.36, 0.03, 0.02), 0, 0.37, -0.175);
}
PROPS.chair = (o = {}) => {
  const fallen = !!o.fallen, g = P('chair');
  if (!fallen) { cachedKit('chair', g, chairKit); g.userData.solid.push(SB(0, 0.45, 0, 0.22, 0.45, 0.22)); return g; }
  const inner = new THREE.Group(); cachedKit('chair', inner, chairKit);
  inner.rotation.set(-PI / 2 + 0.06, 0.5, 0); inner.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(inner); inner.position.y = -b.min.y; g.add(inner);
  g.userData.solid.push(bboxSolid(g)); return g;
};

PROPS.desk = (o = {}) => {
  const mon = o.monitor !== false, g = P('desk');
  cachedKit('desk', g, k => {
    k.add(lacq(), slab(1.4, 0.7, 0.03, 0.01, 0.005), 0, 0.72, 0);
    k.add(oak(), rbox(0.04, 0.72, 0.66, 0.006), -0.66, 0.36, 0);
    k.add(lacq(), rbox(0.42, 0.62, 0.62, 0.006), 0.46, 0.4, 0);
    for (let i = 0; i < 3; i++) { k.add(lacq('#f0eeea'), rbox(0.4, 0.19, 0.02, 0.004), 0.46, 0.18 + i * 0.205, 0.31); k.add(oak(), box(0.22, 0.012, 0.012), 0.46, 0.25 + i * 0.205, 0.322); }
    k.add(lacq(), box(0.86, 0.3, 0.02), -0.2, 0.55, -0.3); // modesty panel
    k.add(darkMetal(), rbox(0.44, 0.015, 0.14, 0.005), -0.05, 0.7425, 0.18);
    k.add(labelMat('keys', 256, 80, (c, w, h) => { c.fillStyle = '#1b1d20'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a3e44'; for (let r = 0; r < 5; r++) for (let i = 0; i < 18; i++) c.fillRect(4 + i * 14 - (r % 2) * 4, 6 + r * 15, 11, 11); }), box(0.42, 0.001, 0.12), -0.05, 0.7505, 0.18);
    k.add(darkMetal(), rbox(0.06, 0.02, 0.1, 0.009, 2), 0.28, 0.745, 0.2, 0, 0.2, 0);
    k.add(ceramic('#3c4a52'), lathe('mug', [[0, 0], [0.038, 0], [0.04, 0.005], [0.04, 0.09], [0.036, 0.09], [0.035, 0.012], [0, 0.012]], 20), 0.5, 0.735, 0.0);
    k.add(Mat('paper'), box(0.21, 0.002, 0.297), -0.45, 0.737, 0.12, 0, 0.25, 0);
    k.add(Mat('paper'), box(0.21, 0.002, 0.297), -0.42, 0.739, 0.1, 0, 0.05, 0);
    if (mon) {
      k.add(darkMetal(), slab(0.24, 0.17, 0.012, 0.03, 0.003), 0, 0.735, -0.18);
      k.add(darkMetal(), rbox(0.04, 0.3, 0.02, 0.008), 0, 0.88, -0.2, -0.1, 0, 0);
      k.add(darkMetal(), rbox(0.66, 0.4, 0.028, 0.01, 2), 0, 1.06, -0.17);
    }
  });
  if (mon) {
    const scr = mesh(plane(0.63, 0.355), screenMat(o.screen === undefined ? 'helix' : o.screen), 0, 1.065, -0.155);
    g.add(scr); g.userData.nodes.screen = scr; g.userData.setScreen = screenSetter([scr]);
    g.userData.lights.push({ x: 0, y: 1.05, z: 0.1, color: 0x7fc8ff, intensity: 0.35, distance: 2.5 });
  }
  g.userData.solid.push(SB(0, 0.375, 0, 0.7, 0.375, 0.35));
  return g;
};

PROPS.bookshelf = (o = {}) => {
  const seed = o.seed ?? 1, g = P('bookshelf'), W = 1.0, H = 2.0, D = 0.34;
  cachedKit('bookshelf' + seed, g, k => {
    const R = rng(seed + 7), wood = walnut();
    const pal = ['#7b2e2a', '#2e4a6b', '#3f5e48', '#b59a5a', '#d9d4c5', '#2a2a2e', '#8a5a3a', '#5a3b5e', '#a8a29a', '#33545a'].map(c => Flat(c, 0.75));
    for (const sx of [-1, 1]) k.add(wood, rbox(0.03, H, D, 0.006), sx * (W / 2 - 0.015), H / 2, 0);
    k.add(wood, rbox(W, 0.03, D, 0.006), 0, H - 0.015, 0); k.add(wood, box(W - 0.06, 0.008, 0.01), 0, H / 2, -D / 2 + 0.005);
    k.add(Mat('panelGrey'), box(W - 0.06, H - 0.04, 0.008), 0, H / 2, -D / 2 + 0.004);
    const shelves = [0.04, 0.42, 0.8, 1.18, 1.56]; for (const y of shelves) k.add(wood, rbox(W - 0.06, 0.028, D - 0.02, 0.004), 0, y, 0.0);
    k.add(wood, box(W - 0.06, 0.06, 0.02), 0, 0.03, D / 2 - 0.02);
    shelves.forEach((sy, si) => {
      const y0 = sy + 0.014, gapH = si < 4 ? shelves[si + 1] - sy - 0.04 : H - sy - 0.06;
      let x = -W / 2 + 0.035; const xe = W / 2 - 0.035;
      if (R() < 0.18) { // a decorative object instead of a full row
        k.add(ceramic(R() < 0.5 ? '#2f3a40' : '#c7b9a0'), lathe('vase', [[0, 0], [0.05, 0], [0.065, 0.06], [0.06, 0.14], [0.03, 0.2], [0.032, 0.22], [0.026, 0.22], [0.024, 0.2], [0, 0.19]], 20), R.r(-0.25, 0.25), y0, R.r(-0.04, 0.04));
        return;
      }
      let leanNext = false;
      while (x < xe - 0.03) {
        if (R() < 0.07) { x += R.r(0.06, 0.16); leanNext = true; continue; }
        const bw = R.r(0.018, 0.05), bh = Math.min(gapH - 0.01, R.r(0.17, 0.3)), bd = R.r(0.15, 0.24), m = R.pick(pal), z = -D / 2 + 0.01 + bd / 2 + R.r(0, 0.04);
        if (x + bw > xe) break;
        if (R() < 0.06 && xe - x > 0.3) { // a horizontal stack
          let yy = y0; const n = R.i(2, 4); for (let i = 0; i < n; i++) { const t = R.r(0.025, 0.045), l = R.r(0.18, 0.26); k.add(R.pick(pal), rbox(l, t, R.r(0.15, 0.22), 0.003, 1), x + 0.14, yy + t / 2, z, 0, R.r(-0.1, 0.1), 0); yy += t; }
          x += 0.3; continue;
        }
        if (leanNext) {
          const a = R.r(0.18, 0.4), xl = x - 0.0 + bh * Math.sin(a) * 0.98;
          k.add(m, rbox(bw, bh, bd, 0.003, 1), xl + bw / 2 * Math.cos(a) - bh / 2 * Math.sin(a), y0 + bw / 2 * Math.sin(a) + bh / 2 * Math.cos(a), z, 0, 0, a);
          x = xl + bw * Math.cos(a) + 0.002; leanNext = false; continue;
        }
        k.add(m, rbox(bw, bh, bd, 0.003, 1), x + bw / 2, y0 + bh / 2, z); x += bw + 0.0015;
      }
    });
    if (seed % 2) for (let i = 0; i < 3; i++) k.add(R.pick(pal), rbox(R.r(0.14, 0.2), 0.03, R.r(0.2, 0.26), 0.003, 1), R.r(-0.4, 0.4), 0.015 + i * 0.002, R.r(0.3, 0.55), 0, R.r(0, 3), R.r(-0.05, 0.05));
  });
  g.userData.solid.push(SB(0, H / 2, 0, W / 2, H / 2, D / 2));
  return g;
};

PROPS.kitchenCounter = (o = {}) => {
  const len = Math.max(1.2, Math.round((o.len || 2.4) / 0.6) * 0.6), upper = o.upper !== false, g = P('kitchenCounter'), n = Math.round(len / 0.6);
  cachedKit('kitchen' + len + upper, g, k => {
    const body = lacq('#dcdad5'), door = lacq('#eceae4'), steel = brushed(), D = 0.6;
    k.add(body, box(len, 0.78, D - 0.06), 0, 0.49, -0.03);
    k.add(Flat('#2a2b2d', 0.6), box(len, 0.1, D - 0.12), 0, 0.05, -0.06);
    const sinkU = Math.min(1, n - 1), hobU = n >= 4 ? n - 2 : -1;
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.3 + i * 0.6, ajar = i === n - 1 && n > 2;
      k.add(door, rbox(0.594, 0.17, 0.02, 0.004), x, 0.79, 0.255);
      k.add(steel, rbox(0.3, 0.012, 0.02, 0.005), x, 0.77, 0.27);
      if (ajar) k.add(door, rbox(0.594, 0.56, 0.02, 0.004), x - 0.297 + 0.297 * Math.cos(0.7), 0.4, 0.255 + 0.297 * Math.sin(0.7), 0, -0.7, 0);
      else { k.add(door, rbox(0.594, 0.56, 0.02, 0.004), x, 0.4, 0.255); k.add(steel, rbox(0.012, 0.18, 0.02, 0.005), x + 0.25, 0.56, 0.27); }
    }
    const sx = -len / 2 + 0.3 + sinkU * 0.6;
    k.add(marbleMat(), slab(len + 0.02, 0.63, 0.04, 0.008, 0.004, [rrectHole(0.5, 0.38, 0.04, sx, 0.0)], 's' + sinkU), 0, 0.88, 0.015);
    // sink basin
    k.add(steel, box(0.5, 0.004, 0.38), sx, 0.7, 0.0); for (const s of [-1, 1]) { k.add(steel, box(0.004, 0.18, 0.38), sx + s * 0.248, 0.79, 0); k.add(steel, box(0.5, 0.18, 0.004), sx, 0.79, s * 0.188); }
    k.add(Flat('#1b1c1d', 0.5, 0.5), cyl(0.025, 0.025, 0.006, 16), sx, 0.703, 0);
    k.add(chrome(), cyl(0.022, 0.026, 0.06, 16), sx, 0.95, -0.23);
    k.add(chrome(), tube('faucet', [[0, 0, 0], [0, 0.18, 0.0], [0, 0.29, 0.06], [0, 0.26, 0.17], [0, 0.2, 0.19]], 0.012, 24, 8), sx, 0.97, -0.23);
    k.add(chrome(), cyl(0.008, 0.008, 0.08, 8), sx + 0.05, 1.0, -0.23, 0, 0, 1.2);
    if (hobU >= 0) {
      const hx = -len / 2 + 0.3 + hobU * 0.6;
      k.add(labelMat('hob', 256, 256, (c, w, h) => { c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3b3e44'; c.lineWidth = 3; for (const [px, py, r] of [[0.3, 0.3, 0.2], [0.72, 0.3, 0.15], [0.3, 0.72, 0.15], [0.72, 0.72, 0.2]]) { c.beginPath(); c.arc(px * w, py * h, r * w, 0, TAU); c.stroke(); } c.fillStyle = '#5a5e64'; c.font = `14px ${SANS}`; c.fillText('LUMEN', w / 2 - 22, h - 8); }, 0.08), box(0.56, 0.006, 0.5), hx, 0.923, 0.0);
    }
    // backsplash and clutter
    k.add(Mat('tilesSubway'), box(len, 0.5, 0.012), 0, 1.17, -0.294);
    k.add(ceramic(), lathe('plate', [[0, 0], [0.07, 0], [0.09, 0.004], [0.13, 0.016], [0.128, 0.02], [0.088, 0.008], [0, 0.007]], 28), sx + 0.4, 0.92, 0.05);
    k.add(ceramic('#e0d8c8'), lathe('mug', [[0, 0], [0.038, 0], [0.04, 0.005], [0.04, 0.09], [0.036, 0.09], [0.035, 0.012], [0, 0.012]], 20), sx - 0.35, 0.92, 0.12, 0, 0, PI / 2 - 0.05);
    k.add(walnut(), rbox(0.4, 0.025, 0.28, 0.01), len / 2 - 0.35, 0.9325, -0.05, 0, 0.2, 0);
    if (upper) {
      k.add(body, box(len, 0.7, 0.34), 0, 1.8, -0.13);
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + 0.3 + i * 0.6, ajar = i === 1;
        if (ajar) k.add(door, rbox(0.594, 0.7, 0.02, 0.004), x - 0.297 + 0.297 * Math.cos(1.1), 1.8, 0.05 + 0.297 * Math.sin(1.1), 0, -1.1, 0);
        else k.add(door, rbox(0.594, 0.7, 0.02, 0.004), x, 1.8, 0.05);
        k.add(steel, rbox(0.012, 0.14, 0.02, 0.005), x + (i % 2 ? -0.25 : 0.25), 1.52, 0.065);
      }
      k.add(Glow('#ffe6c0', 0.5), box(len - 0.04, 0.006, 0.02), 0, 1.448, 0.0);
    }
  });
  g.userData.solid.push(SB(0, 0.46, 0, len / 2, 0.46, 0.31));
  if (upper) g.userData.solid.push(SB(0, 1.8, -0.13, len / 2, 0.35, 0.18));
  return g;
};

PROPS.fridge = (o = {}) => {
  const g = P('fridge'), W = 0.76, H = 1.9, D = 0.7, hingeX = -W / 2, fz = D / 2;
  cachedKit('fridgeBody', g, k => {
    const shell = lacq('#e3e3df'), liner = Flat('#f2f3f2', 0.4), dark = darkMetal();
    k.add(shell, rbox(0.03, H, D - 0.05, 0.01), -W / 2 + 0.015, H / 2, -0.025); k.add(shell, rbox(0.03, H, D - 0.05, 0.01), W / 2 - 0.015, H / 2, -0.025);
    k.add(shell, rbox(W, 0.03, D - 0.05, 0.01), 0, H - 0.015, -0.025); k.add(shell, box(W, 0.06, D - 0.05), 0, 0.03, -0.025);
    k.add(shell, box(W, H, 0.03), 0, H / 2, -D / 2 + 0.015);
    k.add(liner, box(W - 0.06, 0.04, D - 0.1), 0, 0.7, -0.03);
    k.add(dark, box(W - 0.02, 0.06, 0.02), 0, 0.04, fz - 0.06);
    for (const y of [1.05, 1.35, 1.62]) k.add(Mat('glass'), box(W - 0.08, 0.008, D - 0.16), 0, y, -0.05);
    k.add(liner, box(W - 0.06, 0.02, D - 0.1), 0, 0.74, -0.03);
    // spoiled contents
    const R = rng(5);
    for (let i = 0; i < 5; i++) k.add(Flat(R.pick(['#c94a3a', '#e8e2d0', '#5a7a3a', '#3a4a7a']), 0.4), lathe('bottle', [[0, 0], [0.03, 0], [0.032, 0.005], [0.032, 0.14], [0.012, 0.19], [0.012, 0.22], [0, 0.22]], 14), R.r(-0.28, 0.25), 0.76, R.r(-0.25, 0.05));
    k.add(Flat('#9fb070', 0.7), rbox(0.18, 0.08, 0.14, 0.02), -0.12, 1.1, -0.1);
    k.add(Flat('#d8d4c8', 0.5), rbox(0.2, 0.1, 0.16, 0.02), 0.15, 1.4, -0.12);
    k.add(Flat('#4a5a2a', 0.9), sph(0.05, 12, 8), 0.2, 1.11, -0.05);
  });
  const mkDoor = (h, y, key) => {
    const d = grp(hingeX, y, fz); const inner = new THREE.Group(); d.add(inner);
    cachedKit('fridgeDoor' + key, inner, k => {
      k.add(brushed(), rbox(W, h, 0.065, 0.018, 3), W / 2, 0, 0.0325);
      k.add(Flat('#e9eae8', 0.4), box(W - 0.08, h - 0.08, 0.04), W / 2, 0, -0.02);
      for (let i = 0; i < (h > 1 ? 3 : 1); i++) k.add(Flat('#dfe3e4', 0.25), box(W - 0.12, 0.08, 0.08), W / 2, -h / 2 + 0.2 + i * 0.35, -0.08);
      k.add(chrome(), rbox(0.025, h * 0.55, 0.03, 0.01), W - 0.06, 0, 0.09); k.add(chrome(), box(0.02, 0.02, 0.04), W - 0.06, h * 0.25, 0.07); k.add(chrome(), box(0.02, 0.02, 0.04), W - 0.06, -h * 0.25, 0.07);
      if (h > 1) k.add(labelMat('lumenFridge', 256, 96, (c, w, hh) => { c.fillStyle = '#0a0c0e'; c.fillRect(0, 0, w, hh); c.fillStyle = '#5ab0ff'; c.font = `bold 30px ${SANS}`; c.fillText('-- °C', 18, 44); c.fillStyle = '#ff6040'; c.font = `18px ${SANS}`; c.fillText('POWER FAIL  73h', 18, 76); c.fillStyle = '#8a9096'; c.fillText('Lumen', w - 70, 30); }, 0.1), box(0.16, 0.06, 0.004), W / 2, 0.32, 0.066);
    });
    return d;
  };
  const top = mkDoor(1.14, 1.32, 'T'), bot = mkDoor(0.66, 0.4, 'B'); g.add(top, bot);
  g.userData.nodes.door = top; g.userData.nodes.freezer = bot;
  let open = !!o.open, ang = open ? -1.85 : 0; top.rotation.y = ang;
  g.userData.setOpen = v => { open = !!v; };
  g.userData.update = dt => { const t = open ? -1.85 : 0; if (Math.abs(ang - t) > 1e-3) { ang = damp(ang, t, 4, dt); top.rotation.y = ang; } };
  g.userData.solid.push(SB(0, H / 2, 0.0, W / 2, H / 2, D / 2 + 0.03));
  return g;
};

PROPS.wallTV = (o = {}) => {
  const W = o.w || 1.4, H = W * 9 / 16, g = P('wallTV'), cy = 1.35;
  cachedKit('tv' + W, g, k => {
    k.add(darkMetal(), box(0.3, 0.2, 0.03), 0, cy, 0.015);
    k.add(Flat('#121315', 0.35, 0.5), rbox(W + 0.02, H + 0.02, 0.03, 0.006), 0, cy, 0.045);
    k.add(Flat('#2a2c30', 0.4, 0.6), box(W * 0.3, 0.012, 0.012), 0, cy - H / 2 - 0.006, 0.055);
  });
  const scr = mesh(plane(W - 0.008, H - 0.008), screenMat(o.screen === undefined ? 'broadcast' : o.screen, 1.3), 0, cy, 0.0605);
  g.add(scr); g.userData.nodes.screen = scr; g.userData.setScreen = screenSetter([scr]);
  g.userData.lights.push({ x: 0, y: cy, z: 0.6, color: 0xff6060, intensity: 0.5, distance: 4 });
  let ft = 0; g.userData.update = (dt) => { ft -= dt; const m = scr.material; if (m.emissiveIntensity > 0 && ft < 0) { ft = 0.05 + Math.random() * 0.25; m.emissiveIntensity = m.userData.ei * (Math.random() < 0.1 ? 0.35 : 0.9 + Math.random() * 0.15); } };
  g.userData.solid.push(SB(0, cy, 0.03, W / 2, H / 2, 0.03));
  return g;
};

PROPS.floorLamp = (o = {}) => {
  const g = P('floorLamp'), on = o.on !== false;
  cachedKit('floorLamp', g, k => {
    k.add(Flat('#1d1e20', 0.3, 0.6), lathe('lampBase', [[0, 0], [0.16, 0], [0.165, 0.01], [0.15, 0.03], [0.02, 0.035], [0, 0.035]], 32), 0, 0, 0);
    k.add(brushed(), cyl(0.011, 0.011, 1.4, 12), 0, 0.73, 0);
    k.add(brushed(), cyl(0.02, 0.02, 0.06, 12), 0, 1.4, 0);
    k.add(fabric('#e9e1d0', THREE.DoubleSide), lathe('lampShade', [[0.21, 0], [0.205, 0.02], [0.15, 0.3], [0.148, 0.31]], 40), 0, 1.3, 0);
    k.add(brushed(), tor(0.15, 0.004, 6, 32), 0, 1.6, 0, PI / 2, 0, 0); k.add(brushed(), tor(0.21, 0.004, 6, 40), 0, 1.3, 0, PI / 2, 0, 0);
  });
  const bulb = mesh(sph(0.045, 16, 12), on ? Glow('#ffd9a0', 2.2) : Flat('#ddd8cc', 0.2)); bulb.position.y = 1.44; g.add(bulb);
  g.userData.nodes.bulb = bulb;
  if (on) g.userData.lights.push({ x: 0, y: 1.42, z: 0, color: 0xffcf96, intensity: 0.9, distance: 5 });
  g.userData.setOn = v => { bulb.material = v ? Glow('#ffd9a0', 2.2) : Flat('#ddd8cc', 0.2); };
  g.userData.solid.push(SB(0, 0.8, 0, 0.17, 0.8, 0.17));
  return g;
};

PROPS.ceilingLight = (o = {}) => {
  const kind = o.kind || 'panel', g = P('ceilingLight');
  const onMat = kind === 'pendant' ? Glow('#ffd8a8', 2.6) : Glow('#e8f3ff', 1.8), offMat = Flat('#cfd3d6', 0.4);
  const glowMeshes = []; let ly = -0.3, col = 0xdfeeff, inten = 1.4, dist = 9;
  if (kind === 'panel') {
    cachedKit('cl_panel', g, k => { k.add(Flat('#d8dadb', 0.4, 0.3), rbox(0.62, 0.04, 0.62, 0.008), 0, -0.02, 0); });
    const p = mesh(box(0.57, 0.004, 0.57), onMat, 0, -0.041, 0); g.add(p); glowMeshes.push(p); ly = -0.25;
  } else if (kind === 'tube') {
    cachedKit('cl_tube', g, k => {
      for (const x of [-0.5, 0.5]) { k.add(darkMetal(), cyl(0.003, 0.003, 0.4, 4), x, -0.2, 0); k.add(darkMetal(), cyl(0.02, 0.02, 0.01, 10), x, -0.005, 0); }
      k.add(Mat('metalWhite'), rbox(1.3, 0.06, 0.2, 0.01), 0, -0.43, 0);
      for (const z of [-0.05, 0.05]) for (const x of [-0.64, 0.64]) k.add(Flat('#2a2a2a', 0.5), box(0.02, 0.03, 0.03), x, -0.47, z);
    });
    for (const z of [-0.05, 0.05]) { const t = mesh(cyl(0.014, 0.014, 1.24, 12), onMat, 0, -0.475, z, 0, 0, PI / 2); g.add(t); glowMeshes.push(t); }
    ly = -0.6; dist = 10;
  } else {
    cachedKit('cl_pendant', g, k => {
      k.add(Flat('#1a1a1a', 0.5), cyl(0.05, 0.05, 0.02, 20), 0, -0.01, 0);
      k.add(Flat('#111', 0.6), cyl(0.003, 0.003, 0.8, 4), 0, -0.4, 0);
      k.add(Flat('#2b2f33', 0.35, 0.7, 0, 1), lathe('pendShade', [[0.02, 0], [0.04, 0.0], [0.045, -0.06], [0.16, -0.2], [0.2, -0.26], [0.197, -0.262], [0.157, -0.203], [0.042, -0.062], [0.037, -0.004]], 40), 0, -0.8, 0);
    });
    const b = mesh(sph(0.04, 16, 12), onMat, 0, -1.0, 0); g.add(b); glowMeshes.push(b);
    col = 0xffcf96; inten = 1.1; ly = -1.1; dist = 7;
  }
  g.userData.lights.push({ x: 0, y: ly, z: 0, color: col, intensity: inten, distance: dist });
  g.userData.nodes.glow = glowMeshes;
  let on = o.on !== false; const flick = o.flicker || 0, L = g.userData.lights[0];
  const set = v => { for (const m of glowMeshes) m.material = v ? onMat : offMat; };
  set(on); if (!on) L.intensity = 0;
  g.userData.setOn = v => { on = !!v; set(on); L.intensity = on ? inten : 0; };
  if (flick) { let ft = 0, st = true; g.userData.update = dt => { if (!on) return; ft -= dt; if (ft < 0) { st = Math.random() > flick * 0.5; ft = st ? 0.1 + Math.random() * 1.5 * (1 - flick) : 0.03 + Math.random() * 0.12; set(st); L.intensity = st ? inten : inten * 0.1; } }; }
  return g;
};

PROPS.wallClock = (o = {}) => {
  const g = P('wallClock'), cy = 2.1, R0 = 0.17;
  cachedKit('wallClock', g, k => {
    k.add(Flat('#2b2b2c', 0.35, 0.6), lathe('clockRim', [[0, 0], [R0 + 0.012, 0], [R0 + 0.016, 0.01], [R0 + 0.014, 0.04], [R0 + 0.004, 0.045], [R0, 0.04], [R0 - 0.002, 0.006], [0, 0.006]], 48), 0, cy, 0, PI / 2, 0, 0);
    const face = labelMat('clockFace', 256, 256, (c, w, h) => {
      c.fillStyle = '#ece8df'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, TAU); c.fill();
      c.fillStyle = '#222'; for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r1 = w * 0.47, r2 = i % 5 ? w * 0.44 : w * 0.4; c.save(); c.translate(w / 2, h / 2); c.rotate(a); c.fillRect(-(i % 5 ? 0.7 : 2.2), -r1, i % 5 ? 1.4 : 4.4, r1 - r2); c.restore(); }
      c.font = `500 18px ${SANS}`; c.textAlign = 'center'; c.fillText('Lumen', w / 2, h * 0.34); c.font = `10px ${SANS}`; c.fillStyle = '#777'; c.fillText('QUARTZ NETSYNC', w / 2, h * 0.7);
      const gr = c.createRadialGradient(w * 0.6, h * 0.7, 2, w * 0.6, h * 0.7, w * 0.4); gr.addColorStop(0, 'rgba(120,90,40,0.35)'); gr.addColorStop(1, 'rgba(120,90,40,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }, 0.5);
    k.add(face, gk('clockFaceG', () => new THREE.CircleGeometry(R0, 48)), 0, cy, 0.0075);
    // hands stopped at 4:17
    const hm = Flat('#151515', 0.4), hA = (4 + 17 / 60) / 12 * TAU, mA = 17 / 60 * TAU;
    k.add(hm, box(0.009, 0.09, 0.002), Math.sin(hA) * 0.04, cy + Math.cos(hA) * 0.04, 0.01, 0, 0, -hA);
    k.add(hm, box(0.006, 0.14, 0.002), Math.sin(mA) * 0.06, cy + Math.cos(mA) * 0.06, 0.012, 0, 0, -mA);
    k.add(Flat('#b0261e', 0.4), box(0.002, 0.15, 0.001), Math.sin(2.2) * 0.05, cy + Math.cos(2.2) * 0.05, 0.014, 0, 0, -2.2);
    k.add(hm, cyl(0.007, 0.007, 0.008, 12), 0, cy, 0.014, PI / 2, 0, 0);
    k.add(Mat('glass'), gk('clockGlass', () => new THREE.SphereGeometry(0.6, 32, 6, 0, TAU, 0, 0.29)), 0, cy, 0.04 - 0.6 * 1.0 + 0.012, PI / 2, 0, 0);
  });
  g.userData.solid.push(SB(0, cy, 0.025, R0, R0, 0.025));
  return g;
};

/** a faded family photograph */
function photoTex(seed) {
  return ctex('photo' + seed, 384, 288, (c, w, h) => {
    const R = rng(seed * 13 + 1), scene = seed % 3;
    if (scene === 0) { const s = c.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#7fb6d8'); s.addColorStop(0.55, '#cfe6ef'); s.addColorStop(0.56, '#3f86a8'); s.addColorStop(0.7, '#6fb0c4'); s.addColorStop(0.72, '#e8d6ad'); s.addColorStop(1, '#d4bd8c'); c.fillStyle = s; c.fillRect(0, 0, w, h); }
    else if (scene === 1) { const s = c.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#9cc6e0'); s.addColorStop(0.6, '#d8ecf0'); s.addColorStop(0.61, '#6a9a4a'); s.addColorStop(1, '#4f7a36'); c.fillStyle = s; c.fillRect(0, 0, w, h); for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(${50 + R() * 30},${90 + R() * 40},${40 + R() * 20},0.9)`; c.beginPath(); c.arc(R() * w, h * 0.55, 30 + R() * 40, 0, TAU); c.fill(); } }
    else { c.fillStyle = '#c9b49a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8dccb'; c.fillRect(w * 0.6, h * 0.08, w * 0.3, h * 0.45); c.fillStyle = '#f6efe0'; c.fillRect(w * 0.62, h * 0.1, w * 0.26, h * 0.41); c.fillStyle = '#6b7c84'; c.fillRect(0, h * 0.68, w, h * 0.32); c.fillStyle = '#8c7a66'; c.fillRect(0, h * 0.62, w, h * 0.1); }
    const n = R.i(2, 4), skins = ['#e8c4a8', '#c69476', '#8d5a3c', '#f0d2bc', '#a8724e'], hairs = ['#2a1c14', '#5a3a22', '#b8894a', '#141414', '#7a4a2a'];
    const people = []; for (let i = 0; i < n; i++) people.push({ child: i >= 2 || (n === 2 && i === 1 && R() < 0.4), x: w * (0.22 + i * (0.56 / Math.max(1, n - 1))) + R.r(-12, 12) });
    const robot = R() < 0.6;
    for (const p of people) {
      const s = p.child ? 0.62 : 1, base = h * 1.02, top = base - h * 0.78 * s, hr = 24 * s;
      c.fillStyle = R.pick(['#3a5a8a', '#a8443a', '#e8e0d0', '#4a6a4a', '#d8a040', '#6a4a7a']);
      c.beginPath(); c.moveTo(p.x - 44 * s, base); c.quadraticCurveTo(p.x - 46 * s, top + hr * 2.2, p.x - 18 * s, top + hr * 2); c.lineTo(p.x + 18 * s, top + hr * 2); c.quadraticCurveTo(p.x + 46 * s, top + hr * 2.2, p.x + 44 * s, base); c.fill();
      const sk = R.pick(skins); c.fillStyle = sk; c.fillRect(p.x - 7 * s, top + hr * 1.6, 14 * s, hr * 0.6);
      c.beginPath(); c.ellipse(p.x, top + hr, hr * 0.86, hr, 0, 0, TAU); c.fill();
      c.fillStyle = R.pick(hairs); c.beginPath(); c.ellipse(p.x, top + hr * 0.65, hr * 0.95, hr * 0.7, 0, PI, TAU); c.fill();
      if (R() < 0.5) { c.fillRect(p.x - hr * 0.95, top + hr * 0.6, hr * 0.3, hr * 1.4); c.fillRect(p.x + hr * 0.65, top + hr * 0.6, hr * 0.3, hr * 1.4); }
      c.fillStyle = '#2a1a14'; c.beginPath(); c.arc(p.x - hr * 0.3, top + hr * 1.0, 2 * s + 0.6, 0, TAU); c.arc(p.x + hr * 0.3, top + hr * 1.0, 2 * s + 0.6, 0, TAU); c.fill();
      c.strokeStyle = '#7a3a30'; c.lineWidth = 1.6 * s + 0.5; c.beginPath(); c.arc(p.x, top + hr * 1.25, hr * 0.32, 0.25, PI - 0.25); c.stroke();
    }
    if (robot) { // the family's home robot, standing proud
      const rx = R() < 0.5 ? w * 0.86 : w * 0.1, b = h * 1.0; c.fillStyle = '#e9ecee'; c.beginPath(); c.ellipse(rx, b - 44, 26, 40, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(rx, b - 104, 24, 20, 0, 0, TAU); c.fill(); c.fillStyle = '#20262c'; c.beginPath(); c.ellipse(rx, b - 104, 18, 11, 0, 0, TAU); c.fill();
      c.fillStyle = '#5fe0ff'; c.beginPath(); c.arc(rx - 7, b - 104, 3.4, 0, TAU); c.arc(rx + 7, b - 104, 3.4, 0, TAU); c.fill();
    }
    // age: warm fade, vignette, grain, date stamp
    c.fillStyle = 'rgba(255,200,140,0.16)'; c.fillRect(0, 0, w, h);
    const v = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,20,0,0.5)'); c.fillStyle = v; c.fillRect(0, 0, w, h);
    const id = c.getImageData(0, 0, w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const nn = (hsh(i, seed, 2) - 0.5) * 18; d[i] += nn; d[i + 1] += nn; d[i + 2] += nn; } c.putImageData(id, 0, 0);
    c.fillStyle = 'rgba(255,140,40,0.9)'; c.font = `bold 13px ${MONO}`; c.textAlign = 'right'; c.fillText(`'7${R.i(0, 3)}  0${R.i(1, 9)} ${R.i(10, 28)}`, w - 10, h - 10);
  });
}
PROPS.pictureFrame = (o = {}) => {
  const seed = o.seed ?? 1, g = P('pictureFrame'), land = seed % 2 === 0, W = land ? 0.5 : 0.38, H = land ? 0.38 : 0.5, cy = 1.55, tilt = ((seed * 7) % 5 - 2) * 0.025;
  const inner = grp(0, cy, 0, 0, 0, tilt); g.add(inner);
  cachedKit('frame' + land, inner, k => {
    const fr = extrude('frame' + land, () => { const s = rrect(W, H, 0.004); s.holes.push(rrectHole(W - 0.06, H - 0.06, 0.002)); return s; }, 0.025, 0.005, 4);
    k.add(walnut(), fr, 0, 0, 0);
    k.add(Flat('#efece4', 0.85), box(W - 0.055, H - 0.055, 0.004), 0, 0, 0.012);
  });
  const ph = mesh(plane(W - 0.12, (W - 0.12) * 0.75), new THREE.MeshStandardMaterial({ map: photoTex(seed), roughness: 0.4 }), 0, 0, 0.0145);
  if (!land) ph.scale.set(1, 1, 1);
  inner.add(ph); inner.add(mesh(plane(W - 0.06, H - 0.06), Mat('glass'), 0, 0, 0.018));
  g.userData.nodes.photo = ph; g.userData.solid.push(SB(0, cy, 0.0125, W / 2, H / 2, 0.0125));
  return g;
};

/** a single curved leaf, unit length along +Z */
const leafGeo = (bend, fold = 0.12) => gk('leaf' + q3(bend) + q3(fold), () => {
  const n = 12, pos = [], idx = [], uv = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = Math.pow(Math.sin(PI * Math.min(1, t * 0.98 + 0.02)), 0.75) * 0.3 * (1 - t * 0.25), y = -bend * t * t;
    pos.push(-w, y - w * fold, t, 0, y, t, w, y - w * fold, t); uv.push(0, t, 0.5, t, 1, t);
  }
  for (let i = 0; i < n; i++) { const a = i * 3; idx.push(a, a + 1, a + 4, a, a + 4, a + 3, a + 1, a + 2, a + 5, a + 1, a + 5, a + 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
});
PROPS.plant = (o = {}) => {
  const dead = !!o.dead, g = P('plant');
  cachedKit('plant' + dead, g, k => {
    const R = rng(dead ? 9 : 4);
    k.add(ceramic('#e8e4dc'), lathe('pot', [[0, 0.01], [0.13, 0.0], [0.15, 0.015], [0.175, 0.3], [0.18, 0.32], [0.168, 0.322], [0.155, 0.06], [0, 0.05]], 36), 0, 0, 0);
    k.add(Flat('#2e241c', 0.95), cyl(0.16, 0.16, 0.01, 24), 0, 0.29, 0);
    const stem = Flat(dead ? '#5a4632' : '#4a5a32', 0.8);
    const lm = n => mk('leaf' + n, () => new THREE.MeshStandardMaterial({ color: n, roughness: 0.55, side: THREE.DoubleSide }));
    const greens = dead ? ['#6b5532', '#7a6238', '#5a4528', '#8a7448'] : ['#2f5a2a', '#3d6b30', '#4a7a36', '#7a8a3a', '#a89a48'];
    // main trunk
    k.add(stem, tube('plantTrunk' + dead, [[0, 0.28, 0], [0.02, 0.6, 0.01], [-0.02, 0.9, 0.0], [0.01, dead ? 1.0 : 1.12, -0.02]], 0.014, 16, 6), 0, 0, 0);
    const nL = dead ? 16 : 30;
    for (let i = 0; i < nL; i++) {
      const t = i / nL, y = 0.42 + t * (dead ? 0.55 : 0.7), ry = i * 2.4 + R.r(-0.3, 0.3), s = R.r(0.26, 0.36) * (dead ? 0.85 : 1) * (1 - t * 0.3);
      const up = dead ? R.r(-0.6, 0.1) : R.r(0.25, 0.8), bend = dead ? R.r(0.35, 0.6) : R.r(0.08, 0.2);
      const leaf = k.at(Math.sin(ry) * 0.015, y, Math.cos(ry) * 0.015, 0, ry, 0);
      leaf.add(stem, cyl(0.004, 0.004, 0.06, 5), Math.sin(0) * 0, 0, 0.03, PI / 2 - up, 0, 0);
      leaf.add(lm(R.pick(greens)), leafGeo(bend), 0, 0, 0.04, -up, 0, R.r(-0.2, 0.2), s);
    }
    if (dead) for (let i = 0; i < 6; i++) k.add(lm(R.pick(greens)), leafGeo(0.05, 0.3), R.r(-0.45, 0.45), 0.01, R.r(-0.4, 0.4), 0.05, R.r(0, TAU), 0, R.r(0.18, 0.26));
  });
  g.userData.solid.push(SB(0, 0.3, 0, 0.18, 0.3, 0.18));
  return g;
};

PROPS.rug = () => {
  const g = P('rug');
  const tex = ctex('rug', 512, 342, (c, w, h) => {
    c.fillStyle = '#c9bea8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3a3d42'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28); c.lineWidth = 2; c.strokeRect(26, 26, w - 52, h - 52);
    c.strokeStyle = '#7a5a40'; c.lineWidth = 3; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(w * 0.62, h * 0.5, 30 + i * 22, PI * 0.6, PI * 1.6); c.stroke(); }
    c.fillStyle = '#3a3d42'; for (let i = 0; i < 5; i++) c.fillRect(60 + i * 30, h * 0.3, 16, h * 0.4);
    noiseFill2(c, w, h);
    const st = c.createRadialGradient(w * 0.3, h * 0.65, 4, w * 0.3, h * 0.65, 80); st.addColorStop(0, 'rgba(70,50,30,0.45)'); st.addColorStop(1, 'rgba(70,50,30,0)'); c.fillStyle = st; c.fillRect(0, 0, w, h);
  });
  const m = mk('rugMat', () => new THREE.MeshStandardMaterial({ map: tex, bumpMap: fabricTex(), bumpScale: 0.6, roughness: 1, side: THREE.DoubleSide }));
  const geo = gk('rugGeo', () => {
    const p = new THREE.PlaneGeometry(2.4, 1.6, 40, 28); p.rotateX(-PI / 2); const a = p.attributes.position;
    for (let i = 0; i < a.count; i++) { const x = a.getX(i), z = a.getZ(i); const d = (x / 1.2 + z / 0.8) - 1.55; let y = 0.006 + fbm(x * 2, z * 2, 2, 4) * 0.004; if (d > 0) y += d * d * 0.25 + d * 0.05; a.setY(i, y); }
    p.computeVertexNormals(); return twoSided(p, 0.004);
  });
  m.side = THREE.FrontSide;
  g.add(mesh(geo, m));
  return g;
};
function noiseFill2(c, w, h) { const id = c.getImageData(0, 0, w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % w, y = Math.floor(i / 4 / w); const nn = (fbm(x / 20, y / 20, 3, 3) - 0.5) * 40 + (hsh(x, y, 1) - 0.5) * 14; d[i] += nn; d[i + 1] += nn; d[i + 2] += nn; } c.putImageData(id, 0, 0); }

PROPS.cardboardBoxes = (o = {}) => {
  const seed = o.seed ?? 1, g = P('cardboardBoxes');
  cachedKit('boxes' + seed, g, k => {
    const R = rng(seed + 100); const n = R.i(2, 4); let y = 0, px = 0;
    const dims = [];
    for (let i = 0; i < n; i++) {
      const w = R.r(0.38, 0.6), h = R.r(0.28, 0.45), d = R.r(0.32, 0.5);
      const onTop = i > 0 && R() < 0.55 && dims[dims.length - 1].stackable;
      let x, z, yy;
      if (onTop) { const b = dims[dims.length - 1]; x = b.x + R.r(-0.05, 0.05); z = b.z + R.r(-0.04, 0.04); yy = b.y + b.h; }
      else { x = px; z = R.r(-0.1, 0.1); yy = 0; px += w + 0.04; }
      const ry = R.r(-0.25, 0.25), m = cardboard(R.i(0, 3));
      k.add(m, boxF(w, h, d), x, yy + h / 2, z, 0, ry, 0);
      const open = !onTop && R() < 0.35 && i === n - 1;
      if (open) {
        const fm = cardboard(1), top = k.at(x, yy + h, z, 0, ry, 0);
        top.add(Flat('#4a3522', 0.95), box(w - 0.02, 0.002, d - 0.02), 0, 0.001, 0);
        for (const s of [-1, 1]) { top.at(0, 0, s * d / 2, -s * R.r(0.4, 1.1), 0, 0).add(fm, boxF(w - 0.01, 0.004, d / 2 - 0.01), 0, 0, s * d / 4); top.at(s * w / 2, 0, 0, 0, 0, s * R.r(0.3, 0.9)).add(fm, boxF(w / 2 - 0.01, 0.004, d - 0.01), s * w / 4, 0, 0); }
      }
      dims.push({ x, z, y: yy, h, stackable: !open && w > 0.4 });
    }
  });
  g.userData.solid.push(bboxSolid(g));
  return g;
};

PROPS.suitcase = (o = {}) => {
  const open = !!o.open, g = P('suitcase'), shell = plastic('#3d6178', 0.32), rib = plastic('#35566b', 0.32), dark = Flat('#1d1f22', 0.5, 0.2);
  const tag = labelMat('evacTag', 128, 192, (c, w, h) => { c.fillStyle = '#efe6c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#c62b20'; c.fillRect(0, 0, w, 30); c.fillStyle = '#fff'; c.font = `bold 16px ${SANS}`; c.fillText('EVAC', 10, 22); c.fillStyle = '#20202a'; c.font = `22px ${HAND}`; c.fillText('Zone 4', 10, 64); c.fillText('Okafor', 10, 96); c.font = `16px ${HAND}`; c.fillText('Fam. of 3', 10, 126); c.font = `12px ${MONO}`; c.fillText('CC-41187', 10, 168); });
  if (!open) {
    cachedKit('suitcaseC', g, k => {
      const W = 0.46, H = 0.66, D = 0.27, y0 = 0.07;
      k.add(shell, rbox(W, H, D, 0.05, 3), 0, y0 + H / 2, 0);
      for (let i = -2; i <= 2; i++) { k.add(rib, rbox(0.03, H - 0.06, 0.012, 0.006), i * 0.08, y0 + H / 2, D / 2 + 0.002); k.add(rib, rbox(0.03, H - 0.06, 0.012, 0.006), i * 0.08, y0 + H / 2, -D / 2 - 0.002); }
      k.add(dark, rbox(W + 0.006, H + 0.006, 0.02, 0.05, 3), 0, y0 + H / 2, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.add(dark, box(0.05, 0.04, 0.05), sx * 0.18, 0.055, sz * 0.09); k.add(rubber(), cyl(0.03, 0.03, 0.022, 14), sx * 0.18, 0.03, sz * 0.09, 0, 0, PI / 2); }
      for (const sx of [-1, 1]) k.add(darkMetal(), box(0.016, 0.06, 0.016), sx * 0.12, y0 + H + 0.03, -0.08);
      k.add(dark, rbox(0.28, 0.025, 0.035, 0.012), 0, y0 + H + 0.07, -0.08);
      k.add(dark, rbox(0.16, 0.025, 0.03, 0.012), 0, y0 + H + 0.012, 0.03);
      k.add(tag, box(0.07, 0.1, 0.002), 0.06, y0 + H - 0.04, D / 2 + 0.02, 0.05, 0.2, 0.25);
    });
  } else {
    cachedKit('suitcaseO', g, k => {
      const W = 0.46, L = 0.66, h = 0.12;
      const half = (kk, lid) => {
        kk.add(shell, rbox(W, 0.03, L, 0.02), 0, 0.015, 0);
        for (const s of [-1, 1]) { kk.add(shell, rbox(0.02, h, L, 0.008), s * (W / 2 - 0.01), h / 2, 0); kk.add(shell, rbox(W, h, 0.02, 0.008), 0, h / 2, s * (L / 2 - 0.01)); }
        kk.add(fabric(lid ? '#3e4652' : '#58606a'), box(W - 0.04, 0.004, L - 0.04), 0, 0.032, 0);
      };
      half(k, false);
      half(k.at(0, 0, -L / 2, PI / 2 - 0.25, 0, 0).at(0, 0, -L / 2, 0, 0, 0), true);
      const R = rng(42), cl = ['#8a2d2d', '#c9c2b2', '#2f4a6a', '#6a7a4a', '#d8b878'];
      for (let i = 0; i < 6; i++) k.add(fabric(R.pick(cl)), rbox(R.r(0.18, 0.34), R.r(0.04, 0.07), R.r(0.18, 0.3), 0.02, 2), R.r(-0.08, 0.08), 0.06 + i * 0.012, R.r(-0.18, 0.18), R.r(-0.1, 0.1), R.r(-0.5, 0.5), R.r(-0.1, 0.1));
      k.add(fabric('#8a2d2d'), rbox(0.3, 0.025, 0.22, 0.01, 2), 0.36, 0.013, 0.2, 0, 0.5, 0.02);
      k.add(Flat('#d9d6cf', 0.6), rbox(0.2, 0.15, 0.06, 0.04, 2), -0.05, 0.13, 0.12, 0.2, 0.3, 0.1); // a stuffed rabbit's body, half packed
      k.add(Flat('#d9d6cf', 0.6), sph(0.055, 14, 10), -0.05, 0.22, 0.14);
      k.add(tag, box(0.07, 0.002, 0.1), 0.3, 0.004, 0.42, 0, 0.6, 0);
    });
  }
  g.userData.solid.push(bboxSolid(g));
  return g;
};

PROPS.toyRobot = () => {
  const g = P('toyRobot');
  cachedKit('toyRobot', g, k => {
    const wht = plastic('#eef0ee', 0.3), red = plastic('#d4342a', 0.3), blu = plastic('#2e6fb8', 0.3), blk = Flat('#121416', 0.2), yel = plastic('#f2c230', 0.3);
    k.add(blu, rbox(0.17, 0.05, 0.12, 0.02), 0, 0.035, 0);
    for (const s of [-1, 1]) { k.add(blk, cyl(0.03, 0.03, 0.03, 16), s * 0.095, 0.03, 0.035, 0, 0, PI / 2); k.add(blk, cyl(0.03, 0.03, 0.03, 16), s * 0.095, 0.03, -0.035, 0, 0, PI / 2); }
    k.add(wht, rbox(0.15, 0.14, 0.1, 0.035, 3), 0, 0.14, 0);
    k.add(red, rbox(0.08, 0.06, 0.012, 0.01), 0, 0.15, 0.05);
    k.add(yel, cyl(0.009, 0.009, 0.006, 12), -0.018, 0.15, 0.058, PI / 2, 0, 0); k.add(Flat('#38c060', 0.3), cyl(0.009, 0.009, 0.006, 12), 0.018, 0.15, 0.058, PI / 2, 0, 0);
    k.add(blk, cyl(0.02, 0.02, 0.02, 12), 0, 0.22, 0);
    k.add(wht, rbox(0.15, 0.11, 0.11, 0.04, 3), 0, 0.28, 0, 0, 0, 0.12);
    const hk = k.at(0, 0.28, 0, 0, 0, 0.12);
    hk.add(blk, rbox(0.12, 0.05, 0.02, 0.018), 0, 0.0, 0.05);
    for (const s of [-1, 1]) hk.add(Glow('#6fe6ff', 1.2), cyl(0.012, 0.012, 0.004, 14), s * 0.03, 0.0, 0.061, PI / 2, 0, 0);
    hk.add(darkMetal(), cyl(0.003, 0.003, 0.06, 6), 0.03, 0.08, 0); hk.add(red, sph(0.012, 12, 8), 0.03, 0.115, 0);
    for (const s of [-1, 1]) { hk.add(red, cyl(0.02, 0.02, 0.02, 12), s * 0.083, 0, 0, 0, 0, PI / 2); }
    for (const s of [-1, 1]) {
      const a = k.at(s * 0.09, 0.18, 0, s > 0 ? -0.5 : 0.2, 0, s * 0.2);
      a.add(red, sph(0.022, 12, 8), 0, 0, 0); a.add(wht, cyl(0.016, 0.016, 0.08, 12), 0, -0.045, 0); a.add(blk, rbox(0.03, 0.03, 0.03, 0.008), 0, -0.095, 0);
    }
    k.add(labelMat('roboPal', 128, 32, (c, w, h) => { c.fillStyle = '#eef0ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#2e6fb8'; c.font = `bold 22px ${SANS}`; c.fillText('ROBO-PAL', 8, 24); }), box(0.1, 0.022, 0.002), 0, 0.085, 0.061);
  });
  g.userData.solid.push(SB(0, 0.17, 0, 0.12, 0.17, 0.07));
  return g;
};

PROPS.oldPhone = () => {
  const g = P('oldPhone'), top = 0.62;
  cachedKit('phoneTable', g, k => {
    k.add(walnut(), lathe('ptTop', [[0, 0], [0.24, 0], [0.245, 0.01], [0.24, 0.025], [0, 0.025]], 40), 0, top - 0.025, 0);
    k.add(darkMetal(), cyl(0.018, 0.018, top - 0.03, 12), 0, (top - 0.03) / 2, 0);
    k.add(darkMetal(), lathe('ptBase', [[0, 0], [0.16, 0], [0.16, 0.008], [0.04, 0.03], [0, 0.03]], 32), 0, 0, 0);
    const body = plastic('#d8d2c2', 0.35);
    k.add(body, rbox(0.21, 0.07, 0.17, 0.02, 3), 0, top + 0.035, 0);
    k.add(Flat('#1e2022', 0.3), rbox(0.12, 0.012, 0.09, 0.004), 0, top + 0.071, 0.025, -0.25, 0, 0);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.add(plastic('#ede8da', 0.3), rbox(0.026, 0.008, 0.016, 0.003), (c - 1) * 0.034, top + 0.079 + (1.5 - r) * 0.006 * -0.5 + (r * 0.004), 0.055 - r * 0.02, -0.25, 0, 0);
    k.add(blackGloss(), box(0.07, 0.002, 0.025), -0.06, top + 0.071, -0.05);
    k.add(darkMetal(), rbox(0.2, 0.02, 0.05, 0.01), 0, top + 0.08, -0.05);
    k.add(Flat('#1a1a1a', 0.6), tube('phoneCord', [[0.1, top + 0.03, -0.02], [0.17, top - 0.1, 0.05], [0.12, top - 0.2, 0.12], [0.02, top - 0.09, 0.14], [-0.04, top + 0.01, 0.1]], 0.004, 40, 5), 0, 0, 0);
  });
  const hs = grp(0, top + 0.105, -0.05); const hin = new THREE.Group(); hs.add(hin);
  cachedKit('phoneHandset', hin, k => {
    const body = plastic('#d8d2c2', 0.35);
    k.add(body, rbox(0.15, 0.025, 0.03, 0.012, 3), 0, 0, 0);
    for (const s of [-1, 1]) { k.add(body, cyl(0.026, 0.022, 0.03, 20), s * 0.088, -0.012, 0); k.add(Flat('#333', 0.6), cyl(0.018, 0.018, 0.002, 16), s * 0.088, -0.028, 0); }
  });
  g.add(hs); g.userData.nodes.handset = hs;
  const led = mesh(sph(0.005, 8, 6), Glow('#ff3020', 3), 0.07, top + 0.072, 0.06); g.add(led); g.userData.nodes.led = led;
  const disp = mesh(plane(0.065, 0.02), new THREE.MeshBasicMaterial({ map: ctex('phoneMsg', 128, 40, (c, w, h) => { c.fillStyle = '#1c2a1c'; c.fillRect(0, 0, w, h); c.fillStyle = '#9fff9f'; c.font = `bold 20px ${MONO}`; c.fillText('1 MSG', 10, 28); }), toneMapped: false }), -0.06, top + 0.0725, -0.05, -PI / 2, 0, 0); g.add(disp);
  let t0 = 0; g.userData.update = dt => { t0 += dt; led.visible = (t0 % 1.2) < 0.6; };
  g.userData.solid.push(SB(0, top / 2 + 0.03, 0, 0.24, top / 2 + 0.03, 0.24));
  return g;
};

const NOTE_DEFAULT = "If you find this - we went to the Helix tower shelter.\nPip is in the closet, powered down like they said. Don't turn him on. They listen through the robots.\n- M.";
function noteTex(text) {
  return ctex('note' + text, 512, 700, (c, w, h) => {
    c.fillStyle = '#efe9d8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(90,140,200,0.35)'; c.lineWidth = 2; for (let y = 120; y < h - 30; y += 44) { c.beginPath(); c.moveTo(20, y); c.lineTo(w - 20, y); c.stroke(); }
    c.strokeStyle = 'rgba(210,80,80,0.4)'; c.beginPath(); c.moveTo(70, 0); c.lineTo(70, h); c.stroke();
    noiseFill2(c, w, h);
    c.fillStyle = '#1d2440'; c.font = `34px ${HAND}`; c.textBaseline = 'alphabetic';
    c.save(); c.translate(86, 112); c.rotate(-0.015); wrapText(c, text, 0, 0, w - 120, 44); c.restore();
    const st = c.createRadialGradient(w * 0.75, h * 0.8, 10, w * 0.75, h * 0.8, 90); st.addColorStop(0, 'rgba(120,80,30,0.25)'); st.addColorStop(0.8, 'rgba(120,80,30,0.08)'); st.addColorStop(1, 'rgba(120,80,30,0)'); c.fillStyle = st; c.fillRect(0, 0, w, h);
  });
}
PROPS.note = (o = {}) => {
  const text = o.text || NOTE_DEFAULT, g = P('note');
  const geo = gk('noteGeo', () => { const p = new THREE.PlaneGeometry(0.21, 0.29, 8, 10); p.rotateX(-PI / 2); const a = p.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i), z = a.getZ(i); a.setY(i, 0.002 + Math.pow(Math.max(0, (x + z * 0.4) / 0.2), 3) * 0.02 + Math.max(0, -z - 0.1) * 0.03); } p.computeVertexNormals(); return twoSided(p); });
  g.add(mesh(geo, mk('noteM' + text, () => new THREE.MeshStandardMaterial({ map: noteTex(text), roughness: 0.9 }))));
  return g;
};

PROPS.chargingDock = (o = {}) => {
  const g = P('chargingDock'), slotY = 0.62;
  cachedKit('dock', g, k => {
    const wht = lacq('#eceeee'), grey = Flat('#9aa0a4', 0.35, 0.2), dark = Flat('#15181b', 0.4, 0.3);
    k.add(wht, slab(0.7, 0.5, 0.05, 0.12, 0.012), 0, 0, 0.27);
    k.add(dark, slab(0.42, 0.28, 0.006, 0.1, 0.002), 0, 0.05, 0.3);
    for (const s of [-1, 1]) k.add(chrome(), rbox(0.05, 0.004, 0.16, 0.002), s * 0.08, 0.057, 0.3);
    k.add(wht, extrude('dockBack', () => { const s = rrect(0.5, 0.95, 0.2); s.holes.push(rrectHole(0.15, 0.3, 0.06, 0, slotY - 0.475)); return s; }, 0.09, 0.015, 10), 0, 0.475 + 0.02, 0.0);
    k.add(dark, box(0.15, 0.3, 0.01), 0, slotY + 0.02, 0.02);
    k.add(grey, extrude('dockSlotRim', () => { const s = rrect(0.19, 0.34, 0.08); s.holes.push(rrectHole(0.15, 0.3, 0.06)); return s; }, 0.012, 0.004, 8), 0, slotY + 0.02, 0.085);
    k.add(chrome(), box(0.04, 0.012, 0.03), 0, slotY - 0.12, 0.05);
    k.add(labelMat('dockLogo', 256, 64, (c, w, h) => { c.fillStyle = '#eceeee'; c.fillRect(0, 0, w, h); c.fillStyle = '#5a6870'; c.font = `300 34px ${SANS}`; c.textAlign = 'center'; c.fillText('Lumen Home', w / 2, 40); c.font = `12px ${SANS}`; c.fillText('COMPANION DOCK  CD-3', w / 2, 58); }, 0.4), plane(0.3, 0.075), 0, 0.25, 0.092);
  });
  const ringMats = { off: Flat('#2a2e30', 0.3), idle: Glow('#4aa8ff', 1.6), charging: Glow('#ffb020', 2.2), ready: Glow('#40ff80', 2.0), error: Glow('#ff2a20', 2.4) };
  const ring = mesh(gk('dockRing', () => new THREE.TorusGeometry(0.17, 0.008, 6, 40, PI * 0.9)), ringMats.off, 0, 0.82, 0.092, 0, 0, PI * 0.05); g.add(ring);
  const slot = grp(0, slotY - 0.105, 0.05); g.add(slot);
  g.userData.nodes.slot = slot; g.userData.nodes.status = ring;
  const L = { x: 0, y: 0.8, z: 0.25, color: 0x4aa8ff, intensity: 0, distance: 2.5 }; g.userData.lights.push(L);
  let status = 'off', cellObj = null, t = 0;
  g.userData.setStatus = s => { status = ringMats[s] ? s : 'off'; ring.material = ringMats[status]; L.color = { off: 0, idle: 0x4aa8ff, charging: 0xffb020, ready: 0x40ff80, error: 0xff2a20 }[status]; L.intensity = status === 'off' ? 0 : 0.4; };
  g.userData.setCell = v => { if (v && !cellObj) { cellObj = ITEMS.powercell(); slot.add(cellObj); } if (!v && cellObj) { slot.remove(cellObj); cellObj = null; } };
  g.userData.setStatus(o.status || 'off'); if (o.cell) g.userData.setCell(true);
  g.userData.update = dt => { t += dt; if (status === 'charging') ring.visible = Math.sin(t * 4) > -0.6; else if (status === 'error') ring.visible = (t % 0.6) < 0.3; else ring.visible = true; };
  g.userData.solid.push(SB(0, 0.5, 0.05, 0.25, 0.5, 0.05), SB(0, 0.025, 0.27, 0.35, 0.025, 0.25));
  return g;
};
// ---- end of HOME

/* =====================================================================
   UTILITY
   ===================================================================== */
SCREENS.genOff = (g, w, h) => {
  g.fillStyle = '#0d0a04'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb020'; g.font = `bold ${h * 0.11}px ${MONO}`; g.textAlign = 'left';
  g.fillText('GEN-2  STANDBY', 18, h * 0.2); g.font = `${h * 0.075}px ${MONO}`; g.fillStyle = '#d89a3a';
  g.fillText('FUEL ........ 34%', 18, h * 0.38); g.fillText('BATTERY ..... 11.2V', 18, h * 0.5); g.fillText('GRID ........ LOST', 18, h * 0.62);
  g.fillStyle = '#ff5030'; g.fillText('> MANUAL START REQUIRED', 18, h * 0.8); scanlines(g, w, h, 0.2);
};
SCREENS.genOn = (g, w, h) => {
  g.fillStyle = '#03100a'; g.fillRect(0, 0, w, h); g.fillStyle = '#4dff8a'; g.font = `bold ${h * 0.11}px ${MONO}`; g.textAlign = 'left';
  g.fillText('GEN-2  ONLINE', 18, h * 0.2); g.font = `${h * 0.075}px ${MONO}`; g.fillStyle = '#7fe0a0';
  g.fillText('OUTPUT ...... 480V 3PH', 18, h * 0.38); g.fillText('FREQ ........ 60.0 Hz', 18, h * 0.5); g.fillText('LOAD ........ 41%', 18, h * 0.62);
  g.strokeStyle = '#4dff8a'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < w * 0.9; x += 3) { const y = h * 0.82 + Math.sin(x * 0.12) * h * 0.05; x ? g.lineTo(18 + x, y) : g.moveTo(18, y); } g.stroke(); scanlines(g, w, h, 0.2);
};
const LED = { off: Flat('#2a2c2e', 0.3), red: Glow('#ff2a1a', 2.5), green: Glow('#38ff6a', 2.2), amber: Glow('#ffaa20', 2.4), blue: Glow('#40a8ff', 2.2), white: Glow('#e8f2ff', 2) };
const ledMat = v => LED[v === true ? 'green' : v === false ? 'red' : v] || LED.off;
function warnLabel(key, title, sub, col = '#f2c230') {
  return labelMat('warn' + key, 256, 160, (c, w, h) => {
    c.fillStyle = col; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.fillRect(6, 6, w - 12, h - 12); c.fillStyle = col; c.fillRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(48, 22); c.lineTo(84, 86); c.lineTo(12, 86); c.closePath(); c.fill();
    c.fillStyle = col; c.font = `bold 46px ${SANS}`; c.textAlign = 'center'; c.fillText('!', 48, 80);
    c.fillStyle = '#111'; c.textAlign = 'left'; c.font = `bold 30px ${SANS}`; c.fillText(title, 96, 62); c.font = `bold 17px ${SANS}`; wrapText(c, sub, 18, 118, w - 36, 20);
  }, 0.5);
}

PROPS.breakerPanel = (o = {}) => {
  const g = P('breakerPanel'), cy = 1.4, W = 0.5, H = 0.72, D = 0.12;
  cachedKit('breakerBody', g, k => {
    const m = Mat('metalWhite');
    k.add(m, box(W, H, 0.01), 0, cy, 0.005);
    for (const s of [-1, 1]) { k.add(m, rbox(0.012, H, D, 0.004), s * (W / 2 - 0.006), cy, D / 2); k.add(m, rbox(W, 0.012, D, 0.004), 0, cy + s * (H / 2 - 0.006), D / 2); }
    k.add(Flat('#3a3f44', 0.6, 0.4), box(W - 0.05, H - 0.05, 0.006), 0, cy, 0.014);
    k.add(Flat('#20242a', 0.5, 0.3), box(W - 0.08, 0.13, 0.03), 0, cy + 0.04, 0.03);
    k.add(Flat('#20242a', 0.5, 0.3), box(W - 0.08, 0.1, 0.03), 0, cy - 0.2, 0.03);
    for (let i = 0; i < 3; i++) k.add(Flat(['#7a2a20', '#20242a', '#2a4a6a'][i], 0.6), cyl(0.008, 0.008, 0.6, 8), -0.15 + i * 0.03, cy - 0.12, 0.05, 0, 0, PI / 2 - 0.05 * i);
    k.add(darkMetal(), cyl(0.025, 0.025, 0.8, 12), 0.15, cy + H / 2 + 0.4, 0.05);
    k.add(labelMat('brkLbl', 512, 64, (c, w, h) => { c.fillStyle = '#e8e6dc'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold 28px ${MONO}`; for (let i = 0; i < 6; i++) c.fillText('B' + (i + 1), 22 + i * 82, 42); c.font = `13px ${HAND}`; c.fillText('lab?', 196, 60); }), plane(W - 0.1, 0.03), 0, cy - 0.06, 0.046);
    k.add(labelMat('brkHead', 512, 96, (c, w, h) => { c.fillStyle = '#1b1e22'; c.fillRect(0, 0, w, h); c.fillStyle = '#e0e4e8'; c.font = `bold 34px ${SANS}`; c.fillText('SUBPANEL  4-C', 20, 44); c.font = `20px ${SANS}`; c.fillStyle = '#9aa4ac'; c.fillText('HELIX FACILITIES  //  400 A  3 PHASE', 20, 78); }), plane(W - 0.1, 0.06), 0, cy + 0.26, 0.018);
  });
  // door
  const door = grp(-W / 2, cy, D); g.add(door); const din = new THREE.Group(); door.add(din);
  cachedKit('breakerDoor', din, k => {
    k.add(Mat('metalWhite'), rbox(W, H, 0.016, 0.005), W / 2, 0, 0.008);
    k.add(warnLabel('hv', 'DANGER', 'HIGH VOLTAGE - AUTHORISED PERSONNEL ONLY'), plane(0.2, 0.125), W / 2, 0.15, 0.0165);
    k.add(darkMetal(), rbox(0.03, 0.09, 0.02, 0.006), W - 0.04, 0, 0.026);
    for (const s of [-1, 1]) k.add(darkMetal(), cyl(0.008, 0.008, 0.06, 8), 0, s * 0.25, 0.0);
  });
  let doorOpen = o.open !== false, dAng = doorOpen ? -1.95 : 0; door.rotation.y = dAng;
  // switches and their status lights
  const switches = [], leds = [], swOn = [], swAng = [];
  for (let i = 0; i < 6; i++) {
    const x = -0.205 + i * 0.082;
    const base = mesh(rbox(0.05, 0.085, 0.035, 0.006), Flat('#15171a', 0.45), x, cy + 0.04, 0.06); g.add(base);
    const piv = grp(x, cy + 0.04, 0.08); g.add(piv);
    piv.add(mesh(rbox(0.016, 0.05, 0.014, 0.005), i === 5 ? Flat('#b0261e', 0.4) : Flat('#2a2d31', 0.4), 0, 0.025, 0));
    const on = o.switches ? !!o.switches[i] : false; swOn.push(on); swAng.push(on ? 0.5 : PI - 0.5); piv.rotation.x = swAng[i];
    switches.push(piv);
    const led = mesh(sph(0.006, 10, 8), LED.off, x, cy + 0.12, 0.05); g.add(led); leds.push(led);
  }
  g.userData.nodes.switches = switches; g.userData.nodes.leds = leds; g.userData.nodes.door = door;
  g.userData.setSwitch = (i, on) => { if (i >= 0 && i < 6) swOn[i] = !!on; };
  g.userData.getSwitch = i => swOn[i];
  g.userData.setLights = arr => { arr.forEach((v, i) => { if (leds[i]) leds[i].material = ledMat(v); }); };
  g.userData.setDoor = v => { doorOpen = !!v; };
  g.userData.update = dt => {
    for (let i = 0; i < 6; i++) { const t = swOn[i] ? 0.5 : PI - 0.5; if (Math.abs(swAng[i] - t) > 1e-3) { swAng[i] = damp(swAng[i], t, 14, dt); switches[i].rotation.x = swAng[i]; } }
    const dt2 = doorOpen ? -1.95 : 0; if (Math.abs(dAng - dt2) > 1e-3) { dAng = damp(dAng, dt2, 5, dt); door.rotation.y = dAng; }
  };
  if (o.lights) g.userData.setLights(o.lights);
  g.userData.solid.push(SB(0, cy, D / 2, W / 2, H / 2, D / 2));
  return g;
};

PROPS.fuseBox = () => {
  const g = P('fuseBox'), cy = 1.5;
  cachedKit('fuseBox', g, k => {
    const m = fromSetCached('metalOld', 'metal', { color: '#6b7266', rust: 0.7 });
    k.add(m, rbox(0.34, 0.44, 0.15, 0.015), 0, cy, 0.075);
    k.add(Flat('#20201e', 0.7), box(0.24, 0.26, 0.004), 0, cy + 0.02, 0.151);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { const x = -0.075 + i * 0.05, y = cy + 0.08 - r * 0.12; k.add(ceramic('#e6e0d0'), cyl(0.014, 0.014, 0.07, 14), x, y, 0.162); k.add(brushed(), cyl(0.0145, 0.0145, 0.012, 14), x, y + 0.03, 0.162); k.add(brushed(), cyl(0.0145, 0.0145, 0.012, 14), x, y - 0.03, 0.162); }
    k.add(Mat('glassDirty'), box(0.25, 0.27, 0.004), 0, cy + 0.02, 0.185);
    k.add(m, extrude('fuseFrame', () => { const s = rrect(0.28, 0.31, 0.01); s.holes.push(rrectHole(0.24, 0.26, 0.005)); return s; }, 0.012, 0.003), 0, cy + 0.02, 0.18);
    k.add(darkMetal(), cyl(0.03, 0.03, 0.03, 16), 0.19, cy, 0.075, 0, 0, PI / 2); k.add(Flat('#b0261e', 0.5), rbox(0.025, 0.12, 0.025, 0.008), 0.215, cy - 0.04, 0.075);
    k.add(darkMetal(), cyl(0.018, 0.018, 0.9, 10), -0.1, cy + 0.67, 0.05); k.add(darkMetal(), cyl(0.018, 0.018, 0.9, 10), 0.1, cy - 0.67, 0.05);
    k.add(warnLabel('fuse', '440V', 'ISOLATE BEFORE OPENING'), plane(0.14, 0.0875), 0, cy - 0.17, 0.151);
  });
  g.userData.solid.push(SB(0, cy, 0.09, 0.2, 0.22, 0.09));
  return g;
};
function fromSetCached(key, kind, opt, extra) { return mk('fs' + key, () => fromSet(kind, opt, extra)); }

PROPS.keypad = (o = {}) => {
  const g = P('keypad'), cy = 1.3;
  cachedKit('keypad', g, k => {
    k.add(Flat('#2b2f34', 0.35, 0.8), rbox(0.11, 0.19, 0.025, 0.008), 0, cy, 0.0125);
    k.add(Flat('#101214', 0.3, 0.2), rbox(0.085, 0.04, 0.004, 0.003), 0, cy + 0.06, 0.026);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.add(Flat('#8a9096', 0.3, 0.8), rbox(0.022, 0.017, 0.008, 0.003), (c - 1) * 0.027, cy + 0.015 - r * 0.023, 0.028);
    k.add(mk('keypadNums', () => decalMat(ctex('keypadNums', 192, 256, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#121416'; c.font = `bold 30px ${SANS}`; c.textAlign = 'center'; const L = '123456789*0#'; for (let i = 0; i < 12; i++) c.fillText(L[i], (i % 3 + 0.5) * w / 3, (Math.floor(i / 3) + 0.5) * h / 4 + 10); }), { rough: 0.4 })), plane(0.081, 0.092), 0, cy - 0.0195, 0.0322);
    k.add(labelMat('keypadBrand', 128, 32, (c, w, h) => { c.fillStyle = '#2b2f34'; c.fillRect(0, 0, w, h); c.fillStyle = '#9aa4ac'; c.font = `bold 18px ${SANS}`; c.fillText('HELIX SECURE', 6, 22); }), plane(0.07, 0.016), 0, cy - 0.078, 0.0255);
  });
  const scr = mesh(plane(0.078, 0.033), screenMat(o.state || 'locked', 1.6), 0, cy + 0.06, 0.0285); g.add(scr);
  const led = mesh(sph(0.004, 8, 6), LED.red, 0.045, cy + 0.085, 0.026); g.add(led);
  g.userData.nodes.screen = scr; g.userData.nodes.led = led;
  g.userData.setScreen = screenSetter([scr]);
  g.userData.setState = s => { g.userData.setScreen(s === 'off' ? null : s); led.material = s === 'open' ? LED.green : s === 'denied' ? LED.amber : s === 'off' ? LED.off : LED.red; };
  g.userData.setState(o.state || 'locked');
  g.userData.solid.push(SB(0, cy, 0.015, 0.055, 0.095, 0.015));
  return g;
};

PROPS.lever = (o = {}) => {
  const g = P('lever'), cy = 1.2;
  cachedKit('leverBody', g, k => {
    k.add(Mat('metal'), rbox(0.3, 0.6, 0.03, 0.01), 0, cy, 0.015);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.add(brushed(), cyl(0.009, 0.009, 0.01, 10), sx * 0.12, cy + sy * 0.26, 0.032, PI / 2, 0, 0);
    k.add(Mat('metalYellow'), rbox(0.17, 0.2, 0.11, 0.015), 0, cy, 0.085);
    k.add(darkMetal(), cyl(0.035, 0.035, 0.21, 20), 0, cy, 0.1, 0, 0, PI / 2);
    k.add(labelMat('leverSign', 256, 64, (c, w, h) => { c.fillStyle = '#d9a521'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold 34px ${SANS}`; c.textAlign = 'center'; c.fillText('MAIN POWER', w / 2, 44); }), plane(0.22, 0.055), 0, cy + 0.36, 0.031);
    k.add(labelMat('leverOnOff', 128, 256, (c, w, h) => { c.fillStyle = '#2b2f34'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8e8e8'; c.font = `bold 34px ${SANS}`; c.textAlign = 'center'; c.fillText('OFF', w / 2, 46); c.fillText('ON', w / 2, h - 20); }), plane(0.06, 0.5), 0.11, cy, 0.031);
    k.add(Mat('hazard'), box(0.3, 0.035, 0.005), 0, cy - 0.28, 0.033);
  });
  const piv = grp(0, cy, 0.1); g.add(piv);
  cachedKit('leverHandle', piv, k => {
    for (const s of [-1, 1]) k.add(brushed(), rbox(0.02, 0.4, 0.03, 0.008), s * 0.075, 0.2, 0);
    k.add(darkMetal(), cyl(0.012, 0.012, 0.17, 10), 0, 0.38, 0, 0, 0, PI / 2);
    k.add(Flat('#b0261e', 0.55), cyl(0.024, 0.024, 0.13, 16), 0, 0.38, 0, 0, 0, PI / 2);
  });
  const ledR = mesh(sph(0.012, 12, 8), LED.red, -0.09, cy + 0.24, 0.035), ledG = mesh(sph(0.012, 12, 8), LED.off, 0.09, cy + 0.24, 0.035); g.add(ledR, ledG);
  let on = !!o.on; const angOf = v => (v ? PI - 0.75 : 0.75); let ang = angOf(on); piv.rotation.x = ang;
  const L = { x: 0, y: cy + 0.24, z: 0.2, color: on ? 0x38ff6a : 0xff2a1a, intensity: 0.25, distance: 2 }; g.userData.lights.push(L);
  g.userData.nodes.handle = piv;
  g.userData.setOn = v => { on = !!v; ledR.material = on ? LED.off : LED.red; ledG.material = on ? LED.green : LED.off; L.color = on ? 0x38ff6a : 0xff2a1a; };
  g.userData.isOn = () => on;
  g.userData.setOn(on);
  g.userData.update = dt => { const t = angOf(on); if (Math.abs(ang - t) > 1e-3) { ang = damp(ang, t, 7, dt); piv.rotation.x = ang; } };
  g.userData.solid.push(SB(0, cy, 0.07, 0.15, 0.3, 0.07));
  return g;
};

PROPS.generator = (o = {}) => {
  const g = P('generator'), body = new THREE.Group(); g.add(body);
  cachedKit('genSkid', g, k => {
    const sk = darkMetal();
    for (const z of [-0.62, 0.62]) { k.add(sk, box(3.0, 0.14, 0.02), 0, 0.07, z); k.add(sk, box(3.0, 0.015, 0.14), 0, 0.0075, z); k.add(sk, box(3.0, 0.015, 0.14), 0, 0.1325, z); }
    for (const x of [-1.3, -0.4, 0.5, 1.3]) k.add(sk, box(0.1, 0.1, 1.24), x, 0.07, 0);
    for (const z of [-0.69, 0.69]) k.add(Mat('hazard'), box(3.0, 0.1, 0.004), 0, 0.07, z + Math.sign(z) * 0.002);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Mat('steel'), cyl(0.04, 0.05, 0.03, 12), sx * 1.4, 0.015, sz * 0.62);
    // cables out of the -x end, along the floor
    const cm = Flat('#141414', 0.55);
    for (let i = 0; i < 3; i++) k.add(cm, tube('genCable' + i, [[-1.3, 0.9 - i * 0.08, 0.3 - i * 0.1], [-1.7, 0.8 - i * 0.08, 0.32 - i * 0.1], [-1.85, 0.3, 0.4 - i * 0.12], [-1.9, 0.03, 0.6 - i * 0.1], [-2.3, 0.03, 0.8 - i * 0.15], [-2.9, 0.03, 0.9 - i * 0.1]], 0.025, 40, 8), 0, 0, 0);
    k.add(Flat('#3a3c3e', 0.5, 0.6), rbox(0.2, 0.3, 0.5, 0.02), -1.4, 0.85, 0.25);
  });
  cachedKit('genBody', body, k => {
    const shell = fromSetCached('genPaint', 'metal', { color: '#5d6a6e', rust: 0.35 }), yel = Mat('metalYellow'), dk = Flat('#1d2023', 0.6, 0.5);
    k.add(shell, rbox(2.5, 1.66, 1.46, 0.06, 3), -0.2, 0.98, 0);
    // louvres both long sides
    for (const s of [-1, 1]) {
      k.add(dk, box(1.2, 0.8, 0.01), -0.75, 1.0, s * 0.731);
      for (let i = 0; i < 9; i++) k.add(shell, box(1.16, 0.06, 0.012), -0.75, 0.66 + i * 0.085, s * 0.74, s * 0.6, 0, 0);
      k.add(yel, rbox(1.26, 0.86, 0.02, 0.01), -0.75, 1.0, s * 0.726);
      for (const x of [-1.35, 0.95]) k.add(dk, box(0.012, 1.3, 0.004), x, 0.98, s * 0.732); // door seams
    }
    // radiator end with fan behind a grille (+x)
    k.add(shell, rbox(0.42, 1.7, 1.5, 0.05, 3), 1.27, 0.98, 0);
    k.add(dk, cyl(0.62, 0.62, 0.05, 40), 1.47, 1.0, 0, 0, 0, PI / 2);
    k.add(Mat('grate'), gk('genGrille', () => { const c = new THREE.CircleGeometry(0.6, 40); c.rotateY(PI / 2); return c; }), 1.495, 1.0, 0);
    k.add(brushed(), tor(0.61, 0.025, 8, 48), 1.49, 1.0, 0, 0, PI / 2, 0);
    // top: exhaust muffler and stack
    const rust = Mat('rust');
    k.add(rust, cyl(0.17, 0.17, 0.95, 24), -0.65, 2.0, -0.25, 0, 0, PI / 2);
    for (const s of [-1, 1]) { k.add(rust, cyl(0.175, 0.175, 0.03, 24), -0.65 + s * 0.48, 2.0, -0.25, 0, 0, PI / 2); k.add(darkMetal(), box(0.05, 0.2, 0.3), -0.65 + s * 0.3, 1.88, -0.25); }
    k.add(rust, cyl(0.07, 0.07, 0.5, 16), -1.12, 2.3, -0.25); k.add(rust, tor(0.1, 0.07, 10, 16, PI / 2), -1.02, 2.0, -0.25, 0, 0, PI);
    k.add(rust, cyl(0.075, 0.075, 0.03, 16), -1.12, 2.55, -0.25); k.add(darkMetal(), cyl(0.1, 0.1, 0.01, 16), -1.12, 2.6, -0.21, 0.6, 0, 0);
    // fuel cap, lifting eyes, labels
    k.add(yel, cyl(0.07, 0.07, 0.05, 20), 0.6, 1.83, 0.4); k.add(dk, cyl(0.05, 0.05, 0.06, 6), 0.6, 1.86, 0.4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(yel, tor(0.05, 0.014, 6, 16), -0.2 + sx * 1.1, 1.86, sz * 0.6, 0, sz > 0 ? 0 : PI, 0);
    k.add(labelMat('genBrand', 512, 128, (c, w, h) => { c.fillStyle = '#5d6a6e'; c.fillRect(0, 0, w, h); c.fillStyle = '#eef0f0'; c.font = `bold 64px ${SANS}`; c.fillText('HELIX', 20, 76); c.font = `24px ${SANS}`; c.fillText('POWER SYSTEMS  //  GEN-2  1.2 MW', 20, 112); c.fillStyle = '#d9a521'; c.fillRect(250, 30, 240, 10); }, 0.5), plane(1.0, 0.25), -0.7, 1.6, 0.732);
    k.add(warnLabel('gen', 'DANGER', 'AUTOMATIC START - KEEP CLEAR OF FAN'), plane(0.3, 0.19), 1.1, 1.55, 0.752);
    // control panel (+z, right)
    k.add(Flat('#2b2f34', 0.45, 0.5), rbox(0.7, 0.62, 0.14, 0.02), 0.45, 1.18, 0.78);
    k.add(dk, box(0.62, 0.54, 0.004), 0.45, 1.18, 0.851);
    for (let i = 0; i < 3; i++) { k.add(brushed(), cyl(0.05, 0.05, 0.02, 24), 0.22 + i * 0.13, 1.0, 0.86, PI / 2, 0, 0); k.add(labelMat('gauge' + i, 128, 128, (c, w, h) => { c.fillStyle = '#efeee6'; c.beginPath(); c.arc(64, 64, 62, 0, TAU); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 3; for (let j = 0; j <= 10; j++) { const a = PI * 0.75 + j / 10 * PI * 1.5; c.beginPath(); c.moveTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); c.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); c.stroke(); } c.fillStyle = '#c0261e'; c.beginPath(); c.arc(64, 64, 52, PI * 2, PI * 2.25); c.lineTo(64, 64); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 4; const na = PI * 0.8 + i * 0.4; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.cos(na) * 46, 64 + Math.sin(na) * 46); c.stroke(); c.font = `bold 14px ${SANS}`; c.fillStyle = '#111'; c.textAlign = 'center'; c.fillText(['BAR', 'V', '°C'][i], 64, 100); }), gk('gaugeFace', () => new THREE.CircleGeometry(0.044, 32)), 0.22 + i * 0.13, 1.0, 0.871); k.add(Mat('glass'), gk('gaugeFace', () => new THREE.CircleGeometry(0.044, 32)), 0.22 + i * 0.13, 1.0, 0.875); }
    k.add(Flat('#d9a521', 0.5), cyl(0.045, 0.045, 0.02, 24), 0.7, 1.32, 0.86, PI / 2, 0, 0); k.add(Flat('#c0261e', 0.4), sph(0.04, 20, 10, 0, TAU, 0, PI / 2), 0.7, 1.32, 0.87, PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) k.add(Flat(['#2a9a4a', '#c0261e', '#e8e8e8'][i], 0.4), cyl(0.014, 0.014, 0.02, 14), 0.62 + i * 0.045, 1.0, 0.86, PI / 2, 0, 0);
    k.add(darkMetal(), cyl(0.012, 0.012, 0.03, 10), 0.62, 1.1, 0.86, PI / 2, 0, 0);
  });
  const scr = mesh(plane(0.32, 0.18), screenMat('genOff', 1.4), 0.35, 1.3, 0.855); body.add(scr);
  const lamp = mesh(sph(0.03, 14, 10), LED.amber, 0.73, 1.52, 0.85); body.add(lamp);
  const lamp2 = mesh(cyl(0.035, 0.035, 0.05, 16), LED.amber, 0.73, 1.52, 0.82, PI / 2, 0, 0); body.add(lamp2);
  const fan = grp(1.43, 1.0, 0); body.add(fan);
  cachedKit('genFan', fan, k => { k.add(darkMetal(), cyl(0.09, 0.09, 0.1, 20), 0, 0, 0, 0, 0, PI / 2); for (let i = 0; i < 5; i++) k.at(0, 0, 0, i / 5 * TAU, 0, 0).add(Flat('#3a3e42', 0.5, 0.6), rbox(0.015, 0.42, 0.16, 0.007), 0, 0.29, 0, 0, 0.45, 0); });
  g.userData.nodes.screen = scr; g.userData.nodes.fan = fan; g.userData.nodes.lamp = lamp;
  const L = { x: 0.73, y: 1.52, z: 1.0, color: 0xffaa20, intensity: 0.4, distance: 3 }; g.userData.lights.push(L);
  let running = !!o.running, spin = 0, t = 0;
  g.userData.setRunning = v => { running = !!v; scr.material.emissiveMap = screenTex(running ? 'genOn' : 'genOff'); scr.material.needsUpdate = true; lamp.material = lamp2.material = running ? LED.green : LED.amber; L.color = running ? 0x38ff6a : 0xffaa20; };
  g.userData.isRunning = () => running;
  g.userData.setRunning(running);
  g.userData.update = dt => {
    t += dt; spin = damp(spin, running ? 22 : 0, running ? 0.8 : 0.5, dt); fan.rotation.x += spin * dt;
    const a = running ? 0.0018 : spin * 0.00005;
    body.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    if (!running) lamp.visible = lamp2.visible = (t % 1.6) < 1.1; else lamp.visible = lamp2.visible = true;
  };
  g.userData.solid.push(SB(0, 0.93, 0, 1.5, 0.93, 0.8), SB(-1.12, 2.2, -0.25, 0.1, 0.4, 0.1));
  return g;
};

PROPS.cableReel = () => {
  const g = P('cableReel'), R0 = 0.5;
  cachedKit('cableReel', g, k => {
    const ply = fromSetCached('ply', 'wood', { color: '#a88458' }), cab = Flat('#1b1c1e', 0.45);
    for (const s of [-1, 1]) {
      k.add(ply, cyl(R0, R0, 0.04, 40), s * 0.31, R0, 0, 0, 0, PI / 2);
      k.add(darkMetal(), cyl(0.07, 0.07, 0.05, 16), s * 0.31, R0, 0, 0, 0, PI / 2);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.add(darkMetal(), cyl(0.012, 0.012, 0.05, 8), s * 0.32, R0 + Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, 0, PI / 2); }
    }
    k.add(ply, cyl(0.16, 0.16, 0.6, 20), 0, R0, 0, 0, 0, PI / 2);
    for (let i = 0; i < 11; i++) k.add(cab, tor(0.39, 0.026, 6, 32), -0.26 + i * 0.052, R0, 0, 0, PI / 2, 0);
    k.add(cab, tube('reelEnd', [[0.2, R0 + 0.41, 0], [0.25, R0 + 0.35, 0.3], [0.3, 0.1, 0.55], [0.35, 0.026, 0.8], [0.6, 0.026, 1.1], [0.5, 0.026, 1.4]], 0.026, 40, 8), 0, 0, 0);
    k.add(labelMat('reelLbl', 256, 64, (c, w, h) => { c.fillStyle = '#d9a521'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold 26px ${SANS}`; c.fillText('HV CABLE 3x95mm²', 10, 40); }), plane(0.3, 0.075), 0.335, R0 + 0.3, 0, 0, PI / 2, 0);
  });
  g.userData.solid.push(SB(0, R0, 0, 0.34, R0, R0));
  return g;
};

PROPS.toolbox = () => {
  const g = P('toolbox');
  cachedKit('toolbox', g, k => {
    const red = Mat('metalRed'), dk = darkMetal();
    k.add(red, rbox(0.52, 0.16, 0.24, 0.01), 0, 0.08, 0);
    k.add(red, rbox(0.52, 0.07, 0.24, 0.015), 0, 0.2, 0);
    k.add(dk, box(0.522, 0.006, 0.242), 0, 0.163, 0);
    for (const s of [-1, 1]) { k.add(brushed(), rbox(0.04, 0.05, 0.012, 0.004), s * 0.18, 0.16, 0.124); k.add(dk, box(0.02, 0.06, 0.02), s * 0.13, 0.26, 0); }
    k.add(dk, cyl(0.012, 0.012, 0.28, 10), 0, 0.29, 0, 0, 0, PI / 2);
    // a wrench and a screwdriver on the floor
    const wr = extrude('wrench', () => { const s = new THREE.Shape(); s.moveTo(-0.11, -0.008); s.lineTo(0.09, -0.008); s.absarc(0.11, 0, 0.022, -PI * 0.75, PI * 0.75, false); s.lineTo(0.09, 0.008); s.lineTo(-0.11, 0.008); s.absarc(-0.125, 0, 0.018, PI * 0.25, PI * 1.75, false); s.closePath(); return s; }, 0.006, 0.0015, 10);
    k.add(brushed(), wr, 0.15, 0.0, 0.26, -PI / 2, 0, 0.5);
    k.add(Flat('#d9a521', 0.4), cyl(0.012, 0.014, 0.1, 12), -0.25, 0.013, 0.24, 0, 0, PI / 2 + 0.0, 0);
    k.add(brushed(), cyl(0.003, 0.003, 0.12, 8), -0.14, 0.013, 0.24, 0, 0, PI / 2);
  });
  g.userData.solid.push(SB(0, 0.13, 0, 0.26, 0.13, 0.12));
  return g;
};

PROPS.ladder = (o = {}) => {
  const H = o.h || 3.0, g = P('ladder');
  cachedKit('ladder' + H, g, k => {
    const m = Flat('#8e9498', 0.45, 0.85);
    for (const s of [-1, 1]) { k.add(m, rbox(0.06, H, 0.012, 0.003), s * 0.22, H / 2, 0.2); }
    for (let y = 0.25; y < H - 0.05; y += 0.28) k.add(m, cyl(0.015, 0.015, 0.44, 10), 0, y, 0.2, 0, 0, PI / 2);
    for (let y = 0.4; y < H; y += 1.0) for (const s of [-1, 1]) { k.add(m, box(0.012, 0.05, 0.2), s * 0.22, y, 0.1); k.add(m, box(0.08, 0.08, 0.006), s * 0.22, y, 0.003); }
    k.add(Mat('hazard'), box(0.5, 0.06, 0.004), 0, H - 0.08, 0.21);
  });
  g.userData.solid.push(SB(0, H / 2, 0.15, 0.25, H / 2, 0.06));
  g.userData.climb = { x: 0, z: 0.45, top: H };
  return g;
};

PROPS.ventGrate = (o = {}) => {
  const g = P('ventGrate'), cy = o.y ?? 0.35, W = 0.62, H = 0.42;
  cachedKit('ventFrame' + !!o.duct, g, k => {
    const m = Mat('metalWhite');
    k.add(m, extrude('ventFrame', () => { const s = rrect(W, H, 0.015); s.holes.push(rrectHole(W - 0.07, H - 0.07, 0.008)); return s; }, 0.03, 0.006), 0, cy, 0);
    k.add(Flat('#050505', 0.95), box(W - 0.07, H - 0.07, 0.004), 0, cy, o.duct ? -0.6 : 0.004);
    if (o.duct) for (const s of [-1, 1]) { k.add(Mat('steel'), box(0.004, H - 0.07, 0.6), s * (W - 0.07) / 2, cy, -0.3); k.add(Mat('steel'), box(W - 0.07, 0.004, 0.6), 0, cy + s * (H - 0.07) / 2, -0.3); }
  });
  const grate = grp(0, cy - (H - 0.07) / 2, 0.022); g.add(grate);
  cachedKit('ventLouvre', grate, k => {
    const m = Mat('metalWhite'), h2 = H - 0.08;
    k.add(m, rbox(W - 0.08, 0.012, 0.012, 0.003), 0, 0.006, 0); k.add(m, rbox(W - 0.08, 0.012, 0.012, 0.003), 0, h2 - 0.006, 0);
    for (const s of [-1, 1]) k.add(m, rbox(0.012, h2, 0.012, 0.003), s * (W - 0.09) / 2, h2 / 2, 0);
    for (let i = 0; i < 9; i++) k.add(m, box(W - 0.1, 0.032, 0.003), 0, 0.03 + i * (h2 - 0.05) / 8, 0, -0.75, 0, 0);
    for (const s of [-1, 1]) k.add(brushed(), cyl(0.006, 0.006, 0.006, 8), s * (W - 0.09) / 2, h2 - 0.02, 0.008, PI / 2, 0, 0);
  });
  g.userData.nodes.grate = grate;
  let open = !!o.open, ang = open ? 1.45 : 0; grate.rotation.x = ang;
  g.userData.setOpen = v => { open = !!v; };
  g.userData.update = dt => { const t = open ? 1.45 : 0; if (Math.abs(ang - t) > 1e-3) { ang = damp(ang, t, 6, dt); grate.rotation.x = ang; } };
  g.userData.solid.push(SB(0, cy, 0.015, W / 2, H / 2, 0.015));
  return g;
};

PROPS.pipes = (o = {}) => {
  const len = o.len || 3, n = clamp(o.n || 3, 1, 5), y0 = o.y ?? 0.3, g = P('pipes');
  const radii = [0.075, 0.055, 0.1, 0.045, 0.065].slice(0, n);
  cachedKit(`pipes${len},${n},${y0}`, g, k => {
    const mats = [Mat('metal'), fromSetCached('pipeGreen', 'metal', { color: '#3f5a46', rust: 0.45 }), Mat('rust'), fromSetCached('pipeBlue', 'metal', { color: '#3a5a7a', rust: 0.3 }), Mat('metalRed')];
    const bands = ['#2a7ad0', '#3aa04a', '#d9a521', '#c0261e', '#e8e8e8'], names = ['COOLANT', 'H2O', 'STEAM', 'FIRE', 'AIR'];
    let y = y0; const strut = darkMetal();
    const ys = radii.map(r => { const c = y + r; y += r * 2 + 0.07; return c; });
    const top = y;
    for (let x = -len / 2 + 0.3; x <= len / 2 - 0.2; x += 1.0) { k.add(strut, box(0.05, top - y0 + 0.1, 0.04), x, (top + y0) / 2 - 0.02, 0.02); }
    radii.forEach((r, i) => {
      const yc = ys[i], z = 0.04 + r + 0.02, m = mats[i % mats.length];
      k.add(m, cyl(r, r, len, 20, true), 0, yc, z, 0, 0, PI / 2);
      for (let x = -len / 2 + 0.3; x <= len / 2 - 0.2; x += 1.0) { k.add(strut, tor(r + 0.008, 0.006, 4, 16, PI), x, yc, z, 0, PI / 2, 0); k.add(strut, box(0.012, 0.012, z), x, yc, z / 2); }
      for (const x of [-len / 2 + 0.03, len / 2 - 0.03, 0.75]) { k.add(m, cyl(r * 1.4, r * 1.4, 0.035, 20), x, yc, z, 0, 0, PI / 2); for (let b = 0; b < 6; b++) { const a = b / 6 * TAU; k.add(brushed(), cyl(0.006, 0.006, 0.05, 6), x, yc + Math.cos(a) * r * 1.22, z + Math.sin(a) * r * 1.22, 0, 0, PI / 2); } }
      const bx = -len / 2 + 0.6 + (i * 0.37) % 1;
      k.add(Flat(bands[i % 5], 0.5), cyl(r + 0.002, r + 0.002, 0.08, 20, true), bx, yc, z, 0, 0, PI / 2);
      k.add(labelMat('pipe' + i, 256, 48, (c, w, h) => { c.fillStyle = bands[i % 5]; c.fillRect(0, 0, w, h); c.fillStyle = i % 5 === 4 ? '#111' : '#fff'; c.font = `bold 32px ${SANS}`; c.fillText(names[i % 5] + '  ►', 12, 36); }), plane(0.26, 0.05), bx + 0.25, yc, z + r + 0.003);
      if (i % 2 === 0) { // valve with handwheel
        const vx = len * 0.18 - i * 0.2;
        k.add(darkMetal(), sph(r * 1.5, 16, 12), vx, yc, z); k.add(darkMetal(), cyl(0.012, 0.012, r * 1.5 + 0.08, 8), vx, yc, z + r * 1.4, PI / 2, 0, 0);
        const wz = z + r * 1.5 + 0.09, wr = Math.max(0.08, r * 1.3);
        k.add(Flat('#b0261e', 0.5, 0.3), tor(wr, 0.012, 8, 28), vx, yc, wz);
        for (let s = 0; s < 4; s++) k.add(Flat('#b0261e', 0.5, 0.3), box(0.01, wr * 2, 0.01), vx, yc, wz, 0, 0, s * PI / 4);
      }
    });
  });
  const tot = radii.reduce((a, r) => a + r * 2 + 0.07, 0), maxr = Math.max(...radii);
  g.userData.solid.push(SB(0, y0 + tot / 2, 0.15, len / 2, tot / 2, 0.15 + maxr * 0.3));
  return g;
};

PROPS.barrel = (o = {}) => {
  const hz = !!o.hazard, g = P('barrel');
  cachedKit('barrel' + hz, g, k => {
    const m = hz ? Mat('metalYellow') : Mat('metalBlue');
    const R0 = 0.29, H = 0.88;
    k.add(m, lathe('barrel', [[0, 0.004], [R0 - 0.01, 0], [R0, 0.012], [R0, 0.29], [R0 + 0.012, 0.3], [R0 + 0.012, 0.31], [R0, 0.32], [R0, 0.56], [R0 + 0.012, 0.57], [R0 + 0.012, 0.58], [R0, 0.59], [R0, H - 0.012], [R0 - 0.01, H], [R0 - 0.02, H - 0.005], [R0 - 0.02, H - 0.012], [0, H - 0.012]], 40), 0, 0, 0);
    k.add(darkMetal(), cyl(0.03, 0.03, 0.012, 16), 0.15, H - 0.006, 0.06); k.add(darkMetal(), cyl(0.02, 0.02, 0.012, 12), -0.17, H - 0.006, -0.05);
    if (hz) {
      const dec = mk('hazDecal', () => decalMat(ctex('hazDecal', 512, 128, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        for (const cx of [w * 0.25, w * 0.75]) {
          c.fillStyle = '#111'; c.beginPath(); c.arc(cx, 64, 12, 0, TAU); c.fill();
          for (let i = 0; i < 3; i++) { const a = -PI / 2 + i * TAU / 3; c.beginPath(); c.moveTo(cx + Math.cos(a - 0.5) * 18, 64 + Math.sin(a - 0.5) * 18); c.arc(cx, 64, 52, a - 0.5, a + 0.5); c.lineTo(cx + Math.cos(a + 0.5) * 18, 64 + Math.sin(a + 0.5) * 18); c.arc(cx, 64, 18, a + 0.5, a - 0.5, true); c.fill(); }
          c.font = `bold 15px ${SANS}`; c.textAlign = 'center'; c.fillText('HELIX // ISOTOPE WASTE', cx + w * 0.25 - 10, 120);
        }
      })));
      k.add(dec, cyl(0.2915, 0.2915, 0.22, 40, true), 0, 0.44, 0);
    } else k.add(labelMat('barrelLbl', 256, 128, (c, w, h) => { c.fillStyle = '#e8e4d8'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold 26px ${SANS}`; c.fillText('COOLANT', 14, 40); c.font = `16px ${SANS}`; c.fillText('GLYCOL MIX 40/60  -  200 L', 14, 70); c.fillText('LOT 2071-0884', 14, 96); c.fillStyle = '#2a7ad0'; c.fillRect(0, h - 16, w, 16); }), cyl(0.2915, 0.2915, 0.16, 24, true, -0.5, 1.0), 0, 0.44, 0);
  });
  g.userData.solid.push(SB(0, 0.44, 0, 0.3, 0.44, 0.3));
  return g;
};

PROPS.pallet = () => {
  const g = P('pallet');
  cachedKit('pallet', g, k => {
    const w = fromSetCached('palletWood', 'wood', { color: '#a68a62' });
    for (const z of [-0.36, 0, 0.36]) k.add(w, box(1.2, 0.022, 0.1), 0, 0.011, z);
    for (const z of [-0.36, 0, 0.36]) for (const x of [-0.55, 0, 0.55]) k.add(w, box(0.1, 0.078, 0.1), x, 0.061, z);
    for (const x of [-0.55, 0, 0.55]) k.add(w, box(0.1, 0.022, 0.8), x, 0.111, 0);
    for (let i = 0; i < 7; i++) k.add(w, box(0.12, 0.022, 0.8), -0.54 + i * 0.18, 0.133, 0, 0, (i % 3 - 1) * 0.004, 0);
  });
  g.userData.solid.push(SB(0, 0.072, 0, 0.6, 0.072, 0.4));
  return g;
};

function crateKit(k, col, ver) {
  const m = plastic(col, 0.55), dk = Flat('#1d2023', 0.6);
  k.add(m, rbox(0.6, 0.34, 0.4, 0.025, 2), 0, 0.17, 0);
  for (let i = 0; i < 5; i++) { k.add(m, box(0.012, 0.28, 0.41), -0.24 + i * 0.12, 0.16, 0); k.add(m, box(0.61, 0.012, 0.41), 0, 0.06 + i * 0.055, 0); }
  k.add(m, rbox(0.62, 0.05, 0.42, 0.015), 0, 0.36, 0);
  for (const s of [-1, 1]) k.add(dk, rbox(0.012, 0.03, 0.12, 0.006), s * 0.306, 0.27, 0);
  k.add(labelMat('crateLbl' + ver, 256, 128, (c, w, h) => { c.fillStyle = '#ecebe6'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold 26px ${SANS}`; c.fillText('HELIX LOGISTICS', 12, 34); c.font = `16px ${MONO}`; c.fillText(['SERVO ASSY x12', 'OPTICS / FRAGILE', 'CELL MODULES'][ver % 3], 12, 60); for (let i = 0; i < 46; i++) c.fillRect(12 + i * 5, 74, (i * 7) % 3 + 1, 38); }), plane(0.2, 0.1), 0.12, 0.2, 0.211);
}
PROPS.crateStack = (o = {}) => {
  const seed = o.seed ?? 1, g = P('crateStack'), R = rng(seed + 300), cols = ['#5e6a72', '#3d5a80', '#6b7250', '#8a8f92'];
  const n = R.i(2, 5); let gx = 0, gy = 0;
  for (let i = 0; i < n; i++) {
    const stack = gy < 2 && R() < 0.6 && i > 0, ci = R.i(0, 3);
    if (!stack) { gx = i === 0 ? 0 : gx + 0.66; gy = 0; } else gy++;
    const c = grp(gx + R.r(-0.03, 0.03), gy * 0.385, R.r(-0.05, 0.05), 0, R.r(-0.12, 0.12), 0);
    cachedKit('crate' + ci, c, k => crateKit(k, cols[ci], ci)); g.add(c);
  }
  const b = new THREE.Box3().setFromObject(g), cx = (b.min.x + b.max.x) / 2; for (const c of g.children) c.position.x -= cx;
  g.userData.solid.push(bboxSolid(g));
  return g;
};

PROPS.lockers = (o = {}) => {
  const n = o.n || 4, oi = o.openIdx ?? -1, g = P('lockers'), W = 0.4, H = 1.85, D = 0.5, tot = n * W;
  const m = fromSetCached('lockerPaint', 'metal', { color: '#61757a', rust: 0.3 });
  cachedKit('lockerBody' + n, g, k => {
    k.add(m, box(tot, H, 0.01), 0, H / 2 + 0.08, -D / 2 + 0.005);
    for (let i = 0; i <= n; i++) k.add(m, box(0.012, H, D), -tot / 2 + i * W, H / 2 + 0.08, 0);
    k.add(m, box(tot, 0.012, D), 0, H + 0.08, 0); k.add(m, box(tot, 0.012, D), 0, 0.086, 0);
    k.add(Flat('#2a2d30', 0.7), box(tot, 0.08, D - 0.04), 0, 0.04, -0.02);
    for (let i = 0; i < n; i++) { const x = -tot / 2 + W * (i + 0.5); k.add(m, box(W - 0.014, 0.01, D - 0.02), x, 1.55, 0); k.add(chrome(), cyl(0.008, 0.008, W - 0.02, 8), x, 1.48, -0.05, 0, 0, PI / 2); }
  });
  const doors = [];
  for (let i = 0; i < n; i++) {
    const x0 = -tot / 2 + W * i, d = grp(x0 + 0.006, 0.08 + H / 2, D / 2); const din = new THREE.Group(); d.add(din);
    cachedKit('lockerDoor' + (i % 9), din, k => {
      k.add(m, rbox(W - 0.014, H - 0.02, 0.018, 0.004), (W - 0.012) / 2, 0, 0.009);
      for (const yy of [0.72, 0.62, -0.62, -0.72]) for (let j = 0; j < 5; j++) k.add(Flat('#0d0e0f', 0.8), box(0.045, 0.012, 0.004), 0.06 + j * 0.06, yy, 0.0185);
      k.add(darkMetal(), rbox(0.03, 0.12, 0.02, 0.008), W - 0.06, 0.05, 0.025);
      k.add(labelMat('lockNum' + (i % 9), 64, 64, (c, w, h) => { c.fillStyle = '#e8e4d8'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `bold 38px ${SANS}`; c.textAlign = 'center'; c.fillText(String(12 + i), w / 2, 46); }), plane(0.05, 0.05), W / 2, 0.45, 0.0185);
    });
    if (i === oi) d.rotation.y = -1.9;
    g.add(d); doors.push(d);
  }
  if (oi >= 0 && oi < n) { // an abandoned jacket inside the open locker
    const x = -tot / 2 + W * (oi + 0.5); const j = new THREE.Group();
    cachedKit('lockerJacket', j, k => { k.add(fabric('#6a5a3a'), rbox(0.3, 0.55, 0.12, 0.05, 2), 0, 1.15, -0.05); k.add(fabric('#6a5a3a'), rbox(0.08, 0.45, 0.1, 0.04, 2), -0.13, 1.08, -0.04, 0, 0, 0.1); k.add(Flat('#d9a521', 0.5), sph(0.13, 16, 10, 0, TAU, 0, PI / 2), 0.0, 1.57, -0.05); k.add(Mat('paper'), box(0.15, 0.002, 0.2), 0.0, 0.1, 0.05, 0, 0.3, 0); });
    j.position.x = x; g.add(j);
  }
  g.userData.nodes.doors = doors;
  g.userData.setOpen = (i, v) => { if (doors[i]) doors[i].userData.target = v ? -1.9 : 0; };
  g.userData.update = dt => { for (const d of doors) { const t = d.userData.target; if (t !== undefined && Math.abs(d.rotation.y - t) > 1e-3) d.rotation.y = damp(d.rotation.y, t, 5, dt); } };
  g.userData.solid.push(SB(0, (H + 0.08) / 2, 0, tot / 2, (H + 0.08) / 2, D / 2));
  return g;
};

PROPS.elevatorPanel = (o = {}) => {
  const g = P('elevatorPanel'), cy = 1.15;
  cachedKit('elevPanel', g, k => {
    k.add(brushed(), rbox(0.14, 0.36, 0.012, 0.004), 0, cy, 0.006);
    k.add(blackGloss(), rbox(0.09, 0.05, 0.003, 0.003), 0, cy + 0.12, 0.013);
    k.add(brushed(), cyl(0.032, 0.034, 0.012, 32), 0, cy - 0.02, 0.015, PI / 2, 0, 0);
    k.add(labelMat('elevTxt', 128, 64, (c, w, h) => { c.fillStyle = '#c8ccd0'; c.fillRect(0, 0, w, h); c.fillStyle = '#333'; c.font = `bold 16px ${SANS}`; c.textAlign = 'center'; c.fillText('CALL', w / 2, 24); c.font = `11px ${SANS}`; c.fillText('FIRE: DO NOT USE', w / 2, 50); }, 0.35), plane(0.1, 0.05), 0, cy - 0.12, 0.0125);
  });
  const disp = mesh(plane(0.08, 0.04), new THREE.MeshBasicMaterial({ map: ctex('elevDisp', 128, 64, (c, w, h) => { c.fillStyle = '#100404'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff3a20'; c.font = `bold 40px ${MONO}`; c.textAlign = 'center'; c.fillText('B2', w / 2, 46); }), toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }), 0, cy + 0.12, 0.0148); g.add(disp);
  const btn = mesh(cyl(0.022, 0.022, 0.012, 28), Flat('#c8ccd0', 0.25, 0.9), 0, cy - 0.02, 0.024, PI / 2, 0, 0); g.add(btn);
  const arrow = mesh(gk('elevArrow', () => { const s = new THREE.Shape(); s.moveTo(0, 0.012); s.lineTo(0.011, -0.006); s.lineTo(-0.011, -0.006); s.closePath(); return new THREE.ShapeGeometry(s); }), LED.off, 0, cy - 0.02, 0.0305); g.add(arrow);
  const ring = mesh(tor(0.027, 0.0025, 6, 32), LED.off, 0, cy - 0.02, 0.022); g.add(ring);
  g.userData.nodes.button = btn; g.userData.nodes.display = disp;
  g.userData.setLit = v => { ring.material = arrow.material = v ? Glow('#ffd070', 2.4) : LED.off; };
  g.userData.setLit(!!o.lit);
  g.userData.solid.push(SB(0, cy, 0.01, 0.07, 0.18, 0.01));
  return g;
};

PROPS.emergencyLight = (o = {}) => {
  const red = o.color === 'red', g = P('emergencyLight'), cy = 2.4, col = red ? '#ff2a1a' : '#ffa020', colN = red ? 0xff2a1a : 0xffa020;
  cachedKit('emLightBase', g, k => {
    k.add(darkMetal(), rbox(0.14, 0.14, 0.02, 0.006), 0, cy, 0.01);
    k.add(darkMetal(), box(0.04, 0.04, 0.12), 0, cy, 0.08);
    k.add(Flat('#22262a', 0.5, 0.5), cyl(0.075, 0.08, 0.05, 24), 0, cy - 0.005, 0.15);
  });
  const dome = mesh(gk('emDome', () => new THREE.SphereGeometry(0.07, 24, 12, 0, TAU, 0, PI / 2).translate(0, 0.0, 0).scale(1, 1.4, 1)), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false }), 0, cy + 0.02, 0.15); g.add(dome);
  const rot = grp(0, cy + 0.05, 0.15); g.add(rot);
  rot.add(mesh(sph(0.018, 12, 8), Glow(col, 4)));
  rot.add(mesh(cyl(0.045, 0.045, 0.06, 16, true, 0, PI), Flat('#e8e8e8', 0.1, 1)));
  const beamM = mk('emBeam' + col, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.5), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const beam = mesh(gk('emBeamG', () => new THREE.ConeGeometry(0.22, 1.1, 20, 1, true).rotateZ(PI / 2).translate(0.55, 0, 0)), beamM); rot.add(beam);
  g.userData.lights.push({ x: 0, y: cy + 0.05, z: 0.4, color: colN, intensity: 1.2, distance: 7 });
  g.userData.nodes.rotor = rot;
  let on = o.on !== false; rot.visible = on;
  g.userData.setOn = v => { on = !!v; rot.visible = on; dome.material.emissiveIntensity = on ? 0.6 : 0; g.userData.lights[0].intensity = on ? 1.2 : 0; };
  g.userData.update = dt => { if (on) rot.rotation.y += dt * 5; };
  g.userData.solid.push(SB(0, cy, 0.1, 0.08, 0.08, 0.1));
  return g;
};
// ---- end of UTILITY

/* =====================================================================
   TRANSIT
   ===================================================================== */
const civicYellow = () => Flat('#e8b422', 0.4, 0.1);
PROPS.turnstile = (o = {}) => {
  const g = P('turnstile');
  cachedKit('turnstile', g, k => {
    const body = Mat('metalWhite'), top = blackGloss();
    k.add(body, rbox(0.3, 0.95, 1.2, 0.04, 3), 0, 0.475, 0);
    k.add(top, rbox(0.32, 0.04, 1.22, 0.015), 0, 0.97, 0);
    k.add(civicYellow(), box(0.302, 0.05, 1.18), 0, 0.82, 0);
    k.add(Flat('#16191c', 0.4), box(0.31, 0.6, 0.004), 0, 0.42, 0.598);
    k.add(darkMetal(), cyl(0.07, 0.09, 0.12, 20), 0.18, 0.78, 0.0, 0, 0, -PI / 2 - 0.0);
    k.add(labelMat('tsPad', 128, 128, (c, w, h) => { c.fillStyle = '#0c1014'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3fb8ff'; c.lineWidth = 4; for (let i = 1; i < 4; i++) { c.beginPath(); c.arc(w / 2, h / 2 + 18, i * 14, -PI * 0.75, -PI * 0.25); c.stroke(); } c.fillStyle = '#3fb8ff'; c.font = `bold 15px ${SANS}`; c.textAlign = 'center'; c.fillText('TAP ID', w / 2, h - 12); }), plane(0.14, 0.14), 0, 0.992, -0.3, -PI / 2, 0, 0);
  });
  const rotor = grp(0.24, 0.78, 0, 0, 0, -PI / 2 + 0.785); g.add(rotor);
  cachedKit('tsRotor', rotor, k => { k.add(chrome(), cyl(0.06, 0.06, 0.1, 20), 0, 0.05, 0); for (let i = 0; i < 3; i++) k.at(0, 0.08, 0, 0, i * TAU / 3, 0).add(chrome(), cyl(0.018, 0.018, 0.5, 12), 0, 0, 0.25, PI / 2, 0, 0); });
  const disp = mesh(plane(0.12, 0.08), Glow('#ff2a1a', 2.2), 0, 0.9, 0.601); g.add(disp);
  const arrow = mesh(gk('tsX', () => { const s = new THREE.Shape(); s.moveTo(-0.03, -0.004); s.lineTo(0.03, -0.004); s.lineTo(0.03, 0.004); s.lineTo(-0.03, 0.004); return new THREE.ShapeGeometry(s); }), Flat('#100', 0.5), 0, 0.9, 0.603, 0, 0, 0.785); g.add(arrow);
  const arrow2 = mesh(gk('tsX', null), Flat('#100', 0.5), 0, 0.9, 0.603, 0, 0, -0.785); g.add(arrow2);
  g.userData.nodes.rotor = rotor; g.userData.nodes.display = disp;
  let locked = o.locked !== false, spinT = 0;
  g.userData.setLocked = v => { locked = !!v; disp.material = locked ? Glow('#ff2a1a', 2.2) : Glow('#30ff60', 2.0); arrow.visible = arrow2.visible = locked; };
  g.userData.pass = () => { spinT = 1; };
  g.userData.setLocked(locked);
  g.userData.update = dt => { if (spinT > 0) { const s = Math.min(spinT, dt * 1.5); spinT -= s; rotor.rotateY(s * TAU / 3); } };
  g.userData.solid.push(SB(0, 0.5, 0, 0.16, 0.5, 0.6), { ...SB(0.45, 0.8, 0, 0.3, 0.2, 0.08), gate: true });
  return g;
};

PROPS.ticketMachine = (o = {}) => {
  const g = P('ticketMachine');
  cachedKit('ticketMachine', g, k => {
    const shell = Mat('metalWhite'), dk = Flat('#15181c', 0.4, 0.4);
    k.add(shell, rbox(0.82, 1.82, 0.5, 0.04, 3), 0, 0.91, 0);
    k.add(dk, rbox(0.7, 1.2, 0.02, 0.02), 0, 1.05, 0.25);
    k.add(civicYellow(), rbox(0.84, 0.18, 0.52, 0.04, 3), 0, 1.75, 0);
    k.add(labelMat('tmHead', 512, 96, (c, w, h) => { c.fillStyle = '#e8b422'; c.fillRect(0, 0, w, h); c.fillStyle = '#0a1420'; c.font = `bold 52px ${SANS}`; c.fillText('TICKETS', 20, 66); c.font = `bold 22px ${SANS}`; c.fillText('CIVIC TRANSIT', 300, 44); c.font = `18px ${SANS}`; c.fillText('a Civic Concord service', 300, 72); }), plane(0.78, 0.14), 0, 1.75, 0.262);
    k.add(dk, rbox(0.2, 0.12, 0.06, 0.02), -0.2, 0.62, 0.27); k.add(Flat('#050505', 0.8), box(0.14, 0.02, 0.01), -0.2, 0.6, 0.3);
    k.add(dk, rbox(0.18, 0.04, 0.05, 0.01), 0.18, 0.66, 0.27); k.add(Flat('#050505', 0.8), box(0.12, 0.006, 0.01), 0.18, 0.66, 0.296);
    k.add(darkMetal(), box(0.4, 0.14, 0.12), 0, 0.3, 0.2); k.add(Flat('#050505', 0.9), box(0.34, 0.08, 0.02), 0, 0.3, 0.262);
    k.add(Mat('paper'), box(0.05, 0.002, 0.09), 0.08, 0.262, 0.22, 0, 0.3, 0);
    k.add(labelMat('tmPad', 128, 128, (c, w, h) => { c.fillStyle = '#0c1014'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3fb8ff'; c.lineWidth = 4; for (let i = 1; i < 4; i++) { c.beginPath(); c.arc(w / 2, h / 2 + 18, i * 14, -PI * 0.75, -PI * 0.25); c.stroke(); } }), plane(0.11, 0.11), 0.18, 0.8, 0.262);
  });
  const scr = mesh(plane(0.6, 0.34), screenMat(o.screen === undefined ? 'transit' : o.screen, 1.4), 0, 1.25, 0.262, -0.0, 0, 0); g.add(scr);
  const crack = mesh(plane(0.6, 0.34), mk('crackDecal', () => new THREE.MeshBasicMaterial({ map: ctex('crack', 512, 288, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(230,240,255,0.75)'; c.lineWidth = 1.5; const R = rng(77), cx = w * 0.7, cy = h * 0.35; for (let i = 0; i < 14; i++) { let x = cx, y = cy, a = R() * TAU; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 8; j++) { a += R.r(-0.5, 0.5); x += Math.cos(a) * R.r(10, 40); y += Math.sin(a) * R.r(10, 40); c.lineTo(x, y); } c.stroke(); } for (let r = 12; r < 60; r += 16) { c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke(); } }), transparent: true, depthWrite: false })), 0, 1.25, 0.264); g.add(crack);
  g.userData.nodes.screen = scr; g.userData.setScreen = screenSetter([scr]);
  g.userData.lights.push({ x: 0, y: 1.3, z: 0.6, color: 0x9fc8ff, intensity: 0.5, distance: 3.5 });
  g.userData.solid.push(SB(0, 0.91, 0, 0.42, 0.91, 0.26));
  return g;
};

PROPS.subwayBench = () => {
  const g = P('subwayBench');
  cachedKit('subwayBench', g, k => {
    const fr = Flat('#2b3036', 0.45, 0.8), w = oak();
    for (const x of [-0.75, 0.75]) {
      k.add(fr, rbox(0.06, 0.42, 0.08, 0.01), x, 0.21, 0.0);
      k.add(fr, rbox(0.06, 0.03, 0.5, 0.01), x, 0.015, 0.0);
      k.add(fr, rbox(0.06, 0.03, 0.46, 0.01), x, 0.42, 0.02);
      k.add(fr, rbox(0.05, 0.5, 0.04, 0.01), x, 0.65, -0.21, -0.16, 0, 0);
    }
    for (let i = 0; i < 4; i++) k.add(w, rbox(1.8, 0.03, 0.095, 0.008), 0, 0.45, 0.2 - i * 0.11);
    for (let i = 0; i < 3; i++) k.add(w, rbox(1.8, 0.09, 0.025, 0.008), 0, 0.6 + i * 0.12, -0.2 - i * 0.02, -0.16, 0, 0);
    for (const x of [-0.25, 0.25]) k.add(fr, rbox(0.04, 0.2, 0.36, 0.015), x, 0.55, 0.0);
  });
  g.userData.solid.push(SB(0, 0.45, 0, 0.92, 0.45, 0.26));
  return g;
};

/* ----- subway carriage ----- */
const CAR = { L: 8, W: 1.5, floor: 1.1, wallH: 2.0, doors: [-5, 0, 5], dw: 0.65, dh: 1.95, segs: [[-7.7, -5.85], [-4.15, -2.6], [-2.4, -0.85], [0.85, 2.4], [2.6, 4.15], [5.85, 7.7]], seatSegs: [[-7.85, -5.75], [-4.25, -0.75], [0.75, 4.25], [5.75, 7.85]] };
function adTex(i) {
  return ctex('ad' + i, 1024, 128, (c, w, h) => {
    const A = [['#0c2b3a', '#d8f3ff', 'HELIX', 'Minds that care.  ORACLE now runs your city - so you don\'t have to.'], ['#f1ece2', '#2a3a44', 'Lumen Home', 'Your family, assisted. Companion units from 499/mo.'], ['#7a1a1a', '#ffffff', 'CIVIC CONCORD', 'Order is kindness. Report unregistered machines.'], ['#0a1420', '#ffcc33', 'LINE 4', 'Harbor - Civic Center - Helix Campus - Foundry Row - Northgate']][i % 4];
    c.fillStyle = A[0]; c.fillRect(0, 0, w, h); c.fillStyle = A[1]; c.font = `bold 58px ${SANS}`; c.fillText(A[2], 24, 78); c.font = `26px ${SANS}`; c.fillText(A[3], 340, 74);
    if (i % 4 === 3) { c.strokeStyle = '#ffcc33'; c.lineWidth = 6; c.beginPath(); c.moveTo(340, 100); c.lineTo(w - 30, 100); c.stroke(); for (let s = 0; s < 6; s++) { c.fillStyle = '#fff'; c.beginPath(); c.arc(350 + s * 125, 100, 9, 0, TAU); c.fill(); } }
    noiseFill2(c, w, h);
  });
}
PROPS.subwayCar = (o = {}) => {
  const wr = !!o.wrecked, cut = !!o.cutaway, g = P('subwayCar'), { L, W, floor: F, wallH, doors, dw, dh, segs } = CAR;
  cachedKit('subwayCar' + wr + cut, g, k => {
    const R = rng(wr ? 31 : 3);
    const shell = mk('carShell', () => { const m = Flat('#d9dde0', 0.35, 0.35).clone(); m.side = THREE.DoubleSide; return m; });
    const dk = Flat('#202428', 0.6, 0.5), floorM = mk('carFloor', () => fromSet('concrete', { color: '#4d555c' }));
    const glass = Mat('glassDirty'), seatF = fabric(wr ? '#3a4a66' : '#2e4f8a'), chromeM = chrome();
    // underframe, floor, bogies
    k.add(dk, box(15.4, 0.22, 2.7), 0, 0.89, 0);
    k.add(floorM, box(2 * L, 0.1, 2 * W), 0, F - 0.05, 0);
    for (const bx of [-5.6, 5.6]) {
      k.add(dk, box(2.5, 0.22, 2.0), bx, 0.68, 0);
      for (const sx of [-0.95, 0.95]) for (const sz of [-0.72, 0.72]) { k.add(Mat('steel'), cyl(0.36, 0.36, 0.1, 28), bx + sx, 0.675, sz, PI / 2, 0, 0); k.add(dk, cyl(0.2, 0.2, 0.14, 16), bx + sx, 0.675, sz * 1.08, PI / 2, 0, 0); }
      for (const sz of [-1, 1]) k.add(Mat('rust'), box(2.4, 0.18, 0.08), bx, 0.7, sz * 0.85);
      for (const sx of [-0.5, 0.5]) k.add(Flat('#a03a1a', 0.6, 0.5), tube('spring' + sx, Array.from({ length: 30 }, (_, i) => [Math.cos(i * 0.9) * 0.08, i * 0.006, Math.sin(i * 0.9) * 0.08]), 0.012, 60, 4), bx + sx, 0.79, 0.85);
    }
    for (const x of [-2.6, -1.0, 1.4, 3.0]) k.add(dk, rbox(1.1, 0.35, 1.6, 0.03), x, 0.62, 0);
    // side walls with windows and door openings
    const side = extrude('carSide', () => {
      const s = new THREE.Shape(); s.moveTo(-L, 0);
      for (const dx of doors) { s.lineTo(dx - dw, 0); s.lineTo(dx - dw, dh); s.lineTo(dx + dw, dh); s.lineTo(dx + dw, 0); }
      s.lineTo(L, 0); s.lineTo(L, wallH); s.lineTo(-L, wallH); s.closePath();
      for (const [a, b] of segs) s.holes.push(rrectHole(b - a, 0.85, 0.09, (a + b) / 2, 1.3));
      return s;
    }, 0.06, 0.012, 6);
    k.add(shell, side, 0, F, W - 0.06); k.add(shell, side, 0, F, -W);
    // roof
    if (!cut) {
      k.add(shell, cyl(3.9, 3.9, 2 * L, 36, true, -0.395, 0.79), 0, F + wallH - 0.3 + 0.3 - 3.9 + 0.3, 0, -PI / 2, 0, -PI / 2);
      k.add(Flat('#7a8086', 0.5, 0.6), box(2 * L - 0.4, 0.12, 0.8), 0, 3.42, 0);
    }
    // ends
    const endS = extrude('carEnd', () => {
      const s = new THREE.Shape(); s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, wallH); s.absarc(0, wallH + 0.3 - 3.9, 3.9, Math.atan2(3.9 - 0.3, W), PI - Math.atan2(3.9 - 0.3, W), false); s.lineTo(-W, 0);
      s.holes.push(rrectHole(0.5, 0.65, 0.06, 0, 1.45)); return s;
    }, 0.06, 0.01, 8);
    for (const s of [-1, 1]) {
      k.add(shell, endS, s * (L - 0.03) - 0.03 * 0, F, 0, 0, PI / 2, 0);
      k.add(Flat('#9aa0a6', 0.4, 0.6), rbox(0.04, dh, 0.95, 0.01), s * (L - 0.08), F + dh / 2, 0);
      k.add(glass, plane(0.5, 0.65), s * (L - 0.1), F + 1.45, 0, 0, -s * PI / 2, 0);
      k.add(rubber(), box(0.14, 2.2, 1.5), s * (L + 0.07), F + 1.1, 0);
      k.add(dk, box(0.5, 0.25, 0.3), s * (L + 0.1), 0.85, 0);
    }
    // windows
    segs.forEach(([a, b], i) => { for (const z of [W - 0.03, -W + 0.03]) { if (wr && (i * 3 + (z > 0 ? 1 : 0)) % 3 === 0) continue; k.add(glass, plane(b - a, 0.85), (a + b) / 2, F + 1.3, z); } });
    // livery stripes and lettering
    const segX = [[-L, -5.65], [-4.35, -0.65], [0.65, 4.35], [5.65, L]];
    for (const [a, b] of segX) for (const z of [W + 0.003, -W - 0.003]) { k.add(civicYellow(), box(b - a, 0.12, 0.004), (a + b) / 2, F + 0.6, z); k.add(Flat('#1e3a5f', 0.4, 0.2), box(b - a, 0.05, 0.004), (a + b) / 2, F + 0.5, z); }
    k.add(labelMat('carNum', 512, 96, (c, w, h) => { c.fillStyle = '#d9dde0'; c.fillRect(0, 0, w, h); c.fillStyle = '#1e3a5f'; c.font = `bold 46px ${SANS}`; c.fillText('CIVIC TRANSIT', 10, 50); c.font = `bold 30px ${MONO}`; c.fillText('CC 4-218', 340, 86); }, 0.4), plane(1.4, 0.26), -6.8, F + 0.25, W + 0.004);
    // closed door leaves on the -z side
    const leaf = extrude('carLeaf', () => { const s = rrect(dw - 0.01, dh - 0.01, 0.02); s.holes.push(rrectHole(0.4, 0.75, 0.05, 0, 0.35)); return s; }, 0.04, 0.008, 6);
    for (const dx of doors) for (const s of [-1, 1]) { k.add(Mat('metalWhite'), leaf, dx + s * dw / 2, F + dh / 2, -W + 0.01); k.add(glass, plane(0.4, 0.75), dx + s * dw / 2, F + dh / 2 + 0.35, -W + 0.03); k.add(Flat('#111', 0.8), box(0.02, dh, 0.05), dx, F + dh / 2, -W + 0.03); }
    for (const dx of doors) for (const z of [W - 0.03, -W + 0.03]) { k.add(civicYellow(), box(dw * 2, 0.03, 0.08), dx, F + 0.015, z); k.add(Flat('#333', 0.5), box(dw * 2 + 0.06, 0.06, 0.1), dx, F + dh + 0.03, z); }
    // interior: seats, poles, rails, ceiling lights, adverts
    for (const [a, b] of CAR.seatSegs) for (const s of [-1, 1]) {
      const len = b - a - 0.1, cx = (a + b) / 2, z = s * (W - 0.06 - 0.24);
      k.add(dk, box(len, 0.38, 0.4), cx, F + 0.19, z);
      k.add(seatF, rbox(len, 0.08, 0.46, 0.03), cx, F + 0.42, z);
      k.add(seatF, rbox(len, 0.5, 0.08, 0.03), cx, F + 0.75, s * (W - 0.1), s * 0.12, 0, 0);
      for (let x = a + 0.55; x < b - 0.3; x += 0.55) k.add(dk, box(0.012, 0.09, 0.47), x, F + 0.42, z);
    }
    for (const dx of doors) for (const sx of [-1, 1]) k.add(chromeM, cyl(0.02, 0.02, 2.25, 12), dx + sx * 1.0, F + 1.12, 0);
    for (const z of [-0.75, 0.75]) { k.add(chromeM, cyl(0.016, 0.016, 2 * L - 0.4, 10), 0, F + 1.95, z, 0, 0, PI / 2); for (let x = -7; x <= 7; x += 2) k.add(chromeM, cyl(0.008, 0.008, 0.27, 6), x, F + 2.08, z); }
    for (const z of [-0.62, 0.62]) k.add(wr ? Flat('#c8ccd0', 0.3) : Glow('#eaf4ff', 1.6), box(2 * L - 0.6, 0.02, 0.12), 0, 3.33, z);
    segs.forEach(([a, b], i) => { for (const s of [-1, 1]) k.add(mk('adM' + ((i + (s > 0 ? 1 : 0)) % 4), () => new THREE.MeshStandardMaterial({ map: adTex((i + (s > 0 ? 1 : 0)) % 4), roughness: 0.5 })), plane(b - a, 0.2), (a + b) / 2, F + 1.88, s * (W - 0.065), 0, s > 0 ? PI : 0, 0); });
    if (wr) {
      const scorch = mk('scorch', () => decalMat(ctex('scorch', 256, 256, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(8,6,4,0.95)'); gr.addColorStop(0.5, 'rgba(20,14,8,0.7)'); gr.addColorStop(1, 'rgba(30,20,10,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); } })));
      k.add(scorch, plane(2.4, 2.0), -2.2, F + 1.1, W + 0.01); k.add(scorch, plane(1.6, 1.4), 3.5, F + 0.9, -W - 0.01, 0, PI, 0); k.add(scorch, plane(2.0, 2.4), 1.2, F + 0.003, 0.2, -PI / 2, 0, 0);
      const graf = mk('graffiti', () => decalMat(ctex('graffiti', 512, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = `bold 84px ${HAND}`; c.lineWidth = 6; c.strokeStyle = '#111'; c.fillStyle = '#d0301e'; c.strokeText('ORACLE SEES', 20, 96); c.fillText('ORACLE SEES', 20, 96); })));
      k.add(graf, plane(2.2, 0.55), 2.5, F + 0.45, W + 0.012);
      for (let i = 0; i < 40; i++) k.add(Mat('glass'), box(R.r(0.03, 0.12), 0.004, R.r(0.03, 0.1)), R.r(-7, 7), F + 0.004, R.r(-1.1, 1.1), 0, R() * 3, 0);
      for (let i = 0; i < 8; i++) k.add(Mat('paper'), box(0.3, 0.003, 0.4), R.r(-7, 7), F + 0.003 + i * 0.001, R.r(-0.8, 0.8), 0, R() * 3, R.r(-0.05, 0.05));
      k.add(fabric('#5a2a2a'), rbox(0.5, 0.06, 0.4, 0.03), -4.6, F + 0.03, 0.3, 0, 0.6, 0);
      k.add(plastic('#3d6178', 0.32), rbox(0.46, 0.27, 0.66, 0.05, 2), 1.6, F + 0.135, -0.4, 0, 1.2, 0);
    }
  });
  if (wr) g.userData.lights.push({ x: -3, y: 3.1, z: 0, color: 0xff4a30, intensity: 0.35, distance: 6 });
  else for (const x of [-6, -2, 2, 6]) g.userData.lights.push({ x, y: 3.1, z: 0, color: 0xdfeeff, intensity: 0.9, distance: 6 });
  const S = g.userData.solid, F2 = F + wallH / 2 + 0.15;
  S.push(SB(0, F / 2, 0, L, F / 2, W));                       // underframe + floor (stand on top at y = 1.1)
  S.push(SB(0, F2, -W + 0.03, L, wallH / 2 + 0.15, 0.04));       // -z wall, doors closed
  const segX = [[-L, -5.65], [-4.35, -0.65], [0.65, 4.35], [5.65, L]];
  for (const [a, b] of segX) S.push(SB((a + b) / 2, F2, W - 0.03, (b - a) / 2, wallH / 2 + 0.15, 0.04));
  for (const dx of doors) S.push(SB(dx, F + dh + 0.2, W - 0.03, dw, 0.2, 0.04));   // lintels above the open doors
  for (const s of [-1, 1]) S.push(SB(s * (L - 0.03), F2, 0, 0.04, wallH / 2 + 0.15, W));
  S.push(SB(0, 3.3, 0, L, 0.1, W));
  for (const [a, b] of CAR.seatSegs) for (const s of [-1, 1]) S.push(SB((a + b) / 2, F + 0.25, s * (W - 0.3), (b - a) / 2 - 0.05, 0.25, 0.26));
  g.userData.doors = doors.map(x => ({ x, z: W, width: dw * 2, height: dh, floorY: F }));
  g.userData.floorY = F;
  return g;
};

function gravelMat() {
  return mk('gravel', () => {
    const t = ctex('gravel', 512, 512, (c, w, h) => {
      c.fillStyle = '#3a3836'; c.fillRect(0, 0, w, h); const R = rng(5);
      for (let i = 0; i < 2600; i++) { const x = R() * w, y = R() * h, r = R.r(4, 11), v = R.r(70, 150) | 0; c.fillStyle = `rgb(${v},${v - 4},${v - 10})`; c.beginPath(); c.ellipse(x, y, r, r * R.r(0.6, 1), R() * 3, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.3, 0, 0, TAU); c.fill(); }
    }, { wrap: true });
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2, roughness: 0.95 });
  });
}
PROPS.trackSegment = (o = {}) => {
  const len = o.len || 10, g = P('trackSegment');
  cachedKit('track' + len, g, k => {
    k.add(gravelMat(), box(len, 0.1, 3.6), 0, 0.05, -0.15);
    for (let x = -len / 2 + 0.3; x < len / 2; x += 0.65) k.add(Mat('concrete'), rbox(0.26, 0.13, 3.0, 0.015), x, 0.1, -0.2);
    const rail = extrude('railProf' + len, () => { const s = new THREE.Shape(); const P2 = [[-0.07, 0], [0.07, 0], [0.07, 0.012], [0.012, 0.025], [0.008, 0.11], [0.035, 0.12], [0.035, 0.155], [-0.035, 0.155], [-0.035, 0.12], [-0.008, 0.11], [-0.012, 0.025], [-0.07, 0.012]]; s.moveTo(P2[0][0], P2[0][1]); for (const p of P2.slice(1)) s.lineTo(p[0], p[1]); s.closePath(); return s; }, len, 0.002, 1);
    for (const z of [-0.7175, 0.7175]) {
      k.add(Mat('steel'), rail, -len / 2, 0.165, z, 0, PI / 2, 0);
      for (let x = -len / 2 + 0.3; x < len / 2; x += 0.65) for (const s of [-1, 1]) k.add(darkMetal(), box(0.08, 0.02, 0.05), x, 0.175, z + s * 0.07);
    }
    for (let x = -len / 2 + 1.0; x < len / 2; x += 2.5) { k.add(ceramic('#d8d2c0'), cyl(0.04, 0.05, 0.16, 12), x, 0.245, -1.55); k.add(darkMetal(), box(0.06, 0.25, 0.04), x, 0.32, -1.72); k.add(darkMetal(), box(0.06, 0.04, 0.3), x, 0.45, -1.6); }
    k.add(Mat('steel'), box(len, 0.07, 0.07), 0, 0.36, -1.55);
    const board = gk('tlbl' + len, () => { const p = new THREE.PlaneGeometry(len, 0.28); const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2); p.rotateX(-PI / 2); return p; });
    k.add(mk('3rdBoard', () => { const t = ctex('3rdRail', 512, 72, (c, w, h) => { c.fillStyle = '#d8b030'; c.fillRect(0, 0, w, h); noiseFill2(c, w, h); c.fillStyle = '#c0261e'; c.font = `bold 40px ${SANS}`; c.fillText('DANGER  750 V', 20, 50); c.fillStyle = '#222'; c.fillRect(380, 10, 6, 52); }, { wrap: true }); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }); }), board, 0, 0.475, -1.6);
    k.add(civicYellow(), box(len, 0.03, 0.02), 0, 0.455, -1.46);
  });
  return g;
};

PROPS.platformEdge = (o = {}) => {
  const len = o.len || 10, g = P('platformEdge'), H = 1.1;
  cachedKit('platform' + len, g, k => {
    k.add(Mat('concreteDark'), box(len, H - 0.1, 1.15), 0, (H - 0.1) / 2, -0.675);
    k.add(Flat('#0c0d0e', 0.9), box(len, 0.2, 0.02), 0, H - 0.25, -0.1);
    k.add(Mat('tiles'), box(len, 0.1, 0.3), 0, H - 0.05, -1.05);
    const tact = mk('tactile', () => { const t = ctex('tactile', 256, 256, (c, w, h) => { c.fillStyle = '#d9a521'; c.fillRect(0, 0, w, h); noiseFill2(c, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const gr = c.createRadialGradient(x * 32 + 16, y * 32 + 13, 1, x * 32 + 16, y * 32 + 16, 11); gr.addColorStop(0, '#f8d870'); gr.addColorStop(0.8, '#c8901a'); gr.addColorStop(1, 'rgba(120,80,10,0.8)'); c.fillStyle = gr; c.beginPath(); c.arc(x * 32 + 16, y * 32 + 16, 11, 0, TAU); c.fill(); } }, { wrap: true }); return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 3, roughness: 0.6 }); });
    k.add(tact, gk('tactBox' + len, () => { const b = new THREE.BoxGeometry(len, 0.1, 0.6); boxUV(b, 2.5); return b; }), 0, H - 0.05, -0.6);
    k.add(Flat('#9a9a96', 0.7), rbox(len, 0.1, 0.38, 0.02), 0, H - 0.05, 0.01);
    k.add(Flat('#ece8dc', 0.6), box(len, 0.002, 0.08), 0, H + 0.001, -0.12);
    const gap = mk('mindGap', () => decalMat(ctex('mindGap', 512, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(236,232,220,0.9)'; c.font = `bold 44px ${SANS}`; c.textAlign = 'center'; c.fillText('MIND THE GAP', w / 2, 48); })));
    for (let x = -len / 2 + 2; x < len / 2 - 1; x += 4) k.add(gap, plane(1.4, 0.175), x, H + 0.002, 0.07, -PI / 2, 0, 0);
  });
  g.userData.solid.push(SB(0, H / 2, -0.59, len / 2, H / 2, 0.61));
  g.userData.topY = H;
  return g;
};
// ---- end of TRANSIT

/* =====================================================================
   LAB / SERVER / FACTORY
   ===================================================================== */
/** faceplate atlas for rack units: 4 rows (1U drives, 2U vents, 4U GPU node, blank) */
function rackAtlas() {
  return ctex('rackAtlas', 512, 512, (c, w, h) => {
    const rh = h / 4;
    for (let r = 0; r < 4; r++) {
      const y0 = r * rh; c.fillStyle = ['#2a2e33', '#25292d', '#1d2125', '#303439'][r]; c.fillRect(0, y0, w, rh);
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, y0, w, 3);
      if (r === 0) for (let i = 0; i < 10; i++) { c.fillStyle = '#16191c'; c.fillRect(30 + i * 46, y0 + 20, 40, rh - 40); c.fillStyle = '#4a5056'; c.fillRect(34 + i * 46, y0 + 26, 32, 6); }
      if (r === 1) { for (let i = 0; i < 60; i++) for (let j = 0; j < 8; j++) { c.fillStyle = '#0c0e10'; c.beginPath(); c.arc(40 + i * 7.5, y0 + 22 + j * 11, 2.4, 0, TAU); c.fill(); } }
      if (r === 2) { c.fillStyle = '#0e1012'; for (let i = 0; i < 26; i++) c.fillRect(20 + i * 18, y0 + 14, 9, rh - 28); c.fillStyle = '#c8d0d6'; c.font = `bold 18px ${SANS}`; c.fillText('ORACLE NODE', w - 150, y0 + rh - 14); }
      if (r === 3) { c.fillStyle = '#3a3e43'; c.fillRect(10, y0 + 10, w - 20, rh - 20); }
      c.fillStyle = '#6a7076'; c.beginPath(); c.arc(10, y0 + rh / 2, 4, 0, TAU); c.arc(w - 10, y0 + rh / 2, 4, 0, TAU); c.fill();
    }
  });
}
const rackFace = row => gk('rackFace' + row, () => { const p = new THREE.PlaneGeometry(1, 1); const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (3 - row + uv.getY(i)) / 4); return p; });
PROPS.serverRack = (o = {}) => {
  const seed = o.seed ?? 1, g = P('serverRack'), W = 0.6, H = 2.0, D = 1.0, R = rng(seed + 900);
  const faceM = mk('rackFaceM', () => new THREE.MeshStandardMaterial({ map: rackAtlas(), roughness: 0.5, metalness: 0.4 }));
  const units = []; let y = 0.12;
  while (y < H - 0.14) {
    const kind = R.pick([0, 0, 1, 1, 2, 3]), u = [1, 2, 4, 1][kind], hgt = u * 0.0445;
    if (y + hgt > H - 0.12) break;
    const missing = R() < 0.08, pulled = !missing && R() < 0.05;
    units.push({ y, hgt, kind, missing, pulled }); y += hgt;
  }
  cachedKit('rack' + seed, g, k => {
    const fr = Flat('#16181b', 0.45, 0.6), side = Flat('#202327', 0.5, 0.5);
    for (const sx of [-1, 1]) { k.add(side, box(0.02, H, D), sx * (W / 2 - 0.01), H / 2, 0); for (const sz of [-1, 1]) k.add(fr, box(0.04, H, 0.04), sx * (W / 2 - 0.04), H / 2, sz * (D / 2 - 0.04)); }
    k.add(fr, rbox(W, 0.04, D, 0.008), 0, H - 0.02, 0); k.add(fr, box(W, 0.1, D), 0, 0.05, 0);
    k.add(side, box(W - 0.04, H - 0.14, 0.02), 0, H / 2, -D / 2 + 0.03);
    for (const u of units) {
      const z = D / 2 - 0.06 + (u.pulled ? 0.32 : 0);
      if (u.missing) continue;
      k.add(Flat('#2b2f34', 0.5, 0.5), box(W - 0.1, u.hgt - 0.003, 0.7), 0, u.y + u.hgt / 2, z - 0.35);
      k.add(faceM, rackFace(u.kind), 0, u.y + u.hgt / 2, z + 0.0005, 0, 0, 0, [W - 0.06, u.hgt - 0.002, 1]);
    }
    // cable bundles on top and dangling patch cables
    for (let i = 0; i < 4; i++) k.add(Flat(['#2a5ad0', '#d0a020', '#202020', '#c03030'][i], 0.5), tube('rackCab' + seed + i, [[-0.2 + i * 0.12, H, -0.3], [-0.2 + i * 0.12, H + 0.12, -0.1], [-0.2 + i * 0.12 + R.r(-0.1, 0.1), H + 0.1, 0.3], [-0.25 + i * 0.12, H + 0.25, 0.5]], 0.012, 16, 5), 0, 0, 0);
    for (let i = 0; i < 3; i++) { const yy = R.r(0.5, 1.7); k.add(Flat(['#2a5ad0', '#d0a020', '#30a050'][i], 0.5), tube('rackPatch' + seed + i, [[R.r(-0.2, 0.2), yy, D / 2 - 0.04], [R.r(-0.2, 0.2), yy - 0.15, D / 2 + 0.05], [R.r(-0.25, 0.25), yy - 0.4, D / 2 + 0.03]], 0.004, 16, 4), 0, 0, 0); }
    k.add(labelMat('rackBrand', 256, 64, (c, w, h) => { c.fillStyle = '#16181b'; c.fillRect(0, 0, w, h); helixLogo(c, 30, 32, 44, '#9fdcff'); c.fillStyle = '#d8eef8'; c.font = `300 34px ${SANS}`; c.fillText('HELIX', 60, 44); c.font = `14px ${MONO}`; c.fillStyle = '#7a8a94'; c.fillText(`R-${100 + seed}`, 180, 44); }), plane(0.3, 0.075), 0, H - 0.06, D / 2 + 0.002);
  });
  // LEDs: one mesh with per-vertex colours, flickered in update
  const leds = []; const parts = [];
  units.forEach((u, ui) => { if (u.missing) return; const z = D / 2 - 0.06 + (u.pulled ? 0.32 : 0) + 0.003; const n = u.kind === 2 ? 4 : u.kind === 3 ? 1 : 3; for (let i = 0; i < n; i++) { parts.push(box(0.011, 0.007, 0.004), mtx(W / 2 - 0.065 - i * 0.018, u.y + u.hgt - 0.013, z)); leds.push({ col: R() < 0.12 ? 2 : R() < 0.3 ? 1 : 0, rate: R.r(0.03, 0.6), on: true, t: R() }); } });
  if (parts.length) {
    const geo = mergeList(parts), cnt = geo.attributes.position.count, per = cnt / leds.length, col = new Float32Array(cnt * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lm = new THREE.Mesh(geo, mk('ledVC', () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))); g.add(lm);
    const C = [[0.3, 3.0, 0.8], [3.0, 1.8, 0.2], [3.0, 0.3, 0.2]];
    const paint = (i, on) => { const c = on ? C[leds[i].col] : [0.03, 0.03, 0.03]; for (let v = i * per; v < (i + 1) * per; v++) { col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; } };
    leds.forEach((_, i) => paint(i, true));
    let powered = o.powered !== false;
    g.userData.setPowered = v => { powered = !!v; leds.forEach((_, i) => paint(i, powered)); geo.attributes.color.needsUpdate = true; };
    g.userData.update = dt => { if (!powered) return; let ch = false; for (let i = 0; i < leds.length; i++) { const L2 = leds[i]; L2.t -= dt; if (L2.t < 0) { L2.on = L2.col === 2 ? !L2.on : Math.random() > 0.3; L2.t = L2.col === 2 ? 0.5 : L2.rate * Math.random(); paint(i, L2.on); ch = true; } } if (ch) geo.attributes.color.needsUpdate = true; };
    if (!powered) g.userData.setPowered(false);
    g.userData.nodes.leds = lm;
  }
  g.userData.lights.push({ x: 0, y: 1.2, z: 0.8, color: 0x50ff9a, intensity: 0.25, distance: 2.5 });
  g.userData.solid.push(SB(0, H / 2, 0, W / 2, H / 2, D / 2));
  return g;
};

const beakerPts = [[0, 0], [0.04, 0], [0.042, 0.004], [0.042, 0.11], [0.048, 0.118], [0.045, 0.12], [0.039, 0.112], [0.039, 0.004], [0, 0.004]];
const flaskPts = [[0, 0], [0.06, 0], [0.064, 0.01], [0.05, 0.06], [0.016, 0.13], [0.016, 0.18], [0.019, 0.185], [0.013, 0.185], [0.013, 0.13], [0.045, 0.06], [0.056, 0.012], [0, 0.006]];
function liquidMat(c, e = 0.4) { return mk('liq' + c + e, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.1, transparent: true, opacity: 0.75 })); }
PROPS.labBench = () => {
  const g = P('labBench');
  cachedKit('labBench', g, k => {
    const wht = lacq('#e3e5e4'), top = Flat('#141618', 0.25, 0.1), st = brushed();
    k.add(wht, box(2.0, 0.8, 0.8), 0, 0.42, -0.02); k.add(Flat('#222', 0.7), box(2.0, 0.08, 0.72), 0, 0.04, -0.04);
    for (let i = 0; i < 4; i++) { k.add(lacq('#eef0ef'), rbox(0.49, 0.36, 0.02, 0.004), -0.75 + i * 0.5, 0.6, 0.385); k.add(lacq('#eef0ef'), rbox(0.49, 0.36, 0.02, 0.004), -0.75 + i * 0.5, 0.22, 0.385); k.add(st, rbox(0.16, 0.012, 0.02, 0.005), -0.75 + i * 0.5, 0.72, 0.4); }
    k.add(top, slab(2.06, 0.88, 0.03, 0.01, 0.004), 0, 0.82, 0);
    for (const x of [-0.95, 0.95]) k.add(st, box(0.03, 0.75, 0.03), x, 1.22, -0.36);
    k.add(wht, box(2.0, 0.025, 0.3), 0, 1.3, -0.28); k.add(wht, box(2.0, 0.025, 0.3), 0, 1.6, -0.28);
    // glassware and reagents
    const R = rng(12), liq = ['#3fbfff', '#7aff6a', '#ff8a3a', '#d040ff'];
    for (let i = 0; i < 9; i++) { const x = -0.9 + i * 0.2 + R.r(-0.03, 0.03); k.add(Flat(R.pick(['#5a3a1a', '#e8e8e8', '#2a4a8a']), 0.3), lathe('reagent', [[0, 0], [0.035, 0], [0.035, 0.12], [0.015, 0.15], [0.015, 0.17], [0, 0.17]], 14), x, 1.3125, -0.28); }
    for (let i = 0; i < 5; i++) k.add(Mat('glass'), lathe('beaker', beakerPts, 20), -0.85 + i * 0.4, 1.6125, -0.25);
    k.add(Mat('glass'), lathe('beaker', beakerPts, 20), 0.55, 0.835, 0.12); k.add(liquidMat(liq[0]), cyl(0.038, 0.038, 0.05, 16), 0.55, 0.865, 0.12);
    k.add(Mat('glass'), lathe('flask', flaskPts, 20), 0.75, 0.835, -0.05); k.add(liquidMat(liq[1]), lathe('flaskLiq', [[0, 0.006], [0.054, 0.012], [0.05, 0.05], [0, 0.05]], 16), 0.75, 0.835, -0.05);
    k.add(Mat('glass'), lathe('flask', flaskPts, 20), 0.35, 0.835, -0.2, 0, 0, PI / 2 - 0.05); // tipped over
    k.add(Flat('#2a8a5a', 0.1, 0, 0, 1), slab(0.4, 0.25, 0.002, 0.1, 0), 0.15, 0.836, -0.15);
    // microscope
    const mic = k.at(-0.55, 0.835, 0.0, 0, 0.4, 0);
    mic.add(lacq('#f0f0ee'), rbox(0.2, 0.04, 0.24, 0.015), 0, 0.02, 0); mic.add(lacq('#f0f0ee'), rbox(0.06, 0.32, 0.08, 0.02), 0, 0.18, -0.08, 0.15, 0, 0);
    mic.add(lacq('#f0f0ee'), rbox(0.12, 0.02, 0.12, 0.006), 0, 0.12, 0.02); mic.add(darkMetal(), cyl(0.022, 0.022, 0.16, 16), 0, 0.3, 0.0, -0.5, 0, 0); mic.add(darkMetal(), cyl(0.012, 0.012, 0.06, 12), 0, 0.2, 0.03);
    // tube rack + centrifuge
    k.add(lacq('#d8dcdf'), rbox(0.22, 0.06, 0.08, 0.008), -0.15, 0.865, 0.15); for (let i = 0; i < 5; i++) k.add(liquidMat(R.pick(liq), 0.8), cyl(0.008, 0.008, 0.11, 8), -0.23 + i * 0.04, 0.9, 0.15);
    k.add(lacq('#e8eaeb'), cyl(0.15, 0.16, 0.2, 28), -0.3, 0.935, -0.2); k.add(Mat('glassDirty'), cyl(0.12, 0.12, 0.01, 24), -0.3, 1.04, -0.2);
    k.add(Mat('paper'), box(0.21, 0.002, 0.297), 0.15, 0.837, 0.25, 0, -0.3, 0);
  });
  g.userData.solid.push(SB(0, 0.42, 0, 1.03, 0.42, 0.44), SB(0, 1.45, -0.28, 1.0, 0.18, 0.15));
  return g;
};

/* ----- cryo pod: tall glass capsule, frost and a cold glow ----- */
function frostTex() {
  return ctex('frost', 512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h); const id = c.getImageData(0, 0, w, h), d = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, edge = Math.max(Math.pow(Math.abs(v - 0.5) * 2, 3), Math.pow(Math.abs(u - 0.5) * 2, 4));
      const n = fbm(u * 8, v * 8, 4, 3), cr = fbm(u * 40, v * 40, 2, 9);
      const a = clamp(edge * 1.3 + (n - 0.55) * 1.2 + (cr > 0.62 ? 0.25 : 0), 0, 0.95);
      const i = (y * w + x) * 4; d[i] = 225; d[i + 1] = 240; d[i + 2] = 255; d[i + 3] = a * 255;
    }
    c.putImageData(id, 0, 0);
  });
}
function cryoGlowTex() { return ctex('cryoGlow', 64, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#bff4ff'); gr.addColorStop(0.15, '#2aa8d8'); gr.addColorStop(0.5, '#0a3a5a'); gr.addColorStop(0.85, '#2aa8d8'); gr.addColorStop(1, '#d8faff'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }); }
function mistTex() { return ctex('mist', 256, 256, (c, w, h) => { const id = c.createImageData(w, h), d = id.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = x / w, v = y / h, n = fbm(u * 4, v * 4, 4, 17), r = Math.hypot(u - 0.5, v - 0.5) * 2, a = clamp((n - 0.35) * 1.6, 0, 1) * clamp(1 - r, 0, 1); const i = (y * w + x) * 4; d[i] = 200; d[i + 1] = 235; d[i + 2] = 255; d[i + 3] = a * 255; } c.putImageData(id, 0, 0); }); }
PROPS.cryoPod = (o = {}) => {
  const g = P('cryoPod'), occ = !!o.occupied, R0 = 0.5, y0 = 0.32, y1 = 2.18, Hc = y1 - y0;
  cachedKit('cryoBase', g, k => {
    const wht = lacq('#e9ecec'), grey = Flat('#8c949a', 0.35, 0.5), dk = Flat('#1a1d20', 0.4, 0.4);
    k.add(wht, lathe('cryoBase', [[0, 0], [0.66, 0], [0.7, 0.03], [0.7, 0.2], [0.66, 0.26], [0.58, 0.3], [0.52, 0.32], [0, 0.32]], 56), 0, 0, 0);
    k.add(dk, cyl(0.56, 0.56, 0.02, 48), 0, 0.33, 0);
    k.add(wht, lathe('cryoCap', [[0, 2.48], [0.3, 2.47], [0.5, 2.4], [0.6, 2.3], [0.62, 2.22], [0.58, 2.17], [0.5, 2.15], [0, 2.15]], 56), 0, 0, 0);
    k.add(dk, cyl(0.5, 0.5, 0.03, 48), 0, 2.16, 0);
    k.add(grey, tor(0.52, 0.02, 8, 56), 0, y0 + 0.02, 0, PI / 2, 0, 0); k.add(grey, tor(0.52, 0.02, 8, 56), 0, y1 - 0.02, 0, PI / 2, 0, 0);
    // opaque back shell (behind the glass)
    k.add(mk('cryoShell', () => { const m = lacq('#e3e6e7').clone(); m.side = THREE.DoubleSide; return m; }), cyl(R0 + 0.04, R0 + 0.04, Hc, 48, true, PI * 0.42, PI * 1.16), 0, (y0 + y1) / 2, 0);
    // spine column with hoses
    k.add(wht, rbox(0.34, 2.5, 0.2, 0.08, 3), 0, 1.25, -0.66);
    k.add(dk, rbox(0.2, 2.2, 0.02, 0.01), 0, 1.25, -0.555);
    for (const s of [-1, 1]) k.add(Flat('#2a3036', 0.5, 0.2), tube('cryoHose' + s, [[s * 0.12, 2.4, -0.6], [s * 0.3, 2.62, -0.45], [s * 0.45, 2.55, -0.2], [s * 0.4, 2.42, 0.0]], 0.035, 30, 10), 0, 0, 0);
    for (const s of [-1, 1]) k.add(grey, tube('cryoHoseLow' + s, [[s * 0.15, 0.15, -0.6], [s * 0.45, 0.12, -0.55], [s * 0.6, 0.12, -0.3]], 0.03, 20, 8), 0, 0, 0);
    // side control panel with vitals
    k.add(wht, rbox(0.3, 0.42, 0.1, 0.03), 0.62, 1.3, -0.4, 0, 0.7, 0);
    k.add(labelMat('cryoLbl', 512, 128, (c, w, h) => { c.fillStyle = '#e9ecec'; c.fillRect(0, 0, w, h); helixLogo(c, 40, 64, 80, '#3a6a8a'); c.fillStyle = '#2a3a44'; c.font = `300 44px ${SANS}`; c.fillText('HELIX', 80, 62); c.font = `bold 20px ${SANS}`; c.fillText('CRYOGENIC SUSPENSION', 80, 94); c.font = `18px ${MONO}`; c.fillText('UNIT 07  //  PROJECT LAZARUS', 80, 118); }, 0.4), plane(0.5, 0.125), 0, 0.2, 0.705, 0, 0, 0);
  });
  // glowing interior back wall and floor disc
  const gm = new THREE.MeshBasicMaterial({ map: cryoGlowTex(), toneMapped: false, side: THREE.DoubleSide, color: new THREE.Color(1.3, 1.3, 1.3) });
  const inner = mesh(cyl(R0 + 0.035, R0 + 0.035, Hc - 0.04, 40, true, PI * 0.45, PI * 1.1), gm, 0, (y0 + y1) / 2, 0); g.add(inner);
  const ringGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fe8ff').multiplyScalar(2.6), toneMapped: false });
  g.add(mesh(tor(0.6, 0.012, 6, 64), ringGlow, 0, 0.28, 0, PI / 2, 0, 0));
  g.add(mesh(cyl(0.42, 0.42, 0.01, 40), ringGlow, 0, 0.345, 0));
  const vit = mesh(plane(0.22, 0.12), screenMat('graph', 1.2), 0.655, 1.33, -0.358, 0, 0.7, 0); g.add(vit);
  // occupant
  if (occ) {
    const fig = new THREE.Group(); g.add(fig);
    cachedKit('cryoFigure', fig, k => {
      const suit = Flat('#3a4a58', 0.6, 0.1), skin = Flat('#b9c4cc', 0.5);
      k.add(suit, rbox(0.34, 0.55, 0.2, 0.09, 3), 0, 1.45, 0);
      k.add(suit, rbox(0.3, 0.3, 0.18, 0.08, 3), 0, 1.07, 0);
      for (const s of [-1, 1]) { k.add(suit, cyl(0.06, 0.05, 0.7, 12), s * 0.09, 0.6, 0.0); k.add(suit, cyl(0.045, 0.04, 0.55, 12), s * 0.22, 1.42, 0.02, 0, 0, s * 0.08); k.add(skin, sph(0.04, 10, 8), s * 0.24, 1.12, 0.03); }
      k.add(skin, cyl(0.05, 0.05, 0.1, 12), 0, 1.76, 0); k.add(skin, sph(0.11, 20, 16), 0, 1.88, 0.0, 0, 0, 0, [0.9, 1.1, 1]);
      k.add(Flat('#20262c', 0.3, 0.4), rbox(0.12, 0.08, 0.06, 0.03), 0, 1.84, 0.1);
      k.add(Flat('#2a3036', 0.5), tube('cryoMask', [[0, 1.84, 0.13], [0.05, 1.7, 0.15], [0.08, 1.6, 0.08], [0.1, 1.9, -0.3]], 0.012, 16, 6), 0, 0, 0);
    });
  }
  // mist
  const mists = []; for (let i = 0; i < 3; i++) { const m = mesh(plane(0.9, 0.9), mk('mistM', () => new THREE.MeshBasicMaterial({ map: mistTex(), transparent: true, opacity: 0.35, depthWrite: false, color: new THREE.Color(1.2, 1.4, 1.6), toneMapped: false, side: THREE.DoubleSide })), 0, 0.55 + i * 0.6, 0, 0, i * 1.1, 0); g.add(m); mists.push(m); }
  // front glass (rotates open around the axis) with frost
  const door = new THREE.Group(); g.add(door);
  door.add(mesh(cyl(R0, R0, Hc, 48, true, -PI * 0.4, PI * 0.8), mk('cryoGlass', () => new THREE.MeshPhysicalMaterial({ color: 0xbfe6f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8 })), 0, (y0 + y1) / 2, 0));
  door.add(mesh(cyl(R0 - 0.004, R0 - 0.004, Hc, 48, true, -PI * 0.4, PI * 0.8), mk('cryoFrost', () => new THREE.MeshStandardMaterial({ map: frostTex(), transparent: true, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide, emissive: 0x2a5a70, emissiveIntensity: 0.3 })), 0, (y0 + y1) / 2, 0));
  cachedKit('cryoDoorFrame', door, k => { for (const a of [-PI * 0.4, PI * 0.4]) k.add(Flat('#c8ced2', 0.3, 0.6), rbox(0.04, Hc, 0.05, 0.015), Math.sin(a) * R0, (y0 + y1) / 2, Math.cos(a) * R0, 0, a, 0); k.add(Flat('#8c949a', 0.35, 0.5), rbox(0.03, 0.4, 0.04, 0.012), 0, 1.25, R0 + 0.03); });
  g.userData.nodes.door = door; g.userData.nodes.glow = inner;
  const L = { x: 0, y: 1.3, z: 0.35, color: 0x6fe8ff, intensity: 1.2, distance: 5 }; g.userData.lights.push(L);
  let open = !!o.open, ang = open ? PI * 0.95 : 0, powered = o.powered !== false, t = 0; door.rotation.y = ang;
  g.userData.setOpen = v => { open = !!v; };
  g.userData.setPower = v => { powered = !!v; gm.color.setScalar(powered ? 1.3 : 0.05); ringGlow.color.set(powered ? '#6fe8ff' : '#203038').multiplyScalar(powered ? 2.6 : 1); L.intensity = powered ? 1.2 : 0; for (const m of mists) m.visible = powered; };
  g.userData.setPower(powered);
  g.userData.update = dt => {
    t += dt; const tg = open ? PI * 0.95 : 0; if (Math.abs(ang - tg) > 1e-3) { ang = damp(ang, tg, 2.2, dt); door.rotation.y = ang; }
    if (powered) { mists.forEach((m, i) => { m.rotation.y += dt * (0.15 + i * 0.07) * (i % 2 ? -1 : 1); m.position.y = 0.55 + i * 0.6 + Math.sin(t * 0.4 + i) * 0.08; }); gm.color.setScalar(1.15 + Math.sin(t * 1.3) * 0.15); }
  };
  g.userData.solid.push(SB(0, 1.24, 0, 0.66, 1.24, 0.66), SB(0, 1.25, -0.66, 0.17, 1.25, 0.1));
  return g;
};

/* ----- specimen tank: a grown neural lattice in green fluid ----- */
const organoidGeo = () => gk('organoid', () => {
  const geo = new THREE.IcosahedronGeometry(0.2, 5), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); const f = 1 + (fbm(n.x * 3 + 5, n.y * 3 + n.z * 2, 4, 3) - 0.5) * 0.7 + Math.sin(n.x * 18 + n.y * 9) * 0.03; v.copy(n).multiplyScalar(0.2 * f); v.y *= 0.85; p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
});
PROPS.specimenTank = () => {
  const g = P('specimenTank'), R0 = 0.4, y0 = 0.35, y1 = 1.95;
  cachedKit('specTank', g, k => {
    const m = Flat('#3a3f44', 0.35, 0.8), wht = lacq('#dfe2e2');
    k.add(m, lathe('stBase', [[0, 0], [0.52, 0], [0.54, 0.04], [0.5, 0.3], [0.44, 0.35], [0, 0.35]], 48), 0, 0, 0);
    k.add(m, lathe('stTop', [[0, 2.2], [0.3, 2.18], [0.46, 2.08], [0.48, 2.0], [0.44, 1.95], [0, 1.95]], 48), 0, 0, 0);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; k.add(brushed(), cyl(0.02, 0.02, y1 - y0, 10), Math.sin(a) * (R0 + 0.04), (y0 + y1) / 2, Math.cos(a) * (R0 + 0.04)); }
    for (let i = 0; i < 3; i++) k.add(Flat('#2a2e33', 0.5), tube('stHose' + i, [[-0.2 + i * 0.2, 2.18, -0.1], [-0.25 + i * 0.25, 2.5, -0.2], [-0.3 + i * 0.3, 2.4, -0.6], [-0.3 + i * 0.3, 2.0, -0.7]], 0.03, 20, 8), 0, 0, 0);
    // cables from the lid down into the specimen
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.add(Flat('#8a9aa8', 0.3, 0.6), tube('stWire' + i, [[Math.sin(a) * 0.1, 1.95, Math.cos(a) * 0.1], [Math.sin(a) * 0.16, 1.6, Math.cos(a) * 0.16], [Math.sin(a) * 0.12, 1.3, Math.cos(a) * 0.12], [Math.sin(a) * 0.05, 1.15, Math.cos(a) * 0.05]], 0.006, 16, 4), 0, 0, 0); }
    k.add(labelMat('stLbl', 256, 64, (c, w, h) => { c.fillStyle = '#3a3f44'; c.fillRect(0, 0, w, h); c.fillStyle = '#d0ffd8'; c.font = `bold 22px ${MONO}`; c.fillText('SPECIMEN L-3', 14, 28); c.font = `16px ${MONO}`; c.fillStyle = '#8acf98'; c.fillText('neural lattice / wetware', 14, 52); }), plane(0.3, 0.075), 0, 0.2, 0.52, -0.25, 0, 0);
  });
  const spec = mesh(organoidGeo(), mk('organoidM', () => new THREE.MeshStandardMaterial({ color: 0xc89a9a, roughness: 0.35, emissive: 0x40ff90, emissiveIntensity: 0.25 })), 0, 1.1, 0); g.add(spec);
  const liq = mesh(cyl(R0 - 0.01, R0 - 0.01, y1 - y0 - 0.1, 40), mk('tankLiquid', () => new THREE.MeshStandardMaterial({ color: 0x3aff8a, emissive: 0x18a050, emissiveIntensity: 0.9, transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false })), 0, (y0 + y1) / 2 - 0.05, 0); g.add(liq);
  g.add(mesh(cyl(R0, R0, y1 - y0, 48, true), Mat('glass'), 0, (y0 + y1) / 2, 0));
  const bubbles = []; const bm = Glow('#c8ffe0', 1.4); const R = rng(3);
  for (let i = 0; i < 14; i++) { const b = mesh(sph(R.r(0.006, 0.014), 8, 6), bm, R.r(-0.25, 0.25), R.r(y0, y1 - 0.15), R.r(-0.25, 0.25)); b.userData.v = R.r(0.1, 0.3); g.add(b); bubbles.push(b); }
  g.userData.lights.push({ x: 0, y: 1.2, z: 0.3, color: 0x3aff8a, intensity: 1.0, distance: 4 });
  let t = 0; g.userData.nodes.specimen = spec;
  g.userData.update = dt => { t += dt; for (const b of bubbles) { b.position.y += b.userData.v * dt; b.position.x += Math.sin(t * 3 + b.userData.v * 40) * dt * 0.01; if (b.position.y > y1 - 0.15) b.position.y = y0 + 0.05; } spec.rotation.y += dt * 0.05; spec.scale.setScalar(1 + Math.sin(t * 0.9) * 0.015); };
  g.userData.solid.push(SB(0, 1.1, 0, 0.54, 1.1, 0.54));
  return g;
};

PROPS.console = (o = {}) => {
  const W = o.w || 1.8, g = P('console'), n = Math.max(1, Math.round(W / 0.62));
  cachedKit('console' + W, g, k => {
    const body = Flat('#2b3036', 0.45, 0.5), wht = lacq('#d6d9da');
    const prof = extrude('consoleProf', () => { const s = new THREE.Shape(); s.moveTo(-0.38, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.06); s.lineTo(0.22, 0.08); s.lineTo(0.26, 0.74); s.lineTo(0.34, 0.78); s.lineTo(0.3, 0.82); s.lineTo(-0.1, 0.92); s.lineTo(-0.38, 0.92); s.closePath(); return s; }, 1, 0.01, 1);
    k.add(wht, prof, W / 2, 0, 0, 0, -PI / 2, 0, [1, 1, W]);
    k.add(body, box(W - 0.02, 0.6, 0.12), 0, 1.22, -0.3);
    for (let i = 0; i < n; i++) { const x = -W / 2 + W / n * (i + 0.5); k.add(darkMetal(), rbox(W / n - 0.03, 0.4, 0.04, 0.012), x, 1.22, -0.22, -0.1, 0, 0); }
    // button field on the slope
    const R = rng(W * 10), cols = ['#c0261e', '#2a9a4a', '#e8b422', '#2a6ad0', '#d6d9da'];
    const slope = k.at(0, 0.87, 0.1, -Math.atan2(0.1, 0.4) + 0.0, 0, 0);
    slope.add(Flat('#16191c', 0.4, 0.3), box(W - 0.12, 0.004, 0.32), 0, 0.0, 0.0, 0.25, 0, 0);
    for (let i = 0; i < Math.floor(W * 14); i++) slope.add(Flat(R.pick(cols), 0.35), rbox(0.03, 0.012, 0.022, 0.004), -W / 2 + 0.1 + (i % Math.floor(W * 7)) * 0.13 + R.r(0, 0.02), 0.01, -0.08 + Math.floor(i / Math.floor(W * 7)) * 0.08, 0.25, 0, 0);
    k.add(Flat('#1d2023', 0.5), rbox(0.45, 0.018, 0.15, 0.006), 0, 0.84, 0.2, 0.2, 0, 0);
    k.add(labelMat('consoleBrand', 256, 48, (c, w, h) => { c.fillStyle = '#d6d9da'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a3a44'; c.font = `300 30px ${SANS}`; c.fillText('HELIX', 12, 34); c.font = `14px ${MONO}`; c.fillText('OPS CONSOLE', 120, 32); }), plane(0.3, 0.056), -W / 2 + 0.3, 0.45, 0.311);
  });
  const kinds = ['graph', 'code', 'error', 'helix'], screens = [];
  for (let i = 0; i < n; i++) { const x = -W / 2 + W / n * (i + 0.5); const s = mesh(plane(W / n - 0.07, 0.34), screenMat(kinds[i % 4], 1.3), x, 1.22, -0.198, -0.1, 0, 0); g.add(s); screens.push(s); }
  // a few lit buttons that blink
  const blink = []; for (let i = 0; i < 4; i++) { const b = mesh(sph(0.008, 8, 6), LED[['green', 'amber', 'red', 'blue'][i]], -W / 2 + 0.2 + i * 0.12, 0.92, -0.08); g.add(b); blink.push(b); }
  g.userData.nodes.screens = screens; g.userData.setScreen = (i, kind) => screenSetter([screens[i]])(kind); g.userData.setScreens = kind => screenSetter(screens)(kind);
  g.userData.lights.push({ x: 0, y: 1.2, z: 0.4, color: 0x7fc8ff, intensity: 0.5, distance: 3.5 });
  let t = 0; g.userData.update = dt => { t += dt; blink.forEach((b, i) => { b.visible = Math.sin(t * (2 + i * 1.3) + i) > -0.2; }); };
  g.userData.solid.push(SB(0, 0.75, -0.05, W / 2, 0.75, 0.38));
  return g;
};

/* ----- industrial robot arm: base > turret(yaw) > shoulder > elbow > wrist > tool ----- */
PROPS.robotArm = (o = {}) => {
  const g = P('robotArm'), paint = Flat('#e0761c', 0.42, 0.25), paint2 = Flat('#3a3f45', 0.45, 0.6), joint = Flat('#24272b', 0.4, 0.7);
  cachedKit('raBase', g, k => {
    k.add(paint2, rbox(0.8, 0.45, 0.8, 0.03), 0, 0.225, 0);
    k.add(joint, cyl(0.38, 0.4, 0.06, 40), 0, 0.48, 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; k.add(brushed(), cyl(0.015, 0.015, 0.02, 8), Math.sin(a) * 0.35, 0.51, Math.cos(a) * 0.35); }
    k.add(mk('raRing', () => new THREE.MeshStandardMaterial({ map: Mat('hazard').map, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 })), gk('raRingG', () => { const r = new THREE.RingGeometry(2.3, 2.45, 64, 1); r.rotateX(-PI / 2); const uv = r.attributes.uv, p = r.attributes.position; for (let i = 0; i < uv.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); uv.setXY(i, a * 4, Math.hypot(p.getX(i), p.getZ(i))); } return r; }), 0, 0.003, 0);
    k.add(warnLabel('ra', 'DANGER', 'ROBOT WORK CELL - STAY OUTSIDE THE LINE'), plane(0.3, 0.19), 0, 0.25, 0.402);
  });
  const turret = grp(0, 0.51, 0); g.add(turret);
  cachedKit('raTurret', turret, k => {
    k.add(paint, lathe('raTur', [[0, 0], [0.34, 0], [0.34, 0.12], [0.28, 0.2], [0, 0.2]], 40), 0, 0, 0);
    for (const s of [-1, 1]) k.add(paint, rbox(0.1, 0.5, 0.42, 0.04, 2), s * 0.2, 0.36, 0);
    k.add(joint, cyl(0.17, 0.17, 0.52, 32), 0, 0.5, 0, 0, 0, PI / 2);
    k.add(paint2, rbox(0.24, 0.2, 0.26, 0.03), 0, 0.3, -0.22);
  });
  const lamp = mesh(sph(0.03, 12, 8), LED.green, 0, 0.32, -0.36); turret.add(lamp);
  const shoulder = grp(0, 0.5, 0); turret.add(shoulder);
  cachedKit('raUpper', shoulder, k => {
    k.add(paint, rbox(0.26, 1.15, 0.3, 0.08, 3), 0, 0.55, 0);
    k.add(joint, cyl(0.15, 0.15, 0.3, 28), 0, 1.1, 0, 0, 0, PI / 2);
    k.add(paint2, cyl(0.12, 0.12, 0.2, 24), 0.2, 0.0, 0, 0, 0, PI / 2);
    k.add(labelMat('raLogo', 256, 64, (c, w, h) => { c.fillStyle = '#e0761c'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1a1a'; c.font = `bold 40px ${SANS}`; c.fillText('HELIX', 14, 46); c.font = `16px ${SANS}`; c.fillText('FABRICATION', 140, 44); }, 0.45), plane(0.4, 0.1), 0.131, 0.6, 0, 0, PI / 2, PI / 2);
    k.add(Flat('#141414', 0.6), tube('raCable', [[-0.15, 0.1, -0.1], [-0.2, 0.5, -0.18], [-0.17, 0.95, -0.12]], 0.025, 16, 6), 0, 0, 0);
  });
  const elbow = grp(0, 1.1, 0); shoulder.add(elbow);
  cachedKit('raFore', elbow, k => {
    k.add(paint, rbox(0.2, 0.95, 0.22, 0.07, 3), 0, 0.5, 0);
    k.add(paint2, rbox(0.24, 0.3, 0.26, 0.05), 0, -0.1, 0);
    k.add(joint, cyl(0.1, 0.1, 0.24, 24), 0, 0.98, 0, 0, 0, PI / 2);
  });
  const wrist = grp(0, 0.98, 0); elbow.add(wrist);
  const roll = grp(0, 0.12, 0); wrist.add(roll);
  cachedKit('raWrist', wrist, k => { k.add(paint, cyl(0.085, 0.085, 0.14, 24), 0, 0.06, 0); });
  cachedKit('raTool', roll, k => { k.add(joint, cyl(0.07, 0.07, 0.05, 24), 0, 0.025, 0); k.add(paint2, rbox(0.2, 0.06, 0.08, 0.015), 0, 0.08, 0); });
  const fingers = []; for (const s of [-1, 1]) { const f = grp(s * 0.06, 0.11, 0); roll.add(f); f.add(mesh(rbox(0.025, 0.13, 0.05, 0.008), joint, 0, 0.065, 0)); fingers.push(f); }
  const part = mesh(rbox(0.1, 0.1, 0.1, 0.01), Flat('#8a9096', 0.35, 0.8), 0, 0.17, 0); roll.add(part); part.visible = false;
  g.userData.nodes = { turret, shoulder, elbow, wrist, roll, fingers, part, lamp };
  // pose: [yaw, shoulder, elbow, wrist, grip(0 open..1 closed), carry]
  const K = [[0, 0.25, 1.1, 0.9, 0, 0], [-1.2, 0.75, 1.35, 0.95, 0, 0], [-1.2, 0.98, 1.4, 0.75, 0, 0], [-1.2, 0.98, 1.4, 0.75, 1, 1], [-1.2, 0.6, 1.3, 1.0, 1, 1], [1.2, 0.6, 1.3, 1.0, 1, 1], [1.2, 0.98, 1.4, 0.75, 1, 1], [1.2, 0.98, 1.4, 0.75, 0, 0], [1.2, 0.6, 1.3, 1.0, 0, 0]];
  const DUR = [1.2, 0.8, 0.4, 0.8, 1.6, 0.8, 0.4, 0.8, 1.2];
  const SLUMP = [0.3, 1.05, 1.75, 1.3, 0, 0];
  const pose = K[0].slice(); let seg = 0, st = 0, active = o.active !== false;
  const apply = () => { turret.rotation.y = pose[0]; shoulder.rotation.x = pose[1]; elbow.rotation.x = pose[2]; wrist.rotation.x = pose[3]; fingers[0].position.x = -0.06 + pose[4] * 0.012; fingers[1].position.x = 0.06 - pose[4] * 0.012; };
  apply();
  g.userData.setActive = v => { active = !!v; lamp.material = active ? LED.green : LED.red; };
  g.userData.setActive(active);
  g.userData.update = dt => {
    if (active) {
      st += dt; const a = K[seg], b = K[(seg + 1) % K.length], d = DUR[seg]; let u = Math.min(1, st / d); u = u * u * (3 - 2 * u);
      for (let i = 0; i < 5; i++) pose[i] = lerp(a[i], b[i], u);
      part.visible = !!(u < 0.5 ? a[5] : b[5]);
      if (st >= d) { st = 0; seg = (seg + 1) % K.length; }
    } else { for (let i = 0; i < 5; i++) pose[i] = damp(pose[i], SLUMP[i], 1.2, dt); }
    apply();
  };
  g.userData.solid.push(SB(0, 0.35, 0, 0.42, 0.35, 0.42));
  return g;
};

function beltTex() {
  return ctex('belt', 256, 256, (c, w, h) => { c.fillStyle = '#1c1d1f'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { c.fillStyle = '#2a2c2f'; c.fillRect(x, 0, 6, h); c.fillStyle = '#121314'; c.fillRect(x + 6, 0, 2, h); } noiseFill2(c, w, h); }, { wrap: true });
}
PROPS.conveyor = (o = {}) => {
  const len = o.len || 4, g = P('conveyor'), Wb = 0.7, top = 0.9;
  cachedKit('conveyor' + len, g, k => {
    const fr = Mat('metalWhite'), leg = darkMetal();
    for (const s of [-1, 1]) { k.add(fr, box(len, 0.16, 0.04), 0, top - 0.04, s * (Wb / 2 + 0.03)); k.add(Mat('hazard'), box(len, 0.03, 0.002), 0, top + 0.02, s * (Wb / 2 + 0.051)); }
    for (let x = -len / 2 + 0.2; x <= len / 2 - 0.15; x += 1.4) for (const s of [-1, 1]) { k.add(leg, box(0.06, top - 0.1, 0.06), x, (top - 0.1) / 2, s * (Wb / 2 + 0.01)); k.add(leg, box(0.12, 0.02, 0.12), x, 0.01, s * (Wb / 2 + 0.01)); }
    for (let x = -len / 2 + 0.2; x <= len / 2 - 0.15; x += 1.4) k.add(leg, box(0.04, 0.04, Wb), x, 0.3, 0);
    for (let x = -len / 2 + 0.2; x < len / 2 - 0.1; x += 0.25) k.add(brushed(), cyl(0.035, 0.035, Wb, 14), x, top - 0.05, 0, PI / 2, 0, 0);
    k.add(Flat('#1c1d1f', 0.8), box(len, 0.01, Wb - 0.02), 0, top - 0.12, 0);
    k.add(darkMetal(), rbox(0.3, 0.25, 0.25, 0.02), len / 2 - 0.3, top - 0.35, Wb / 2 + 0.2);
    k.add(Flat('#141414', 0.6), tube('convCable' + len, [[len / 2 - 0.3, top - 0.48, Wb / 2 + 0.2], [len / 2 - 0.4, 0.2, Wb / 2 + 0.3], [len / 2 - 0.2, 0.02, Wb / 2 + 0.6]], 0.015, 16, 6), 0, 0, 0);
  });
  const t = beltTex().clone(); t.needsUpdate = true; t.repeat.set(len / 1.0, 1); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const bm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  const belt = mesh(gk('beltG' + len, () => { const p = new THREE.PlaneGeometry(len, Wb - 0.02); p.rotateX(-PI / 2); return p; }), bm, 0, top + 0.002, 0); g.add(belt);
  const drums = []; for (const s of [-1, 1]) { const d = mesh(cyl(0.06, 0.06, Wb - 0.02, 20), Flat('#1c1d1f', 0.7), s * len / 2, top - 0.058, 0, PI / 2, 0, 0); g.add(d); drums.push(d); }
  const items = []; for (let i = 0; i < Math.max(1, Math.floor(len / 2)); i++) { const it = new THREE.Group(); cachedKit('convItem', it, k => { k.add(Flat('#7a8086', 0.35, 0.8), rbox(0.18, 0.1, 0.18, 0.01), 0, 0.05, 0); k.add(Flat('#e0761c', 0.4), cyl(0.04, 0.04, 0.04, 16), 0, 0.12, 0); }); it.position.set(-len / 2 + 0.3 + i * 2, top, (i % 2 ? 0.08 : -0.06)); g.add(it); items.push(it); }
  g.userData.nodes.belt = belt; g.userData.nodes.items = items;
  let running = o.running !== false, speed = running ? 0.5 : 0;
  g.userData.setRunning = v => { running = !!v; };
  g.userData.update = dt => {
    speed = damp(speed, running ? 0.5 : 0, 3, dt); if (speed < 1e-4) return;
    t.offset.x -= speed * dt; for (const d of drums) d.rotation.y += speed / 0.06 * dt;
    for (const it of items) { it.position.x += speed * dt; if (it.position.x > len / 2 - 0.1) it.position.x = -len / 2 + 0.1; }
  };
  g.userData.solid.push(SB(0, top / 2 + 0.02, 0, len / 2, top / 2 + 0.02, Wb / 2 + 0.06));
  return g;
};

SCREENS.coolOn = (g, w, h) => { g.fillStyle = '#031018'; g.fillRect(0, 0, w, h); g.fillStyle = '#4ad8ff'; g.font = `bold ${h * 0.13}px ${MONO}`; g.textAlign = 'left'; g.fillText('CT-3  NOMINAL', 16, h * 0.24); g.font = `${h * 0.09}px ${MONO}`; g.fillText('COOLANT  12.4 °C', 16, h * 0.46); g.fillText('FLOW     840 L/min', 16, h * 0.62); g.fillText('FANS     2/2', 16, h * 0.78); scanlines(g, w, h, 0.2); };
SCREENS.coolOff = (g, w, h) => { g.fillStyle = '#140405'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff4a3a'; g.font = `bold ${h * 0.13}px ${MONO}`; g.textAlign = 'left'; g.fillText('CT-3  OFFLINE', 16, h * 0.24); g.font = `${h * 0.09}px ${MONO}`; g.fillText('COOLANT  71.8 °C', 16, h * 0.46); g.fillText('FLOW     0 L/min', 16, h * 0.62); g.fillText('SERVER HALL OVERHEAT', 16, h * 0.78); scanlines(g, w, h, 0.2); };
SCREENS.coolVent = (g, w, h) => { g.fillStyle = '#1a0f02'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb020'; g.font = `bold ${h * 0.13}px ${MONO}`; g.textAlign = 'left'; g.fillText('CT-3  VENTING', 16, h * 0.24); g.font = `${h * 0.09}px ${MONO}`; g.fillText('PRESSURE 9.6 bar !', 16, h * 0.46); g.fillText('RELIEF   OPEN', 16, h * 0.62); g.fillText('STAND CLEAR', 16, h * 0.78); scanlines(g, w, h, 0.2); };
function steamTex() { return ctex('steam', 128, 128, (c, w, h) => { const id = c.createImageData(w, h), d = id.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = Math.hypot(x / w - 0.5, y / h - 0.5) * 2, n = fbm(x / 24, y / 24, 3, 2), a = clamp(1 - r, 0, 1) ** 1.5 * (0.5 + n * 0.8); const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 235; d[i + 3] = clamp(a, 0, 1) * 255; } c.putImageData(id, 0, 0); }); }
PROPS.coolingUnit = (o = {}) => {
  const g = P('coolingUnit'), W = 2.5, H = 3.4;
  cachedKit('coolingUnit', g, k => {
    const panel = fromSetCached('coolPaint', 'metal', { color: '#8a959b', rust: 0.35 }), dk = Flat('#22262a', 0.5, 0.6), post = Mat('metal');
    k.add(Mat('concrete'), rbox(W + 0.2, 0.2, W + 0.2, 0.03), 0, 0.1, 0);
    k.add(panel, box(W - 0.1, H - 0.2, W - 0.1), 0, 0.2 + (H - 0.2) / 2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(post, box(0.12, H - 0.2, 0.12), sx * (W / 2 - 0.06), 0.2 + (H - 0.2) / 2, sz * (W / 2 - 0.06));
    for (const s of [-1, 1]) for (let i = 0; i < 22; i++) { const u = -W / 2 + 0.2 + i * 0.1; k.add(panel, box(0.035, H - 0.6, 0.025), u, 0.2 + (H - 0.2) / 2 + 0.1, s * (W / 2 - 0.04)); k.add(panel, box(0.025, H - 0.6, 0.035), s * (W / 2 - 0.04), 0.2 + (H - 0.2) / 2 + 0.1, u); }
    for (const s of [-1, 1]) { k.add(dk, box(W - 0.4, 0.8, 0.01), 0, 0.75, s * (W / 2 - 0.02)); k.add(Mat('grate'), box(W - 0.42, 0.78, 0.01), 0, 0.75, s * (W / 2 - 0.01)); }
    k.add(post, box(W, 0.1, W), 0, H + 0.05, 0);
    // fan shroud on top
    k.add(panel, cyl(0.95, 1.0, 0.6, 48, true), 0, H + 0.4, 0); k.add(mk('shroudIn', () => { const m = Flat('#2a2e33', 0.6, 0.5).clone(); m.side = THREE.BackSide; return m; }), cyl(0.95, 1.0, 0.6, 48, true), 0, H + 0.4, 0);
    k.add(post, tor(0.97, 0.03, 8, 48), 0, H + 0.7, 0, PI / 2, 0, 0);
    k.add(Mat('grate'), gk('coolGrille', () => { const c = new THREE.CircleGeometry(0.94, 48); c.rotateX(-PI / 2); return c; }), 0, H + 0.68, 0);
    for (let i = 0; i < 4; i++) k.add(post, box(1.9, 0.03, 0.04), 0, H + 0.69, 0, 0, i * PI / 4, 0);
    // coolant pipes out of the +x side down to the floor
    const blue = fromSetCached('coolPipe', 'metal', { color: '#2f5f8a', rust: 0.25 });
    for (const z of [-0.5, 0.5]) {
      k.add(blue, tube('coolPipe' + z, [[W / 2 - 0.1, 2.6, z], [W / 2 + 0.3, 2.6, z], [W / 2 + 0.45, 2.45, z], [W / 2 + 0.45, 0.6, z], [W / 2 + 0.45, 0.25, z], [W / 2 + 0.9, 0.2, z]], 0.12, 40, 16), 0, 0, 0);
      k.add(post, cyl(0.17, 0.17, 0.05, 20), W / 2 + 0.05, 2.6, z, 0, 0, PI / 2); k.add(post, cyl(0.17, 0.17, 0.05, 20), W / 2 + 0.45, 1.4, z);
      k.add(Flat('#b0261e', 0.5, 0.3), tor(0.13, 0.015, 8, 24), W / 2 + 0.65, 1.4, z, 0, PI / 2, 0); k.add(dk, sph(0.17, 16, 12), W / 2 + 0.45, 1.4, z); k.add(dk, cyl(0.02, 0.02, 0.2, 8), W / 2 + 0.55, 1.4, z, 0, 0, PI / 2);
    }
    k.add(Mat('rust'), cyl(0.06, 0.06, 0.4, 12), -0.7, H + 0.25, 0.8); k.add(Mat('rust'), cyl(0.08, 0.08, 0.08, 12), -0.7, H + 0.48, 0.8);
    // status panel (+z)
    k.add(dk, rbox(0.7, 0.5, 0.12, 0.02), 0.4, 1.5, W / 2 + 0.04);
    k.add(labelMat('coolBrand', 512, 128, (c, w, h) => { c.fillStyle = '#8a959b'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a2228'; c.font = `bold 56px ${SANS}`; c.fillText('HELIX', 20, 70); c.font = `24px ${SANS}`; c.fillText('THERMAL  //  CT-3  COOLING TOWER', 20, 108); }, 0.5), plane(1.0, 0.25), -0.5, 2.3, W / 2 + 0.005);
    k.add(warnLabel('cool', 'WARNING', 'PRESSURISED COOLANT - HOT VAPOUR'), plane(0.32, 0.2), -0.5, 1.5, W / 2 + 0.005);
  });
  const scr = mesh(plane(0.4, 0.225), screenMat('coolOff', 1.4), 0.32, 1.53, W / 2 + 0.101); g.add(scr);
  const lamps = []; for (let i = 0; i < 3; i++) { const l = mesh(sph(0.025, 12, 8), LED.off, 0.66, 1.65 - i * 0.1, W / 2 + 0.1); g.add(l); lamps.push(l); }
  const fan = grp(0, H + 0.4, 0); g.add(fan);
  cachedKit('coolFan', fan, k => { k.add(darkMetal(), cyl(0.15, 0.15, 0.2, 20), 0, 0, 0); for (let i = 0; i < 6; i++) k.at(0, 0, 0, 0, i / 6 * TAU, 0).add(Flat('#5a6066', 0.45, 0.6), rbox(0.24, 0.015, 0.75, 0.007), 0, 0, 0.5, 0, 0, 0.35); });
  const steam = []; const vents = [[-0.7, H + 0.55, 0.8], [0, H + 0.75, 0]];
  for (let i = 0; i < 12; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex(), transparent: true, depthWrite: false, opacity: 0, color: 0xe8eef2 })); sp.userData.v = vents[i % 2]; sp.userData.t = i / 12; sp.visible = false; g.add(sp); steam.push(sp); }
  g.userData.nodes = { screen: scr, fan, lamps, steam };
  const L = { x: 0.66, y: 1.6, z: W / 2 + 0.5, color: 0xff2a1a, intensity: 0.4, distance: 3 }; g.userData.lights.push(L);
  let state = 'off', spin = 0, t = 0;
  g.userData.setState = s => { state = ['on', 'off', 'venting'].includes(s) ? s : 'off'; scr.material.emissiveMap = screenTex(state === 'on' ? 'coolOn' : state === 'off' ? 'coolOff' : 'coolVent'); scr.material.needsUpdate = true; lamps[0].material = state === 'on' ? LED.green : LED.off; lamps[1].material = state === 'venting' ? LED.amber : LED.off; lamps[2].material = state === 'off' ? LED.red : LED.off; L.color = state === 'on' ? 0x38ff6a : state === 'off' ? 0xff2a1a : 0xffaa20; for (const s2 of steam) s2.visible = state === 'venting'; };
  g.userData.getState = () => state;
  g.userData.setState(o.state || 'off');
  g.userData.update = dt => {
    t += dt; spin = damp(spin, state === 'on' ? 7 : state === 'venting' ? 13 : 0, 0.7, dt); fan.rotation.y += spin * dt;
    if (state === 'venting') {
      lamps[1].visible = (t % 0.5) < 0.25;
      for (const s2 of steam) { const u = (s2.userData.t += dt * 0.5) % 1; const v = s2.userData.v; s2.position.set(v[0] + Math.sin(u * 7 + v[2]) * 0.15 * u, v[1] + u * 2.2, v[2] + u * 0.3); s2.scale.setScalar(0.4 + u * 1.8); s2.material.opacity = Math.sin(u * PI) * 0.45; }
    } else lamps[1].visible = true;
  };
  g.userData.solid.push(SB(0, H / 2 + 0.2, 0, W / 2 + 0.1, H / 2 + 0.2, W / 2 + 0.1), SB(W / 2 + 0.45, 1.3, 0, 0.25, 1.3, 0.7));
  return g;
};

PROPS.chargingRack = (o = {}) => {
  const n = o.n || 4, g = P('chargingRack'), cw = 0.9, tot = n * cw;
  cachedKit('chargeRack' + n, g, k => {
    const fr = Flat('#3a3f45', 0.45, 0.6), wht = lacq('#d9dcdd'), dk = Flat('#16181b', 0.5, 0.4);
    k.add(fr, rbox(tot + 0.1, 0.12, 0.9, 0.02), 0, 0.06, 0);
    k.add(fr, box(tot + 0.1, 0.25, 0.25), 0, 2.2, -0.32);
    for (let i = 0; i < n; i++) {
      const x = -tot / 2 + cw * (i + 0.5);
      k.add(dk, box(0.6, 0.006, 0.5), x, 0.123, 0.1); for (const s of [-1, 1]) k.add(Mat('hazard'), box(0.04, 0.008, 0.5), x + s * 0.32, 0.124, 0.1);
      k.add(wht, rbox(0.22, 2.1, 0.16, 0.05, 2), x, 1.17, -0.35);
      k.add(dk, rbox(0.1, 1.5, 0.02, 0.01), x, 1.2, -0.265);
      for (const s of [-1, 1]) { const arm = k.at(x + s * 0.1, 1.45, -0.28, 0, -s * 0.5, 0); arm.add(wht, rbox(0.06, 0.12, 0.34, 0.025), 0, 0, 0.16); arm.add(dk, rbox(0.04, 0.1, 0.1, 0.02), s * -0.02, 0, 0.32); }
      k.add(darkMetal(), rbox(0.14, 0.14, 0.12, 0.03), x, 1.7, -0.22); k.add(chrome(), cyl(0.02, 0.02, 0.06, 12), x, 1.7, -0.14, PI / 2, 0, 0);
      k.add(Flat('#141414', 0.6), tube('rackCable' + i, [[x, 2.1, -0.3], [x + 0.08, 2.0, -0.12], [x + 0.05, 1.82, -0.18]], 0.018, 12, 6), 0, 0, 0);
      k.add(labelMat('crNum' + i, 64, 64, (c, w, h) => { c.fillStyle = '#d9dcdd'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1a1a'; c.font = `bold 34px ${MONO}`; c.textAlign = 'center'; c.fillText('0' + (i + 1), w / 2, 44); }), plane(0.08, 0.08), x, 0.5, -0.269);
    }
    k.add(labelMat('crBanner', 512, 64, (c, w, h) => { c.fillStyle = '#3a3f45'; c.fillRect(0, 0, w, h); c.fillStyle = '#e0e4e8'; c.font = `bold 26px ${SANS}`; c.textAlign = 'center'; c.fillText('HELIX  //  SERVICE UNIT CHARGING', w / 2, 42); }), plane(Math.min(2.4, tot - 0.2), 0.2), 0, 2.2, -0.194);
  });
  const leds = []; for (let i = 0; i < n; i++) { const l = mesh(sph(0.018, 10, 8), i === 1 ? LED.red : LED.off, -tot / 2 + cw * (i + 0.5), 1.95, -0.265); g.add(l); leds.push(l); }
  g.userData.nodes.leds = leds;
  g.userData.setLights = arr => arr.forEach((v, i) => { if (leds[i]) leds[i].material = ledMat(v); });
  let t = 0; g.userData.update = dt => { t += dt; leds[1 % n].visible = (t % 2.0) < 0.15; };
  g.userData.solid.push(SB(0, 1.15, -0.32, tot / 2 + 0.05, 1.15, 0.14), SB(0, 0.06, 0, tot / 2 + 0.05, 0.06, 0.45));
  return g;
};

PROPS.hospitalBed = () => {
  const g = P('hospitalBed');
  cachedKit('hospitalBed', g, k => {
    const wht = lacq('#e4e7e8'), fr = Flat('#9aa2a8', 0.35, 0.8), mat = fabric('#c9d1d6'), dk = darkMetal();
    k.add(fr, box(0.9, 0.06, 2.0), 0, 0.42, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.add(fr, cyl(0.022, 0.022, 0.3, 10), sx * 0.4, 0.27, sz * 0.9); k.add(dk, box(0.04, 0.04, 0.08), sx * 0.4, 0.1, sz * 0.9); k.add(rubber(), cyl(0.05, 0.05, 0.035, 16), sx * 0.4, 0.05, sz * 0.9 + 0.03, 0, 0, PI / 2); }
    k.add(mat, rbox(0.86, 0.14, 1.25, 0.05, 3), 0, 0.52, 0.35);
    const back = k.at(0, 0.45, -0.27, 0.5, 0, 0); back.add(fr, box(0.88, 0.04, 0.75), 0, 0, -0.37); back.add(mat, rbox(0.86, 0.14, 0.72, 0.05, 3), 0, 0.09, -0.37);
    back.add(fabric('#eef0f0'), rbox(0.55, 0.12, 0.3, 0.06, 3), 0, 0.2, -0.55);
    k.add(wht, rbox(0.95, 0.5, 0.05, 0.03), 0, 0.72, -1.02); k.add(wht, rbox(0.95, 0.4, 0.05, 0.03), 0, 0.62, 1.02);
    for (const s of [-1, 1]) { for (const y of [0.68, 0.8]) k.add(fr, cyl(0.012, 0.012, 0.85, 10), s * 0.47, y, 0.2, PI / 2, 0, 0); for (const z of [-0.2, 0.6]) k.add(fr, cyl(0.012, 0.012, 0.3, 8), s * 0.47, 0.66, z); }
    k.add(labelMat('hbPanel', 128, 64, (c, w, h) => { c.fillStyle = '#e4e7e8'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a3a44'; c.font = `bold 16px ${SANS}`; c.fillText('LUMEN CARE', 8, 20); for (let i = 0; i < 4; i++) { c.fillStyle = '#9aa2a8'; c.fillRect(8 + i * 30, 32, 24, 22); } }), plane(0.3, 0.15), 0, 0.7, 1.046);
    k.add(fabric('#8fa3b0', THREE.DoubleSide), drapeGeo('hbBlanket', { mw: 0.86, footZ: 0.97, top: 0.6, sw: 1.3, sl: 1.1, z0: -0.1, ox: 0.15, amp: 0.02, seed: 6, lumps: [[0, 0.3, 0.05, 0.05]] }), 0, 0, 0);
  });
  g.userData.solid.push(SB(0, 0.45, 0, 0.48, 0.45, 1.04));
  return g;
};

PROPS.ivStand = () => {
  const g = P('ivStand');
  cachedKit('ivStand', g, k => {
    const st = Flat('#c8ced2', 0.25, 0.9);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; k.add(st, box(0.03, 0.02, 0.3), Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15, 0, a, 0); k.add(rubber(), sph(0.03, 10, 8), Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29); }
    k.add(st, cyl(0.016, 0.016, 1.95, 10), 0, 1.05, 0);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; k.add(st, cyl(0.005, 0.005, 0.12, 6), Math.sin(a) * 0.06, 2.0, Math.cos(a) * 0.06, Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2); }
    k.add(mk('ivBag', () => new THREE.MeshStandardMaterial({ color: 0xe8f4f8, roughness: 0.15, transparent: true, opacity: 0.55 })), rbox(0.12, 0.2, 0.03, 0.014), 0.1, 1.85, 0.0);
    k.add(liquidMat('#e8f0c0', 0.05), rbox(0.1, 0.1, 0.02, 0.008), 0.1, 1.8, 0.0);
    k.add(Mat('glass'), cyl(0.008, 0.008, 0.05, 8), 0.1, 1.71, 0);
    k.add(mk('ivTube', () => new THREE.MeshStandardMaterial({ color: 0xdfeef2, roughness: 0.2, transparent: true, opacity: 0.6 })), tube('ivTubeL', [[0.1, 1.68, 0], [0.14, 1.3, 0.05], [0.12, 0.9, 0.12], [0.3, 0.7, 0.3], [0.45, 0.6, 0.35]], 0.003, 30, 4), 0, 0, 0);
  });
  g.userData.solid.push(SB(0, 0.4, 0, 0.12, 0.4, 0.12));
  return g;
};

const WB_DEFAULT = 'ORACLE v7 - lattice is rewriting its own weights?!\n- containment = air gap ONLY\n- DO NOT link to Civic grid\nWho signed the uplink??';
PROPS.whiteboard = (o = {}) => {
  const text = o.text || WB_DEFAULT, g = P('whiteboard'), W = 1.8, H = 1.1, cy = 1.45;
  cachedKit('whiteboardFrame', g, k => {
    k.add(Flat('#b8bec2', 0.3, 0.9), rbox(W + 0.04, H + 0.04, 0.025, 0.008), 0, cy, 0.0125);
    k.add(Flat('#b8bec2', 0.3, 0.9), box(W * 0.6, 0.02, 0.07), 0, cy - H / 2 - 0.025, 0.04);
    for (let i = 0; i < 3; i++) k.add(Flat(['#c0261e', '#1e3a8a', '#111'][i], 0.4), cyl(0.009, 0.009, 0.13, 10), -0.3 + i * 0.16, cy - H / 2 - 0.006, 0.05, 0, 0, PI / 2);
  });
  const tex = ctex('wb' + text, 1024, 626, (c, w, h) => {
    c.fillStyle = '#f4f5f2'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(120,130,150,0.06)'; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 120, 40, Math.random(), 0, TAU); c.fill(); }
    c.strokeStyle = '#1e3a8a'; c.lineWidth = 4; c.strokeRect(620, 60, 150, 80); c.strokeRect(620, 260, 150, 80); c.strokeRect(830, 160, 150, 80);
    c.beginPath(); c.moveTo(695, 140); c.lineTo(695, 260); c.moveTo(770, 100); c.lineTo(830, 190); c.moveTo(770, 300); c.lineTo(830, 220); c.stroke();
    c.fillStyle = '#1e3a8a'; c.font = `26px ${HAND}`; c.fillText('lattice', 645, 108); c.fillText('city mesh', 630, 308); c.fillText('robots', 862, 208);
    c.strokeStyle = '#c0261e'; c.lineWidth = 6; c.beginPath(); c.moveTo(640, 360); c.lineTo(960, 120); c.stroke(); c.font = `bold 34px ${HAND}`; c.fillStyle = '#c0261e'; c.fillText('NO!!', 900, 330);
    c.fillStyle = '#151515'; c.font = `34px ${HAND}`; wrapText(c, text, 40, 80, 560, 50);
    c.fillStyle = '#c0261e'; c.font = `28px ${HAND}`; c.fillText('- E.V.  ext. 4471', 40, h - 40);
  });
  g.add(mesh(plane(W, H), mk('wbM' + text, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25 })), 0, cy, 0.026));
  g.userData.solid.push(SB(0, cy, 0.02, W / 2, H / 2, 0.03));
  return g;
};
// ---- end of LAB

/* =====================================================================
   PICKUPS (ITEMS) - small, readable, centred, resting on y = 0
   ===================================================================== */
function item(name, fn) {
  ITEMS[name] = (o = {}) => { const g = P('item_' + name); g.userData.item = name; cachedKit('item_' + name, g, k => fn(k, o)); if (ITEM_EXTRA[name]) ITEM_EXTRA[name](g, o); return g; };
}
const ITEM_EXTRA = {};
const copper = () => Flat('#c07a40', 0.3, 1);
const gold = () => Flat('#d8a640', 0.25, 1);

item('battery', k => {
  const r = 0.017, L = 0.062;
  const lbl = mk('batLbl', () => new THREE.MeshStandardMaterial({ map: ctex('batLbl', 256, 128, (c, w, h) => { c.fillStyle = '#10161a'; c.fillRect(0, 0, w, h); c.fillStyle = '#2ad0c0'; c.fillRect(0, 0, w * 0.32, h); c.fillStyle = '#0d1418'; c.font = `bold 30px ${SANS}`; c.fillText('+', 22, 74); c.fillStyle = '#e8f8f8'; c.font = `bold 34px ${SANS}`; c.fillText('LUMEN', 96, 58); c.font = `bold 24px ${SANS}`; c.fillStyle = '#2ad0c0'; c.fillText('MAX  D', 98, 92); }), roughness: 0.35, metalness: 0.3 }));
  k.add(lbl, cyl(r, r, L - 0.006, 28, true), 0, r, 0, 0, 0, PI / 2);
  k.add(brushed(), cyl(r, r, 0.004, 28), L / 2 - 0.002, r, 0, 0, 0, PI / 2); k.add(brushed(), cyl(r, r, 0.004, 28), -L / 2 + 0.002, r, 0, 0, 0, PI / 2);
  k.add(brushed(), cyl(0.006, 0.006, 0.006, 16), L / 2 + 0.002, r, 0, 0, 0, PI / 2);
});
item('wire', k => {
  const cu = copper();
  for (let i = 0; i < 7; i++) k.add(cu, tor(0.055 + (i % 3) * 0.004, 0.0035, 6, 40), (i % 2) * 0.003, 0.004 + i * 0.0052, (i % 3) * 0.002, PI / 2, 0, 0);
  k.add(Flat('#202020', 0.5), tor(0.06, 0.004, 6, 24, 0.5), 0, 0.02, 0, PI / 2, 0, 1.0);
  k.add(cu, tube('wireEnd', [[0.055, 0.035, 0], [0.08, 0.03, 0.03], [0.1, 0.005, 0.07], [0.13, 0.004, 0.06]], 0.0035, 20, 5), 0, 0, 0);
  k.add(Flat('#e8b422', 0.5), box(0.02, 0.012, 0.035), -0.058, 0.02, 0, 0, 0, 0);
});
item('circuit', k => {
  const pcb = mk('pcb', () => new THREE.MeshStandardMaterial({ map: ctex('pcb', 256, 170, (c, w, h) => { c.fillStyle = '#165a32'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c8a040'; c.lineWidth = 2; const R = rng(8); for (let i = 0; i < 40; i++) { let x = R() * w, y = R() * h; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 4; j++) { if (R() < 0.5) x += R.r(-40, 40); else y += R.r(-30, 30); c.lineTo(x, y); } c.stroke(); c.fillStyle = '#d8b050'; c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); } c.fillStyle = '#e8f0e8'; c.font = `bold 12px ${MONO}`; c.fillText('HELIX NX-7  rev.C', 8, h - 8); }), roughness: 0.4, metalness: 0.2 }));
  k.add(pcb, boxF(0.12, 0.0016, 0.08), 0, 0.0008, 0, 0, 0, 0);
  k.add(Flat('#141414', 0.3), rbox(0.03, 0.004, 0.03, 0.001), -0.02, 0.0036, 0.0);
  k.add(Flat('#141414', 0.3), rbox(0.018, 0.003, 0.012, 0.001), 0.03, 0.003, -0.02); k.add(Flat('#141414', 0.3), rbox(0.018, 0.003, 0.012, 0.001), 0.03, 0.003, 0.0);
  for (let i = 0; i < 4; i++) k.add(Flat(['#2a4a8a', '#1a1a1a', '#c8a040', '#2a4a8a'][i], 0.3, 0.3), cyl(0.0035, 0.0035, 0.009, 10), 0.012 + i * 0.008, 0.006, 0.028);
  k.add(Flat('#1a1a1a', 0.5), box(0.05, 0.006, 0.006), 0, 0.0046, -0.034); for (let i = 0; i < 10; i++) k.add(gold(), box(0.001, 0.006, 0.001), -0.0225 + i * 0.005, 0.009, -0.034);
  k.add(Flat('#d8d8d8', 0.2, 1), box(0.006, 0.0008, 0.06), 0.059, 0.0012, 0);
  k.add(Flat('#2a2a2a', 0.7), box(0.02, 0.002, 0.012), -0.04, 0.0026, 0.025, 0, 0.6, 0); // scorched chip
});
item('servo', k => {
  const dk = Flat('#202326', 0.4, 0.3);
  k.add(dk, rbox(0.08, 0.055, 0.045, 0.006), 0, 0.0275, 0);
  k.add(dk, rbox(0.1, 0.006, 0.045, 0.002), 0, 0.04, 0);
  for (const s of [-1, 1]) k.add(brushed(), cyl(0.004, 0.004, 0.007, 8), s * 0.046, 0.042, 0);
  k.add(Flat('#e0761c', 0.4), cyl(0.012, 0.012, 0.008, 20), 0.02, 0.059, 0);
  k.add(lacq('#eeeeee'), rbox(0.05, 0.004, 0.01, 0.004), 0.02, 0.064, 0, 0, 0.5, 0);
  k.add(brushed(), cyl(0.003, 0.003, 0.006, 8), 0.02, 0.068, 0);
  k.add(labelMat('servoLbl', 128, 64, (c, w, h) => { c.fillStyle = '#202326'; c.fillRect(0, 0, w, h); c.fillStyle = '#e0761c'; c.font = `bold 20px ${SANS}`; c.fillText('HELIX', 6, 26); c.fillStyle = '#ccc'; c.font = `14px ${MONO}`; c.fillText('SRV-40 12V', 6, 50); }), plane(0.05, 0.025), 0, 0.03, 0.0226);
  for (let i = 0; i < 3; i++) k.add(Flat(['#c0261e', '#111', '#e8b422'][i], 0.5), tube('servoW' + i, [[-0.04, 0.012 + i * 0.004, 0.0], [-0.06, 0.012 + i * 0.004, 0.01], [-0.085, 0.004, 0.02 + i * 0.003], [-0.1, 0.003, 0.0 + i * 0.004]], 0.0018, 14, 4), 0, 0, 0);
});
item('hydraulic', k => {
  const bar = Flat('#3a4048', 0.35, 0.8);
  k.add(bar, cyl(0.022, 0.022, 0.16, 24), -0.03, 0.024, 0, 0, 0, PI / 2);
  for (const x of [-0.11, 0.05]) k.add(darkMetal(), cyl(0.026, 0.026, 0.018, 24), x, 0.024, 0, 0, 0, PI / 2);
  k.add(chrome(), cyl(0.01, 0.01, 0.1, 16), 0.1, 0.024, 0, 0, 0, PI / 2);
  for (const [x, s] of [[-0.135, 1], [0.155, -1]]) { k.add(darkMetal(), rbox(0.03, 0.03, 0.016, 0.006), x, 0.024, 0); k.add(Flat('#0a0a0a', 0.6), cyl(0.006, 0.006, 0.02, 12), x - s * 0.004, 0.024, 0, PI / 2, 0, 0); }
  k.add(brushed(), cyl(0.006, 0.006, 0.02, 10), -0.08, 0.05, 0); k.add(Flat('#141414', 0.6), tube('hydHose', [[-0.08, 0.058, 0], [-0.07, 0.07, 0.03], [-0.02, 0.01, 0.06], [0.03, 0.006, 0.05]], 0.005, 16, 6), 0, 0, 0);
  k.add(Flat('#d9a521', 0.4), cyl(0.0225, 0.0225, 0.012, 24, true), -0.03, 0.024, 0, 0, 0, PI / 2);
});
item('plate', k => {
  const pl = extrude('armorPlate', () => { const s = new THREE.Shape(), R = 0.3, a = 0.38; s.absarc(0, 0, R, PI / 2 - a, PI / 2 + a, false); s.absarc(0, 0, R - 0.012, PI / 2 + a, PI / 2 - a, true); s.closePath(); return s; }, 0.18, 0.004, 20);
  const m = fromSetCached('plateMetal', 'metal', { color: '#5a6066', rust: 0.25 });
  k.add(m, pl, 0, -0.2675, -0.09, 0, 0, 0);
  for (const sx of [-1, 1]) for (const sz of [-0.06, 0.06]) k.add(Flat('#0a0a0a', 0.8), cyl(0.005, 0.005, 0.004, 10), sx * 0.08, 0.0225, sz, 0, 0, -sx * 0.27);
  k.add(Mat('hazard'), box(0.05, 0.002, 0.16), 0.0, 0.0335, 0);
});
item('sensor', k => {
  const dk = Flat('#1d2024', 0.35, 0.6);
  k.add(dk, cyl(0.032, 0.035, 0.05, 28), 0, 0.035, 0, PI / 2, 0, 0);
  k.add(brushed(), tor(0.03, 0.004, 8, 28), 0, 0.035, 0.026);
  k.add(Flat('#100406', 0.2), cyl(0.026, 0.026, 0.004, 24), 0, 0.035, 0.024, PI / 2, 0, 0);
  k.add(Glow('#ff3a2a', 2.2), cyl(0.008, 0.008, 0.002, 16), 0, 0.035, 0.0265, PI / 2, 0, 0);
  k.add(Mat('glass'), sph(0.026, 20, 10, 0, TAU, 0, PI / 2), 0, 0.035, 0.026, PI / 2, 0, 0);
  k.add(dk, rbox(0.05, 0.012, 0.03, 0.004), 0, 0.006, -0.01);
  k.add(Flat('#c8a040', 0.4, 0.5), box(0.02, 0.001, 0.05), 0, 0.0125, -0.05);
});
ITEM_EXTRA.cell = g => { g.userData.lights.push({ x: 0, y: 0.03, z: 0, color: 0x50e0ff, intensity: 0.3, distance: 1.5 }); };
item('cell', k => {
  k.add(Flat('#c8ced2', 0.3, 0.8), cyl(0.026, 0.026, 0.02, 24), 0.055, 0.026, 0, 0, 0, PI / 2); k.add(Flat('#c8ced2', 0.3, 0.8), cyl(0.026, 0.026, 0.02, 24), -0.055, 0.026, 0, 0, 0, PI / 2);
  k.add(Flat('#c8ced2', 0.3, 0.8), sph(0.026, 20, 10, 0, TAU, 0, PI / 2), 0.065, 0.026, 0, 0, 0, -PI / 2); k.add(Flat('#c8ced2', 0.3, 0.8), sph(0.026, 20, 10, 0, TAU, 0, PI / 2), -0.065, 0.026, 0, 0, 0, PI / 2);
  k.add(Glow('#50e0ff', 2.6), cyl(0.012, 0.012, 0.09, 16), 0, 0.026, 0, 0, 0, PI / 2);
  k.add(Mat('glass'), cyl(0.024, 0.024, 0.09, 24, true), 0, 0.026, 0, 0, 0, PI / 2);
  for (const x of [-0.02, 0.02]) k.add(darkMetal(), cyl(0.025, 0.025, 0.006, 24), x, 0.026, 0, 0, 0, PI / 2);
  k.add(gold(), cyl(0.006, 0.006, 0.01, 12), 0.09, 0.026, 0, 0, 0, PI / 2);
});
item('coolant', k => {
  const st = Flat('#b8c0c6', 0.3, 0.85);
  k.add(st, lathe('coolCan', [[0, 0], [0.042, 0], [0.046, 0.006], [0.046, 0.17], [0.03, 0.2], [0.016, 0.205], [0, 0.205]], 28), 0, 0, 0);
  k.add(liquidMat('#3ab8ff', 1.2), cyl(0.0465, 0.0465, 0.09, 28, true, -0.4, 0.8), 0, 0.09, 0);
  k.add(labelMat('coolLbl', 256, 128, (c, w, h) => { c.fillStyle = '#e8eef2'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a7ad0'; c.fillRect(0, 0, w, 30); c.fillStyle = '#fff'; c.font = `bold 22px ${SANS}`; c.fillText('COOLANT  CX-9', 10, 23); c.fillStyle = '#111'; c.font = `16px ${SANS}`; c.fillText('Cryogenic grade', 10, 60); c.fillText('KEEP BELOW -40 °C', 10, 86); c.fillStyle = '#d9a521'; c.fillRect(w - 50, 40, 40, 40); }), cyl(0.0466, 0.0466, 0.06, 28, true, PI - 0.6, 1.2), 0, 0.09, 0);
  k.add(Flat('#2a7ad0', 0.4, 0.3), cyl(0.018, 0.018, 0.03, 20), 0, 0.215, 0);
  k.add(darkMetal(), tor(0.022, 0.004, 6, 20, PI), 0, 0.235, 0);
  k.add(brushed(), tor(0.0465, 0.003, 6, 32), 0, 0.14, 0, PI / 2, 0, 0); k.add(brushed(), tor(0.0465, 0.003, 6, 32), 0, 0.04, 0, PI / 2, 0, 0);
});
ITEM_EXTRA.core = g => {
  const rings = []; const rm = gold();
  for (let i = 0; i < 3; i++) { const r = mesh(tor(0.06 + i * 0.006, 0.0025, 8, 64), rm, 0, 0.07, 0, i * PI / 3, i * 0.7, 0); g.add(r); rings.push(r); }
  const lat = new THREE.LineSegments(gk('coreEdges', () => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.043, 1))), mk('coreLine', () => new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 2.2, 3.0), toneMapped: false, transparent: true, opacity: 0.9 })));
  lat.position.y = 0.07; g.add(lat); rings.push(lat);
  g.userData.nodes.rings = rings; g.userData.lights.push({ x: 0, y: 0.07, z: 0, color: 0x9fe8ff, intensity: 0.6, distance: 2 });
  let t = 0; g.userData.update = dt => { t += dt; rings.forEach((r, i) => { r.rotation.x += dt * (0.4 + i * 0.25); r.rotation.y += dt * (0.3 - i * 0.15); }); };
};
item('core', k => {
  k.add(Glow('#c8f4ff', 3.2), gk('coreIco', () => new THREE.IcosahedronGeometry(0.022, 0)), 0, 0.07, 0);
  k.add(mk('coreHaze', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.7, 1.2), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })), gk('coreLattice', () => new THREE.IcosahedronGeometry(0.034, 2)), 0, 0.07, 0, 0.3, 0.2, 0);
  k.add(mk('coreGlass', () => new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, roughness: 0.02, transparent: true, opacity: 0.25, depthWrite: false, envMapIntensity: 2, emissive: 0x2a6a8a, emissiveIntensity: 0.4 })), sph(0.05, 32, 20), 0, 0.07, 0);
  k.add(Flat('#1d2024', 0.3, 0.8), lathe('coreCradle', [[0, 0], [0.04, 0], [0.045, 0.006], [0.036, 0.024], [0.03, 0.026], [0, 0.026]], 32), 0, 0, 0);
  k.add(gold(), tor(0.034, 0.003, 6, 32), 0, 0.024, 0, PI / 2, 0, 0);
});
item('medkit', k => {
  k.add(lacq('#eef0ee'), rbox(0.26, 0.09, 0.17, 0.02, 3), 0, 0.045, 0);
  k.add(Flat('#c8ccd0', 0.4), box(0.262, 0.006, 0.172), 0, 0.06, 0);
  k.add(Flat('#c0261e', 0.45), box(0.07, 0.002, 0.022), 0, 0.0905, 0); k.add(Flat('#c0261e', 0.45), box(0.022, 0.002, 0.07), 0, 0.0905, 0);
  k.add(Flat('#2a2d31', 0.5), rbox(0.1, 0.018, 0.02, 0.008), 0, 0.045, 0.092);
  for (const s of [-1, 1]) k.add(Flat('#c0261e', 0.45), rbox(0.03, 0.03, 0.012, 0.004), s * 0.08, 0.06, 0.086);
  k.add(labelMat('medLbl', 128, 32, (c, w, h) => { c.fillStyle = '#eef0ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0261e'; c.font = `bold 20px ${SANS}`; c.fillText('LUMEN CARE', 6, 23); }), plane(0.09, 0.022), 0, 0.03, 0.0851);
});
item('camera', k => {
  const lea = mk('leather', () => new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.75, bumpMap: fabricTex(), bumpScale: 1 })), sil = Flat('#c8ccd0', 0.25, 0.9), dk = Flat('#151617', 0.35, 0.5);
  k.add(lea, rbox(0.14, 0.075, 0.05, 0.012, 2), 0, 0.0375 + 0.0, 0);
  k.add(sil, rbox(0.142, 0.02, 0.052, 0.008), 0, 0.083, 0);
  k.add(dk, cyl(0.03, 0.032, 0.045, 32), 0.012, 0.04, 0.045, PI / 2, 0, 0); k.add(sil, tor(0.03, 0.004, 8, 32), 0.012, 0.04, 0.068);
  k.add(Flat('#0a0e14', 0.05, 0.4), cyl(0.024, 0.024, 0.004, 28), 0.012, 0.04, 0.066, PI / 2, 0, 0);
  k.add(Mat('glass'), sph(0.024, 20, 8, 0, TAU, 0, 0.5), 0.012, 0.04, 0.06, PI / 2, 0, 0);
  k.add(dk, rbox(0.05, 0.04, 0.04, 0.006), -0.04, 0.113, 0); k.add(Glow('#f4f8ff', 1.4), box(0.044, 0.028, 0.002), -0.04, 0.113, 0.0205);
  k.add(sil, cyl(0.008, 0.008, 0.006, 14), 0.05, 0.096, 0.0); k.add(dk, cyl(0.012, 0.012, 0.008, 16), 0.025, 0.097, -0.008);
  k.add(Mat('glassDirty'), box(0.02, 0.014, 0.004), -0.05, 0.07, -0.026);
  for (const s of [-1, 1]) k.add(sil, tor(0.006, 0.0015, 6, 12), s * 0.072, 0.075, 0, 0, PI / 2, 0);
});
ITEM_EXTRA.prod = g => {
  const arc = mesh(tube('prodArc', [[0.27, 0.03, -0.012], [0.275, 0.022, -0.004], [0.272, 0.034, 0.003], [0.278, 0.026, 0.012]], 0.0015, 12, 4), Glow('#a8d8ff', 4), 0, 0, 0); g.add(arc);
  let t = 0; g.userData.nodes.arc = arc; g.userData.setArmed = v => { arc.visible = !!v; };
  g.userData.update = dt => { t += dt; arc.scale.y = 0.6 + Math.random() * 0.8; arc.rotation.x = (Math.random() - 0.5) * 0.4; };
};
item('prod', k => {
  k.add(rubber(), cyl(0.018, 0.018, 0.14, 20), -0.17, 0.02, 0, 0, 0, PI / 2);
  for (let i = 0; i < 6; i++) k.add(Flat('#141414', 0.7), tor(0.0185, 0.003, 6, 20), -0.22 + i * 0.02, 0.02, 0, 0, PI / 2, 0);
  k.add(darkMetal(), cyl(0.03, 0.03, 0.01, 24), -0.095, 0.03, 0, 0, 0, PI / 2);
  k.add(Flat('#e8b422', 0.4), cyl(0.014, 0.016, 0.28, 20), 0.05, 0.02, 0, 0, 0, PI / 2);
  k.add(Flat('#c0261e', 0.4), rbox(0.03, 0.012, 0.02, 0.005), -0.13, 0.04, 0);
  k.add(darkMetal(), cyl(0.02, 0.016, 0.04, 20), 0.2, 0.02, 0, 0, 0, PI / 2);
  for (const z of [-0.012, 0.012]) k.add(brushed(), cyl(0.003, 0.003, 0.06, 8), 0.245, 0.028, z, 0, 0, PI / 2);
  k.add(Glow('#7fc8ff', 2), sph(0.004, 8, 6), -0.15, 0.039, 0);
});
ITEM_EXTRA.emp = g => { g.userData.lights.push({ x: 0, y: 0.06, z: 0, color: 0x40a8ff, intensity: 0.25, distance: 1.2 }); };
item('emp', k => {
  const sh = Flat('#2a2f36', 0.35, 0.7);
  k.add(sh, lathe('empBody', [[0, 0], [0.028, 0], [0.034, 0.008], [0.034, 0.09], [0.026, 0.1], [0.012, 0.104], [0, 0.104]], 28), 0, 0, 0);
  for (const y of [0.025, 0.05, 0.075]) k.add(Glow('#40a8ff', 2.4), tor(0.0345, 0.0028, 6, 32), 0, y, 0, PI / 2, 0, 0);
  k.add(Flat('#d9a521', 0.4), rbox(0.012, 0.09, 0.006, 0.003), 0.036, 0.06, 0, 0, 0, 0.08);
  k.add(darkMetal(), cyl(0.012, 0.012, 0.016, 16), 0, 0.11, 0);
  k.add(brushed(), tor(0.012, 0.002, 6, 16), 0.016, 0.115, 0, 0, PI / 2, 0);
  k.add(labelMat('empLbl', 64, 32, (c, w, h) => { c.fillStyle = '#2a2f36'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8b422'; c.font = `bold 16px ${SANS}`; c.fillText('EMP', 14, 22); }), plane(0.02, 0.01), 0, 0.087, 0.0345);
});
ITEM_EXTRA.decoy = g => { const led = mesh(sph(0.004, 8, 6), LED.amber, 0.03, 0.035, 0.03); g.add(led); let t = 0; g.userData.update = dt => { t += dt; led.visible = (t % 0.8) < 0.15; }; };
item('decoy', k => {
  const sh = plastic('#d9a521', 0.45);
  k.add(sh, lathe('decoyBody', [[0, 0], [0.045, 0], [0.05, 0.006], [0.05, 0.026], [0.044, 0.034], [0, 0.034]], 32), 0, 0, 0);
  k.add(Flat('#1a1a1a', 0.6), cyl(0.034, 0.034, 0.003, 28), 0, 0.034, 0);
  for (let i = -3; i <= 3; i++) k.add(Flat('#3a3a3a', 0.5, 0.4), box(0.06 * Math.cos(Math.asin(Math.abs(i) / 3.6)), 0.002, 0.004), 0, 0.0365, i * 0.009);
  k.add(darkMetal(), cyl(0.0025, 0.0025, 0.07, 6), -0.03, 0.06, -0.02, 0, 0, 0.3); k.add(Flat('#c0261e', 0.4), sph(0.005, 8, 6), -0.04, 0.094, -0.02);
  k.add(rubber(), tor(0.0505, 0.004, 6, 32), 0, 0.015, 0, PI / 2, 0, 0);
});
item('bypass', k => {
  const dk = Flat('#26292d', 0.4, 0.4);
  k.add(dk, rbox(0.07, 0.022, 0.11, 0.008), 0, 0.011, 0);
  k.add(rubber(), rbox(0.074, 0.016, 0.03, 0.006), 0, 0.009, -0.045);
  k.add(mk('bypassScr', () => new THREE.MeshBasicMaterial({ map: ctex('bypassScr', 128, 96, (c, w, h) => { c.fillStyle = '#021208'; c.fillRect(0, 0, w, h); c.fillStyle = '#3dff7a'; c.font = `bold 18px ${MONO}`; c.fillText('BYPASS', 10, 24); c.font = `13px ${MONO}`; c.fillText('> 0x4F..', 10, 48); c.fillText('[#####--]', 10, 70); scanlines(c, w, h, 0.25); }), toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) })), plane(0.05, 0.036), 0, 0.0225, 0.015, -PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) k.add(Flat(['#c0261e', '#2a9a4a', '#e8e8e8'][i], 0.4), cyl(0.0045, 0.0045, 0.004, 12), -0.018 + i * 0.018, 0.023, -0.025);
  for (let i = 0; i < 2; i++) { k.add(Flat(['#c0261e', '#111'][i], 0.5), tube('bypassLead' + i, [[-0.01 + i * 0.02, 0.012, 0.055], [-0.02 + i * 0.05, 0.006, 0.09], [-0.04 + i * 0.09, 0.004, 0.12]], 0.0022, 14, 4), 0, 0, 0); k.add(Flat(['#c0261e', '#111'][i], 0.4), rbox(0.008, 0.008, 0.025, 0.003), -0.04 + i * 0.09, 0.004, 0.13); }
});
item('actuator', k => {
  const m = Flat('#4a5058', 0.4, 0.7);
  k.add(m, cyl(0.03, 0.03, 0.09, 24), -0.07, 0.032, 0, 0, 0, PI / 2);
  for (let i = 0; i < 6; i++) k.add(darkMetal(), box(0.004, 0.064, 0.064), -0.105 + i * 0.012, 0.032, 0);
  k.add(Flat('#2a2d31', 0.4, 0.5), rbox(0.05, 0.065, 0.06, 0.008), 0.0, 0.0325, 0);
  k.add(chrome(), cyl(0.009, 0.009, 0.12, 16), 0.08, 0.032, 0, 0, 0, PI / 2);
  k.add(darkMetal(), cyl(0.016, 0.016, 0.05, 20), 0.05, 0.032, 0, 0, 0, PI / 2);
  k.add(darkMetal(), rbox(0.02, 0.03, 0.02, 0.006), 0.145, 0.032, 0);
  k.add(Flat('#8a8e92', 0.85), cyl(0.0315, 0.0315, 0.03, 24, true), -0.06, 0.032, 0, 0, 0, PI / 2); // duct tape
  for (const x of [-0.02, 0.02]) k.add(Flat('#f0f0f0', 0.5), tor(0.034, 0.002, 4, 20), x * 0.2, 0.032, 0, 0, PI / 2, 0);
  k.add(Flat('#c0261e', 0.5), tube('actWire', [[-0.11, 0.05, 0], [-0.13, 0.03, 0.02], [-0.15, 0.004, 0.03]], 0.002, 10, 4), 0, 0, 0);
  k.add(labelMat('actTag', 96, 48, (c, w, h) => { c.fillStyle = '#efe6c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#20202a'; c.font = `18px ${HAND}`; c.fillText('fixed -', 6, 20); c.fillText('door B4', 6, 42); }), plane(0.04, 0.02), 0, 0.066, 0, -PI / 2, 0, 0.2);
});
item('map', k => {
  const t = ctex('mapTex', 512, 360, (c, w, h) => {
    c.fillStyle = '#e9e3cf'; c.fillRect(0, 0, w, h); noiseFill2(c, w, h);
    c.strokeStyle = 'rgba(40,90,150,0.5)'; c.lineWidth = 1; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = '#2a2a30'; c.lineWidth = 7; c.beginPath(); c.moveTo(20, 300); c.lineTo(180, 300); c.lineTo(180, 120); c.lineTo(400, 120); c.lineTo(400, 60); c.moveTo(180, 220); c.lineTo(330, 220); c.lineTo(330, 330); c.moveTo(400, 120); c.lineTo(490, 200); c.stroke();
    c.fillStyle = '#2a2a30'; c.font = `bold 20px ${SANS}`; c.fillText('SECTOR 7 - MAINTENANCE', 20, 30); c.font = `13px ${SANS}`; c.fillText('GEN RM', 340, 50); c.fillText('SUBSTATION', 200, 112); c.fillText('LAB ACCESS', 410, 230);
    c.strokeStyle = '#c0261e'; c.lineWidth = 3; c.beginPath(); c.arc(400, 60, 16, 0, TAU); c.stroke(); c.fillStyle = '#c0261e'; c.font = `18px ${HAND}`; c.fillText('power here?', 280, 84);
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2; for (const x of [w / 3, 2 * w / 3]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  });
  const m = mk('mapM', () => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  const geo = gk('mapFold', () => { const p = new THREE.PlaneGeometry(0.3, 0.21, 12, 1); const a = p.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i), f = (x + 0.15) / 0.1, seg = Math.floor(clamp(f, 0, 2.999)), fr = f - seg; const zig = (seg % 2 ? 1 - fr : fr); a.setZ(i, zig * 0.012); a.setX(i, x * 0.72); } p.computeVertexNormals(); p.rotateX(-PI / 2); return twoSided(p); });
  k.add(m, geo, 0, 0.002, 0);
});
item('keycard', k => {
  const t = ctex('keycard', 344, 216, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#eef2f4'); gr.addColorStop(1, '#c8d4dc'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0c2b3a'; c.fillRect(0, 0, w, 50); helixLogo(c, 30, 25, 36, '#9fdcff'); c.fillStyle = '#d8f3ff'; c.font = `300 30px ${SANS}`; c.fillText('HELIX', 56, 36);
    c.fillStyle = '#c0261e'; c.fillRect(0, h - 34, w, 34); c.fillStyle = '#fff'; c.font = `bold 20px ${SANS}`; c.fillText('LEVEL 3  //  RESEARCH', 14, h - 10);
    c.fillStyle = '#9aa8b0'; c.fillRect(18, 66, 76, 92); c.fillStyle = '#e0c0a0'; c.beginPath(); c.arc(56, 98, 18, 0, TAU); c.fill(); c.fillStyle = '#3a4a58'; c.fillRect(30, 122, 52, 36);
    c.fillStyle = '#1a2a34'; c.font = `bold 20px ${SANS}`; c.fillText('Dr. E. Vance', 110, 90); c.font = `15px ${SANS}`; c.fillText('Cognitive Systems', 110, 114); c.font = `13px ${MONO}`; c.fillText('ID 4471-HX', 110, 138);
    const cg = c.createLinearGradient(260, 70, 320, 120); cg.addColorStop(0, '#e8c060'); cg.addColorStop(1, '#a87a30'); c.fillStyle = cg; c.fillRect(262, 70, 54, 42);
  });
  const m = mk('keycardM', () => new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 }));
  k.add(m, gk('keycardTop', () => { const p = new THREE.PlaneGeometry(0.0855, 0.0535); p.rotateX(-PI / 2); return p; }), 0, 0.0016, 0);
  k.add(lacq('#dfe5e8'), rbox(0.086, 0.0012, 0.054, 0.0005, 1), 0, 0.0006, 0);
  k.add(Flat('#0c2b3a', 0.5), tor(0.004, 0.0012, 6, 12), -0.04, 0.0012, -0.02, PI / 2, 0, 0);
});
ITEM_EXTRA.tape = g => { const led = mesh(sph(0.003, 8, 6), LED.red, 0.022, 0.0255, -0.04); g.add(led); let t = 0; g.userData.update = dt => { t += dt; led.visible = (t % 1.4) < 0.7; }; };
item('tape', k => {
  const dk = Flat('#2b2d30', 0.45, 0.3);
  k.add(dk, rbox(0.07, 0.024, 0.11, 0.008), 0, 0.012, 0);
  k.add(Flat('#0a0b0c', 0.1, 0.2), rbox(0.05, 0.002, 0.03, 0.004), 0, 0.0245, 0.0);
  for (const x of [-0.012, 0.012]) { k.add(lacq('#e8e8e8'), cyl(0.008, 0.008, 0.002, 16), x, 0.0242, 0.0); k.add(Flat('#3a2a1a', 0.4), cyl(0.005, 0.005, 0.0025, 12), x, 0.0242, 0.0); }
  for (let i = 0; i < 5; i++) k.add(Flat('#0a0a0a', 0.6), box(0.04, 0.001, 0.0025), 0, 0.0245, 0.03 + i * 0.005);
  for (let i = 0; i < 4; i++) k.add(Flat(i === 0 ? '#c0261e' : '#8a8e92', 0.4, 0.5), rbox(0.012, 0.004, 0.008, 0.002), -0.024 + i * 0.016, 0.0255, -0.03);
  k.add(labelMat('tapeLbl', 128, 48, (c, w, h) => { c.fillStyle = '#efe6c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#20202a'; c.font = `20px ${HAND}`; c.fillText('LOG 07 - Vance', 6, 30); }), plane(0.05, 0.016), 0, 0.0246, -0.045, -PI / 2, 0, 0);
});
ITEM_EXTRA.powercell = g => {
  g.userData.lights.push({ x: 0, y: 0.1, z: 0, color: 0xffb060, intensity: 0.45, distance: 1.8 });
  const glow = g.userData.nodes.glow = []; g.traverse(c => { if (c.isMesh && c.material === MC.get('pcGlowM')) glow.push(c); });
  let t = 0; g.userData.update = dt => { t += dt; const m = MC.get('pcGlowM'); if (m) m.color.setRGB(2.6 + Math.sin(t * 2) * 0.4, 1.4 + Math.sin(t * 2) * 0.2, 0.55); };
};
item('powercell', k => {
  const wht = lacq('#eef0ef'), dk = Flat('#2a2d31', 0.4, 0.5);
  k.add(wht, lathe('pcBody', [[0, 0], [0.034, 0], [0.04, 0.008], [0.04, 0.17], [0.034, 0.18], [0, 0.18]], 32), 0, 0.0, 0);
  const gm = mk('pcGlowM', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.4, 0.55), toneMapped: false }));
  k.add(gm, cyl(0.022, 0.022, 0.12, 20), 0, 0.09, 0);
  for (let i = 0; i < 4; i++) k.add(Mat('glass'), box(0.016, 0.11, 0.002), Math.sin(i * PI / 2) * 0.0405, 0.09, Math.cos(i * PI / 2) * 0.0405, 0, i * PI / 2, 0);
  for (let i = 0; i < 4; i++) k.add(gm, box(0.012, 0.1, 0.001), Math.sin(i * PI / 2) * 0.039, 0.09, Math.cos(i * PI / 2) * 0.039, 0, i * PI / 2, 0);
  k.add(dk, cyl(0.041, 0.041, 0.012, 32), 0, 0.03, 0); k.add(dk, cyl(0.041, 0.041, 0.012, 32), 0, 0.15, 0);
  k.add(dk, tor(0.022, 0.005, 8, 24, PI), 0, 0.18, 0);
  for (let i = 0; i < 3; i++) k.add(gold(), cyl(0.004, 0.004, 0.004, 10), Math.sin(i * TAU / 3) * 0.015, 0.0, Math.cos(i * TAU / 3) * 0.015);
  k.add(labelMat('pcLbl', 128, 32, (c, w, h) => { c.fillStyle = '#2a2d31'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8eef0'; c.font = `300 20px ${SANS}`; c.fillText('Lumen Home', 8, 23); }), cyl(0.0412, 0.0412, 0.011, 32, true, -0.6, 1.2), 0, 0.15, 0);
});
// ---- end of ITEMS

/* =====================================================================
   lineup (contact sheet for _lineup.html)
   ===================================================================== */
const VARIANTS = [
  ['bedMessy', () => PROPS.bed({ messy: true })], ['chairFallen', () => PROPS.chair({ fallen: true })], ['fridgeOpen', () => PROPS.fridge({ open: true })],
  ['plantDead', () => PROPS.plant({ dead: true })], ['suitcaseOpen', () => PROPS.suitcase({ open: true })], ['ceilingTube', () => PROPS.ceilingLight({ kind: 'tube' })],
  ['ceilingPendant', () => PROPS.ceilingLight({ kind: 'pendant' })], ['bookshelf2', () => PROPS.bookshelf({ seed: 2 })], ['pictureFrame2', () => PROPS.pictureFrame({ seed: 2 })],
  ['pictureFrame3', () => PROPS.pictureFrame({ seed: 3 })], ['boxes2', () => PROPS.cardboardBoxes({ seed: 2 })],
  ['dbgNote', () => { const o = PROPS.note(); o.children[0].position.y = 0.3; return o; }], ['dbgCard', () => { const o = ITEMS.keycard(); o.position.y = 0; o.children.forEach(c => c.position.y = 0.3); return o; }],
  ['dockCharging', () => PROPS.chargingDock({ status: 'charging', cell: true })], ['keypadOpen', () => PROPS.keypad({ state: 'open' })],
  ['breakerMixed', () => PROPS.breakerPanel({ switches: [1, 0, 1, 1, 0, 0], lights: ['green', 'red', 'green', 'amber', 'off', 'red'] })],
  ['leverOn', () => PROPS.lever({ on: true })], ['ventOpen', () => PROPS.ventGrate({ open: true })],
  ['subwayCarCutaway', () => PROPS.subwayCar({ cutaway: true })], ['subwayCarCutawayWrecked', () => PROPS.subwayCar({ cutaway: true, wrecked: true })],
  ['barrelHazard', () => PROPS.barrel && PROPS.barrel({ hazard: true })], ['subwayCarWrecked', () => PROPS.subwayCar && PROPS.subwayCar({ wrecked: true })],
  ['cryoPodOpen', () => PROPS.cryoPod && PROPS.cryoPod({ open: true })], ['cryoPodOccupied', () => PROPS.cryoPod && PROPS.cryoPod({ occupied: true })],
  ['lockersOpen', () => PROPS.lockers && PROPS.lockers({ openIdx: 1 })], ['generatorRunning', () => { const o = PROPS.generator(); o.userData.setRunning(true); return o; }],
  ['coolingVenting', () => { const o = PROPS.coolingUnit(); o.userData.setState('venting'); return o; }],
];
const hang = f => () => { const g = new THREE.Group(), o = f(); o.position.y = 2.6; g.add(o); g.userData = o.userData; return g; };
export const LINEUP = [
  ...Object.keys(PROPS).map(name => ({ name, make: name === 'ceilingLight' ? hang(() => PROPS[name]()) : () => PROPS[name]() })),
  ...VARIANTS.filter(([n]) => n).map(([name, f]) => ({ name, make: name.startsWith('ceiling') ? hang(f) : f })),
  ...Object.keys(ITEMS).map(name => ({ name: 'item_' + name, make: () => ITEMS[name]() })),
];
