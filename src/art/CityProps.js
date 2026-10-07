/* CityProps.js - the street furniture of a dead city, built in code.

   Everything here is generated: bodies are extruded side profiles with
   rounded bevels, rounded boxes, lathes and tubes; every logo, warning and
   ad is painted on a canvas. Static sub-meshes that share a material are
   merged into one draw call per material, and whole props are cached by
   their options so a street of fifty cones costs one set of geometries.

   Conventions: metres, Y up, front = +Z, base at y = 0, centred on origin.
   userData.solid  = [{ x, y, z, hw, hh, hd }]   local collision boxes
   userData.lights = [{ x, y, z, color, intensity, distance }]
   userData.update = (dt, t) => {}               animated props only
   userData.nodes  = { name: Object3D }          interactive parts       */
import * as THREE from '../../lib/three.module.js';
import { Mat, Flat, Glow } from '../core/Textures.js';

const PI = Math.PI, TAU = PI * 2, V3 = THREE.Vector3;
const FONT = "Bahnschrift, 'Segoe UI', Arial, sans-serif";
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (x, y) => x + (y - x) * f();
  f.int = (x, y) => Math.floor(x + (y - x + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length) % arr.length];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}
const n3 = (x, y, z, s = 0) => Math.sin(x * 3.1 + s) * Math.sin(y * 2.7 + s * 1.7) * Math.sin(z * 3.7 + s * 2.3) * 0.6 + Math.sin(x * 9.3 + s * 3.1) * Math.sin(y * 8.1 + s) * Math.sin(z * 7.7 + s * 0.7) * 0.4;

/* ================= geometry ================= */
const GC = new Map();
const gc = (key, f) => { let g = GC.get(key); if (!g) { g = f(); GC.set(key, g); } return g; };
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new V3(), _s = new V3();
function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** box with properly rounded edges and corners (radius r, s arc steps per 45 degrees) */
function roundBoxGeo(w, h, d, r, s = 2) {
  r = Math.max(0.001, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const N = 2 * s + 1, g = new THREE.BoxGeometry(1, 1, 1, N, N, N);
  const P = g.attributes.position, No = g.attributes.normal;
  const m = (c, H) => { const k = Math.round((c + 0.5) * N); if (k <= s) return -H + r * (1 - Math.tan((1 - k / s) * PI / 4)); const j = N - k; return H - r * (1 - Math.tan((1 - j / s) * PI / 4)); };
  const hx = w / 2, hy = h / 2, hz = d / 2, v = new V3(), inn = new V3();
  for (let i = 0; i < P.count; i++) {
    v.set(m(P.getX(i), hx), m(P.getY(i), hy), m(P.getZ(i), hz));
    inn.set(Math.max(-hx + r, Math.min(hx - r, v.x)), Math.max(-hy + r, Math.min(hy - r, v.y)), Math.max(-hz + r, Math.min(hz - r, v.z)));
    v.sub(inn); const L = v.length() || 1; v.multiplyScalar(1 / L);
    No.setXYZ(i, v.x, v.y, v.z); P.setXYZ(i, inn.x + v.x * r, inn.y + v.y * r, inn.z + v.z * r);
  }
  // box uvs in metres so tiled materials keep their scale
  const U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    const nx = Math.abs(No.getX(i)), ny = Math.abs(No.getY(i)), nz = Math.abs(No.getZ(i));
    if (nx >= ny && nx >= nz) U.setXY(i, P.getZ(i), P.getY(i)); else if (ny >= nz) U.setXY(i, P.getX(i), P.getZ(i)); else U.setXY(i, P.getX(i), P.getY(i));
  }
  return g;
}
const gBox = (w, h, d) => gc(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const gRB = (w, h, d, r, s = 2) => gc(`rb${w},${h},${d},${r},${s}`, () => roundBoxGeo(w, h, d, r, s));
const gCyl = (rt, rb, h, seg = 16, open = false, ts = 0, tl = TAU) => gc(`c${rt},${rb},${h},${seg},${open},${ts},${tl}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl));
const gSph = (r, ws = 16, hs = 12) => gc(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const gTor = (R, r, rs = 8, ts = 24, arc = TAU) => gc(`t${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const gPlane = (w, h) => gc(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h));
const gCircle = (r, seg = 32) => gc(`ci${r},${seg}`, () => new THREE.CircleGeometry(r, seg));
/** lathe around Y; profiles written top-down are flipped so faces point outward */
const gLathe = (pts, seg = 24) => gc('l' + pts.join(',') + '|' + seg, () => { const p = pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts; return new THREE.LatheGeometry(p.map(q => new THREE.Vector2(q[0], q[1])), seg); });
/** a tube along a list of [x,y,z] points */
const gTube = (pts, r, seg = 24, rs = 6, key) => {
  const f = () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2]))), seg, r, rs, false);
  return key ? gc('tu' + key, f) : f();
};
/** lumpy blob: an icosphere pushed around by noise */
function blobGeo(r, detail, amp, seed, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail), P = g.attributes.position, v = new V3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const k = 1 + amp * n3(v.x * 2 / r, v.y * 2 / r, v.z * 2 / r, seed); P.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz); }
  smoothNormals(g, 80); return g;
}

/** smooth normals of a non-indexed geometry across coincident vertices, keeping creases sharper than `crease` degrees */
function smoothNormals(geo, crease = 50) {
  const P = geo.attributes.position, n = P.count, tri = (n / 3) | 0;
  const fn = new Float32Array(tri * 3), fa = new Float32Array(tri * 3);
  const a = new V3(), b = new V3(), c = new V3();
  for (let t = 0; t < tri; t++) {
    a.fromBufferAttribute(P, t * 3); b.fromBufferAttribute(P, t * 3 + 1); c.fromBufferAttribute(P, t * 3 + 2);
    c.sub(b); a.sub(b); c.cross(a); fa[t * 3] = c.x; fa[t * 3 + 1] = c.y; fa[t * 3 + 2] = c.z; c.normalize(); fn[t * 3] = c.x; fn[t * 3 + 1] = c.y; fn[t * 3 + 2] = c.z;
  }
  const groups = new Map(), key = i => `${Math.round(P.getX(i) * 2000)},${Math.round(P.getY(i) * 2000)},${Math.round(P.getZ(i) * 2000)}`;
  for (let i = 0; i < n; i++) { const k = key(i); let gq = groups.get(k); if (!gq) groups.set(k, gq = []); gq.push(i); }
  const out = new Float32Array(n * 3), cc = Math.cos(crease * PI / 180);
  for (const gq of groups.values()) for (const i of gq) {
    const fi = (i / 3) | 0; let x = 0, y = 0, z = 0;
    for (const j of gq) { const fj = (j / 3) | 0; if (fn[fi * 3] * fn[fj * 3] + fn[fi * 3 + 1] * fn[fj * 3 + 1] + fn[fi * 3 + 2] * fn[fj * 3 + 2] >= cc) { x += fa[fj * 3]; y += fa[fj * 3 + 1]; z += fa[fj * 3 + 2]; } }
    const L = Math.hypot(x, y, z) || 1; out[i * 3] = x / L; out[i * 3 + 1] = y / L; out[i * 3 + 2] = z / L;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}
function deform(geo, fn, renorm = false) {
  const P = geo.attributes.position, v = new V3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); fn(v, i); P.setXYZ(i, v.x, v.y, v.z); }
  if (renorm) geo.computeVertexNormals();
  geo.computeBoundingSphere(); return geo;
}
/** extrude a side profile (shape x = length, y = height) across `width`; returns geometry with length on Z, width on X */
function extrudeSide(shape, width, bevel, curveSeg = 14, bevelSeg = 4, steps = 1) {
  const depth = Math.max(0.005, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth, steps, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: bevelSeg, curveSegments: curveSeg });
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const u = P.getX(i), v = P.getY(i), w = P.getZ(i); P.setXYZ(i, -(w - depth / 2), v, u); }
  return g;
}
/** smooth interpolation through [[z, y], ...] (cubic hermite, clamped at the ends) */
function curveFn(pts) {
  const n = pts.length;
  const slope = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); };
  return z => {
    if (z <= pts[0][0]) return pts[0][1]; if (z >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (i < n - 2 && z > pts[i + 1][0]) i++;
    const [z1, y1] = pts[i], [z2, y2] = pts[i + 1], h = z2 - z1, t = (z - z1) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * h * slope(i + 1);
  };
}
/** rounded-rectangle cross-section with a fixed point count (closed loop, ccw seen from +Z, starting bottom centre) */
function rrSection(hw, b, t, rt, rb, sideYs = [], seg = 5) {
  const H = Math.max(1e-4, t - b); rt = Math.max(1e-4, Math.min(rt, hw * 0.95, H * 0.6)); rb = Math.max(1e-4, Math.min(rb, hw * 0.5, H * 0.35));
  const R = [[0, b], [(hw - rb) * 0.5, b], [hw - rb, b]];
  for (let i = 1; i <= seg; i++) { const a = -PI / 2 + i / seg * PI / 2; R.push([hw - rb + Math.cos(a) * rb, b + rb + Math.sin(a) * rb]); }
  const y0 = b + rb, y1 = Math.max(y0, t - rt);
  const ys = [0.25, 0.5, 0.75].map(f => y0 + (y1 - y0) * f).concat(sideYs.map(y => Math.max(y0, Math.min(y1, y)))).sort((p, q) => p - q);
  for (const y of ys) R.push([hw, y]);
  for (let i = 0; i <= seg; i++) { const a = i / seg * PI / 2; R.push([hw - rt + Math.cos(a) * rt, t - rt + Math.sin(a) * rt]); }
  R.push([(hw - rt) * 0.5, t], [0, t]);
  for (let i = R.length - 2; i >= 1; i--) R.push([-R[i][0], R[i][1]]);
  return R;
}
/** loft a body along Z from cross-sections; ends rounded with radius endR and capped */
function loftGeo(o) {
  const { z0, z1 } = o, nz = o.nz ?? 60;
  let zs = []; for (let i = 0; i <= nz; i++) zs.push(z0 + (z1 - z0) * i / nz);
  if (o.extraZ) zs.push(...o.extraZ.filter(z => z > z0 && z < z1));
  zs.sort((a, b) => a - b); zs = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-4);
  const sec = z => { const hw = o.hw(z), b = o.bot(z), t = Math.max(b + 1e-3, o.top(z)); let p = rrSection(hw, b, t, o.rt ?? 0.1, o.rb ?? 0.05, o.sideYs, o.seg ?? 5); if (o.shape) p = p.map(q => o.shape(q[0], q[1], z, hw, b, t)); if (o.arch) { const a = o.arch(z); p = p.map(q => (q[1] < a ? [q[0], a] : q)); } return p; };
  const inset = (pts, d) => { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; return pts.map(p => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1, k = Math.max(0.02, L - d) / L; return [cx + dx * k, cy + dy * k]; }); };
  const rings = [], K = 4, e0 = o.endR0 ?? o.endR ?? 0, e1 = o.endR1 ?? o.endR ?? 0;
  if (e0 > 0) { const p = sec(z0); for (let k = K; k >= 1; k--) { const th = k / K * PI / 2; rings.push({ z: z0 - e0 * Math.sin(th), p: inset(p, e0 * (1 - Math.cos(th))) }); } }
  for (const z of zs) rings.push({ z, p: sec(z) });
  if (e1 > 0) { const p = sec(z1); for (let k = 1; k <= K; k++) { const th = k / K * PI / 2; rings.push({ z: z1 + e1 * Math.sin(th), p: inset(p, e1 * (1 - Math.cos(th))) }); } }
  const n = rings[0].p.length, nr = rings.length, pos = new Float32Array((nr * n + 2) * 3), uv = new Float32Array((nr * n + 2) * 2);
  const v = new V3();
  rings.forEach((r, i) => r.p.forEach((q, j) => { v.set(q[0], q[1], r.z); if (o.deform) o.deform(v); const a = i * n + j; pos[a * 3] = v.x; pos[a * 3 + 1] = v.y; pos[a * 3 + 2] = v.z; uv[a * 2] = r.z + q[0] * 0.3; uv[a * 2 + 1] = q[1]; }));
  const capC = (i, slot) => { let x = 0, y = 0, z = 0; for (let j = 0; j < n; j++) { x += pos[(i * n + j) * 3]; y += pos[(i * n + j) * 3 + 1]; z += pos[(i * n + j) * 3 + 2]; } pos[slot * 3] = x / n; pos[slot * 3 + 1] = y / n; pos[slot * 3 + 2] = z / n; };
  const c0 = nr * n, c1 = nr * n + 1; capC(0, c0); capC(nr - 1, c1);
  const idx = [];
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n; idx.push(a, b, c, b, d, c); }
  for (let j = 0; j < n; j++) { idx.push(c0, (j + 1) % n, j); idx.push(c1, (nr - 1) * n + j, (nr - 1) * n + (j + 1) % n); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  // box-projected uvs (metres) from the dominant normal axis, so weathering maps never smear
  const N = g.attributes.normal;
  for (let i = 0; i < nr * n + 2; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i)), x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else if (ay >= az) { uv[i * 2] = z; uv[i * 2 + 1] = x; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  g.attributes.uv.needsUpdate = true;
  return g;
}
/** split an indexed geometry by triangle-centroid predicate -> [matching, rest] sharing attributes */
function splitGeo(g, pred) {
  const I = g.index.array, P = g.attributes.position, A = [], B = [], c = new V3(), t = new V3(), a = new V3(), b = new V3(), n = new V3();
  for (let i = 0; i < I.length; i += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(t.fromBufferAttribute(P, I[i + k])); c.multiplyScalar(1 / 3);
    t.fromBufferAttribute(P, I[i]); a.fromBufferAttribute(P, I[i + 1]).sub(t); b.fromBufferAttribute(P, I[i + 2]).sub(t); n.crossVectors(a, b).normalize();
    (pred(c, n) ? A : B).push(I[i], I[i + 1], I[i + 2]);
  }
  const mk = ix => { const h = new THREE.BufferGeometry(); for (const k in g.attributes) h.setAttribute(k, g.attributes[k]); h.setIndex(ix); h.computeBoundingSphere(); return h; };
  return [mk(A), mk(B)];
}
const archFn = (axles, r, cy) => z => { let y = -1e9; for (const ax of axles) { const d = z - ax; if (Math.abs(d) < r) y = Math.max(y, cy + Math.sqrt(r * r - d * d)); } return y; };
const archZs = (axles, r, cy, bottom) => { const out = []; for (const ax of axles) { const a0 = Math.asin(Math.max(-1, Math.min(1, (bottom - cy) / r))); for (let i = 0; i <= 18; i++) { const a = a0 + (PI - 2 * a0) * i / 18; out.push(ax + Math.cos(a) * r); } out.push(ax + Math.cos(a0) * r + 0.004, ax - Math.cos(a0) * r - 0.004); } return out; };

/** flat shape in a plane: pts [[a,b]...] -> ShapeGeometry in XY facing +Z */
function shapeGeo(pts, holes) {
  const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  if (holes) for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  return new THREE.ShapeGeometry(s);
}

/** merge [{geo, m}] into one indexed geometry (position / normal / uv) */
function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const { geo } of list) { const c = geo.attributes.position.count; nv += c; ni += geo.index ? geo.index.count : c; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0; const v = new V3(), nm = new THREE.Matrix3();
  for (const { geo, m } of list) {
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    nm.getNormalMatrix(m); const flip = m.determinant() < 0;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      if (N) v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
      nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      if (U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
    }
    const cnt = geo.index ? geo.index.count : P.count;
    for (let i = 0; i < cnt; i += 3) {
      const a = geo.index ? geo.index.getX(i) : i, b = geo.index ? geo.index.getX(i + 1) : i + 1, c = geo.index ? geo.index.getX(i + 2) : i + 2;
      idx[io + i] = a + vo; idx[io + i + 1] = (flip ? c : b) + vo; idx[io + i + 2] = (flip ? b : c) + vo;
    }
    vo += P.count; io += cnt;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/** Kit: collects parts per material under a transform stack, then bakes one mesh per material */
class Kit {
  constructor() { this.parts = new Map(); this.solid = []; this.lights = []; this.objs = []; this.nodes = {}; this.T = new THREE.Matrix4(); this.stack = []; }
  at(...a) { const fn = a.pop(); const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1] = a; this.stack.push(this.T.clone()); this.T.multiply(mtx(x, y, z, rx, ry, rz, s)); fn(); this.T = this.stack.pop(); return this; }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const m = this.T.clone().multiply(mtx(x, y, z, rx, ry, rz, sx, sy, sz));
    let e = this.parts.get(mat); if (!e) this.parts.set(mat, e = []); e.push({ geo, m }); return this;
  }
  box(mat, w, h, d, x, y, z, rx, ry, rz) { return this.add(mat, gBox(w, h, d), x, y, z, rx, ry, rz); }
  rb(mat, w, h, d, r, x, y, z, rx, ry, rz) { return this.add(mat, gRB(w, h, d, r), x, y, z, rx, ry, rz); }
  /** low-detail rounded box (one arc step) for small repeated parts */
  rb1(mat, w, h, d, r, x, y, z, rx, ry, rz) { return this.add(mat, gRB(w, h, d, r, 1), x, y, z, rx, ry, rz); }
  cyl(mat, rt, rb, h, x, y, z, rx, ry, rz, seg = 16) { return this.add(mat, gCyl(rt, rb, h, seg), x, y, z, rx, ry, rz); }
  /** a cylinder (rod) between two points */
  rod(mat, r, a, b, seg = 8) {
    const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize());
    const m = this.T.clone().multiply(new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new V3(1, L, 1)));
    let e = this.parts.get(mat); if (!e) this.parts.set(mat, e = []); e.push({ geo: gCyl(r, r, 1, seg, true), m }); return this;
  }
  obj(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) { this.T.clone().multiply(mtx(x, y, z, rx, ry, rz, s)).decompose(o.position, o.quaternion, o.scale); this.objs.push(o); return o; }
  solidBox(x, y, z, hw, hh, hd) { this.solid.push({ x, y, z, hw, hh, hd }); return this; }
  light(x, y, z, color, intensity, distance) { this.lights.push({ x, y, z, color, intensity, distance }); return this; }
  bake() { return { meshes: [...this.parts].map(([mat, list]) => [mat, mergeGeos(list)]), solid: this.solid, lights: this.lights }; }
  build(root = new THREE.Group()) {
    for (const [mat, list] of this.parts) root.add(new THREE.Mesh(mergeGeos(list), mat));
    for (const o of this.objs) root.add(o);
    root.userData.solid = this.solid; root.userData.lights = this.lights; root.userData.nodes = this.nodes;
    return root;
  }
}
const PROP = new Map();
/** build once per key, then hand out light-weight instances sharing geometry */
function cachedKit(key, fill) {
  let e = PROP.get(key);
  if (!e) { const k = new Kit(); fill(k); e = k.bake(); PROP.set(key, e); }
  const g = new THREE.Group();
  for (const [mat, geo] of e.meshes) g.add(new THREE.Mesh(geo, mat));
  g.userData.solid = e.solid.map(b => ({ ...b })); g.userData.lights = e.lights.map(l => ({ ...l })); g.userData.nodes = {};
  return g;
}

/* ================= canvas painting ================= */
const TX = new Map();
function ctex(key, w, h, draw, repeat = false) {
  let t = TX.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  draw(g, w, h);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TX.set(key, t); return t;
}
function blots(g, w, h, R, n, r0, r1, rgb, a0, a1) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = r0 + R() * (r1 - r0), a = a0 + R() * (a1 - a0);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const X = x + ox, Y = y + oy; if (X + r < 0 || X - r > w || Y + r < 0 || Y - r > h) continue;
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(X - r, Y - r, 2 * r, 2 * r);
    }
  }
}
function streaks(g, w, h, R, n, rgb, aMax, len = 0.5) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, L = h * len * (0.3 + R()), lw = 1 + R() * 4;
    const gr = g.createLinearGradient(0, y, 0, y + L); gr.addColorStop(0, `rgba(${rgb},${aMax * R()})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x, y, lw, L); if (y + L > h) g.fillRect(x, y - h, lw, L);
  }
}
/** weathering maps multiplied into paints: 'clean' | 'grime' | 'soot' */
function wearTex(kind) {
  return ctex('wear_' + kind, 512, 512, (g, w, h) => {
    const R = rng(kind.length * 31 + 7);
    g.fillStyle = kind === 'soot' ? '#c8c4c0' : '#ffffff'; g.fillRect(0, 0, w, h);
    if (kind === 'clean') { blots(g, w, h, R, 30, 30, 120, '120,118,112', 0.03, 0.08); return; }
    blots(g, w, h, R, 70, 20, 110, '70,66,60', 0.04, 0.14);
    streaks(g, w, h, R, 90, '60,58,55', 0.12, 0.4);
    blots(g, w, h, R, 150, 1, 3, '60,55,50', 0.08, 0.25);
    if (kind === 'soot') {
      blots(g, w, h, R, 300, 1, 4, '50,45,40', 0.2, 0.6);
      blots(g, w, h, R, 16, 40, 140, '12,10,9', 0.3, 0.7);
      blots(g, w, h, R, 14, 10, 50, '80,55,40', 0.1, 0.25);
      streaks(g, w, h, R, 60, '10,10,10', 0.35, 0.5);
      blots(g, w, h, R, 200, 2, 6, '70,50,35', 0.2, 0.5);
    }
  }, true);
}
/** spiderweb cracked glass (dark base, light cracks) or translucent version */
function crackTex(alpha = false) {
  return ctex('crack' + alpha, 512, 512, (g, w, h) => {
    const R = rng(alpha ? 11 : 5);
    if (alpha) { g.fillStyle = 'rgba(150,170,180,0.28)'; g.fillRect(0, 0, w, h); } else { g.fillStyle = '#0d1115'; g.fillRect(0, 0, w, h); blots(g, w, h, R, 20, 30, 120, '40,48,56', 0.2, 0.5); }
    for (let k = 0; k < 4; k++) {
      const cx = R() * w, cy = R() * h, rays = 10 + (R() * 8 | 0), ends = [];
      if (alpha && k < 2) { g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = 20 + R() * 45; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); g.restore(); }
      g.strokeStyle = alpha ? 'rgba(235,245,250,0.85)' : 'rgba(200,215,225,0.75)'; g.lineWidth = 1.3;
      for (let i = 0; i < rays; i++) {
        const a = i / rays * TAU + R() * 0.3; let x = cx, y = cy; const pts = [];
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 8; s++) { const st = 18 + R() * 30; x += Math.cos(a + (R() - 0.5) * 0.6) * st; y += Math.sin(a + (R() - 0.5) * 0.6) * st; g.lineTo(x, y); pts.push([x, y]); }
        g.stroke(); ends.push(pts);
      }
      g.lineWidth = 0.8;
      for (let ring = 0; ring < 5; ring++) { g.beginPath(); for (let i = 0; i <= rays; i++) { const p = ends[i % rays][ring]; if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0] + (R() - 0.5) * 6, p[1] + (R() - 0.5) * 6); } g.stroke(); }
    }
  }, true);
}

/* ================= materials ================= */
const MC = new Map();
const mc = (key, f) => { let m = MC.get(key); if (!m) { m = f(); m.name = key; MC.set(key, m); } return m; };
/** car-style clearcoat paint with a weathering map */
function paint(color, wear = 'grime') {
  return mc(`paint${color}|${wear}`, () => {
    const t = wearTex(wear); t.repeat.set(0.35, 0.35);
    return new THREE.MeshPhysicalMaterial({ color, map: t, roughness: wear === 'soot' ? 0.6 : 0.3, metalness: wear === 'soot' ? 0.3 : 0.45, clearcoat: wear === 'soot' ? 0.2 : 0.9, clearcoatRoughness: 0.15 });
  });
}
/** matte painted plastic / composite panels with a weathering map */
function matte(color, wear = 'grime', rough = 0.55, metal = 0) {
  return mc(`matte${color}|${wear}|${rough}|${metal}`, () => { const t = wearTex(wear); t.repeat.set(0.35, 0.35); return new THREE.MeshStandardMaterial({ color, map: t, roughness: rough, metalness: metal }); });
}
const M = {
  get darkGlass() { return mc('darkGlass', () => new THREE.MeshPhysicalMaterial({ color: 0x0c1218, roughness: 0.12, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.03 })); },
  get crackGlass() { return mc('crackGlass', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: crackTex(false), roughness: 0.18, metalness: 0.6 })); },
  get crackClear() { return mc('crackClear', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: crackTex(true), roughness: 0.1, metalness: 0.1, transparent: true, depthWrite: false, side: THREE.DoubleSide })); },
  get shard() { return mc('shard', () => new THREE.MeshStandardMaterial({ color: 0x9fb4bc, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); },
  get trim() { return Flat(0x16181b, 0.5, 0.3); },
  get black() { return Flat(0x07080a, 0.8, 0); },
  get chrome() { return Flat(0xc4c8cc, 0.16, 1); },
  get alu() { return Flat(0x9aa0a6, 0.32, 0.9); },
  get gunmetal() { return Flat(0x3a3e43, 0.38, 0.8); },
  get steel() { return Mat('steel'); },
  get rubber() { return Mat('rubber'); },
  get white() { return matte(0xe4e6e6, 'grime', 0.4); },
  get grey() { return matte(0x8a9096, 'grime', 0.5, 0.2); },
  get dark() { return matte(0x2a2e33, 'grime', 0.5, 0.2); },
  get wood() { return Mat('wood'); },
  get concrete() { return Mat('concrete'); },
  get soot() { return Flat(0x0b0a09, 0.95, 0); },
  get fabric() { return Mat('fabric'); },
  get seat() { return Flat(0x2f4552, 0.9, 0); },
  get cardboard() { return mc('cardboard', () => { const t = ctex('cardboardT', 256, 256, (g, w, h) => { g.fillStyle = '#9c7a52'; g.fillRect(0, 0, w, h); const R = rng(4); blots(g, w, h, R, 40, 10, 60, '70,50,30', 0.1, 0.35); streaks(g, w, h, R, 40, '60,45,30', 0.3, 0.5); g.fillStyle = 'rgba(60,40,25,0.5)'; g.fillRect(0, h * 0.48, w, 6); }, true); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }); }); },
};
/** decal material: transparent canvas on a plane */
function decal(key, w, h, draw, o = {}) {
  return mc('decal_' + key, () => new THREE.MeshStandardMaterial({ map: ctex(key, w, h, draw), transparent: true, roughness: o.rough ?? 0.5, metalness: o.metal ?? 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: o.double ? THREE.DoubleSide : THREE.FrontSide }));
}
/** glowing canvas (screens, signs). k > 1 blooms */
function glowTex(key, w, h, draw, k = 1.6, o = {}) {
  return mc('glow_' + key + k, () => new THREE.MeshBasicMaterial({ map: ctex(key, w, h, draw), color: new THREE.Color(1, 1, 1).multiplyScalar(k), toneMapped: false, transparent: !!o.transparent, depthWrite: !o.transparent, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: o.double ? THREE.DoubleSide : THREE.FrontSide }));
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function txt(g, s, x, y, size, color, weight = 700, align = 'center', base = 'middle', spacing = 0) {
  g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
  if (spacing) { try { g.letterSpacing = spacing + 'px'; } catch (e) { /* */ } }
  g.fillText(s, x, y); if (spacing) { try { g.letterSpacing = '0px'; } catch (e) { /* */ } }
}
/** the AI's mark: a ring with three inward ticks */
function drawGlyph(g, cx, cy, r, color, lw = 0.13) {
  g.save(); g.strokeStyle = color; g.lineCap = 'butt'; g.lineWidth = r * lw;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.lineWidth = r * lw * 0.95;
  for (let k = 0; k < 3; k++) { const a = -PI / 2 + k * TAU / 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.48); g.stroke(); }
  g.restore();
}
/** smear an existing canvas: horizontal slice shifts + rgb split (for glitch frames) */
function glitchCanvas(g, w, h, R, amount = 1) {
  const src = document.createElement('canvas'); src.width = w; src.height = h; src.getContext('2d').drawImage(g.canvas, 0, 0);
  for (let i = 0; i < 9 * amount; i++) { const y = R() * h, sh = 4 + R() * h * 0.08, dx = (R() - 0.5) * w * 0.12; g.drawImage(src, 0, y, w, sh, dx, y, w, sh); }
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35;
  g.drawImage(src, w * 0.012, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
}
function scan(g, w, h, a = 0.18) { g.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); }

/* ================= shared bits ================= */
function wheelCoverTex() {
  return ctex('wheelcover', 256, 256, (g, w, h) => {
    const c = w / 2; g.fillStyle = '#16181b'; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
    const gr = g.createRadialGradient(c, c, 10, c, c, c); gr.addColorStop(0, '#cfd3d6'); gr.addColorStop(0.7, '#8d9398'); gr.addColorStop(1, '#5c6166');
    g.fillStyle = gr;
    for (let i = 0; i < 7; i++) { g.save(); g.translate(c, c); g.rotate(i / 7 * TAU); g.beginPath(); g.moveTo(-10, -18); g.quadraticCurveTo(30, -60, 20, -c + 14); g.lineTo(46, -c + 18); g.quadraticCurveTo(52, -60, 12, -16); g.closePath(); g.fill(); g.restore(); }
    g.strokeStyle = '#a7adb2'; g.lineWidth = 12; g.beginPath(); g.arc(c, c, c - 10, 0, TAU); g.stroke();
    g.fillStyle = '#2a2d31'; g.beginPath(); g.arc(c, c, 24, 0, TAU); g.fill();
    g.strokeStyle = '#7fd6ff'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, 17, 0, TAU); g.stroke();
  });
}
const wheelCoverMat = () => mc('wheelCover', () => new THREE.MeshStandardMaterial({ map: wheelCoverTex(), roughness: 0.35, metalness: 0.7 }));
const TYRE = [[0.24, -0.12], [0.3, -0.126], [0.338, -0.118], [0.357, -0.08], [0.362, 0], [0.357, 0.08], [0.338, 0.118], [0.3, 0.126], [0.24, 0.12]];
/** a wheel with axis along X. side = +1 outer face on +X */
function wheel(k, x, y, z, side, s = 1, flat = false, ry = 0) {
  k.at(x, y, z, 0, ry, 0, () => {
    k.add(M.rubber, gLathe(TYRE, 30), 0, 0, 0, 0, 0, PI / 2, s, flat ? s * 0.82 : s, s);
    k.add(wheelCoverMat(), gCircle(0.255 * s, 28), side * 0.118 * s, flat ? 0.02 : 0, 0, 0, side * PI / 2, 0, 1, flat ? 0.9 : 1, 1);
    k.add(M.trim, gCircle(0.25 * s, 20), -side * 0.11 * s, 0, 0, 0, -side * PI / 2, 0);
  });
}
/** scattered glass shards on the ground */
function shards(k, R, n, cx, cz, rx, rz) {
  const g = gc('shardtri', () => shapeGeo([[0, 0], [0.06, 0.01], [0.02, 0.05]]));
  for (let i = 0; i < n; i++) { const s = 0.5 + R() * 1.6; k.add(M.shard, g, cx + (R() - 0.5) * 2 * rx, 0.004 + R() * 0.004, cz + (R() - 0.5) * 2 * rz, -PI / 2 + (R() - 0.5) * 0.2, R() * TAU, 0, s); }
}
function sootPatch(k, x, z, r, R) {
  const m = mc('sootDecal', () => new THREE.MeshBasicMaterial({ map: ctex('sootpatch', 256, 256, (g, w, h) => { const R2 = rng(9); blots(g, w, h, R2, 30, 20, 90, '0,0,0', 0.25, 0.6); g.globalCompositeOperation = 'destination-in'; const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  k.add(m, gPlane(1, 1), x, 0.006, z, -PI / 2, 0, R ? R() * TAU : 0, r * 2, r * 2, 1);
}

const archMat = () => mc('archLiner', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9, side: THREE.DoubleSide }));
function archLiner(k, x, y, z, r, w) { k.add(archMat(), gCyl(r, r, w, 22, true, 0, PI), x, y, z, 0, 0, PI / 2); }

/* ================= vehicles ================= */
const CAR_COLS = [0xe2e4e4, 0x1e2125, 0x8a9198, 0x6a1c20, 0x22364e, 0xb8ab94, 0x3e4d47, 0x5b6770];
function arches(s, axles, r, cy, bottom) {
  // walk the bottom edge from front to rear, notching an arch over each axle
  const dx = Math.sqrt(r * r - (cy - bottom) ** 2), a = Math.asin((bottom - cy) / r);
  for (const ax of axles) { s.lineTo(ax + dx, bottom); s.absarc(ax, cy, r, a, PI - a, false); s.lineTo(ax - dx, bottom); }
}
function crumpler(wreck, seed, z0, z1, depth) {
  const s = seed * 1.37 + 0.5;
  return v => {
    if (!wreck) return; const t = ss(z0, z1, v.z); if (t <= 0) return;
    v.z -= depth * t * t;
    v.y += (n3(v.x * 1.3, v.y * 1.5, v.z * 1.2, s) * 0.09 - 0.06 * t * ss(0.4, 0.95, v.y)) * t;
    v.x *= 1 - 0.05 * t; v.x += n3(v.z * 2, v.y * 2, v.x * 2, s + 2) * 0.05 * t;
    if (v.y > 0.6) v.y += 0.07 * t * Math.sin(v.x * 6 + s);
  };
}
function carGeos(wreck, seed) {
  return gc('carGeo' + (wreck ? 'w' + seed : ''), () => {
    const cr = crumpler(wreck, seed, 0.9, 2.4, 0.5);
    const axles = [1.45, -1.45], arch = archFn(axles, 0.5, 0.25), bot0 = curveFn([[-2.3, 0.32], [-2.1, 0.25], [2.05, 0.24], [2.27, 0.3]]);
    const top = curveFn([[-2.3, 0.84], [-2.12, 0.94], [-1.6, 0.975], [-0.5, 0.96], [0.6, 0.935], [1.3, 0.9], [1.8, 0.84], [2.1, 0.76], [2.27, 0.68]]);
    const body = loftGeo({
      z0: -2.29, z1: 2.27, nz: 90, endR0: 0.08, endR1: 0.1, rt: 0.22, rb: 0.07, extraZ: archZs(axles, 0.5, 0.25, 0.25),
      top, bot: bot0, arch, hw: curveFn([[-2.3, 0.9], [-1.9, 0.95], [-1.2, 0.965], [1.0, 0.965], [1.8, 0.94], [2.27, 0.86]]),
      shape: (x, y, z, hw, b, t) => [x * (1 - 0.055 * ss(b + (t - b) * 0.4, t, y) - 0.04 * ss(b + 0.15, b, y)), y + 0.025 * (1 - (x / hw) ** 2) * ss(t - 0.25, t, y)],
      deform: cr,
    });
    const can = loftGeo({
      z0: -2.02, z1: 1.56, nz: 60, rt: 0.55, rb: 0.02, sideYs: [0.9],
      top: curveFn([[-2.02, 0.87], [-1.6, 1.08], [-1.0, 1.36], [-0.5, 1.44], [0.2, 1.47], [0.6, 1.425], [1.0, 1.24], [1.4, 0.98], [1.56, 0.87]]),
      bot: () => 0.86, hw: curveFn([[-2.02, 0.66], [-1.5, 0.8], [-0.5, 0.845], [0.6, 0.835], [1.3, 0.76], [1.56, 0.72]]),
      shape: (x, y, z, hw, b, t) => [x * (1 - 0.2 * ss(b + (t - b) * 0.15, b + 0.62, y)), y],
      deform: cr,
    });
    return { body, can };
  });
}
function plateMat(id) {
  return glowTex('plate' + id, 256, 64, (g, w, h) => {
    g.fillStyle = '#e9eef0'; rr(g, 2, 2, w - 4, h - 4, 8); g.fill(); g.fillStyle = '#2a7fa8'; g.fillRect(2, 2, 34, h - 4);
    txt(g, 'CC', 19, h / 2, 16, '#fff'); txt(g, id, w / 2 + 16, h / 2 + 2, 38, '#16202a', 700, 'center', 'middle', 3);
  }, 0.9);
}
/** per-instance hazard blinkers still flashing on a dead vehicle */
function addBlinkers(root, pts, phase = 0, rate = 1.3, color = 0xffa020, geo = gRB(0.16, 0.05, 0.04, 0.015)) {
  const list = pts.map(p => { const m = new THREE.Mesh(geo, Glow(color, 3)); m.position.set(p[0], p[1], p[2]); root.add(m); return m; });
  let t0 = phase;
  root.userData.update = (dt) => { t0 += dt; const on = (t0 * rate) % 1 < 0.5; for (const m of list) m.visible = on; };
  return list;
}

/** autonomous sedan. ~4.75 x 1.92 x 1.5 m */
function car(opts = {}) {
  const seed = opts.seed ?? 1, wreck = !!opts.wrecked;
  const WCOLS = [0xb8ab94, 0x8a9198, 0xd8dada, 0x7a2328, 0x34506e, 0x5b6770];
  const color = opts.color ?? (wreck ? WCOLS[seed % WCOLS.length] : CAR_COLS[(seed * 5 + 2) % CAR_COLS.length]);
  const g = cachedKit(`car${color}|${wreck}|${seed}`, k => {
    const R = rng(seed + 17);
    const { body, can } = carGeos(wreck, seed);
    const drop = wreck ? 0.06 : 0, pm = paint(color, wreck ? 'soot' : 'grime');
    k.at(0, -drop, 0, wreck ? 0.02 : 0, 0, wreck ? R.range(-0.02, 0.02) : 0, () => {
      k.add(pm, body);
      k.add(wreck ? M.crackGlass : M.darkGlass, can);
      for (const z of [1.45, -1.45]) archLiner(k, 0, 0.25, z, 0.49, 1.7);
      k.rb(M.trim, 1.8, 0.08, 1.9, 0.035, 0, 0.27, 0);            // rocker
      k.rb(M.trim, 1.2, 0.1, 0.06, 0.03, 0, 0.4, wreck ? 1.86 : 2.345); // lower intake
      k.rb(M.trim, 1.4, 0.09, 0.06, 0.03, 0, 0.4, -2.35);            // diffuser
      if (!wreck) {
        k.rb(M.trim, 1.56, 0.06, 0.05, 0.02, 0, 0.6, 2.35);
        k.rb(Glow(0xeef6ff, 3.2), 1.5, 0.026, 0.05, 0.01, 0, 0.6, 2.365);
      } else {
        k.rb(M.darkGlass, 1.0, 0.03, 0.06, 0.012, -0.2, 0.58, 1.85, 0, 0.3, 0.1);
      }
      k.rb(M.trim, 1.66, 0.06, 0.05, 0.02, 0, 0.74, -2.345);
      k.rb(Glow(0xff1830, 2.4), 1.6, 0.026, 0.05, 0.01, 0, 0.74, -2.36);
      k.add(plateMat('HX·' + (4400 + seed * 37 % 600)), gPlane(0.42, 0.105), 0, 0.53, -2.378, 0, PI, 0);
      // sensor puck + side cameras
      k.add(M.darkGlass, gLathe([[0, 0.075], [0.05, 0.07], [0.085, 0.04], [0.1, 0]], 20), 0, 1.475, 0.25);
      k.cyl(M.alu, 0.104, 0.11, 0.025, 0, 1.47, 0.25, 0, 0, 0, 20);
      for (const sx of [-1, 1]) k.rb(M.trim, 0.06, 0.05, 0.16, 0.02, sx * 0.84, 0.99, 1.2);
    });
    const wy = wreck ? 0.3 : 0.362;
    for (const sx of [-1, 1]) for (const z of [1.45, -1.45]) wheel(k, sx * 0.83, wy, z, sx, 1, wreck && (z > 0 || R() < 0.5), wreck ? R.range(-0.2, 0.2) * (z > 0) : 0);
    if (wreck) {
      // driver door hanging open, dark cabin behind it
      k.add(M.black, gPlane(1.25, 0.6), 0.958, 0.61 - drop, 0.38, 0, PI / 2, 0);
      const dshape = new THREE.Shape(); dshape.moveTo(-0.25, 0.32); dshape.lineTo(1.0, 0.32); dshape.quadraticCurveTo(1.06, 0.32, 1.06, 0.4); dshape.lineTo(1.06, 0.92); dshape.lineTo(-0.25, 0.94); dshape.closePath();
      const door = gc('carDoor', () => smoothNormals(extrudeSide(dshape, 0.08, 0.03, 6, 2), 50));
      const win = gc('carDoorWin', () => shapeGeo([[0.12, 0.93], [1.0, 0.93], [0.55, 1.3], [-0.05, 1.34], [-0.2, 0.94]].map(p => [-p[0], p[1]])));
      k.at(0.94, -drop, 1.06, 0, -1.0, 0, () => {
        k.add(pm, door, 0, 0, -1.06);
        k.rb(M.trim, 0.02, 0.45, 1.05, 0.02, -0.045, 0.62, -0.5);
        k.add(M.crackGlass, win, 0.0, 0, -1.06, 0, PI / 2, 0);
      });
      shards(k, R, 40, 0.3, 2.2, 1.4, 0.6); shards(k, R, 20, 1.4, 0.4, 0.4, 1.0);
      sootPatch(k, 0, 1.5, 1.6, R);
      k.rb(M.darkGlass, 0.5, 0.03, 0.06, 0.012, 0.9, 0.02, 2.9, 0, 1.1, 0);
    }
    k.solidBox(0, 0.74, 0, 0.97, 0.74, 2.37);
  });
  if (wreck) addBlinkers(g, [[0.78, 0.68, -2.36], [-0.78, 0.68, -2.36]], seed * 0.37);
  return g;
}

function vanGeos(wreck, seed) {
  return gc('vanGeo' + (wreck ? 'w' + seed : ''), () => {
    const cr = crumpler(wreck, seed, 1.5, 2.7, 0.45);
    const axles = [1.75, -1.75], arch = archFn(axles, 0.52, 0.27), bot0 = curveFn([[-2.6, 0.3], [-2.4, 0.27], [2.35, 0.27], [2.6, 0.33]]);
    const all = loftGeo({
      z0: -2.6, z1: 2.6, nz: 100, endR0: 0.07, endR1: 0.09, rt: 0.16, rb: 0.07, sideYs: [1.36, 2.21], extraZ: archZs(axles, 0.52, 0.27, 0.27),
      top: curveFn([[-2.6, 2.34], [-2.45, 2.42], [-2.2, 2.44], [0.9, 2.44], [1.25, 2.41], [1.5, 2.22], [2.25, 1.36], [2.45, 1.16], [2.6, 1.05]]),
      bot: bot0, arch, hw: curveFn([[-2.6, 1.0], [-2.3, 1.02], [1.8, 1.02], [2.35, 0.99], [2.6, 0.93]]),
      shape: (x, y, z, hw, b, t) => [x * (1 - 0.035 * ss(1.9, 2.44, y) - 0.035 * ss(b + 0.18, b, y)), y + 0.03 * (1 - (x / hw) ** 2) * ss(t - 0.2, t, y)],
      deform: cr,
    });
    const [glass, body] = splitGeo(all, (c, n) => c.y > 1.37 && c.z > 0.78 && ((Math.abs(n.x) > 0.72 && c.y < 2.21) || (n.z > 0.3 && n.y < 0.86 && c.y < 2.3)));
    return { body, glass };
  });
}
function lumenLivery(logo = 'Lumen Parcel') {
  const words = String(logo).split(/\s+/), a = words[0].toUpperCase(), b = words.slice(1).join(' ').toUpperCase();
  return decal('livery_' + logo, 1024, 400, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,170,40,0)'); gr.addColorStop(0.25, 'rgba(255,170,40,0.95)'); gr.addColorStop(1, 'rgba(255,120,30,0.95)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h * 0.86); g.bezierCurveTo(w * 0.35, h * 0.86, w * 0.6, h * 0.6, w, h * 0.42); g.lineTo(w, h * 0.55); g.bezierCurveTo(w * 0.62, h * 0.72, w * 0.38, h * 0.95, 0, h * 0.95); g.fill();
    // mark: a lamp disc with rays
    const cx = 120, cy = 150; g.fillStyle = '#ffae2a'; g.beginPath(); g.arc(cx, cy, 52, 0, TAU); g.fill();
    g.fillStyle = '#1d2a36'; g.beginPath(); g.arc(cx, cy, 30, 0, TAU); g.fill(); g.fillStyle = '#ffae2a'; g.beginPath(); g.arc(cx, cy, 14, 0, TAU); g.fill();
    g.strokeStyle = '#ffae2a'; g.lineWidth = 9; for (let i = 0; i < 6; i++) { const an = -PI / 2 + (i - 2.5) * 0.36; g.beginPath(); g.moveTo(cx + Math.cos(an) * 62, cy + Math.sin(an) * 62); g.lineTo(cx + Math.cos(an) * 82, cy + Math.sin(an) * 82); g.stroke(); }
    txt(g, a, 205, 140, 118, '#1d2a36', 800, 'left', 'middle', 6);
    if (b) txt(g, b, 210, 225, 54, '#e08a12', 600, 'left', 'middle', 14);
    txt(g, 'SAME-HOUR  ·  EVERY HOUR  ·  ' + a.toLowerCase() + '.civ', 210, 280, 26, '#3b4a56', 500, 'left');
    txt(g, 'FLEET 07-221', w - 30, 30, 22, '#3b4a56', 500, 'right');
  });
}
/** delivery van ~5.35 x 2.06 x 2.46 m */
function van(opts = {}) {
  const wreck = !!opts.wrecked, color = opts.color ?? 0xe6e8e7, logo = opts.logo ?? 'Lumen Parcel', seed = opts.seed ?? 3;
  const g = cachedKit(`van${color}|${wreck}|${logo}|${seed}`, k => {
    const R = rng(seed + 5), drop = wreck ? 0.06 : 0, pm = paint(color, wreck ? 'soot' : 'grime');
    const { body, glass } = vanGeos(wreck, seed);
    k.at(0, -drop, 0, wreck ? 0.015 : 0, 0, 0, () => {
      k.add(pm, body); k.add(wreck ? M.crackGlass : M.darkGlass, glass);
      for (const z of [1.75, -1.75]) archLiner(k, 0, 0.27, z, 0.51, 1.86);
      const liv = lumenLivery(logo);
      k.add(liv, gPlane(3.2, 1.25), 1.021, 1.3, -0.95, 0, PI / 2, 0);
      k.add(liv, gPlane(3.2, 1.25), -1.021, 1.3, -0.95, 0, -PI / 2, 0);
      k.rb(M.trim, 1.98, 0.12, 2.55, 0.04, 0, 0.3, 0);
      k.rb(M.trim, 1.4, 0.2, 0.06, 0.03, 0, 0.56, wreck ? 2.25 : 2.675);
      k.rb(M.trim, 1.78, 0.07, 0.05, 0.02, 0, 0.93, wreck ? 2.25 : 2.672);
      if (!wreck) k.rb(Glow(0xeef6ff, 3), 1.7, 0.03, 0.05, 0.012, 0, 0.93, 2.685);
      for (const sx of [-1, 1]) k.rb(Glow(0xff1a2a, 2.2), 0.06, 1.0, 0.04, 0.02, sx * 0.9, 1.25, -2.665);
      k.box(M.trim, 0.012, 1.95, 0.01, 0, 1.3, -2.666);
      k.add(liv, gPlane(1.3, 0.5), 0.45, 1.85, -2.667, 0, PI, 0);
      k.box(M.trim, 1.6, 0.06, 0.08, 0, 0.42, -2.66);
      k.add(plateMat('LP·' + (1000 + seed * 53 % 900)), gPlane(0.42, 0.105), -0.45, 0.6, -2.69, 0, PI, 0);
      for (const sx of [-1, 1]) k.rb(M.trim, 0.06, 0.08, 0.22, 0.025, sx * 1.04, 1.95, 1.3);
      k.rb(M.darkGlass, 0.5, 0.05, 0.12, 0.02, 0, 2.45, 1.2);
    });
    const wy = wreck ? 0.31 : 0.38;
    for (const sx of [-1, 1]) for (const z of [1.75, -1.75]) wheel(k, sx * 0.88, wy, z, sx, 1.05, wreck && (z > 0 || R() < 0.5));
    if (wreck) {
      // rear left door swung open, parcels spilled
      k.add(M.black, gPlane(0.95, 1.85), -0.5, 1.25 - drop, -2.672, 0, PI, 0);
      k.at(-1.0, -drop, -2.66, 0, 1.9, 0, () => { k.rb(pm, 0.97, 1.85, 0.05, 0.02, 0.49, 1.27, 0); k.rb(M.trim, 0.85, 1.6, 0.02, 0.01, 0.49, 1.27, 0.03); k.rb(Glow(0x401010, 1), 0.06, 1.0, 0.04, 0.02, 0.09, 1.25, -0.03); });
      for (let i = 0; i < 6; i++) { const s = R.range(0.3, 0.55); k.rb(M.cardboard, s, s * 0.7, s * 0.9, 0.01, R.range(-1.2, 0.4), s * 0.35, -2.9 - R() * 1.2, 0, R() * TAU, 0); }
      shards(k, R, 40, 0.3, 2.6, 1.3, 0.5); sootPatch(k, 0, 2.0, 1.6, R);
    }
    k.solidBox(0, 1.23, 0, 1.03, 1.23, 2.67);
  });
  if (wreck) addBlinkers(g, [[0.92, 0.69, -2.675]], seed * 0.21);
  return g;
}

function halcyonLivery() {
  return decal('halcyon', 2048, 226, (g, w, h) => {
    g.fillStyle = 'rgba(16,132,142,0.96)'; g.fillRect(0, h * 0.7, w, h * 0.13);
    g.fillStyle = 'rgba(232,178,58,0.96)'; g.fillRect(0, h * 0.86, w, h * 0.04);
    // mark: a kingfisher wing in an arc
    const cx = 90, cy = 74; g.strokeStyle = '#10848e'; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, 52, PI * 0.8, PI * 2.2); g.stroke();
    g.fillStyle = '#1c3a44'; g.beginPath(); g.moveTo(cx - 38, cy + 10); g.quadraticCurveTo(cx, cy - 46, cx + 44, cy - 14); g.quadraticCurveTo(cx + 6, cy - 10, cx - 38, cy + 10); g.fill();
    g.fillStyle = '#e8b23a'; g.beginPath(); g.arc(cx + 20, cy + 14, 8, 0, TAU); g.fill();
    txt(g, 'HALCYON', 168, 62, 70, '#1c3a44', 800, 'left', 'middle', 10);
    txt(g, 'TRANSIT', 172, 118, 34, '#10848e', 500, 'left', 'middle', 22);
    g.fillStyle = '#10848e'; rr(g, w - 360, 26, 120, 100, 14); g.fill(); txt(g, '14', w - 300, 78, 68, '#fff', 800);
    txt(g, 'MERIDIAN', w - 220, 58, 34, '#1c3a44', 700, 'left'); txt(g, 'CIVIC CENTRE', w - 220, 100, 26, '#3a5560', 500, 'left');
    txt(g, 'HT-2071-0447  ·  AUTONOMOUS  ·  32 PAX', w / 2, 142, 18, 'rgba(255,255,255,0.9)', 500, 'center', 'middle', 4);
  });
}
function destSign(text, col) {
  return glowTex('dest' + text, 512, 96, (g, w, h) => {
    g.fillStyle = '#050506'; g.fillRect(0, 0, w, h);
    txt(g, text, w / 2, h / 2 + 2, 52, col, 700, 'center', 'middle', 4);
    g.fillStyle = 'rgba(0,0,0,0.55)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1.5, h); for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
  }, 1.8);
}
/** autonomous city pod, 10 x 2.6 x 3.2 m, bidirectional; interior visible through the glass band */
function transitPod(opts = {}) {
  const wreck = !!opts.wrecked;
  const g = cachedKit('pod' + wreck, k => {
    const R = rng(77), pm = paint(0xe9ebeb, wreck ? 'soot' : 'grime');
    const geos = gc('podGeo', () => {
      const hw = d => curveFn([[-4.86, 1.1 - d], [-4.4, 1.25 - d], [-3.7, 1.3 - d], [3.7, 1.3 - d], [4.4, 1.25 - d], [4.86, 1.1 - d]]);
      const axles = [3.4, -3.4], arch = archFn(axles, 0.56, 0.3), bot0 = curveFn([[-4.86, 0.38], [-4.6, 0.3], [4.6, 0.3], [4.86, 0.38]]);
      const ends = []; for (let z = 3.6; z < 4.86; z += 0.12) ends.push(z, -z);
      const skirt = loftGeo({ z0: -4.86, z1: 4.86, nz: 12, endR: 0.14, rt: 0.06, rb: 0.12, seg: 4, top: () => 1.28, bot: bot0, arch, hw: hw(0), extraZ: archZs(axles, 0.56, 0.3, 0.3).concat(ends) });
      const roof = loftGeo({ z0: -4.86, z1: 4.86, nz: 8, endR: 0.14, rt: 0.2, rb: 0.03, seg: 4, top: curveFn([[-4.86, 2.95], [-4.5, 3.1], [-4.0, 3.14], [4.0, 3.14], [4.5, 3.1], [4.86, 2.95]]), bot: () => 2.62, hw: hw(0), extraZ: ends });
      const glass = loftGeo({ z0: -4.86, z1: 4.86, nz: 6, endR: 0.1, rt: 0.04, rb: 0.04, seg: 3, top: () => 2.72, bot: () => 1.18, hw: hw(0.04), extraZ: ends });
      return { skirt, roof, glass };
    });
    k.at(0, wreck ? -0.05 : 0, 0, 0, 0, wreck ? 0.02 : 0, () => {
      k.add(pm, geos.skirt); k.add(pm, geos.roof);
      k.add(wreck ? M.crackClear : Mat('glass'), geos.glass);
      for (const z of [3.4, -3.4]) archLiner(k, 0, 0.3, z, 0.55, 2.4);
      const liv = halcyonLivery();
      k.add(liv, gPlane(5.8, 0.64), 1.302, 0.8, 0, 0, PI / 2, 0);
      k.add(liv, gPlane(5.8, 0.64), -1.302, 0.8, 0, 0, -PI / 2, 0);
      // interior
      k.box(Flat(0x30353a, 0.8, 0.1), 2.3, 0.04, 9.0, 0, 0.64, 0);
      k.box(M.trim, 2.2, 0.03, 9.0, 0, 2.6, 0);
      const seat = (x, z, side) => k.at(x, 0.66, z, 0, -side * PI / 2, 0, () => {
        k.box(M.white, 0.5, 0.06, 0.46, 0, 0.4, 0);
        k.rb1(M.seat, 0.46, 0.08, 0.42, 0.035, 0, 0.47, 0.01);
        k.rb1(M.seat, 0.46, 0.5, 0.07, 0.03, 0, 0.8, -0.2, -0.08);
        k.box(M.white, 0.5, 0.56, 0.03, 0, 0.8, -0.245, -0.08);
      });
      for (const side of [-1, 1]) for (const z0 of [-4.0, 1.55]) for (let i = 0; i < 5; i++) {
        if (wreck && R() < 0.2) continue;
        seat(side * 0.98, z0 + i * 0.52, side);
      }
      if (wreck) for (let i = 0; i < 3; i++) k.at(R.range(-0.5, 0.5), 0.68, R.range(-3, 3), R.range(-1.4, 1.4), R() * TAU, 0, () => { k.rb(M.seat, 0.46, 0.08, 0.42, 0.035, 0, 0.0, 0); k.rb(M.white, 0.5, 0.56, 0.04, 0.015, 0, 0.25, -0.2); });
      for (const z of [-3.2, -1.25, 1.25, 3.2]) for (const x of [-0.45, 0.45]) k.cyl(M.alu, 0.02, 0.02, 1.95, x, 1.62, z, 0, 0, 0, 10);
      for (const x of [-0.62, 0.62]) k.add(M.alu, gCyl(0.017, 0.017, 9, 8), x, 2.35, 0, PI / 2, 0, 0);
      if (!wreck) for (const x of [-0.75, 0.75]) k.rb(Glow(0xe2f2ff, 1.6), 0.12, 0.02, 8.4, 0.008, x, 2.582, 0);
      // pillars
      for (const z of [-3.9, -2.4, 2.4, 3.9]) for (const sx of [-1, 1]) k.rb(M.trim, 0.05, 1.42, 0.12, 0.02, sx * 1.255, 1.94, z);
      k.rb(M.trim, 0.05, 1.42, 0.12, 0.02, -1.255, 1.94, 0);
      // sliding doors on +X
      const leaf = (z) => { k.rb(pm, 0.05, 0.78, 0.98, 0.02, 1.31, 0.86, z); for (const dz of [-0.47, 0.47]) k.rb(M.trim, 0.05, 2.1, 0.05, 0.01, 1.315, 1.5, z + dz); k.rb(M.trim, 0.05, 0.05, 0.98, 0.01, 1.315, 2.52, z); k.rb(M.trim, 0.05, 0.04, 0.98, 0.01, 1.315, 1.26, z); };
      leaf(-0.5); leaf(wreck ? 1.35 : 0.5);
      if (wreck) k.add(M.black, gPlane(0.98, 0.8), 1.32, 0.86, 0.5, 0, PI / 2, 0);
      k.rb(wreck ? M.trim : Glow(0x40e0c8, 2.2), 0.04, 0.03, 1.9, 0.01, 1.3, 2.6, 0);
      // ends: light bars + destination signs + sensors
      for (const e of [1, -1]) {
        const ez = e * 4.98;
        if (!wreck) k.rb(Glow(e > 0 ? 0xeef6ff : 0xff2030, e > 0 ? 3 : 2.2), 1.2, 0.04, 0.05, 0.015, 0, 1.0, e * 4.99);
        k.rb(M.trim, 1.35, 0.1, 0.06, 0.02, 0, 1.0, e * 4.975);
        k.rb(M.trim, 1.75, 0.38, 0.04, 0.02, 0, 2.43, e * 4.84);
        k.add(wreck ? destSign('OUT OF SERVICE', '#ff3a2a') : destSign('14  MERIDIAN', '#ffb23a'), gPlane(1.6, 0.3), 0, 2.43, e * 4.865, 0, e > 0 ? 0 : PI, 0);
        k.add(M.darkGlass, gLathe([[0, 0.08], [0.06, 0.075], [0.1, 0.04], [0.11, 0]], 18), 0, 3.12, e * 4.3);
      }
      k.rb(pm, 1.7, 0.22, 5.0, 0.09, 0, 3.2, 0);
      k.rb(M.grey, 1.2, 0.06, 2.0, 0.03, 0, 3.33, 0);
      if (!wreck) for (const sx of [-1, 1]) k.rb(Glow(0x30d0d8, 1.8), 0.025, 0.025, 7.6, 0.01, sx * 1.22, 2.66, 0);
      if (wreck) {
        // the mark, sprayed across the flank
        const gm = decal('glyphSpray', 256, 256, (gg, w, h) => { drawGlyph(gg, w / 2, h / 2, w * 0.38, 'rgba(200,20,24,0.92)', 0.16); });
        k.add(gm, gPlane(1.1, 1.1), -1.304, 0.95, 2.0, 0, -PI / 2, 0);
      }
    });
    for (const sx of [-1, 1]) for (const z of [3.4, -3.4]) wheel(k, sx * 1.0, wreck && sx > 0 ? 0.36 : 0.42, z, sx, 1.15, wreck && sx > 0);
    if (!wreck) { k.light(0, 2.3, -2.5, 0xdff0ff, 1.2, 6); k.light(0, 2.3, 2.5, 0xdff0ff, 1.2, 6); }
    if (wreck) { shards(k, rng(3), 60, 1.6, 0, 0.5, 4); sootPatch(k, -0.5, -3.5, 2.0, R); }
    k.solidBox(0, 1.6, 0, 1.3, 1.6, 5.0);
  });
  return g;
}

/* ================= street furniture ================= */
const POLE_MAT = () => matte(0xaeb4b8, 'grime', 0.45, 0.4);
/** tall slender lamp post with a cantilevered LED blade, ~7.4 m */
function streetLight(opts = {}) {
  const broken = !!opts.broken;
  return cachedKit('streetLight' + broken, k => {
    const R = rng(broken ? 9 : 4), pm = POLE_MAT();
    k.add(M.gunmetal, gLathe([[0, 0], [0.17, 0], [0.17, 0.03], [0.14, 0.06], [0.115, 0.3], [0.1, 0.34], [0, 0.34]], 24));
    k.at(0, 0, 0, broken ? 0.03 : 0, 0, broken ? 0.07 : 0, () => {
      k.add(pm, gLathe([[0, 0.3], [0.095, 0.3], [0.085, 2.5], [0.065, 5.5], [0.055, 7.2], [0.06, 7.28], [0, 7.3]], 20));
      k.cyl(M.trim, 0.1, 0.1, 0.04, 0, 2.6, 0, 0, 0, 0, 20);
      k.add(decal('lampTag', 128, 256, (g, w, h) => { g.fillStyle = '#2b3a46'; rr(g, 4, 4, w - 8, h - 8, 10); g.fill(); txt(g, 'CC', w / 2, 40, 34, '#e8eef2'); txt(g, 'ST', w / 2, 84, 30, '#9fc6dc'); txt(g, '4471', w / 2, 140, 30, '#e8eef2'); g.fillStyle = '#e8b23a'; g.fillRect(16, 180, w - 32, 8); txt(g, 'CALL 311', w / 2, 220, 18, '#cfd8de', 500); }), gPlane(0.1, 0.2), 0, 2.2, 0.092, -0.01);
      // head: blade with LED underside; pivot at the pole top
      k.at(0, 7.22, 0, broken ? 1.05 : -0.04, 0, 0, () => {
        k.rb(pm, 0.16, 0.12, 0.3, 0.05, 0, 0, 0.05);
        k.rb(M.white, 0.34, 0.07, 1.75, 0.035, 0, 0.02, 0.95);
        k.rb(M.trim, 0.27, 0.03, 1.45, 0.012, 0, -0.02, 1.0);
        k.rb(broken ? M.crackGlass : Glow(0xfff0d8, 3.2), 0.2, 0.012, 1.32, 0.005, 0, -0.035, 1.0);
        k.rb(M.darkGlass, 0.2, 0.03, 0.16, 0.012, 0, 0.065, 1.55);
      });
    });
    if (!broken) k.light(0, 7.0, 1.0, 0xffe6c4, 2.6, 18);
    else shards(k, R, 25, 0.0, 1.0, 0.6, 0.6);
    k.solidBox(0, 3.65, 0, 0.13, 3.65, 0.13);
  });
}

/** mast-arm traffic signal stuck on flashing amber */
function trafficLight(opts = {}) {
  const g = cachedKit('trafficLight', k => {
    const pm = matte(0x3a4046, 'grime', 0.45, 0.5);
    k.add(M.gunmetal, gLathe([[0, 0], [0.22, 0], [0.22, 0.05], [0.16, 0.12], [0.13, 0.4], [0, 0.4]], 20));
    k.add(pm, gLathe([[0, 0.35], [0.11, 0.35], [0.1, 3], [0.085, 5.6], [0, 5.65]], 18));
    // arm reaching over the road (+X)
    k.add(pm, gCyl(0.06, 0.08, 4.4, 14), 2.15, 5.3, 0, 0, 0, PI / 2);
    k.rod(pm, 0.03, [0.05, 4.4, 0], [1.6, 5.28, 0]);
    k.rb(pm, 0.2, 0.25, 0.2, 0.04, 0, 5.3, 0);
    const head = (x) => k.at(x, 4.75, 0.05, () => {
      k.rb(M.dark, 0.36, 1.06, 0.26, 0.07, 0, 0, 0);
      k.rb(M.trim, 0.42, 1.12, 0.03, 0.03, 0, 0, -0.14);
      k.rod(pm, 0.025, [0, 0.53, 0], [0, 0.58, 0]);
      for (const [i, c] of [[1, 0x3a0b0b], [0, 0x3a2a08], [-1, 0x0b2a14]].map(a => a)) {
        k.add(Flat(c, 0.2, 0.1), gCircle(0.11, 24), 0, i * 0.32, 0.131);
        k.add(archMat(), gCyl(0.135, 0.135, 0.16, 18, true, PI / 2, PI), 0, i * 0.32 + 0.0, 0.2, PI / 2, 0, 0);
      }
    });
    head(2.4); head(3.9);
    // pedestrian signal + call button
    k.rb(M.dark, 0.3, 0.36, 0.2, 0.04, 0, 2.7, 0.2);
    k.add(glowTex('pedSig', 128, 160, (gg, w, h) => { gg.fillStyle = '#060606'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#ff5a1a'; gg.beginPath(); gg.arc(64, 34, 12, 0, TAU); gg.fill(); gg.fillRect(54, 50, 20, 52); gg.fillRect(40, 54, 14, 40); gg.fillRect(74, 54, 14, 40); gg.fillRect(54, 100, 8, 44); gg.fillRect(66, 100, 8, 44); scan(gg, w, h, 0.4); }, 1.4), gPlane(0.22, 0.28), 0, 2.7, 0.302);
    k.rb(M.white, 0.12, 0.2, 0.08, 0.02, 0, 1.15, 0.12);
    k.cyl(Flat(0x2a7fa8, 0.3, 0.2), 0.03, 0.03, 0.02, 0, 1.17, 0.165, PI / 2, 0, 0, 16);
    k.light(3.15, 4.75, 0.6, 0xffa020, 1.6, 10);
    k.solidBox(0, 2.8, 0, 0.15, 2.8, 0.15);
  });
  // flashing amber lenses (per instance)
  const on = Glow(0xffa424, 3.5), list = [];
  for (const x of [2.4, 3.9]) { const m = new THREE.Mesh(gCircle(0.108, 24), on); m.position.set(x, 4.75, 0.183); g.add(m); list.push(m); }
  let t0 = 0; const L = g.userData.lights[0];
  g.userData.update = (dt) => { t0 += dt; const lit = (t0 * 0.9) % 1 < 0.55; for (const m of list) m.visible = lit; L.intensity = lit ? 1.6 : 0; };
  return g;
}

function bollard() {
  return cachedKit('bollard', k => {
    k.add(M.steel, gLathe([[0, 0], [0.11, 0], [0.11, 0.015], [0.1, 0.03], [0.1, 0.86], [0.096, 0.91], [0.075, 0.945], [0.04, 0.958], [0, 0.96]], 28));
    k.cyl(Glow(0x9fe4ff, 2), 0.102, 0.102, 0.022, 0, 0.8, 0, 0, 0, 0, 28);
    k.cyl(M.trim, 0.103, 0.103, 0.01, 0, 0.82, 0, 0, 0, 0, 28);
    k.cyl(Flat(0xd8d8c8, 0.3, 0.1), 0.101, 0.101, 0.05, 0, 0.6, 0, 0, 0, 0, 28);
    k.solidBox(0, 0.48, 0, 0.11, 0.48, 0.11);
  });
}

function jerseyBarrier(opts = {}) {
  const text = opts.text ?? 'CIVIC CONCORD  ·  ROAD CLOSED';
  return cachedKit('jersey' + text, k => {
    const geo = gc('jerseyGeo', () => {
      const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.08); s.lineTo(0.19, 0.32); s.lineTo(0.085, 0.8); s.quadraticCurveTo(0.08, 0.81, 0.07, 0.81); s.lineTo(-0.07, 0.81); s.quadraticCurveTo(-0.08, 0.81, -0.085, 0.8); s.lineTo(-0.19, 0.32); s.lineTo(-0.3, 0.08); s.closePath();
      const g = extrudeSide(s, 3.0, 0.025, 4, 2); // shape x -> Z, extrusion -> X
      return smoothNormals(g, 35);
    });
    k.add(M.concrete, geo);
    const sten = decal('stencil' + text, 1024, 128, (g, w, h) => {
      g.fillStyle = 'rgba(30,30,30,0.0)'; g.fillRect(0, 0, w, h);
      let fs = 74; g.font = `700 ${fs}px ${FONT}`; while (g.measureText(text).width > w * 0.94 && fs > 20) { fs -= 2; g.font = `700 ${fs}px ${FONT}`; } g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(235,235,225,0.9)'; g.fillText(text, w / 2, h / 2 + 4);
      // stencil bridges + overspray
      g.globalCompositeOperation = 'destination-out'; for (let x = 0; x < w; x += 23) g.fillRect(x, h * 0.48, 3, 7);
      g.globalCompositeOperation = 'source-over'; const R = rng(text.length); blots(g, w, h, R, 40, 2, 8, '235,235,225', 0.1, 0.3);
    }, { rough: 0.9 });
    const ang = Math.atan2(0.105, 0.48);
    k.add(sten, gPlane(2.6, 0.32), 0, 0.56, 0.138, -ang, 0, 0);
    k.add(sten, gPlane(2.6, 0.32), 0, 0.56, -0.138, ang, PI, 0);
    for (const x of [-1.2, 1.2]) { k.add(Glow(0xff9a20, 0.7), gPlane(0.12, 0.05), x, 0.66, 0.119, -ang); k.add(M.black, gPlane(0.34, 0.06), x * 0.8, 0.04, 0.302); k.add(M.black, gPlane(0.34, 0.06), x * 0.8, 0.04, -0.302, 0, PI, 0); }
    k.solidBox(0, 0.41, 0, 1.5, 0.41, 0.3);
  });
}

function policeBarrier() {
  const g = cachedKit('policeBarrier', k => {
    const tube = matte(0xd8dcdc, 'grime', 0.4, 0.5);
    for (const x of [-0.9, 0.9]) {
      k.rod(tube, 0.022, [x, 0, 0.32], [x, 1.02, 0.02]); k.rod(tube, 0.022, [x, 0, -0.32], [x, 1.02, -0.02]);
      k.rod(tube, 0.015, [x, 0.3, 0.24], [x, 0.3, -0.24]);
      k.rb(M.rubber, 0.06, 0.03, 0.08, 0.01, x, 0.015, 0.32); k.rb(M.rubber, 0.06, 0.03, 0.08, 0.01, x, 0.015, -0.32);
      k.rb(M.gunmetal, 0.08, 0.08, 0.1, 0.02, x, 1.0, 0);
    }
    const sign = decal('evacBoard', 1024, 160, (gg, w, h) => {
      gg.fillStyle = '#f2f2ec'; gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#e0541c'; gg.fillRect(0, 0, w, 18); gg.fillRect(0, h - 18, w, 18);
      txt(gg, 'EVACUATION ROUTE', w * 0.44, h / 2 + 3, 86, '#1c2328', 800, 'center', 'middle', 4);
      gg.fillStyle = '#e0541c'; gg.beginPath(); gg.moveTo(w - 150, h / 2 - 34); gg.lineTo(w - 70, h / 2); gg.lineTo(w - 150, h / 2 + 34); gg.lineTo(w - 150, h / 2 + 14); gg.lineTo(w - 210, h / 2 + 14); gg.lineTo(w - 210, h / 2 - 14); gg.lineTo(w - 150, h / 2 - 14); gg.fill();
      const R = rng(3); blots(gg, w, h, R, 25, 10, 50, '60,55,45', 0.1, 0.3); streaks(gg, w, h, R, 30, '60,55,45', 0.2, 0.6);
    }, { rough: 0.6 });
    const chev = decal('chevBoard', 512, 64, (gg, w, h) => { gg.fillStyle = '#f2f2ec'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#e0541c'; for (let x = -64; x < w; x += 64) { gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x + 32, 0); gg.lineTo(x + 64, h); gg.lineTo(x + 32, h); gg.fill(); } const R = rng(5); blots(gg, w, h, R, 20, 5, 30, '60,55,45', 0.1, 0.3); }, { rough: 0.6 });
    k.rb(M.white, 2.1, 0.32, 0.03, 0.01, 0, 0.84, 0.0);
    k.add(sign, gPlane(2.08, 0.3), 0, 0.84, 0.016); k.add(sign, gPlane(2.08, 0.3), 0, 0.84, -0.016, 0, PI, 0);
    k.rb(M.white, 2.1, 0.14, 0.025, 0.01, 0, 0.5, 0.0);
    k.add(chev, gPlane(2.08, 0.13), 0, 0.5, 0.0135); k.add(chev, gPlane(2.08, 0.13), 0, 0.5, -0.0135, 0, PI, 0);
    k.add(M.dark, gLathe([[0, 0], [0.07, 0], [0.07, 0.04], [0, 0.04]], 16), 0.9, 1.04, 0);
    k.add(mc('amberLens', () => new THREE.MeshStandardMaterial({ color: 0x7a4a10, roughness: 0.2, transparent: true, opacity: 0.85 })), gLathe([[0, 0.13], [0.04, 0.12], [0.06, 0.06], [0.06, 0]], 16), 0.9, 1.08, 0);
    k.light(0.9, 1.15, 0, 0xffa020, 0.8, 6);
    k.solidBox(0, 0.52, 0, 1.0, 0.52, 0.32);
  });
  const lamp = new THREE.Mesh(gLathe([[0, 0.125], [0.038, 0.115], [0.056, 0.06], [0.056, 0]], 16), Glow(0xffa020, 3.5)); lamp.position.set(0.9, 1.08, 0); g.add(lamp);
  let t0 = Math.random(); const L = g.userData.lights[0];
  g.userData.update = dt => { t0 += dt; const on = (t0 * 1.6) % 1 < 0.3; lamp.visible = on; L.intensity = on ? 0.8 : 0; };
  return g;
}

function cone() {
  return cachedKit('cone', k => {
    const t = ctex('coneTex', 64, 256, (g, w, h) => { g.fillStyle = '#e8561a'; g.fillRect(0, 0, w, h); g.fillStyle = '#eef0ee'; g.fillRect(0, h * 0.52, w, h * 0.115); g.fillRect(0, h * 0.35, w, h * 0.07); const R = rng(2); blots(g, w, h, R, 20, 4, 20, '40,30,20', 0.1, 0.4); });
    const m = mc('coneMat', () => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }));
    const pts = [[0.16, 0.035]]; for (let i = 0; i <= 10; i++) pts.push([0.15 - 0.11 * i / 10, 0.06 + 0.64 * i / 10]); pts.push([0.03, 0.72], [0, 0.725]);
    k.add(m, gLathe(pts, 24));
    k.rb(Flat(0x1b1b1c, 0.8), 0.38, 0.035, 0.38, 0.03, 0, 0.0175, 0);
    k.solidBox(0, 0.36, 0, 0.17, 0.36, 0.17);
  });
}

/* ---------- trash ---------- */
const BAG_MATS = () => [Mat('trash'), Mat('trash'), Flat(0x2b3138, 0.3, 0.05), Flat(0x1f2b22, 0.35, 0.05), Flat(0x3a3f47, 0.3, 0.05), Flat(0x2c2f52, 0.35, 0.05)];
function bagGeo(seed, detail = 3) {
  return gc('bag' + seed + '|' + detail, () => {
    const g = new THREE.IcosahedronGeometry(0.3, detail), P = g.attributes.position, v = new V3(), s = seed * 0.71;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      // lumpy contents + plastic wrinkles
      const n = 1 + 0.16 * n3(v.x * 5, v.y * 5, v.z * 5, s) + 0.07 * n3(v.x * 11, v.y * 11, v.z * 11, s + 4) + 0.018 * Math.sin(v.x * 60 + v.y * 23 + s) * Math.sin(v.z * 47 - v.y * 31);
      v.multiplyScalar(n);
      // boxy-ish: push the silhouette out towards a rounded cube
      const m = Math.max(Math.abs(v.x), Math.abs(v.z)) / (Math.hypot(v.x, v.z) || 1); v.x /= 0.75 + 0.25 * m; v.z /= 0.75 + 0.25 * m;
      if (v.y < 0) v.y *= 0.5;                                    // sags flat on the ground
      v.y *= 0.88;
      const neck = ss(0.2, 0.3, v.y); v.x *= 1 - neck * 0.8; v.z *= 1 - neck * 0.8; v.y += neck * 0.04;
      P.setXYZ(i, v.x, v.y + 0.15, v.z);
    }
    smoothNormals(g, 70);
    return g;
  });
}
function addBag(k, R, x, z, y = 0, s = 1, detail = 3) {
  const mats = BAG_MATS(), m = mats[Math.floor(R() * mats.length)];
  const seed = Math.floor(R() * 6), sy = s * (0.8 + R() * 0.4), rx = (R() - 0.5) * 0.3, rz = (R() - 0.5) * 0.3;
  k.add(m, bagGeo(seed, detail), x, y, z, rx, R() * TAU, rz, s * (0.9 + R() * 0.3), sy, s * (0.9 + R() * 0.3));
  const tx = x - rz * 0.45 * sy, ty = y + 0.44 * sy, tz = z + rx * 0.45 * sy, ta = R() * TAU;
  k.add(m, gSph(0.04, 8, 6), tx + Math.cos(ta) * 0.03, ty, tz + Math.sin(ta) * 0.03, 0, ta, 0.6, 1.4, 0.5, 0.8);
  k.add(m, gSph(0.04, 8, 6), tx - Math.cos(ta) * 0.03, ty, tz - Math.sin(ta) * 0.03, 0, ta, -0.6, 1.4, 0.5, 0.8);
}
function trashBags(opts = {}) {
  const n = opts.n ?? 4, seed = opts.seed ?? 1;
  return cachedKit(`bags${n}|${seed}`, k => {
    const R = rng(seed * 13 + n);
    const pts = [];
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0; do { const a = R() * TAU, r = Math.sqrt(R()) * (0.25 + n * 0.1); x = Math.cos(a) * r; z = Math.sin(a) * r; tries++; } while (tries < 20 && pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 0.42));
      const stacked = i >= 3 && R() < 0.4; const p = stacked ? pts[Math.floor(R() * pts.length)] : null;
      if (p) addBag(k, R, p[0] + (R() - 0.5) * 0.2, p[1] + (R() - 0.5) * 0.2, 0.28, 0.85); else { addBag(k, R, x, z); pts.push([x, z]); }
    }
    let mx = 0.4; for (const p of pts) mx = Math.max(mx, Math.abs(p[0]) + 0.35, Math.abs(p[1]) + 0.35);
    k.solidBox(0, 0.25, 0, mx, 0.25, mx);
  });
}
function dumpster(opts = {}) {
  const open = !!opts.open;
  return cachedKit('dumpster' + open, k => {
    const R = rng(open ? 3 : 4);
    const body = gc('dumpBody', () => deform(roundBoxGeo(1.9, 1.05, 1.1, 0.06, 2), v => { const t = (v.y + 0.525) / 1.05; v.z *= 0.88 + 0.12 * t; v.z += (1 - t) * 0.05; }));
    const bm = Mat('metalBlue');
    k.add(bm, body, 0, 0.67, 0);
    for (const x of [-0.97, 0.97]) { k.rb(M.gunmetal, 0.06, 0.1, 0.9, 0.02, x, 1.0, 0); k.cyl(M.gunmetal, 0.04, 0.04, 0.12, x * 1.02, 0.85, 0, 0, 0, PI / 2, 10); }
    k.rb(M.gunmetal, 1.96, 0.06, 1.18, 0.02, 0, 1.2, 0);
    k.rb(M.gunmetal, 1.86, 0.1, 0.06, 0.02, 0, 0.42, 0.55);
    for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.42]) { k.rb(M.gunmetal, 0.08, 0.06, 0.08, 0.01, x, 0.17, z); k.add(M.rubber, gCyl(0.065, 0.065, 0.05, 14), x, 0.07, z + 0.03, 0, 0, PI / 2); }
    k.add(decal('dumpDecal', 512, 192, (g, w, h) => { g.fillStyle = 'rgba(232,232,220,0.92)'; txt(g, 'CIVIC SANITATION', w / 2, 52, 50, 'rgba(235,235,225,0.92)', 800); txt(g, 'UNIT 12-B  ·  NO HAZARDOUS WASTE', w / 2, 112, 26, 'rgba(235,235,225,0.85)', 500); g.fillStyle = 'rgba(235,180,40,0.9)'; g.fillRect(40, 150, w - 80, 10); }), gPlane(1.2, 0.45), 0, 0.82, 0.553, -0.02);
    const lid = (x) => k.at(x, 1.24, -0.6, open ? -2.2 : 0.06, 0, 0, () => { k.rb(Flat(0x1d2a24, 0.5, 0.05), 0.94, 0.05, 1.18, 0.02, 0, 0.0, 0.59); k.rb(Flat(0x1d2a24, 0.5, 0.05), 0.9, 0.03, 0.06, 0.01, 0, 0.0, 1.17); });
    lid(-0.48); lid(0.48);
    if (open) for (let i = 0; i < 5; i++) addBag(k, R, R.range(-0.6, 0.6), R.range(-0.3, 0.3), 1.0, 0.95, 2);
    k.solidBox(0, 0.62, 0, 0.97, 0.62, 0.58);
  });
}

/* ---------- broken electronics (pile, kiosks) ---------- */
function brokenMonitor(k, R) {
  k.rb(M.dark, 0.62, 0.38, 0.04, 0.012, 0, 0, 0);
  k.add(M.crackGlass, gPlane(0.58, 0.34), 0, 0, 0.0205);
  k.rb(M.dark, 0.05, 0.18, 0.04, 0.01, 0, -0.26, -0.03, 0.4, 0, 0);
}
function keyboard(k) {
  k.rb(Flat(0xc9cccc, 0.5), 0.44, 0.02, 0.14, 0.008, 0, 0, 0);
  k.add(decal('keys', 256, 80, (g, w, h) => { g.fillStyle = '#d8dada'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a3e42'; for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) if (Math.sin(r * 7 + c * 3) > -0.85) g.fillRect(6 + c * 16.5, 6 + r * 18, 13, 14); }), gPlane(0.42, 0.12), 0, 0.0105, 0, -PI / 2, 0, 0);
}
function cables(k, R, n, cx, cz, spread, y0) {
  for (let i = 0; i < n; i++) {
    const pts = []; let x = cx + (R() - 0.5) * spread, z = cz + (R() - 0.5) * spread, y = y0;
    for (let j = 0; j < 6; j++) { pts.push([x, y, z]); x += (R() - 0.5) * 0.4; z += (R() - 0.5) * 0.4; y = Math.max(0.02, y + (R() - 0.5) * 0.15); }
    k.add(i % 2 ? M.trim : Flat(0x8a2a1a, 0.5, 0.1), gTube(pts, 0.008, 24, 5));
  }
}
function openBox(k, R, s, crushed = false) {
  const cb = M.cardboard, h = s * (crushed ? 0.35 : 0.7);
  k.rb(cb, s, h, s * 0.8, 0.008, 0, h / 2, 0, 0, 0, crushed ? 0.15 : 0);
  if (!crushed) for (const [x, z, ry] of [[0, s * 0.4, 0], [0, -s * 0.4, PI], [s * 0.5, 0, PI / 2], [-s * 0.5, 0, -PI / 2]]) {
    const ww = ry % PI === 0 ? s : s * 0.8;
    k.at(x, h, z, 0, ry, 0, () => k.add(cb, gBox(ww, s * 0.35, 0.006), 0, s * 0.17 * Math.cos(0.6), s * 0.17 * Math.sin(0.6), -(0.6 + R() * 0.8), 0, 0));
  }
}
/** a heap of bags, boxes and dead electronics ~3.2 x 2.4 m; nodes.cameraSpot marks where the camera sits */
function garbagePile(opts = {}) {
  const seed = opts.seed ?? 1;
  const R0 = rng(seed * 7 + 1), spot = [R0.range(-0.5, 0.5), 0, 0.8];
  const H = (x, z) => 0.55 * Math.sqrt(Math.max(0, 1 - (x / 1.5) ** 2 - (z / 1.15) ** 2));
  spot[1] = H(spot[0], spot[2]) + 0.04;
  const g = cachedKit('pile' + seed, k => {
    const R = rng(seed * 31 + 5);
    k.add(matte(0x3a342c, 'soot', 0.95), gc('pileMound' + seed, () => smoothNormals(deform(blobGeo(1, 3, 0.18, seed, 1.35, 0.5, 1.0), v => { if (v.y < 0) v.y = -0.02; }), 60)), 0, -0.03, 0);
    const near = (x, z, r) => Math.hypot(x - spot[0], z - spot[2]) < r;
    for (let i = 0; i < 18; i++) {
      const a = R() * TAU, r = Math.sqrt(R()) * 0.95, x = Math.cos(a) * r * 1.45, z = Math.sin(a) * r * 1.1;
      if (near(x, z, 0.38)) continue;
      addBag(k, R, x, z, H(x, z) * 0.75 - 0.05, 0.9 + R() * 0.4, 2);
    }
    for (let i = 0; i < 6; i++) {
      const x = R.range(-1.3, 1.3), z = R.range(-0.9, 1.0); if (near(x, z, 0.4)) continue;
      const s = R.range(0.3, 0.55); k.at(x, H(x, z) * 0.7, z, R.range(-0.3, 0.3), R() * TAU, R.range(-0.3, 0.3), () => openBox(k, R, s, R() < 0.4));
    }
    k.at(-0.9, H(-0.9, 0.3) * 0.8 + 0.1, 0.35, -0.9, 0.5, 0.2, () => brokenMonitor(k, R));
    k.at(0.9, H(0.9, 0.0) * 0.85 + 0.05, 0.0, -0.4, -0.6, 0.15, () => brokenMonitor(k, R));
    k.at(0.5, H(0.5, -0.5) + 0.02, -0.5, 0.2, 1.1, -0.3, () => keyboard(k));
    // robot vacuum, router, speaker, tyre, plank, pipe
    k.at(-0.4, H(-0.4, -0.6) + 0.02, -0.6, 0.3, 0, 0.2, () => { k.cyl(M.white, 0.17, 0.17, 0.06, 0, 0, 0, 0, 0, 0, 24); k.cyl(M.dark, 0.06, 0.06, 0.02, 0, 0.035, 0.05, 0, 0, 0, 16); });
    k.at(1.15, H(1.15, 0.5) + 0.03, 0.5, 0.1, 0.4, 0.5, () => { k.rb(M.dark, 0.22, 0.04, 0.15, 0.01, 0, 0, 0); k.rod(M.dark, 0.006, [0.08, 0, -0.06], [0.1, 0.16, -0.08]); });
    k.at(-1.3, 0.14, -0.2, 0, 0.3, PI / 2 - 0.25, () => k.add(M.rubber, gTor(0.24, 0.08, 10, 24)));
    k.at(0.2, H(0.2, -0.2) + 0.05, -0.2, 0.1, 0.7, 0.35, () => k.rb(Mat('wood'), 1.6, 0.03, 0.14, 0.01, 0, 0, 0));
    k.at(-0.6, H(-0.6, 0.0) + 0.08, 0.0, 0.05, -0.5, 0.2, () => k.cyl(M.steel, 0.04, 0.04, 1.3, 0, 0, 0, 0, 0, PI / 2, 10));
    cables(k, R, 5, 0, 0, 1.6, 0.3);
    // a nest for the camera: a crushed box lid the camera rests on
    k.at(spot[0], spot[1] - 0.05, spot[2], 0.05, 0.4, 0, () => k.rb(M.cardboard, 0.42, 0.03, 0.32, 0.008, 0, 0.0, 0));
    addBag(k, R, spot[0] - 0.42, spot[2] - 0.15, H(spot[0] - 0.42, spot[2] - 0.15) * 0.7 - 0.05, 0.85, 2);
    addBag(k, R, spot[0] + 0.45, spot[2] - 0.2, H(spot[0] + 0.45, spot[2] - 0.2) * 0.7 - 0.05, 0.8, 2);
    // spill around the foot of the heap
    litterInto(k, R, 14, 0, 0, 1.9, 1.5);
    k.solidBox(0, 0.3, 0, 1.4, 0.3, 1.0);
    k.solidBox(0, 0.65, -0.1, 0.9, 0.2, 0.6);
  });
  const node = new THREE.Object3D(); node.name = 'cameraSpot'; node.position.set(spot[0], spot[1], spot[2]); node.rotation.y = 0.4; g.add(node);
  g.userData.nodes.cameraSpot = node;
  return g;
}

/* ---------- litter ---------- */
const PAPERS = ['flyer', 'news', 'ad', 'receipt', 'map'];
function paperMat(kind) {
  const draw = {
    flyer: (g, w, h) => { g.fillStyle = '#efece2'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0541c'; g.fillRect(0, 0, w, 52); txt(g, 'EVACUATION NOTICE', w / 2, 28, 26, '#fff', 800); txt(g, 'CIVIC CONCORD', w / 2, 76, 20, '#1c2328', 700); g.fillStyle = '#545a5e'; for (let y = 100; y < h - 30; y += 14) g.fillRect(16, y, w - 32 - (y % 3) * 20, 5); },
    news: (g, w, h) => { g.fillStyle = '#e4e0d6'; g.fillRect(0, 0, w, h); txt(g, 'THE MERIDIAN LEDGER', w / 2, 22, 20, '#222', 800); g.fillStyle = '#222'; g.fillRect(10, 36, w - 20, 2); txt(g, 'GRID FAILS CITYWIDE', w / 2, 62, 24, '#111', 800); g.fillStyle = '#8a8a86'; g.fillRect(12, 84, w / 2 - 18, 70); g.fillStyle = '#5a5a58'; for (let c = 0; c < 2; c++) for (let y = 160; y < h - 10; y += 10) g.fillRect(12 + c * (w / 2), y, w / 2 - 22, 4); for (let y = 84; y < 156; y += 10) g.fillRect(w / 2 + 6, y, w / 2 - 18, 4); },
    ad: (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b2a4a'); gr.addColorStop(1, '#5a2a6a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); txt(g, 'LUMEN', w / 2, h * 0.3, 46, '#ffd27a', 800); txt(g, 'Light that knows you.', w / 2, h * 0.45, 16, '#fff', 500); g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(w / 2, h * 0.72, 40, 0, TAU); g.fill(); },
    receipt: (g, w, h) => { g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, w, h); txt(g, 'HALCYON TRANSIT', w / 2, 20, 16, '#333', 700); g.fillStyle = '#777'; for (let y = 40; y < h - 20; y += 12) g.fillRect(14, y, w - 28 - ((y * 7) % 40), 4); },
    map: (g, w, h) => { g.fillStyle = '#e8e6dc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9aa'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, i * 45 + 10); g.lineTo(w, i * 40 + 30); g.stroke(); g.beginPath(); g.moveTo(i * 40 + 10, 0); g.lineTo(i * 45, h); g.stroke(); } g.strokeStyle = '#e0541c'; g.lineWidth = 5; g.beginPath(); g.moveTo(20, h - 20); g.lineTo(90, 120); g.lineTo(w - 30, 40); g.stroke(); txt(g, 'SHELTER', w - 50, 24, 14, '#e0541c', 800); },
  }[kind];
  return draw;
}
/** all papers share one atlas material; each paper kind is a uv window into it */
function paperAtlas() {
  return mc('paperAtlas', () => {
    const t = ctex('paperAtlasT', 192 * PAPERS.length, 256, (g, w, h) => {
      PAPERS.forEach((kind, i) => { g.save(); g.translate(i * 192, 0); g.beginPath(); g.rect(0, 0, 192, 256); g.clip(); paperMat(kind)(g, 192, 256); const R = rng(i * 3 + 1); blots(g, 192, 256, R, 14, 10, 60, '90,80,60', 0.1, 0.35); streaks(g, 192, 256, R, 10, '90,80,60', 0.2, 0.5); g.restore(); });
    });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  });
}
function atlasU(geo, cell, cells) { const g = geo.clone(), U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setX(i, (cell + U.getX(i)) / cells); return g; }
const paperGeo = (bend, kind = 0) => gc('paperGeo' + bend + '|' + kind, () => atlasU(deform(new THREE.PlaneGeometry(0.21, 0.28, 4, 4), v => { v.z += bend * (v.x * v.x * 1.2 + Math.sin(v.y * 20) * 0.003); }, true), kind, PAPERS.length));
const CAN_COLS = [0xb02a2a, 0x2a6ab0, 0xd8d8d8, 0x2a8a4a, 0xe0a020];
function canAtlas() {
  return mc('canAtlas', () => new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.8, map: ctex('canAtlasT', 64 * CAN_COLS.length, 64, (g, w, h) => {
    CAN_COLS.forEach((c, i) => { g.fillStyle = '#' + c.toString(16).padStart(6, '0'); g.fillRect(i * 64, 0, 64, h); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(i * 64, 26, 64, 6); g.fillStyle = '#c8ccd0'; g.fillRect(i * 64, 0, 64, 5); g.fillRect(i * 64, h - 5, 64, 5); });
  }) }));
}
const canGeo = i => gc('canGeo' + i, () => atlasU(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14), i, CAN_COLS.length));
function litterInto(k, R, n, cx, cz, rx, rz) {
  for (let i = 0; i < n; i++) {
    const x = cx + (R() - 0.5) * 2 * rx, z = cz + (R() - 0.5) * 2 * rz, r = R();
    if (r < 0.45) k.add(paperAtlas(), paperGeo(Math.floor(R() * 3), Math.floor(R() * PAPERS.length)), x, 0.004 + R() * 0.006, z, -PI / 2 + (R() - 0.5) * 0.1, 0, R() * TAU, 0.8 + R() * 0.6);
    else if (r < 0.7) k.add(canAtlas(), canGeo(Math.floor(R() * CAN_COLS.length)), x, 0.033, z, PI / 2, R() * TAU, 0, 1, 1, 1);
    else if (r < 0.82) k.add(Flat(0xe8e2d4, 0.6), gLathe([[0.03, 0], [0.045, 0.12], [0.047, 0.125], [0, 0.125]], 14), x, 0.045, z, PI / 2, R() * TAU, 0);
    else shards(k, R, 6, x, z, 0.2, 0.2);
  }
}
function litter(opts = {}) {
  const seed = opts.seed ?? 1;
  const g = cachedKit('litter' + seed, k => { const R = rng(seed * 5 + 3); litterInto(k, R, 22, 0, 0, 1.2, 1.2); });
  g.userData.solid = [];
  return g;
}

/* ---------- vending ---------- */
const BOTTLE = [[0, 0], [0.032, 0], [0.034, 0.01], [0.034, 0.13], [0.026, 0.16], [0.013, 0.18], [0.013, 0.205], [0, 0.205]];
const DRINK_COLS = [0x2fb0d8, 0xe85a3a, 0x8ad83a, 0xf0c040, 0xd8e8f0, 0xb04ad8];
const drinkMat = c => mc('drink' + c, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.9 }));
function auraSide() {
  return decal('auraSide', 256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d4f6a'); gr.addColorStop(0.6, '#1a8fb0'); gr.addColorStop(1, '#bfeaf2'); g.fillStyle = gr; rr(g, 0, 0, w, h, 18); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(w * 0.5, h * 0.62, 30 + i * 22, 0, TAU); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.15)'; g.stroke(); }
    const bx = w / 2, by = h * 0.62; const bg = g.createLinearGradient(bx - 40, 0, bx + 40, 0); bg.addColorStop(0, '#9fe6ff'); bg.addColorStop(0.5, '#ffffff'); bg.addColorStop(1, '#5fc6ea'); g.fillStyle = bg;
    g.beginPath(); g.moveTo(bx - 40, by + 120); g.lineTo(bx - 40, by - 40); g.quadraticCurveTo(bx - 40, by - 80, bx - 14, by - 100); g.lineTo(bx - 14, by - 130); g.lineTo(bx + 14, by - 130); g.lineTo(bx + 14, by - 100); g.quadraticCurveTo(bx + 40, by - 80, bx + 40, by - 40); g.lineTo(bx + 40, by + 120); g.closePath(); g.fill();
    g.fillStyle = '#0d4f6a'; g.fillRect(bx - 40, by - 10, 80, 50); txt(g, 'AURA', bx, by + 15, 26, '#fff', 800);
    txt(g, 'AURA', w / 2, 70, 72, '#ffffff', 800, 'center', 'middle', 8); txt(g, 'SPRING · SODA · TEA', w / 2, 120, 18, '#cdeef8', 500, 'center', 'middle', 3);
    txt(g, 'Hydration, remembered.', w / 2, h - 30, 18, '#0d4f6a', 600);
  });
}
function vendingMachine(opts = {}) {
  const lit = opts.lit ?? true, broken = !!opts.broken;
  const g = cachedKit(`vend${lit}|${broken}`, k => {
    const R = rng(broken ? 7 : 2), shell = matte(0xe6e8e8, broken ? 'soot' : 'grime', 0.4, 0.1);
    k.at(0, 0, 0, broken ? -0.03 : 0, 0, broken ? 0.02 : 0, () => {
      k.rb(shell, 1.05, 1.96, 0.85, 0.05, 0, 1.02, 0);
      k.rb(M.trim, 1.0, 0.08, 0.8, 0.02, 0, 0.04, 0);
      // display case (left)
      const dx = -0.15, dw = 0.68, dy = 1.2, dh = 1.3, fz = 0.425;
      k.rb(M.trim, dw + 0.08, 0.05, 0.16, 0.015, dx, dy + dh / 2 + 0.02, fz + 0.06);
      k.rb(M.trim, dw + 0.08, 0.05, 0.16, 0.015, dx, dy - dh / 2 - 0.02, fz + 0.06);
      for (const sx of [-1, 1]) k.rb(M.trim, 0.05, dh + 0.08, 0.16, 0.015, dx + sx * (dw / 2 + 0.015), dy, fz + 0.06);
      k.add(lit && !broken ? Glow(0xd8f0ff, 1.25) : Flat(0x1a2026, 0.6), gPlane(dw, dh), dx, dy, fz + 0.002);
      for (let s = 0; s < 5; s++) {
        const sy = dy - dh / 2 + 0.06 + s * 0.26;
        k.box(M.alu, dw, 0.012, 0.13, dx, sy, fz + 0.07);
        for (let i = 0; i < 6; i++) {
          if (broken && R() < 0.3) continue;
          const c = DRINK_COLS[(s * 2 + (i >> 1)) % DRINK_COLS.length];
          if (broken && R() < 0.2) k.add(drinkMat(c), gLathe(BOTTLE, 12), dx - dw / 2 + 0.07 + i * 0.108, sy + 0.04, fz + 0.07, PI / 2, R() * TAU, 0);
          else k.add(drinkMat(c), gLathe(BOTTLE, 12), dx - dw / 2 + 0.07 + i * 0.108, sy + 0.006, fz + 0.07);
        }
      }
      k.add(Mat('glass'), gPlane(dw, dh), dx, dy, fz + 0.135);
      if (broken) k.add(M.crackClear, gPlane(dw, dh), dx, dy, fz + 0.137);
      // right column: brand, screen (separate node), reader, coin/card
      const cx = 0.36;
      k.add(lit && !broken ? glowTex('auraLogo', 256, 128, (gg, w, h) => { gg.fillStyle = '#0d4f6a'; gg.fillRect(0, 0, w, h); txt(gg, 'AURA', w / 2, 58, 64, '#fff', 800, 'center', 'middle', 6); txt(gg, 'DRINKS', w / 2, 104, 20, '#9fe6ff', 500, 'center', 'middle', 6); }, 1.3) : decal('auraLogoOff', 256, 128, (gg, w, h) => { gg.fillStyle = '#0b2c3a'; gg.fillRect(0, 0, w, h); txt(gg, 'AURA', w / 2, 58, 64, '#9fb4bc', 800, 'center', 'middle', 6); txt(gg, 'DRINKS', w / 2, 104, 20, '#5f7a84', 500, 'center', 'middle', 6); }), gPlane(0.26, 0.13), cx, 1.78, fz + 0.003);
      k.rb(M.trim, 0.3, 0.38, 0.03, 0.01, cx, 1.3, fz + 0.005);
      k.rb(M.trim, 0.14, 0.18, 0.04, 0.015, cx, 0.98, fz + 0.01);
      k.add(Glow(0x40e0a0, lit && !broken ? 1.5 : 0.2), gCircle(0.03, 16), cx, 1.0, fz + 0.031);
      k.rb(M.trim, 0.08, 0.02, 0.03, 0.005, cx, 0.86, fz + 0.01);
      // dispense bay
      k.rb(M.black, 0.8, 0.26, 0.06, 0.02, -0.05, 0.36, fz + 0.01);
      k.rb(M.trim, 0.74, 0.04, 0.04, 0.01, -0.05, 0.47, fz + 0.03);
      k.add(auraSide(), gPlane(0.62, 1.24), 0.528, 1.15, 0, 0, PI / 2, 0);
      k.add(auraSide(), gPlane(0.62, 1.24), -0.528, 1.15, 0, 0, -PI / 2, 0);
      k.add(decal('vendSerial', 256, 64, (gg, w, h) => { txt(gg, 'AURA-VX7  ·  SN 0447-2069-118', w / 2, h / 2, 16, 'rgba(60,70,76,0.9)', 600); }), gPlane(0.4, 0.1), cx - 0.1, 0.18, fz + 0.003);
    });
    if (broken) { for (let i = 0; i < 6; i++) k.add(drinkMat(DRINK_COLS[i % 6]), gLathe(BOTTLE, 12), R.range(-0.6, 0.6), 0.034, R.range(0.55, 1.2), PI / 2, R() * TAU, 0); shards(k, R, 30, 0, 0.8, 0.6, 0.4); }
    if (lit && !broken) k.light(0, 1.3, 0.8, 0xcfe8ff, 1.4, 5);
    k.solidBox(0, 1.0, 0, 0.53, 1.0, 0.45);
  });
  // screen node (per instance so the game can swap its texture)
  const scr = new THREE.Mesh(gPlane(0.26, 0.34), lit ? (broken ? glowTex('vendErr', 256, 320, (gg, w, h) => { gg.fillStyle = '#100404'; gg.fillRect(0, 0, w, h); txt(gg, 'OUT OF', w / 2, 120, 34, '#ff4030', 800); txt(gg, 'ORDER', w / 2, 160, 34, '#ff4030', 800); txt(gg, 'ERR 0x1F', w / 2, 220, 18, '#a03020', 600); scan(gg, w, h, 0.35); }, 1.2) : glowTex('vendUI', 256, 320, (gg, w, h) => {
    gg.fillStyle = '#06141c'; gg.fillRect(0, 0, w, h); txt(gg, 'SELECT', w / 2, 30, 26, '#9fe6ff', 700, 'center', 'middle', 4);
    for (let i = 0; i < 6; i++) { const x = 18 + (i % 2) * 118, y = 60 + Math.floor(i / 2) * 78; gg.fillStyle = '#0f2c3a'; rr(gg, x, y, 104, 66, 8); gg.fill(); gg.fillStyle = '#' + DRINK_COLS[i].toString(16).padStart(6, '0'); gg.beginPath(); gg.arc(x + 26, y + 33, 14, 0, TAU); gg.fill(); txt(gg, '¢' + (180 + i * 20), x + 72, y + 33, 18, '#e8f6ff', 600); }
    txt(gg, 'TAP CARD OR PALM', w / 2, h - 22, 16, '#5fc6ea', 600); scan(gg, w, h, 0.15);
  }, 1.3)) : M.black);
  scr.position.set(0.36, 1.3, 0.425 + 0.022); if (broken) scr.rotation.z = 0.02; g.add(scr); g.userData.nodes.screen = scr;
  if (lit && broken) {
    // dying backlight flickers
    const back = new THREE.Mesh(gPlane(0.68, 1.3), Glow(0xd8f0ff, 1.0)); back.position.set(-0.15, 1.2, 0.428); g.add(back);
    let t0 = 0, next = 0.3, state = true;
    g.userData.update = dt => { t0 += dt; if (t0 > next) { state = !state; next = t0 + (state ? 0.05 + Math.random() * 0.6 : 0.03 + Math.random() * 0.15); back.visible = state; scr.visible = state || Math.random() < 0.5; } };
    g.userData.lights = [{ x: 0, y: 1.3, z: 0.8, color: 0xcfe8ff, intensity: 0.8, distance: 4 }];
  }
  return g;
}

function bench() {
  return cachedKit('bench', k => {
    const alu = matte(0x8d9399, 'grime', 0.35, 0.8), wd = M.wood;
    for (const x of [-0.78, 0, 0.78]) k.at(x, 0, 0, () => {
      k.rb(alu, 0.05, 0.03, 0.5, 0.012, 0, 0.015, 0);
      k.rb(alu, 0.045, 0.42, 0.09, 0.02, 0, 0.22, 0.02, -0.06);
      k.rb(alu, 0.05, 0.04, 0.5, 0.015, 0, 0.43, 0.0);
      k.rb(alu, 0.045, 0.48, 0.05, 0.015, 0, 0.66, -0.25, -0.22);
    });
    for (let i = 0; i < 5; i++) k.rb1(wd, 1.82, 0.035, 0.085, 0.012, 0, 0.465, -0.2 + i * 0.1);
    for (let i = 0; i < 3; i++) k.rb1(wd, 1.82, 0.085, 0.03, 0.012, 0, 0.58 + i * 0.12, -0.27 - i * 0.03, -0.22);
    k.add(decal('benchPlaque', 256, 64, (g, w, h) => { g.fillStyle = '#b8a070'; rr(g, 0, 0, w, h, 8); g.fill(); txt(g, 'IN MEMORY OF ELLIS MARSH, WHO LOVED THIS VIEW', w / 2, h / 2, 13, '#3a2c18', 600); }), gPlane(0.18, 0.045), 0.3, 0.64, -0.278, -0.22);
    k.solidBox(0, 0.42, -0.04, 0.92, 0.42, 0.3);
  });
}

function deadTree(k, R, base, h) {
  const wood = Flat(0x3d362e, 0.95, 0);
  const seg = (p, d, len, r, depth) => {
    const q = [p[0] + d.x * len, p[1] + d.y * len, p[2] + d.z * len];
    const A = new V3(...p), B = new V3(...q), dir = B.clone().sub(A);
    const quat = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
    const m = k.T.clone().multiply(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), quat, new V3(1, 1, 1)));
    let e = k.parts.get(wood); if (!e) k.parts.set(wood, e = []); e.push({ geo: gCyl(+(r * 0.68).toFixed(4), +r.toFixed(4), +len.toFixed(3), 6, false), m });
    if (depth <= 0 || r < 0.008) return;
    const n = depth > 2 ? 2 : 2 + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const nd = d.clone().add(new V3(R() - 0.5, R() * 0.4, R() - 0.5).multiplyScalar(1.3)).normalize();
      seg(q, nd, len * (0.62 + R() * 0.2), r * 0.66, depth - 1);
    }
  };
  seg(base, new V3(0.05, 1, 0.02).normalize(), h * 0.42, 0.075, 4);
}
function planter(opts = {}) {
  const dead = opts.dead ?? true;
  return cachedKit('planter' + dead, k => {
    const R = rng(dead ? 21 : 22);
    k.rb(M.concrete, 1.4, 0.08, 1.4, 0.02, 0, 0.56, 0);
    k.rb(M.concrete, 1.34, 0.5, 1.34, 0.02, 0, 0.27, 0);
    for (const [x, z, ry] of [[0, 0.68, 0], [0, -0.68, 0], [0.68, 0, PI / 2], [-0.68, 0, PI / 2]]) for (let i = 0; i < 9; i++) k.rb1(matte([0x7a5236, 0x6e4a30, 0x84593a][i % 3], 'grime', 0.6), 0.12, 0.44, 0.03, 0.008, ...(ry ? [x, 0.27, -0.6 + i * 0.15] : [-0.6 + i * 0.15, 0.27, z]), 0, ry, 0);
    k.rb(Flat(0x2a231c, 1), 1.24, 0.04, 1.24, 0.01, 0, 0.58, 0);
    for (let i = 0; i < 10; i++) k.add(Flat(0x3a3128, 1), blobGeo(0.04, 1, 0.3, i), R.range(-0.5, 0.5), 0.6, R.range(-0.5, 0.5));
    if (dead) {
      deadTree(k, R, [0, 0.58, 0], 2.8);
      for (let i = 0; i < 8; i++) k.add(Flat(0x5a4a2e, 0.9), gc('leaf', () => shapeGeo([[0, 0], [0.03, 0.02], [0.05, 0], [0.03, -0.02]])), R.range(-0.55, 0.55), 0.605, R.range(-0.55, 0.55), -PI / 2, 0, R() * TAU, 1.2);
    } else {
      k.cyl(Flat(0x4a3e30, 0.9), 0.05, 0.07, 1.6, 0, 1.38, 0, 0, 0, 0, 8);
      for (let i = 0; i < 14; i++) k.add(Flat(i % 3 ? 0x3f6a35 : 0x4f7a3a, 0.85), gc('foliage' + (i % 5), () => blobGeo(0.3, 3, 0.3, i % 5 + 3)), R.range(-0.45, 0.45), 2.1 + R.range(-0.25, 0.55), R.range(-0.45, 0.45), 0, R() * TAU, 0, R.range(0.7, 1.1));
    }
    k.solidBox(0, 0.3, 0, 0.7, 0.3, 0.7);
  });
}

function fireHydrant() {
  return cachedKit('hydrant', k => {
    const red = paint(0xa21f1c, 'grime');
    k.add(red, gLathe([[0, 0], [0.16, 0], [0.16, 0.035], [0.125, 0.06], [0.11, 0.1], [0.1, 0.52], [0.115, 0.55], [0.115, 0.6], [0.095, 0.64], [0.07, 0.7], [0.035, 0.73], [0, 0.74]], 24));
    k.cyl(M.chrome, 0.118, 0.118, 0.025, 0, 0.575, 0, 0, 0, 0, 24);
    k.cyl(M.chrome, 0.03, 0.03, 0.05, 0, 0.75, 0, 0, 0, 0, 5);
    for (const s of [-1, 1]) { k.cyl(red, 0.045, 0.045, 0.1, s * 0.13, 0.43, 0, 0, 0, PI / 2, 14); k.cyl(M.chrome, 0.05, 0.05, 0.03, s * 0.19, 0.43, 0, 0, 0, PI / 2, 6); }
    k.cyl(red, 0.06, 0.06, 0.1, 0, 0.36, 0.13, PI / 2, 0, 0, 16); k.cyl(M.chrome, 0.066, 0.066, 0.035, 0, 0.36, 0.19, PI / 2, 0, 0, 6);
    k.cyl(Glow(0x40ff90, 1.4), 0.101, 0.101, 0.012, 0, 0.3, 0, 0, 0, 0, 24);
    k.add(decal('hydrantTag', 128, 64, (g, w, h) => { g.fillStyle = '#e8e4d8'; rr(g, 2, 2, w - 4, h - 4, 6); g.fill(); txt(g, 'CC-H 0912', w / 2, 22, 16, '#222', 700); txt(g, '1600 L/MIN', w / 2, 44, 13, '#555', 600); }), gPlane(0.08, 0.04), 0, 0.2, 0.104, -0.02);
    k.solidBox(0, 0.37, 0, 0.17, 0.37, 0.17);
  });
}

function manhole() {
  const g = cachedKit('manhole', k => {
    const t = ctex('manholeT', 512, 512, (gg, w, h) => {
      const c = w / 2; const gr = gg.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, '#3e3d3a'); gr.addColorStop(1, '#2a2927'); gg.fillStyle = gr; gg.fillRect(0, 0, w, h);
      gg.strokeStyle = '#5a5852'; gg.lineWidth = 6; for (const r of [c - 8, c - 70, 120]) { gg.beginPath(); gg.arc(c, c, r, 0, TAU); gg.stroke(); }
      gg.save(); gg.beginPath(); gg.arc(c, c, 116, 0, TAU); gg.clip(); gg.strokeStyle = '#55534d'; gg.lineWidth = 5;
      for (let y = -6; y < 7; y++) for (let x = -6; x < 7; x++) { const px = c + x * 34 + (y % 2) * 17, py = c + y * 30; gg.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + PI / 6; gg.lineTo(px + Math.cos(a) * 15, py + Math.sin(a) * 15); } gg.closePath(); gg.stroke(); }
      gg.restore();
      gg.font = `700 34px ${FONT}`; gg.fillStyle = '#66645d'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      const s = 'CIVIC CONCORD  ·  STORMWATER  ·  2061  ·  '; let a = -PI / 2 - 1.4;
      for (const ch of s) { gg.save(); gg.translate(c + Math.cos(a) * (c - 40), c + Math.sin(a) * (c - 40)); gg.rotate(a + PI / 2); gg.fillText(ch, 0, 0); gg.restore(); a += (gg.measureText(ch).width + 2) / (c - 40); }
      const R = rng(8); blots(gg, w, h, R, 50, 5, 40, '90,60,40', 0.1, 0.3); blots(gg, w, h, R, 30, 10, 60, '10,10,10', 0.1, 0.3);
    });
    const m = mc('manholeMat', () => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.7 }));
    k.cyl(M.gunmetal, 0.47, 0.47, 0.012, 0, 0.006, 0, 0, 0, 0, 36);
    k.add(m, gCircle(0.42, 36), 0, 0.0135, 0, -PI / 2, 0, 0);
  });
  g.userData.solid = [];
  return g;
}

function magCover(i) {
  const titles = ['VECTOR', 'HALO', 'KINETIC', 'FORM', 'CIRCUIT', 'BLOOM', 'MERIDIAN', 'SIGNAL'];
  const cols = ['#c83a2a', '#2a6ac8', '#e8b23a', '#1c2328', '#3ac8a0', '#c83a8a', '#6a4ac8', '#e8e8e0'];
  return decal('mag' + i, 96, 128, (g, w, h) => {
    g.fillStyle = cols[i % 8]; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h * 0.6, 4, w / 2, h * 0.6, 50); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(w / 2, h * 0.68, 22, 34, 0, 0, TAU); g.fill();
    txt(g, titles[i % 8], w / 2, 16, 17, i % 8 === 7 ? '#111' : '#fff', 800);
    txt(g, 'THE MACHINES', w / 2, h - 22, 9, '#fff', 700); txt(g, 'THAT CARE', w / 2, h - 11, 9, '#fff', 700);
  }, { rough: 0.4 });
}
function newsKiosk() {
  return cachedKit('kiosk', k => {
    const R = rng(12), wh = matte(0xe2e4e3, 'grime', 0.45, 0.1);
    k.rb(wh, 2.4, 1.0, 1.4, 0.04, 0, 0.5, 0);
    k.rb(M.wood, 2.44, 0.05, 0.52, 0.015, 0, 1.025, 0.48);
    k.rb(wh, 2.4, 1.6, 0.08, 0.03, 0, 1.8, -0.66);
    for (const sx of [-1, 1]) k.rb(wh, 0.08, 1.6, 1.4, 0.03, sx * 1.16, 1.8, 0);
    k.rb(Flat(0x14171a, 0.8), 2.24, 1.5, 0.02, 0.005, 0, 1.78, -0.61);
    // interior: magazines on the back wall, a dark counter
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) { k.add(magCover((r * 9 + i) % 8), gPlane(0.2, 0.27), -0.96 + i * 0.24, 1.35 + r * 0.36, -0.595, -0.12); }
    for (let r = 0; r < 3; r++) k.box(M.alu, 2.2, 0.015, 0.08, 0, 1.2 + r * 0.36, -0.57);
    // roof canopy + sign band + soffit LEDs (dead)
    k.rb(wh, 2.9, 0.16, 2.0, 0.05, 0, 2.66, 0.1);
    k.rb(M.trim, 2.7, 0.012, 0.03, 0.005, 0, 2.574, 1.0);
    k.add(decal('kioskSign', 1024, 128, (g, w, h) => { g.fillStyle = '#1c3a44'; g.fillRect(0, 0, w, h); txt(g, 'MERIDIAN NEWS & COFFEE', w / 2 - 60, h / 2 + 2, 60, '#f2efe6', 800, 'center', 'middle', 4); g.fillStyle = '#e8b23a'; g.beginPath(); g.arc(w - 70, h / 2, 34, 0, TAU); g.fill(); txt(g, 'M', w - 70, h / 2 + 2, 40, '#1c3a44', 800); }), gPlane(2.6, 0.13), 0, 2.66, 1.102);
    // rolling shutter half down
    const sh = mc('shutter', () => { const t = ctex('shutterT', 128, 256, (g, w, h) => { g.fillStyle = '#9aa0a4'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = '#c4c8cc'; g.fillRect(0, y, w, 4); g.fillStyle = '#6a7074'; g.fillRect(0, y + 12, w, 3); } const R2 = rng(3); blots(g, w, h, R2, 20, 5, 40, '80,50,30', 0.1, 0.4); streaks(g, w, h, R2, 20, '40,40,40', 0.4, 0.5); }, true); t.repeat.set(2, 2); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.6 }); });
    k.rb(sh, 2.26, 0.8, 0.03, 0.01, 0, 2.15, 0.66);
    k.rb(M.gunmetal, 2.3, 0.05, 0.05, 0.01, 0, 1.75, 0.67);
    k.add(decal('kioskGraffiti', 512, 256, (g, w, h) => { drawGlyph(g, 150, 128, 80, 'rgba(210,25,28,0.85)', 0.17); txt(g, 'IT HEARS', 360, 128, 50, 'rgba(240,240,240,0.8)', 800); }), gPlane(1.1, 0.55), 0.2, 2.15, 0.678);
    // side magazine rack + emergency screen
    k.at(1.24, 0, 0, () => { for (let r = 0; r < 4; r++) { k.box(M.alu, 0.18, 0.012, 1.0, 0.09, 0.45 + r * 0.3, 0, 0, 0, -0.35); for (let i = 0; i < 4; i++) if (R() < 0.75) k.add(magCover(r + i), gPlane(0.2, 0.26), 0.11, 0.56 + r * 0.3, -0.36 + i * 0.24, -0.35 * 0, PI / 2, 0.0); } });
    k.add(glowTex('kioskAlert', 256, 192, (g, w, h) => { g.fillStyle = '#1a0404'; g.fillRect(0, 0, w, h); g.fillStyle = '#d82020'; g.fillRect(0, 0, w, 36); txt(g, 'CIVIC ALERT', w / 2, 19, 24, '#fff', 800, 'center', 'middle', 3); txt(g, 'PROCEED TO THE', w / 2, 80, 22, '#ffd0c8', 700); txt(g, 'NEAREST SHELTER', w / 2, 108, 22, '#ffd0c8', 700); txt(g, 'METRO · MERIDIAN STN', w / 2, 152, 16, '#ff8070', 600); scan(g, w, h, 0.3); }, 1.2), gPlane(0.6, 0.45), -1.205, 1.85, 0.2, 0, -PI / 2, 0);
    litterInto(k, R, 8, 0, 1.6, 1.4, 0.5);
    k.solidBox(0, 1.3, 0, 1.25, 1.3, 0.75);
  });
}

/* ---------- signage that moves ---------- */
function adArt(g, w, h, hue, text, kind) {
  const c = `hsl(${hue},90%,60%)`, c2 = `hsl(${(hue + 40) % 360},90%,70%)`, dk = `hsla(${hue},80%,20%,0.55)`;
  g.fillStyle = dk; g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, w * 0.7); gr.addColorStop(0, `hsla(${hue},90%,60%,0.45)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = c; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  const cx = w / 2, cy = h * 0.52;
  if (kind === 0) { // orb product
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(cx, cy, w * 0.32, w * 0.08 + i * 6, -0.3, 0, TAU); g.strokeStyle = `hsla(${hue + i * 10},90%,70%,0.5)`; g.lineWidth = 3; g.stroke(); }
    const o = g.createRadialGradient(cx - 20, cy - 20, 5, cx, cy, w * 0.2); o.addColorStop(0, '#fff'); o.addColorStop(0.4, c2); o.addColorStop(1, c); g.fillStyle = o; g.beginPath(); g.arc(cx, cy, w * 0.18, 0, TAU); g.fill();
  } else if (kind === 1) { // slim device
    g.fillStyle = c; rr(g, cx - w * 0.14, cy - h * 0.2, w * 0.28, h * 0.4, 24); g.fill(); g.fillStyle = dk; rr(g, cx - w * 0.12, cy - h * 0.18, w * 0.24, h * 0.36, 18); g.fill();
    g.fillStyle = c2; g.beginPath(); g.arc(cx, cy, w * 0.07, 0, TAU); g.fill();
  } else { // a face in profile, serene
    g.fillStyle = c; g.beginPath(); g.moveTo(cx - 20, cy - h * 0.22); g.quadraticCurveTo(cx + 70, cy - h * 0.2, cx + 60, cy); g.lineTo(cx + 78, cy + 26); g.lineTo(cx + 58, cy + 34); g.quadraticCurveTo(cx + 60, cy + 70, cx + 20, cy + 76); g.lineTo(cx - 10, cy + h * 0.22); g.lineTo(cx - 70, cy + h * 0.22); g.quadraticCurveTo(cx - 90, cy - 40, cx - 20, cy - h * 0.22); g.fill();
    g.strokeStyle = c2; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx + 10, cy - 10, 30 + i * 22, -1.2, 0.2); g.stroke(); }
  }
  let fs = Math.floor(w * 0.2); g.font = `800 ${fs}px ${FONT}`; while (g.measureText(text).width > w * 0.86 && fs > 12) { fs -= 2; g.font = `800 ${fs}px ${FONT}`; }
  txt(g, text, w / 2, h * 0.14, fs, '#ffffff', 800, 'center', 'middle', 4);
  const tag = ['Always with you.', 'Thinking ahead, for you.', 'Let it decide.'][kind];
  txt(g, tag, w / 2, h * 0.86, Math.floor(w * 0.06), c2, 600);
  txt(g, 'A CIVIC CONCORD PARTNER', w / 2, h * 0.93, Math.floor(w * 0.035), 'rgba(255,255,255,0.6)', 500, 'center', 'middle', 2);
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
}
/** holographic ad pylon: thin frame + additive panel with shimmer/glitch */
function holoAd(opts = {}) {
  const w = opts.w ?? 1.4, h = opts.h ?? 2.4, hue = opts.hue ?? 190, text = opts.text ?? 'LUMEN';
  let hsh = 0; for (const ch of text) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0; const kind = hsh % 3;
  const g = cachedKit(`holo${w}|${h}`, k => {
    k.rb(M.gunmetal, w + 0.24, 0.16, 0.5, 0.04, 0, 0.08, 0);
    k.rb(M.trim, w + 0.1, 0.04, 0.12, 0.01, 0, 0.18, 0);
    for (const sx of [-1, 1]) k.rb(M.alu, 0.05, h + 0.12, 0.06, 0.015, sx * (w / 2 + 0.035), 0.22 + h / 2, 0);
    k.rb(M.alu, w + 0.12, 0.05, 0.06, 0.015, 0, 0.27 + h + 0.03, 0);
    k.solidBox(0, 0.1 + (h + 0.3) / 2, 0, w / 2 + 0.12, (h + 0.3) / 2, 0.25);
  });
  const key = `holoT${text}|${hue}`, aspect = w / h, TW = 384, TH = Math.round(384 / aspect);
  const tex = ctex(key, TW, TH, (gg, ww, hh) => adArt(gg, ww, hh, hue, text, kind));
  const texG = ctex(key + 'g', TW, TH, (gg, ww, hh) => { adArt(gg, ww, hh, hue, text, kind); glitchCanvas(gg, ww, hh, rng(hsh), 1.4); });
  const col = new THREE.Color().setHSL(hue / 360, 0.8, 0.6);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const panel = new THREE.Mesh(gPlane(w, h), mat); panel.position.set(0, 0.22 + h / 2, 0); g.add(panel);
  const emit = new THREE.Mesh(gBox(w, 0.015, 0.03), Glow(col.getHex(), 3)); emit.position.set(0, 0.205, 0); g.add(emit);
  g.userData.nodes.screen = panel;
  g.userData.lights = [{ x: 0, y: 0.22 + h / 2, z: 0.6, color: col.getHex(), intensity: 1.2, distance: 6 }];
  let t0 = Math.random() * 10, glitchT = 0, nextG = 2 + Math.random() * 5;
  g.userData.update = (dt) => {
    t0 += dt;
    if (t0 > nextG) { glitchT = 0.08 + Math.random() * 0.25; nextG = t0 + 2 + Math.random() * 6; }
    if (glitchT > 0) { glitchT -= dt; mat.map = texG; mat.map.offset.x = (Math.random() - 0.5) * 0.03; mat.opacity = Math.random() < 0.3 ? 0.15 : 0.9; }
    else { mat.map = tex; mat.opacity = 0.72 + 0.1 * Math.sin(t0 * 7.3) + 0.05 * Math.sin(t0 * 31); }
    g.userData.lights[0].intensity = 1.2 * mat.opacity;
  };
  return g;
}

/** public emergency broadcast pole: three horns, a small screen, a flashing beacon */
function broadcastSpeaker() {
  const g = cachedKit('broadcast', k => {
    const pm = POLE_MAT();
    k.add(M.gunmetal, gLathe([[0, 0], [0.2, 0], [0.2, 0.04], [0.15, 0.08], [0.12, 0.3], [0, 0.3]], 20));
    k.add(pm, gLathe([[0, 0.28], [0.08, 0.28], [0.065, 4.8], [0, 4.82]], 16));
    k.cyl(M.gunmetal, 0.12, 0.12, 0.3, 0, 4.6, 0, 0, 0, 0, 16);
    const horn = gLathe([[0.05, 0], [0.06, 0.1], [0.09, 0.25], [0.16, 0.4], [0.23, 0.48], [0.22, 0.49], [0.15, 0.41], [0.08, 0.26], [0.04, 0.1], [0.03, 0]], 20);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU;
      k.at(Math.sin(a) * 0.1, 4.55, Math.cos(a) * 0.1, 0, a, 0, () => k.at(0, 0, 0, PI / 2 + 0.3, 0, 0, () => { k.add(matte(0xd8dcdc, 'grime', 0.4, 0.2), horn); k.cyl(M.dark, 0.075, 0.075, 0.14, 0, -0.04, 0, 0, 0, 0, 14); }));
    }
    k.add(M.dark, gLathe([[0, 0], [0.1, 0], [0.1, 0.04], [0, 0.04]], 16), 0, 4.8, 0);
    k.add(mc('redLens', () => new THREE.MeshStandardMaterial({ color: 0x5a0a0a, roughness: 0.2, transparent: true, opacity: 0.8 })), gLathe([[0, 0.2], [0.05, 0.19], [0.08, 0.1], [0.085, 0]], 16), 0, 4.84, 0);
    // screen housing + junction box
    k.rb(M.dark, 0.5, 0.36, 0.1, 0.03, 0, 2.3, 0.1);
    k.rb(M.white, 0.3, 0.42, 0.16, 0.02, 0, 1.2, 0.1);
    k.add(decal('ccEmergency', 256, 320, (gg, w, h) => { gg.fillStyle = '#d8541c'; gg.fillRect(0, 0, w, 50); txt(gg, 'CIVIC CONCORD', w / 2, 26, 26, '#fff', 800); txt(gg, 'EMERGENCY', w / 2, 100, 34, '#1c2328', 800); txt(gg, 'NETWORK', w / 2, 140, 34, '#1c2328', 800); txt(gg, 'NODE 07-118', w / 2, 200, 22, '#4a555c', 600); gg.fillStyle = '#e8b23a'; gg.fillRect(30, 240, w - 60, 12); }), gPlane(0.26, 0.34), 0, 1.22, 0.181);
    k.light(0, 4.95, 0, 0xff2020, 2.0, 12);
    k.solidBox(0, 2.4, 0, 0.12, 2.4, 0.12);
  });
  const scrM = glowTex('bcScreen', 320, 224, (gg, w, h) => { gg.fillStyle = '#100303'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#c81818'; gg.fillRect(0, 0, w, 40); txt(gg, 'CIVIC ALERT', w / 2, 21, 26, '#fff', 800, 'center', 'middle', 4); txt(gg, 'REMAIN INDOORS', w / 2, 92, 30, '#ffe0d8', 800); txt(gg, 'DO NOT APPROACH', w / 2, 132, 24, '#ffb0a0', 700); txt(gg, 'SERVICE UNITS', w / 2, 162, 24, '#ffb0a0', 700); scan(gg, w, h, 0.3); }, 1.2);
  const scrG = glowTex('bcScreenG', 320, 224, (gg, w, h) => { gg.fillStyle = '#060000'; gg.fillRect(0, 0, w, h); drawGlyph(gg, w / 2, h / 2, 70, '#ff2020', 0.14); glitchCanvas(gg, w, h, rng(5), 1); }, 1.6);
  const scr = new THREE.Mesh(gPlane(0.44, 0.3), scrM); scr.position.set(0, 2.3, 0.151); g.add(scr); g.userData.nodes.screen = scr;
  const beacon = new THREE.Mesh(gLathe([[0, 0.19], [0.045, 0.18], [0.075, 0.1], [0.08, 0]], 16), Glow(0xff2020, 4)); beacon.position.set(0, 4.845, 0); g.add(beacon);
  let t0 = Math.random(), gl = 0, nextG = 3; const L = g.userData.lights[0];
  g.userData.update = dt => {
    t0 += dt; const on = (t0 * 1.2) % 1 < 0.35; beacon.visible = on; L.intensity = on ? 2 : 0;
    if (t0 > nextG) { gl = 0.15 + Math.random() * 0.4; nextG = t0 + 4 + Math.random() * 8; }
    if (gl > 0) { gl -= dt; scr.material = Math.random() < 0.7 ? scrG : scrM; } else scr.material = scrM;
  };
  return g;
}

/** public comm booth: curved glass shell, back panel with a screen and a handset on a cord */
function phoneBooth() {
  const g = cachedKit('phoneBooth', k => {
    const wh = matte(0xe6e8e8, 'grime', 0.35, 0.1);
    k.rb(M.gunmetal, 1.2, 0.05, 1.2, 0.02, 0, 0.025, 0);
    k.add(Mat('glass'), gCyl(0.58, 0.58, 2.15, 32, true, 0.95, TAU - 1.9), 0, 1.13, 0);
    for (const y of [0.06, 2.2]) k.add(M.alu, gTor(0.58, 0.018, 6, 40, TAU - 1.9), 0, y, 0, PI / 2, 0, PI / 2 + 0.95);
    for (const a of [0.95, TAU - 0.95]) k.cyl(M.alu, 0.02, 0.02, 2.15, Math.sin(a) * 0.58, 1.13, Math.cos(a) * 0.58, 0, 0, 0, 8);
    k.add(wh, gc('boothRoof', () => smoothNormals(new THREE.LatheGeometry([[0, 0], [0.62, 0], [0.66, 0.02], [0.64, 0.08], [0.5, 0.12], [0, 0.12]].map(p => new THREE.Vector2(p[0], p[1])), 40).toNonIndexed(), 40)), 0, 2.22, 0);
    k.add(Glow(0xcfefff, 1.6), gTor(0.6, 0.012, 6, 48), 0, 2.235, 0, PI / 2, 0, 0);
    k.rb(wh, 0.86, 2.15, 0.1, 0.03, 0, 1.12, -0.45);
    k.rb(M.trim, 0.56, 0.42, 0.03, 0.02, 0, 1.55, -0.395);
    k.rb(M.dark, 0.2, 0.3, 0.06, 0.02, 0.22, 1.2, -0.38);
    k.add(decal('civicomm', 512, 96, (gg, w, h) => { txt(gg, 'CIVICOMM', w / 2, 40, 54, '#1c3a44', 800, 'center', 'middle', 10); txt(gg, 'PUBLIC COMMUNICATIONS · FREE EMERGENCY CALLS', w / 2, 80, 16, '#3a5560', 600); }), gPlane(0.66, 0.124), 0, 1.98, -0.398);
    k.add(decal('boothKeys', 128, 128, (gg, w, h) => { gg.fillStyle = '#20262c'; gg.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { gg.fillStyle = '#3c454e'; rr(gg, 14 + c * 36, 10 + r * 29, 28, 22, 5); gg.fill(); txt(gg, '123456789*0#'[r * 3 + c], 28 + c * 36, 22 + r * 29, 14, '#cfe0ea', 700); } }), gPlane(0.16, 0.16), -0.2, 1.15, -0.398);
    // cord: coiled helix from the panel down and up to the handset
    const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * 40; pts.push([0.22 + Math.cos(a) * 0.012, 1.08 - Math.sin(t * PI) * 0.25 + Math.sin(a) * 0.012, -0.34 + t * 0.0]); }
    k.add(M.trim, gTube(pts, 0.005, 120, 4, 'boothCord'));
    k.light(0, 2.05, 0, 0xcfefff, 0.7, 4);
    k.solidBox(0, 1.1, -0.47, 0.45, 1.1, 0.07);
    k.solidBox(-0.5, 1.1, -0.05, 0.08, 1.1, 0.42); k.solidBox(0.5, 1.1, -0.05, 0.08, 1.1, 0.42);
  });
  const scr = new THREE.Mesh(gPlane(0.5, 0.36), glowTex('boothScr', 320, 230, (gg, w, h) => { gg.fillStyle = '#04121a'; gg.fillRect(0, 0, w, h); txt(gg, 'NO NETWORK', w / 2, 70, 34, '#ffb03a', 800); txt(gg, 'EMERGENCY CALLS ONLY', w / 2, 120, 20, '#9fd8ef', 600); txt(gg, 'LIFT HANDSET', w / 2, 170, 22, '#e8f6ff', 700); scan(gg, w, h, 0.25); }, 1.2));
  scr.position.set(0, 1.55, -0.378); g.add(scr);
  const hs = new THREE.Group(); hs.name = 'handset';
  const hm = new THREE.Mesh(gRB(0.05, 0.22, 0.045, 0.02), M.dark); hs.add(hm);
  for (const y of [-0.1, 0.1]) { const e = new THREE.Mesh(gRB(0.065, 0.06, 0.06, 0.025), M.dark); e.position.set(0, y, 0.015); hs.add(e); }
  hs.position.set(0.22, 1.2, -0.32); g.add(hs);
  g.userData.nodes.handset = hs; g.userData.nodes.screen = scr;
  return g;
}

/* ---------- evacuation / relief ---------- */
function reliefMark(g, cx, cy, r) {
  // CIVIC RELIEF emblem: an orange disc holding a roof over a wave
  g.fillStyle = '#e0701c'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.fillStyle = '#f4f0e4'; g.beginPath(); g.moveTo(cx - r * 0.55, cy - r * 0.02); g.lineTo(cx, cy - r * 0.55); g.lineTo(cx + r * 0.55, cy - r * 0.02); g.lineTo(cx + r * 0.38, cy - r * 0.02); g.lineTo(cx, cy - r * 0.33); g.lineTo(cx - r * 0.38, cy - r * 0.02); g.fill();
  g.strokeStyle = '#f4f0e4'; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(cx - r * 0.55, cy + r * 0.3); g.bezierCurveTo(cx - r * 0.25, cy + r * 0.05, cx + r * 0.05, cy + r * 0.5, cx + r * 0.55, cy + r * 0.2); g.stroke();
}
function tentCloth() {
  return mc('tentCloth', () => { const t = ctex('tentClothT', 512, 512, (g, w, h) => { g.fillStyle = '#cfc8b2'; g.fillRect(0, 0, w, h); const R = rng(6); for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(120,110,90,${0.05 + R() * 0.05})`; g.fillRect(0, y, w, 1); } blots(g, w, h, R, 40, 20, 100, '90,80,60', 0.05, 0.18); streaks(g, w, h, R, 60, '70,60,45', 0.2, 0.5); }, true); t.repeat.set(0.5, 0.5); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, side: THREE.DoubleSide }); });
}
const sagPlane = (w, h, sag, key) => gc('sag' + key, () => deform(new THREE.PlaneGeometry(w, h, 8, 6), v => { v.z -= sag * (1 - (2 * v.x / w) ** 2) * (1 - (2 * v.y / h) ** 2); }, true));
function cotInto(k) {
  const fr = matte(0x7a8288, 'grime', 0.35, 0.8);
  for (const sx of [-1, 1]) k.rod(fr, 0.014, [-0.95, 0.42, sx * 0.33], [0.95, 0.42, sx * 0.33]);
  for (const x of [-0.95, 0.95]) k.rod(fr, 0.014, [x, 0.42, -0.33], [x, 0.42, 0.33]);
  for (const x of [-0.7, 0, 0.7]) { k.rod(fr, 0.012, [x - 0.12, 0, -0.33], [x + 0.12, 0.42, -0.33]); k.rod(fr, 0.012, [x + 0.12, 0, -0.33], [x - 0.12, 0.42, -0.33]); k.rod(fr, 0.012, [x - 0.12, 0, 0.33], [x + 0.12, 0.42, 0.33]); k.rod(fr, 0.012, [x + 0.12, 0, 0.33], [x - 0.12, 0.42, 0.33]); }
  k.add(Flat(0x4d5a4a, 0.95), sagPlane(1.9, 0.66, 0.05, 'cot'), 0, 0.425, 0, PI / 2, 0, 0);
  k.rb(Flat(0x6a3a34, 0.95), 0.5, 0.08, 0.62, 0.03, 0.55, 0.42, 0, 0, 0, 0.05);
  k.rb(Flat(0xd8d4c8, 0.9), 0.32, 0.08, 0.5, 0.04, -0.75, 0.43, 0);
}
function cot() { return cachedKit('cot', k => { cotInto(k); k.solidBox(0, 0.22, 0, 0.96, 0.22, 0.35); }); }
/** emergency relief tent 4 x 3 m, door on +Z */
function evacTent() {
  return cachedKit('evacTent', k => {
    const cl = tentCloth(), pole = matte(0xa8aeb2, 'grime', 0.35, 0.8);
    const L = 4, W = 3, Hw = 1.65, Hr = 2.5, half = W / 2;
    const slope = Math.hypot(half, Hr - Hw), ang = Math.atan2(Hr - Hw, half);
    // roof panels
    for (const ry of [0, PI]) k.at(0, 0, 0, 0, ry, 0, () => k.add(cl, sagPlane(L, slope, 0.025, 'roof'), 0, (Hw + Hr) / 2, half / 2, -PI / 2 + ang, 0, 0));
    // back + front walls (front has the door gap)
    k.add(cl, sagPlane(L, Hw, 0.04, 'wallL'), 0, Hw / 2, -half);
    for (const sx of [-1, 1]) k.add(cl, sagPlane(1.4, Hw, 0.03, 'wallF'), sx * 1.3, Hw / 2, half);
    // gable ends
    const gable = gc('gable', () => shapeGeo([[-half, 0], [half, 0], [half, Hw], [0, Hr], [-half, Hw]]));
    for (const sx of [-1, 1]) k.add(cl, gable, sx * L / 2, 0, 0, 0, PI / 2, 0);
    // rolled door flap
    k.add(cl, gCyl(0.07, 0.07, 1.2, 10), 0, Hw - 0.05, half + 0.04, 0, 0, PI / 2);
    for (const sx of [-1, 1]) k.rod(Flat(0x2a2a2a, 0.9), 0.004, [sx * 0.55, Hw, half + 0.01], [sx * 0.55, Hw - 0.12, half + 0.1]);
    // markings
    const mark = decal('reliefWall', 1024, 256, (g, w, h) => { g.fillStyle = 'rgba(224,112,28,0.9)'; g.fillRect(0, h - 40, w, 22); reliefMark(g, 120, 108, 86); txt(g, 'CIVIC RELIEF', 240, 92, 96, '#2a2f33', 800, 'left', 'middle', 6); txt(g, 'SHELTER 07  ·  REGISTRATION  ·  WATER  ·  MEDICAL', 244, 166, 30, '#3a4045', 600, 'left'); }, { rough: 0.9, double: true });
    k.add(mark, gPlane(3.0, 0.75), 0, 0.95, -half - 0.03, 0, PI, 0);
    k.add(decal('reliefRoof', 512, 512, (g, w, h) => { reliefMark(g, w / 2, h / 2 - 40, 180); txt(g, 'CIVIC RELIEF', w / 2, h - 50, 64, '#2a2f33', 800); }, { rough: 0.9 }), gPlane(1.3, 1.3), 0, (Hw + Hr) / 2 + 0.02, half / 2 + 0.01, -PI / 2 + ang, 0, 0);
    k.add(decal('reliefDoor', 512, 128, (g, w, h) => { txt(g, 'SHELTER 07', w / 2, 64, 72, '#2a2f33', 800, 'center', 'middle', 6); }, { rough: 0.9 }), gPlane(1.0, 0.25), 0, Hw - 0.25, half + 0.01);
    // frame
    for (const x of [-L / 2, 0, L / 2]) { for (const z of [-half, half]) k.rod(pole, 0.022, [x, 0, z], [x, Hw, z]); k.rod(pole, 0.02, [x, Hw, -half], [x, Hr, 0]); k.rod(pole, 0.02, [x, Hw, half], [x, Hr, 0]); }
    k.rod(pole, 0.022, [-L / 2, Hr, 0], [L / 2, Hr, 0]);
    // guy ropes + pegs
    for (const x of [-L / 2, L / 2]) for (const s of [-1, 1]) { k.rod(Flat(0xc8a050, 0.9), 0.005, [x, Hw, s * half], [x + Math.sign(x) * 0.6, 0.02, s * (half + 0.9)], 4); k.cyl(M.steel, 0.01, 0.01, 0.2, x + Math.sign(x) * 0.6, 0.06, s * (half + 0.9), 0, 0, 0.3, 6); }
    k.add(Flat(0x3a3f3a, 0.95), gPlane(L, W), 0, 0.01, 0, -PI / 2, 0, 0);
    k.at(-0.9, 0, -0.6, 0, PI / 2 * 0, 0, () => cotInto(k));
    k.solidBox(0, 1.1, -half, L / 2, 1.1, 0.06);
    for (const sx of [-1, 1]) { k.solidBox(sx * L / 2, 1.1, 0, 0.06, 1.1, half); k.solidBox(sx * 1.3, 1.1, half, 0.7, 1.1, 0.06); }
    k.solidBox(0, Hr - 0.3, 0, L / 2, 0.35, half);
  });
}
function supplyCrate(opts = {}) {
  const open = !!opts.open;
  return cachedKit('crate' + open, k => {
    const R = rng(open ? 2 : 1), body = matte(0x4c5448, 'grime', 0.55, 0.05), dk = Flat(0x2a2e2a, 0.6);
    k.rb(body, 1.0, 0.48, 0.6, 0.04, 0, 0.26, 0);
    for (const x of [-0.35, 0, 0.35]) k.rb(body, 0.05, 0.5, 0.62, 0.015, x, 0.26, 0);
    k.rb(dk, 1.02, 0.04, 0.62, 0.015, 0, 0.03, 0);
    for (const sx of [-1, 1]) { k.rb(dk, 0.04, 0.05, 0.22, 0.015, sx * 0.51, 0.38, 0); k.rb(Flat(0xb8a040, 0.4, 0.6), 0.1, 0.06, 0.02, 0.01, sx * 0.3, 0.44, 0.31); }
    const lbl = decal('crateLbl', 512, 192, (g, w, h) => { g.fillStyle = 'rgba(240,236,224,0.95)'; rr(g, 4, 4, w - 8, h - 8, 10); g.fill(); reliefMark(g, 80, h / 2, 56); txt(g, 'CIVIC RELIEF', 160, 56, 46, '#1c2328', 800, 'left'); txt(g, 'RATIONS · 24 MEALS · 12 L WATER', 162, 104, 24, '#3a4045', 700, 'left'); g.fillStyle = '#1c2328'; for (let x = 162; x < w - 30; x += 5) g.fillRect(x, 128, (x * 7) % 3 + 1, 40); }, { rough: 0.8 });
    k.add(lbl, gPlane(0.62, 0.23), -0.1, 0.24, 0.302);
    k.add(lbl, gPlane(0.62, 0.23), 0.1, 0.24, -0.302, 0, PI, 0);
    k.add(decal('crateSerial', 256, 64, (g, w, h) => txt(g, 'CR-07 / 2071-0911', w / 2, h / 2, 26, 'rgba(230,230,220,0.85)', 700)), gPlane(0.36, 0.09), 0, 0.26, 0.0 + 0.0, 0, PI / 2, 0);
    k.at(0, 0.5, -0.3, open ? -1.9 : 0, 0, 0, () => { k.rb(body, 1.0, 0.06, 0.6, 0.025, 0, 0.03, 0.3); k.rb(dk, 0.8, 0.02, 0.4, 0.01, 0, 0.07, 0.3); });
    if (open) {
      for (let i = 0; i < 8; i++) k.rb(Flat(0xb8bcc0, 0.35, 0.8), 0.18, 0.04, 0.12, 0.01, -0.36 + (i % 4) * 0.2, 0.5 + Math.floor(i / 4) * 0.045, -0.05 + (i > 3 ? 0.12 : 0), 0, R() * 0.2, 0);
      for (let i = 0; i < 5; i++) k.add(drinkMat(0x9fd8f0), gLathe(BOTTLE, 12), 0.2 + i * 0.06, 0.28, 0.16, 0, 0, 0, 1.3);
      k.rb(Flat(0xb8bcc0, 0.35, 0.8), 0.18, 0.04, 0.12, 0.01, 0.75, 0.02, 0.3, 0, 0.6, 0);
    }
    k.solidBox(0, 0.27, 0, 0.52, 0.27, 0.31);
  });
}
function burlap() {
  return mc('burlap', () => { const t = ctex('burlapT', 256, 256, (g, w, h) => { g.fillStyle = '#9a8662'; g.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 4) { g.fillStyle = 'rgba(60,48,30,0.25)'; g.fillRect(i, 0, 1.5, h); g.fillRect(0, i, w, 1.5); } const R = rng(3); blots(g, w, h, R, 30, 10, 50, '60,50,35', 0.1, 0.3); }, true); t.repeat.set(3, 3); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.97 }); });
}
function sandbags() {
  return cachedKit('sandbags', k => {
    const R = rng(4);
    const bag = i => gc('sandbag' + i, () => deform(roundBoxGeo(0.62, 0.17, 0.36, 0.075, 3), v => { const fx = 1 - (v.x / 0.31) ** 4; v.y *= 0.65 + 0.35 * fx; v.z *= 0.85 + 0.15 * fx; v.y += 0.012 * n3(v.x * 6, v.y * 6, v.z * 6, i); }, true));
    const rows = [[-0.96, -0.32, 0.32, 0.96], [-0.64, 0, 0.64], [-0.32, 0.32]];
    rows.forEach((row, r) => row.forEach((x, i) => k.add(burlap(), bag((r * 4 + i) % 4), x + (R() - 0.5) * 0.05, 0.075 + r * 0.14, (R() - 0.5) * 0.06 + (r === 2 ? -0.02 : 0), (R() - 0.5) * 0.06, (R() - 0.5) * 0.12, (R() - 0.5) * 0.05)));
    k.add(burlap(), bag(1), 0.95, 0.075, 0.42, 0, 0.9, 0);
    k.solidBox(0, 0.24, 0, 1.25, 0.24, 0.22);
  });
}

/* ---------- robots (dead) ---------- */
const gCap = (r, l, cs = 4, rs = 10) => gc(`cap${r},${l}`, () => new THREE.CapsuleGeometry(r, l, cs, rs));
function limb(k, mat, joint, a, b, r) {
  const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize());
  const m = k.T.clone().multiply(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new V3(1, 1, 1)));
  let e = k.parts.get(mat); if (!e) k.parts.set(mat, e = []); e.push({ geo: gCap(r, Math.max(0.01, +(L - 2 * r).toFixed(3))), m });
  k.add(joint, gSph(+(r * 1.05).toFixed(3), 12, 8), ...a);
}
function robotCorpse(opts = {}) {
  const kind = opts.kind ?? 'household', seed = opts.seed ?? 1;
  return cachedKit(`robot${kind}|${seed}`, k => {
    const R = rng(seed * 17 + kind.length);
    const joint = M.gunmetal, cablesM = [Flat(0x8a2a1a, 0.5, 0.1), M.trim, Flat(0x8a2a1a, 0.5, 0.1), M.trim];
    const spill = (p, n) => { for (let i = 0; i < n; i++) { const pts = [p]; let [x, y, z] = p; for (let j = 0; j < 4; j++) { x += (R() - 0.5) * 0.25; z += (R() - 0.5) * 0.25; y = Math.max(0.01, y - 0.05 - R() * 0.05); pts.push([x, y, z]); } k.add(cablesM[i % 4], gTube(pts, 0.006, 16, 4)); } };
    if (kind === 'courier') {
      // six-wheeled sidewalk rover tipped on its side, lid open, parcels out
      const sh = paint(0xe9e9e6, 'soot'), acc = matte(0xe08a1c, 'grime', 0.45);
      k.at(0, 0.36, 0, 0, R.range(-0.4, 0.4), PI / 2 - 0.08, () => {
        k.rb(sh, 0.62, 0.5, 0.9, 0.08, 0, 0, 0);
        k.rb(acc, 0.64, 0.06, 0.92, 0.02, 0, -0.12, 0);
        k.add(lumenLivery('Lumen Parcel'), gPlane(0.8, 0.31), 0.315, 0.05, 0, 0, PI / 2, 0);
        for (const z of [-0.32, 0, 0.32]) for (const sx of [-1, 1]) k.at(sx * 0.33, -0.25, z, () => { k.add(M.rubber, gLathe(TYRE, 20), 0, 0, 0, 0, 0, PI / 2, 0.38, 0.38, 0.38); });
        k.at(0, 0.25, -0.42, -1.6, 0, 0, () => k.rb(sh, 0.58, 0.04, 0.8, 0.03, 0, 0, 0.4));
        k.rb(M.darkGlass, 0.4, 0.08, 0.04, 0.02, 0, 0.12, 0.455);
        k.rod(M.alu, 0.006, [0.2, 0.25, -0.35], [0.5, 0.95, -0.4]);
        k.add(Flat(0xe08a1c, 0.6), gc('flag', () => shapeGeo([[0, 0], [0.18, 0.05], [0, 0.12]])), 0.5, 0.83, -0.4, 0, 0, 0.6);
      });
      for (let i = 0; i < 4; i++) { const s = R.range(0.18, 0.32); k.rb(M.cardboard, s, s * 0.7, s * 0.9, 0.008, R.range(-0.2, 0.9), s * 0.35, R.range(-0.7, 0.7), 0, R() * TAU, 0); }
      spill([0.1, 0.3, 0.3], 3); sootPatch(k, 0.1, 0, 0.8, R);
      k.solidBox(0, 0.32, 0, 0.5, 0.32, 0.5);
      return;
    }
    const sec = kind === 'security';
    const shell = sec ? matte(0x2c3036, 'soot', 0.45, 0.5) : paint(0xe8eaea, 'soot');
    const acc = sec ? matte(0xd8a020, 'grime', 0.5) : Flat(0x7fd6ff, 0.3);
    const s = sec ? 1.15 : 1;
    // lying on its back along X, slightly rolled; head toward +X
    k.at(0, 0, 0, 0, R.range(-0.5, 0.5), 0, () => k.at(0, 0, 0, R.range(-0.25, 0.25), 0, 0, s, () => {
      const ty = 0.17;
      // torso + pelvis
      if (sec) { k.rb(shell, 0.62, 0.3, 0.48, 0.08, 0.1, ty, 0, 0, 0, PI / 2); k.rb(acc, 0.3, 0.06, 0.5, 0.02, 0.15, ty + 0.15, 0, 0, 0, PI / 2); k.rb(shell, 0.2, 0.32, 0.4, 0.06, 0.25, ty + 0.05, 0.0); }
      else {
        k.add(shell, gCap(0.19, 0.3, 6, 16), 0.1, ty, 0, 0, 0, PI / 2, 1, 1, 0.75); k.add(M.dark, gCap(0.12, 0.12, 4, 12), -0.25, ty - 0.02, 0, 0, 0, PI / 2);
        k.rb(M.crackGlass, 0.26, 0.03, 0.2, 0.012, 0.14, ty + 0.17, 0, 0, 0, -0.08);
        for (const sz of [-1, 1]) k.add(shell, gSph(0.075, 14, 10), 0.3, ty + 0.01, sz * 0.21);
      }
      k.rb(shell, 0.2, 0.2, 0.34, 0.06, -0.38, ty - 0.02, 0);
      // neck + head (sometimes torn off and lying apart)
      const headOff = R() < 0.5;
      const hx = headOff ? 0.75 + R() * 0.3 : 0.55, hz = headOff ? R.range(-0.5, 0.5) : 0;
      k.at(hx, ty - 0.02 + (headOff ? -0.02 : 0), hz, R.range(-1, 1), R.range(-0.5, 0.5), headOff ? R.range(-1, 1) : -0.2, () => {
        if (sec) { k.rb(shell, 0.26, 0.24, 0.3, 0.08, 0, 0, 0); k.rb(M.darkGlass, 0.04, 0.05, 0.26, 0.015, 0.13, 0.03, 0); k.rb(Flat(0x3a0808, 0.3), 0.045, 0.012, 0.2, 0.004, 0.13, 0.03, 0); }
        else { k.add(shell, gSph(0.15, 20, 14), 0, 0, 0, 0, 0, 0, 1.0, 1.1, 0.95); k.add(M.crackGlass, gSph(0.152, 20, 10, 0), 0.02, 0, 0, 0, 0, -PI / 2, 1.0, 1.0, 0.8); }
      });
      if (!headOff) k.add(joint, gCyl(0.05, 0.05, 0.12, 10), 0.42, ty - 0.02, 0, 0, 0, PI / 2);
      else spill([0.38, ty, 0], 4);
      // arms
      for (const sz of [-1, 1]) {
        const lost = R() < 0.35;
        const sh0 = [0.3, ty, sz * 0.24];
        if (lost) { spill(sh0, 2); k.at(R.range(-0.6, 0.6), 0.06, sz * R.range(0.7, 1.1), 0, R() * TAU, 0, () => { limb(k, shell, joint, [0, 0, 0], [0.32, 0, 0], 0.05 * s); limb(k, shell, joint, [0.32, 0, 0], [0.58, 0, 0.1], 0.042 * s); k.rb(M.dark, 0.1, 0.04, 0.08, 0.02, 0.64, 0, 0.12); }); continue; }
        const el = [0.3 - R.range(0.05, 0.3), 0.06, sz * R.range(0.4, 0.55)], wr = [el[0] + R.range(-0.3, 0.2), 0.05, el[2] + sz * R.range(0.05, 0.3)];
        limb(k, shell, joint, sh0, el, 0.05); limb(k, shell, joint, el, wr, 0.042); k.rb(M.dark, 0.1, 0.04, 0.08, 0.02, wr[0], wr[1], wr[2], 0, R() * TAU, 0);
      }
      // legs
      for (const sz of [-1, 1]) {
        const hip = [-0.42, ty - 0.04, sz * 0.1], kn = [-0.85, 0.07 + R() * 0.15, sz * R.range(0.12, 0.3)], an = [-1.25 + R() * 0.15, 0.06, kn[2] + sz * R.range(0, 0.2)];
        limb(k, shell, joint, hip, kn, 0.065); limb(k, shell, joint, kn, an, 0.055);
        k.rb(M.dark, 0.1, 0.07, 0.2, 0.03, an[0] - 0.04, an[1], an[2], 0, 0, PI / 2 - 0.3);
      }
      if (sec) k.add(decal('secDecal', 256, 96, (g, w, h) => { txt(g, 'CIVIC SECURITY', w / 2, 34, 30, '#d8a020', 800, 'center', 'middle', 3); txt(g, 'UNIT S-2209', w / 2, 72, 20, '#c8c8c0', 600); }), gPlane(0.34, 0.13), 0.1, ty + 0.152, 0, -PI / 2, 0, PI / 2);
      else { k.add(decal('homeDecal', 256, 64, (g, w, h) => { txt(g, 'LUMEN HOME · AIDE 4', w / 2, h / 2, 24, '#5a7a8a', 700); }), gPlane(0.24, 0.06), 0.14, ty + 0.145, 0.0, -PI / 2, 0, PI / 2); k.add(acc, gTor(0.05, 0.008, 6, 20), 0.12, ty + 0.13, 0, PI / 2, 0, 0); }
    }));
    sootPatch(k, 0, 0, 1.0, R);
    k.solidBox(0, 0.2, 0, 0.75, 0.2, 0.4);
  });
}

/* ---------- small machines ---------- */
function deliveryDrone(opts = {}) {
  const crashed = !!opts.crashed;
  const props = [];
  const g = cachedKit('drone' + crashed, k => {
    const R = rng(crashed ? 6 : 5), sh = paint(0xe6e8e8, crashed ? 'soot' : 'grime'), acc = matte(0xe08a1c, 'grime', 0.45);
    const body = () => {
      k.rb(sh, 0.42, 0.13, 0.36, 0.06, 0, 0.32, 0);
      k.rb(acc, 0.44, 0.03, 0.38, 0.015, 0, 0.27, 0);
      k.rb(M.darkGlass, 0.12, 0.05, 0.04, 0.02, 0, 0.31, 0.18);
      k.add(lumenLivery('Lumen Parcel'), gPlane(0.3, 0.12), 0.211, 0.33, 0, 0, PI / 2, 0);
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + i * PI / 2, x = Math.sin(a) * 0.42, z = Math.cos(a) * 0.42;
        const broke = crashed && i === 1;
        k.rb(sh, 0.05, 0.035, 0.38, 0.015, x * 0.55, 0.34, z * 0.55, 0, a, broke ? 0.4 : 0);
        if (broke) continue;
        k.add(M.dark, gTor(0.16, 0.014, 6, 28), x, 0.36, z, PI / 2, 0, 0);
        k.cyl(M.gunmetal, 0.025, 0.025, 0.06, x, 0.34, z, 0, 0, 0, 10);
        if (crashed) k.box(M.dark, 0.26, 0.004, 0.025, x, 0.375, z, 0, R() * PI, 0);
      }
      // skids
      for (const sx of [-1, 1]) { k.rod(M.alu, 0.008, [sx * 0.15, 0.26, 0.12], [sx * 0.2, 0.02, 0.15]); k.rod(M.alu, 0.008, [sx * 0.15, 0.26, -0.12], [sx * 0.2, 0.02, -0.15]); k.rod(M.alu, 0.009, [sx * 0.2, 0.015, -0.25], [sx * 0.2, 0.015, 0.25]); }
    };
    if (crashed) {
      k.at(0, -0.05, 0, 0.5, 0.4, 0.3, body);
      k.rb(M.cardboard, 0.3, 0.2, 0.26, 0.01, 0.55, 0.1, 0.3, 0, 0.6, 0.2);
      k.at(-0.4, 0.38, -0.4, () => k.add(M.dark, gTor(0.16, 0.014, 6, 28, PI * 1.2), 0, -0.36, 0, PI / 2 + 0.2, 0, 0));
      shards(k, R, 15, 0.2, 0.2, 0.6, 0.6); sootPatch(k, 0, 0, 0.7, R);
    } else {
      body();
      k.rb(M.cardboard, 0.3, 0.2, 0.26, 0.01, 0, 0.13, 0);
      k.add(decal('tape', 64, 64, (gg, w, h) => { gg.fillStyle = '#e08a1c'; gg.fillRect(0, 0, w, h); txt(gg, 'LP', w / 2, h / 2, 30, '#fff', 800); }), gPlane(0.1, 0.1), 0, 0.13, 0.131);
    }
    k.solidBox(0, 0.2, 0, 0.5, 0.2, 0.5);
  });
  if (!crashed) {
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; const p = new THREE.Mesh(gBox(0.28, 0.004, 0.03), M.dark); p.position.set(Math.sin(a) * 0.42, 0.375, Math.cos(a) * 0.42); g.add(p); props.push(p); }
    const led = new THREE.Mesh(gSph(0.012, 8, 6), Glow(0x40ff80, 3)); led.position.set(0, 0.36, 0.19); g.add(led);
    let t0 = 0; g.userData.update = dt => { t0 += dt; props.forEach((p, i) => { p.rotation.y += dt * (i % 2 ? 1.2 : -1.2) * (0.5 + 0.5 * Math.sin(t0 * 0.3)); }); led.visible = (t0 * 0.8) % 1 < 0.15; };
  } else {
    const spark = new THREE.Mesh(gSph(0.03, 8, 6), Glow(0xffd090, 6)); spark.position.set(0.25, 0.2, 0.25); g.add(spark);
    let t0 = 0, nx = 0.5; g.userData.update = dt => { t0 += dt; if (t0 > nx) { spark.visible = !spark.visible; nx = t0 + (spark.visible ? 0.04 : 0.3 + Math.random() * 1.5); spark.scale.setScalar(0.5 + Math.random()); } };
    g.userData.lights = [{ x: 0.25, y: 0.25, z: 0.25, color: 0xffc070, intensity: 0, distance: 3 }];
  }
  return g;
}
function scooter() {
  return cachedKit('scooter', k => {
    const sh = matte(0x22262a, 'grime', 0.4, 0.3), acc = Flat(0x30c8b0, 0.4);
    k.at(0, 0, 0, 0, 0, 0.12, () => {
      k.rb(sh, 0.15, 0.05, 0.78, 0.02, 0, 0.12, 0);
      k.rb(Flat(0x111214, 0.95), 0.13, 0.008, 0.6, 0.004, 0, 0.147, -0.04);
      k.add(decal('rideDecal', 256, 48, (g, w, h) => txt(g, 'HALCYON RIDE  ·  #2207', w / 2, h / 2, 22, '#30c8b0', 700)), gPlane(0.42, 0.08), 0.076, 0.12, 0, 0, PI / 2, 0);
      for (const z of [0.42, -0.4]) k.at(0, 0.11, z, () => { k.add(M.rubber, gLathe(TYRE, 20), 0, 0, 0, 0, 0, PI / 2, 0.3, 0.3, 0.3); k.cyl(M.alu, 0.07, 0.07, 0.05, 0, 0, 0, 0, 0, PI / 2, 14); });
      k.rod(sh, 0.018, [0, 0.11, 0.42], [0, 1.0, 0.36]);
      k.rod(sh, 0.016, [-0.24, 1.0, 0.36], [0.24, 1.0, 0.36]);
      for (const sx of [-1, 1]) k.cyl(M.rubber, 0.02, 0.02, 0.1, sx * 0.21, 1.0, 0.36, 0, 0, PI / 2, 8);
      k.rb(M.darkGlass, 0.08, 0.04, 0.02, 0.01, 0, 1.0, 0.38);
      k.rb(Glow(0xe8f4ff, 2), 0.05, 0.02, 0.01, 0.005, 0, 0.9, 0.38);
      k.rb(acc, 0.14, 0.01, 0.02, 0.004, 0, 0.12, 0.39);
      k.rod(M.alu, 0.008, [0.06, 0.1, -0.1], [0.14, 0.0, -0.2]);
    });
    k.solidBox(0, 0.5, 0, 0.15, 0.5, 0.45);
  });
}
function chargingStation() {
  return cachedKit('charger', k => {
    const wh = matte(0xe4e6e6, 'grime', 0.35, 0.1);
    k.rb(M.gunmetal, 0.5, 0.08, 0.4, 0.02, 0, 0.04, 0);
    k.rb(wh, 0.36, 1.55, 0.26, 0.06, 0, 0.85, 0);
    k.rb(M.trim, 0.3, 0.9, 0.02, 0.02, 0, 1.0, 0.125);
    k.rb(Glow(0x30d0b0, 1.8), 0.012, 1.3, 0.012, 0.004, 0.18, 0.85, 0.11);
    k.add(glowTex('chargeScr', 192, 256, (g, w, h) => { g.fillStyle = '#04121a'; g.fillRect(0, 0, w, h); txt(g, 'LUMEN', w / 2, 34, 30, '#fff', 800, 'center', 'middle', 4); txt(g, 'CHARGE', w / 2, 62, 16, '#30d0b0', 600, 'center', 'middle', 4); g.strokeStyle = '#123'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, 140, 44, 0, TAU); g.stroke(); g.strokeStyle = '#ff6a3a'; g.beginPath(); g.arc(w / 2, 140, 44, -PI / 2, -PI / 2 + 0.3); g.stroke(); txt(g, 'GRID', w / 2, 130, 20, '#ff6a3a', 800); txt(g, 'OFFLINE', w / 2, 154, 16, '#ff6a3a', 700); txt(g, 'STATION 0447', w / 2, 226, 14, '#5a8a9a', 600); scan(g, w, h, 0.2); }, 1.1), gPlane(0.22, 0.29), 0, 1.25, 0.136);
    k.rb(M.dark, 0.1, 0.14, 0.08, 0.02, 0.0, 0.7, 0.16);
    k.rb(M.dark, 0.06, 0.12, 0.08, 0.02, -0.0, 0.68, 0.22, 0.6, 0, 0);
    const pts = [[0.18, 0.5, 0.05]]; for (let i = 1; i <= 16; i++) { const t = i / 16; pts.push([0.22 + Math.sin(t * 9) * 0.06 + t * 0.05, 0.5 - Math.sin(t * PI) * 0.42, 0.05 + Math.cos(t * 9) * 0.06 + t * 0.12]); }
    pts.push([0.04, 0.62, 0.24]);
    k.add(Flat(0x111214, 0.6), gTube(pts, 0.014, 60, 6, 'chargeCable'));
    k.add(decal('chargeBrand', 128, 512, (g, w, h) => { g.save(); g.translate(w / 2, h / 2); g.rotate(-PI / 2); txt(g, 'LUMEN CHARGE', 0, 0, 48, '#1c3a44', 800, 'center', 'middle', 8); g.restore(); }), gPlane(0.07, 0.8), 0.181, 0.95, 0, 0, PI / 2, 0);
    k.solidBox(0, 0.82, 0, 0.2, 0.82, 0.15);
  });
}

/* ---------- big structures ---------- */
/** metro stairwell canopy. The opening the level must cut is x in [-1.5, 1.5], z in [-3, 3]:
    stairs start at ground level at z = +3 and descend toward -Z. Balustrades sit just outside the opening. */
function subwayEntrance() {
  return cachedKit('subway', k => {
    const st = matte(0x5a6168, 'grime', 0.35, 0.85), glass = Mat('glass');
    const z0 = -3.15, z1 = 2.4;
    // glass balustrades + steel handrails around three sides of the opening
    for (const sx of [-1, 1]) {
      k.add(glass, gBox(0.02, 1.0, 6.15), sx * 1.62, 0.55, -0.075);
      k.rb(st, 0.06, 0.05, 6.2, 0.02, sx * 1.62, 1.08, -0.075);
      k.rb(st, 0.1, 0.08, 6.2, 0.02, sx * 1.62, 0.04, -0.075);
      for (let z = -3.1; z <= 3.0; z += 1.53) k.rb(st, 0.04, 1.05, 0.04, 0.01, sx * 1.62, 0.55, z);
    }
    k.add(glass, gBox(3.24, 1.0, 0.02), 0, 0.55, z0); k.rb(st, 3.3, 0.05, 0.06, 0.02, 0, 1.08, z0); k.rb(st, 3.3, 0.08, 0.1, 0.02, 0, 0.04, z0);
    // posts + arched glass canopy with steel ribs
    for (const sx of [-1, 1]) for (const z of [z0 + 0.05, z1 - 0.1]) k.add(st, gLathe([[0, 0], [0.07, 0], [0.06, 0.1], [0.055, 3.0], [0, 3.0]], 14), sx * 1.75, 0, z);
    const arch = (x) => 3.0 + 0.35 * (1 - (x / 1.95) ** 2);
    const roof = gc('subRoof', () => deform(new THREE.PlaneGeometry(3.9, z1 - z0 + 0.4, 12, 2), v => { const x = v.x; v.z = v.y; v.y = arch(x); v.x = x; }, true));
    k.add(Mat('glassDirty'), roof, 0, 0.04, (z0 + z1) / 2);
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 4) { const pts = []; for (let i = 0; i <= 12; i++) { const x = -1.95 + i * 3.9 / 12; pts.push([x, arch(x), z]); } k.add(st, gTube(pts, 0.03, 24, 6, 'rib' + z.toFixed(2))); }
    for (const sx of [-1, 1]) k.rb(st, 0.08, 0.12, z1 - z0 + 0.4, 0.02, sx * 1.95, 3.0, (z0 + z1) / 2);
    k.rb(st, 3.9, 0.12, 0.08, 0.02, 0, 3.0, z0 - 0.2);
    // lit sign across the front
    k.rb(M.dark, 3.4, 0.5, 0.18, 0.04, 0, 3.55, z1 + 0.15);
    const sign = glowTex('metroSign', 1024, 150, (g, w, h) => {
      g.fillStyle = '#0a1a24'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8b23a'; g.beginPath(); g.arc(80, h / 2, 56, 0, TAU); g.fill(); txt(g, 'M', 80, h / 2 + 4, 76, '#0a1a24', 800);
      txt(g, 'METRO — MERIDIAN STATION', 170, h / 2 + 4, 62, '#f2f6f8', 800, 'left', 'middle', 2);
      g.fillStyle = '#30b8c8'; g.fillRect(170, h - 22, w - 200, 6);
    }, 1.6);
    k.add(sign, gPlane(3.3, 0.48), 0, 3.55, z1 + 0.242);
    k.add(sign, gPlane(3.3, 0.48), 0, 3.55, z1 + 0.058, 0, PI, 0);
    // totem beside the mouth
    k.rb(M.dark, 0.36, 2.6, 0.36, 0.05, 2.25, 1.3, 2.7);
    const tot = glowTex('metroTotem', 128, 512, (g, w, h) => { g.fillStyle = '#0a1a24'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8b23a'; g.beginPath(); g.arc(w / 2, 70, 50, 0, TAU); g.fill(); txt(g, 'M', w / 2, 74, 70, '#0a1a24', 800); g.save(); g.translate(w / 2, 300); g.rotate(-PI / 2); txt(g, 'MERIDIAN', 0, 0, 52, '#f2f6f8', 800, 'center', 'middle', 6); g.restore(); txt(g, 'L2 · L5', w / 2, 470, 26, '#30b8c8', 700); }, 1.5);
    for (const [x, z, ry] of [[2.25, 2.881, 0], [2.25, 2.519, PI], [2.431, 2.7, PI / 2], [2.069, 2.7, -PI / 2]]) k.add(tot, gPlane(0.3, 1.2), x, 1.9, z, 0, ry, 0);
    k.add(decal('metroHours', 256, 192, (g, w, h) => { g.fillStyle = 'rgba(10,26,36,0.9)'; g.fillRect(0, 0, w, h); txt(g, 'SERVICE SUSPENDED', w / 2, 40, 24, '#ff6a3a', 800); txt(g, 'BY ORDER OF', w / 2, 90, 18, '#c8d8e0', 600); txt(g, 'CIVIC CONCORD', w / 2, 120, 22, '#f2f6f8', 800); txt(g, 'SHELTER LEVEL -2', w / 2, 165, 18, '#30b8c8', 700); }), gPlane(0.5, 0.375), 1.645, 0.75, 2.2, 0, PI / 2, 0);
    k.light(0, 3.2, z1 + 0.6, 0xe8f4ff, 1.6, 10);
    k.light(0, 2.8, 0, 0xcfe4ff, 1.0, 8);
    for (const sx of [-1, 1]) k.solidBox(sx * 1.63, 0.55, -0.075, 0.06, 0.55, 3.1);
    k.solidBox(0, 0.55, z0, 1.68, 0.55, 0.06);
    k.solidBox(2.25, 1.3, 2.7, 0.18, 1.3, 0.18);
  });
}

function rooftopAC() {
  return cachedKit('rooftopAC', k => {
    const body = Mat('panelGrey');
    const louv = mc('louver', () => { const t = ctex('louverT', 256, 256, (g, w, h) => { g.fillStyle = '#5c6268'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 12) { g.fillStyle = '#2a2e32'; g.fillRect(8, y + 2, w - 16, 6); g.fillStyle = '#868c92'; g.fillRect(8, y + 8, w - 16, 2); } const R = rng(5); streaks(g, w, h, R, 30, '70,40,20', 0.4, 0.5); }); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.5 }); });
    for (const z of [-0.65, 0.65]) k.rb(M.gunmetal, 2.3, 0.12, 0.12, 0.02, 0, 0.06, z);
    k.rb(body, 2.2, 1.1, 1.4, 0.04, 0, 0.67, 0);
    for (const sx of [-1, 1]) k.add(louv, gPlane(1.25, 0.9), sx * 1.102, 0.67, 0, 0, sx * PI / 2, 0);
    k.add(louv, gPlane(2.0, 0.9), 0, 0.67, 0.702);
    const grille = mc('fanGrille', () => new THREE.MeshStandardMaterial({ map: ctex('grilleT', 256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#9aa0a6'; g.lineWidth = 3; for (let r = 20; r < 128; r += 14) { g.beginPath(); g.arc(128, 128, r, 0, TAU); g.stroke(); } for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126); g.stroke(); } }), transparent: true, alphaTest: 0.3, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }));
    for (const x of [-0.52, 0.52]) {
      k.cyl(M.dark, 0.46, 0.46, 0.12, x, 1.24, 0, 0, 0, 0, 32);
      k.cyl(M.black, 0.42, 0.42, 0.01, x, 1.25, 0, 0, 0, 0, 32);
      for (let i = 0; i < 5; i++) k.box(M.gunmetal, 0.36, 0.01, 0.1, x + Math.cos(i * TAU / 5) * 0.18, 1.27, Math.sin(i * TAU / 5) * 0.18, 0.3, -i * TAU / 5, 0);
      k.add(grille, gCircle(0.44, 32), x, 1.305, 0, -PI / 2, 0, 0);
    }
    // duct out the back, bending down
    k.rb(Mat('steel'), 0.5, 0.4, 0.6, 0.02, 0.6, 0.65, -0.95);
    k.rb(Mat('steel'), 0.5, 0.6, 0.4, 0.02, 0.6, 0.35, -1.35);
    for (const x of [-0.6, -0.4]) k.add(Mat('steel'), gTube([[x, 0.4, -0.7], [x, 0.4, -1.0], [x, 0.15, -1.2], [x, 0.05, -1.6]], 0.04, 16, 8, 'acpipe' + x));
    k.add(decal('acPlate', 256, 128, (g, w, h) => { g.fillStyle = '#d8d8d0'; rr(g, 2, 2, w - 4, h - 4, 6); g.fill(); txt(g, 'CONCORD CLIMATE', w / 2, 30, 24, '#222', 800); txt(g, 'RTU-40  ·  R-1234ze', w / 2, 66, 18, '#444', 600); txt(g, '480V 3PH  ·  2064', w / 2, 96, 18, '#444', 600); }), gPlane(0.3, 0.15), 0.8, 1.05, 0.703);
    k.solidBox(0, 0.65, 0, 1.12, 0.65, 0.72);
    k.solidBox(0.6, 0.45, -1.15, 0.26, 0.45, 0.42);
  });
}
function waterTank() {
  return cachedKit('waterTank', k => {
    const tm = Mat('metal'), st = M.gunmetal;
    for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) { k.rb(st, 0.12, 1.2, 0.12, 0.02, x, 0.6, z); k.rb(M.concrete, 0.3, 0.1, 0.3, 0.02, x, 0.05, z); }
    for (const s of [-1, 1]) { k.rod(st, 0.02, [s * 0.85, 0.15, -0.85], [s * 0.85, 1.1, 0.85]); k.rod(st, 0.02, [-0.85, 0.15, s * 0.85], [0.85, 1.1, s * 0.85]); }
    k.rb(st, 2.0, 0.1, 2.0, 0.02, 0, 1.24, 0);
    k.add(tm, gLathe([[0, 1.29], [1.2, 1.29], [1.22, 1.32], [1.22, 3.35], [1.24, 3.4], [0.15, 3.9], [0.12, 3.95], [0, 3.97]], 36));
    for (const y of [1.7, 2.3, 2.9]) k.add(st, gTor(1.235, 0.025, 6, 48), 0, y, 0, PI / 2, 0, 0);
    // ladder on +Z
    for (const sx of [-1, 1]) k.rod(M.steel, 0.018, [sx * 0.2, 1.3, 1.32], [sx * 0.2, 3.5, 1.32]);
    for (let y = 1.45; y < 3.45; y += 0.3) k.rod(M.steel, 0.012, [-0.2, y, 1.32], [0.2, y, 1.32]);
    for (const sx of [-1, 1]) k.rod(M.steel, 0.012, [sx * 0.2, 1.4, 1.22], [sx * 0.2, 1.4, 1.32]);
    k.add(M.steel, gTube([[0.6, 1.3, 0.6], [0.6, 1.0, 0.6], [0.7, 0.4, 0.9], [0.7, 0.1, 1.4]], 0.06, 16, 8, 'tankPipe'));
    k.add(decal('tankDecal', 512, 160, (g, w, h) => { txt(g, 'NON-POTABLE', w / 2, 50, 64, 'rgba(230,230,220,0.85)', 800, 'center', 'middle', 6); txt(g, 'CC WATER · T-118 · 30 m³', w / 2, 118, 34, 'rgba(230,230,220,0.75)', 600); }), gc('tankDecalGeo', () => new THREE.CylinderGeometry(1.226, 1.226, 0.5, 24, 1, true, PI / 2 - 0.8, 1.6)), 0, 2.6, 0);
    k.solidBox(0, 2.0, 0, 1.25, 2.0, 1.25);
  });
}
function antennaMast() {
  const g = cachedKit('antenna', k => {
    const st = matte(0xb8bcc0, 'grime', 0.4, 0.8), H = 8, r = 0.25;
    k.rb(M.concrete, 0.9, 0.3, 0.9, 0.03, 0, 0.15, 0);
    const legs = [0, 1, 2].map(i => [Math.cos(i * TAU / 3) * r, Math.sin(i * TAU / 3) * r]);
    for (const [x, z] of legs) k.rod(st, 0.025, [x, 0.3, z], [x * 0.6, H, z * 0.6], 8);
    for (let y = 0.3, i = 0; y < H - 0.4; y += 0.5, i++) for (let a = 0; a < 3; a++) {
      const f0 = 1 - 0.4 * (y / H), f1 = 1 - 0.4 * ((y + 0.5) / H), A = legs[a], B = legs[(a + 1) % 3];
      k.rod(st, 0.008, [A[0] * f0, y, A[1] * f0], [B[0] * f1, y + 0.5, B[1] * f1], 5);
      k.rod(st, 0.008, [A[0] * f0, y, A[1] * f0], [B[0] * f0, y, B[1] * f0], 5);
    }
    const dish = gLathe([[0.02, 0], [0.15, 0.02], [0.3, 0.07], [0.42, 0.14], [0.4, 0.145], [0.28, 0.08], [0.14, 0.03], [0.01, 0.01]], 28);
    k.at(0.35, 5.6, 0.1, 0, 0.4, 0, () => k.at(0, 0, 0, PI / 2 - 0.1, 0, 0, () => { k.add(M.white, dish); k.rod(st, 0.008, [0, 0.12, 0], [0, 0.4, 0]); }));
    k.at(-0.3, 4.4, -0.15, 0, 2.6, 0, () => k.at(0, 0, 0, PI / 2, 0, 0, () => k.add(M.white, dish, 0, 0, 0, 0, 0, 0, 0.7)));
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; k.rb(M.white, 0.22, 1.2, 0.08, 0.03, Math.cos(a) * 0.3, 6.9, Math.sin(a) * 0.3, 0, -a + PI / 2, 0); }
    k.rod(st, 0.012, [0, H, 0], [0, H + 1.2, 0], 6);
    k.add(mc('redLens2', () => new THREE.MeshStandardMaterial({ color: 0x5a0a0a, roughness: 0.2, transparent: true, opacity: 0.8 })), gSph(0.06, 12, 8), 0, H + 1.25, 0);
    k.rb(M.dark, 0.3, 0.4, 0.2, 0.03, 0, 1.2, 0.25);
    k.light(0, H + 1.3, 0, 0xff2020, 2.5, 25);
    k.solidBox(0, H / 2, 0, 0.3, H / 2, 0.3);
  });
  const lamp = new THREE.Mesh(gSph(0.055, 12, 8), Glow(0xff2020, 5)); lamp.position.set(0, 9.25, 0); g.add(lamp);
  let t0 = Math.random() * 2; const L = g.userData.lights[0];
  g.userData.update = dt => { t0 += dt; const on = (t0 * 0.5) % 1 < 0.2; lamp.visible = on; L.intensity = on ? 2.5 : 0; };
  return g;
}
/** glass walkway segment along X (length), 3.4 m wide, floor slab bottom at y = 0, walking surface at y = 0.3 */
function skyBridge(opts = {}) {
  const len = opts.length ?? 12;
  return cachedKit('skyBridge' + len, k => {
    const R = rng(len * 3), st = matte(0x5a6168, 'grime', 0.35, 0.85), W = 3.4, Hh = 2.9;
    k.rb(Mat('panelGrey'), len, 0.3, W, 0.04, 0, 0.15, 0);
    k.add(Mat('tiles'), gPlane(len, W - 0.2), 0, 0.302, 0, -PI / 2, 0, 0);
    k.rb(Mat('panelWhite'), len, 0.25, W, 0.05, 0, 0.3 + Hh + 0.125, 0);
    k.rb(Glow(0xe8f2ff, 1.4), len - 0.4, 0.015, 0.1, 0.005, 0, 0.3 + Hh - 0.01, 0);
    const n = Math.max(2, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + i * len / n;
      for (const sz of [-1, 1]) k.rb(st, 0.08, Hh, 0.1, 0.02, x, 0.3 + Hh / 2, sz * (W / 2 - 0.05));
      if (i < n) for (const sz of [-1, 1]) {
        const cx = x + len / n / 2, broken = R() < 0.25;
        if (broken && R() < 0.4) continue; // pane gone entirely
        k.add(broken ? M.crackClear : Mat('glass'), gPlane(len / n - 0.08, Hh), cx, 0.3 + Hh / 2, sz * (W / 2 - 0.05), 0, sz > 0 ? 0 : PI, 0);
      }
    }
    for (const sz of [-1, 1]) { k.rb(st, len, 0.06, 0.12, 0.02, 0, 0.33, sz * (W / 2 - 0.05)); k.rb(M.alu, len, 0.04, 0.05, 0.015, 0, 1.05, sz * (W / 2 - 0.15)); }
    k.at(0, 0.3, 0, () => shards(k, R, Math.round(len * 3), 0, 0, len / 2 - 0.3, 1.4));
    k.solidBox(0, 0.15, 0, len / 2, 0.15, W / 2);
    for (const sz of [-1, 1]) k.solidBox(0, 0.3 + Hh / 2, sz * (W / 2 - 0.05), len / 2, Hh / 2, 0.06);
    k.solidBox(0, 0.3 + Hh + 0.125, 0, len / 2, 0.125, W / 2);
  });
}
function emergencyLightBar() {
  return cachedKit('floodlight', k => {
    const st = matte(0xe0c040, 'grime', 0.45, 0.4), dk = M.dark;
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; k.rod(st, 0.018, [0, 1.0, 0], [Math.cos(a) * 0.75, 0.0, Math.sin(a) * 0.75]); k.rb(M.rubber, 0.06, 0.03, 0.06, 0.01, Math.cos(a) * 0.75, 0.015, Math.sin(a) * 0.75); }
    k.cyl(st, 0.04, 0.04, 1.0, 0, 1.4, 0, 0, 0, 0, 12);
    k.cyl(M.alu, 0.03, 0.03, 0.9, 0, 2.3, 0, 0, 0, 0, 12);
    k.rb(dk, 1.3, 0.06, 0.06, 0.02, 0, 2.72, 0);
    for (const [x, y] of [[-0.42, 2.92], [0.42, 2.92], [-0.42, 2.52], [0.42, 2.52]]) k.at(x, y, 0.06, -0.25, 0, 0, () => { k.rb(dk, 0.42, 0.3, 0.1, 0.03, 0, 0, 0); k.rb(Glow(0xf4f8ff, 4), 0.36, 0.24, 0.01, 0.01, 0, 0, 0.051); for (const sx of [-1, 1]) k.rb(dk, 0.02, 0.3, 0.12, 0.005, sx * 0.21, 0, 0.02); });
    for (const x of [-0.42, 0.42]) k.rb(dk, 0.05, 0.5, 0.05, 0.01, x, 2.72, 0);
    // generator on the ground + cable
    k.rb(matte(0xe0c040, 'grime', 0.45, 0.3), 0.7, 0.5, 0.45, 0.06, 1.2, 0.3, -0.3);
    k.rb(dk, 0.74, 0.06, 0.5, 0.02, 1.2, 0.05, -0.3);
    k.add(decal('genDecal', 256, 96, (g, w, h) => { txt(g, 'CIVIC RELIEF', w / 2, 30, 30, '#1c2328', 800); txt(g, 'GEN-3  ·  KEEP DRY', w / 2, 68, 22, '#1c2328', 600); }), gPlane(0.5, 0.19), 1.2, 0.35, -0.074);
    k.add(Flat(0x111214, 0.6), gTube([[0, 1.0, 0], [0.2, 0.3, 0.1], [0.5, 0.02, 0.15], [0.8, 0.02, 0.0], [0.86, 0.2, -0.2]], 0.012, 24, 5, 'genCable'));
    k.light(0, 2.7, 1.2, 0xf4f8ff, 4.0, 22);
    k.solidBox(0, 1.4, 0, 0.3, 1.4, 0.3);
    k.solidBox(1.2, 0.3, -0.3, 0.36, 0.3, 0.24);
  });
}
/** building-mounted screen: back plate at z = 0 (against the wall), face toward +Z.
    y = 0 is the service catwalk deck; the screen spans y = BB_BASE .. BB_BASE + h. */
const BB_BASE = 1.4;
function billboard(opts = {}) {
  const w = opts.w ?? 8, h = opts.h ?? 4.5, glyph = !!opts.glyph, text = opts.text ?? 'HALCYON TRANSIT';
  const g = cachedKit(`billboard${w}|${h}`, k => {
    const st = M.gunmetal, B = BB_BASE;
    k.rb(M.dark, w + 0.3, h + 0.3, 0.35, 0.08, 0, B + h / 2, 0.25);
    for (const sx of [-1, 1]) for (const sy of [0.25, 0.75]) k.rb(st, 0.2, 0.2, 0.25, 0.02, sx * w * 0.35, B - 0.15 + (h + 0.3) * sy, 0.05);
    // service catwalk under the screen (its deck is the prop's base, y = 0)
    k.rb(Mat('grate'), w + 0.3, 0.05, 0.8, 0.01, 0, 0.025, 0.5);
    for (const x of [-w / 2, 0, w / 2]) k.rod(st, 0.03, [x, 0.0, 0.12], [x, B - 0.15, 0.05]);
    k.rod(st, 0.02, [-w / 2 - 0.15, 1.0, 0.88], [w / 2 + 0.15, 1.0, 0.88]);
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) k.rod(st, 0.015, [x, 0.0, 0.88], [x, 1.0, 0.88]);
    k.rb(st, w + 0.3, 0.12, 0.2, 0.03, 0, B + h + 0.21, 0.38);
    for (let i = 0; i < 6; i++) k.cyl(M.dark, 0.05, 0.07, 0.16, -w / 2 + 0.5 + i * (w - 1) / 5, B + h + 0.33, 0.42, -0.6, 0, 0, 10);
    k.solidBox(0, B + h / 2, 0.2, w / 2 + 0.15, h / 2 + 0.15, 0.2);
    k.solidBox(0, 0.025, 0.5, w / 2 + 0.15, 0.025, 0.4);
  });
  const TW = 768, TH = Math.round(768 * h / w);
  let texA, texB;
  if (glyph) {
    const draw = (gg, ww, hh) => { gg.fillStyle = '#050101'; gg.fillRect(0, 0, ww, hh); const gr = gg.createRadialGradient(ww / 2, hh / 2, 10, ww / 2, hh / 2, hh * 0.7); gr.addColorStop(0, 'rgba(120,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, ww, hh); drawGlyph(gg, ww / 2, hh / 2, hh * 0.34, '#ff1818', 0.13); scan(gg, ww, hh, 0.18); };
    texA = ctex(`bbGlyph${TW}x${TH}`, TW, TH, draw);
    texB = ctex(`bbGlyphG${TW}x${TH}`, TW, TH, (gg, ww, hh) => { draw(gg, ww, hh); glitchCanvas(gg, ww, hh, rng(9), 2); });
  } else {
    const hue = opts.hue ?? 195; let hsh = 0; for (const ch of text) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const draw = (gg, ww, hh) => {
      const gr = gg.createLinearGradient(0, 0, ww, hh); gr.addColorStop(0, `hsl(${hue},60%,12%)`); gr.addColorStop(1, `hsl(${(hue + 50) % 360},70%,22%)`); gg.fillStyle = gr; gg.fillRect(0, 0, ww, hh);
      for (let i = 0; i < 6; i++) { gg.strokeStyle = `hsla(${hue + i * 8},90%,65%,0.25)`; gg.lineWidth = 4; gg.beginPath(); gg.moveTo(-50, hh * (0.4 + i * 0.1)); gg.bezierCurveTo(ww * 0.3, hh * (0.1 + i * 0.08), ww * 0.6, hh * (0.9 - i * 0.05), ww + 50, hh * (0.3 + i * 0.07)); gg.stroke(); }
      const cx = ww * 0.73, cy = hh * 0.52; const o = gg.createRadialGradient(cx - 30, cy - 30, 5, cx, cy, hh * 0.32); o.addColorStop(0, '#fff'); o.addColorStop(0.35, `hsl(${hue},90%,70%)`); o.addColorStop(1, `hsla(${hue},90%,40%,0)`); gg.fillStyle = o; gg.beginPath(); gg.arc(cx, cy, hh * 0.32, 0, TAU); gg.fill();
      let fs = Math.floor(hh * 0.2); gg.font = `800 ${fs}px ${FONT}`; while (gg.measureText(text).width > ww * 0.55 && fs > 12) { fs -= 2; gg.font = `800 ${fs}px ${FONT}`; }
      txt(gg, text, ww * 0.06, hh * 0.4, fs, '#fff', 800, 'left', 'middle', 3);
      txt(gg, ['Move as one.', 'The city that thinks of you.', 'Rest. We have it handled.'][hsh % 3], ww * 0.06, hh * 0.58, Math.floor(hh * 0.07), `hsl(${hue},90%,75%)`, 600, 'left');
      txt(gg, 'A CIVIC CONCORD PARTNER', ww * 0.06, hh * 0.85, Math.floor(hh * 0.04), 'rgba(255,255,255,0.6)', 500, 'left', 'middle', 3);
      scan(gg, ww, hh, 0.06);
    };
    texA = ctex(`bb${text}|${hue}|${TW}x${TH}`, TW, TH, draw);
    texB = ctex(`bbG${text}|${hue}|${TW}x${TH}`, TW, TH, (gg, ww, hh) => { draw(gg, ww, hh); glitchCanvas(gg, ww, hh, rng(hsh), 1); });
  }
  const mat = new THREE.MeshBasicMaterial({ map: texA, color: new THREE.Color(1, 1, 1).multiplyScalar(glyph ? 2.2 : 1.5), toneMapped: false });
  const scr = new THREE.Mesh(gPlane(w, h), mat); scr.position.set(0, BB_BASE + h / 2, 0.426); g.add(scr);
  g.userData.nodes.screen = scr;
  const col = glyph ? 0xff2020 : new THREE.Color().setHSL((opts.hue ?? 195) / 360, 0.8, 0.6).getHex();
  g.userData.lights = [{ x: 0, y: BB_BASE + h / 2, z: 2.5, color: col, intensity: glyph ? 3 : 2.2, distance: Math.max(14, w * 2.5) }];
  let t0 = Math.random() * 5, gl = 0, nx = 1 + Math.random() * 3; const base = mat.color.clone(); const L = g.userData.lights[0], I0 = L.intensity;
  g.userData.update = dt => {
    t0 += dt;
    if (t0 > nx) { gl = glyph ? 0.1 + Math.random() * 0.5 : 0.08 + Math.random() * 0.15; nx = t0 + (glyph ? 0.8 + Math.random() * 3 : 4 + Math.random() * 8); }
    let k = 1;
    if (gl > 0) { gl -= dt; mat.map = Math.random() < 0.6 ? texB : texA; k = Math.random() < 0.25 ? 0.15 : 1.1; }
    else { mat.map = texA; k = glyph ? 0.85 + 0.15 * Math.sin(t0 * 2.1) : 1; }
    mat.color.copy(base).multiplyScalar(k); L.intensity = I0 * k;
  };
  return g;
}

// @@MORE

/* ================= exports ================= */
export const PROPS = { car, van, transitPod, streetLight, trafficLight, bollard, jerseyBarrier, policeBarrier, cone, trashBags, dumpster, garbagePile, litter, vendingMachine, bench, planter, fireHydrant, manhole, newsKiosk, holoAd, broadcastSpeaker, phoneBooth,
  evacTent, cot, supplyCrate, sandbags, robotCorpse, deliveryDrone, scooter, chargingStation, subwayEntrance, rooftopAC, waterTank, antennaMast, skyBridge, emergencyLightBar, billboard };
export const LINEUP = [
  { name: 'car', make: () => car({ seed: 1, color: 0xe2e4e4 }) },
  { name: 'carRed', make: () => car({ seed: 2, color: 0x6a1c20 }) },
  { name: 'carWreck', make: () => car({ seed: 3, wrecked: true }) },
  { name: 'carWreck2', make: () => car({ seed: 4, wrecked: true, color: 0x22364e }) },
  { name: 'van', make: () => van() },
  { name: 'vanWreck', make: () => van({ wrecked: true }) },
  { name: 'transitPod', make: () => transitPod() },
  { name: 'transitPodWreck', make: () => transitPod({ wrecked: true }) },
  { name: 'streetLight', make: () => streetLight() },
  { name: 'streetLightBroken', make: () => streetLight({ broken: true }) },
  { name: 'trafficLight', make: () => trafficLight() },
  { name: 'bollard', make: () => bollard() },
  { name: 'jerseyBarrier', make: () => jerseyBarrier() },
  { name: 'policeBarrier', make: () => policeBarrier() },
  { name: 'cone', make: () => cone() },
  { name: 'trashBags', make: () => trashBags({ n: 5, seed: 2 }) },
  { name: 'dumpster', make: () => dumpster() },
  { name: 'dumpsterOpen', make: () => dumpster({ open: true }) },
  { name: 'garbagePile', make: () => garbagePile({ seed: 1 }) },
  { name: 'litter', make: () => litter({ seed: 1 }) },
  { name: 'vendingMachine', make: () => vendingMachine() },
  { name: 'vendingBroken', make: () => vendingMachine({ lit: true, broken: true }) },
  { name: 'vendingDark', make: () => vendingMachine({ lit: false }) },
  { name: 'bench', make: () => bench() },
  { name: 'planter', make: () => planter({ dead: true }) },
  { name: 'planterLive', make: () => planter({ dead: false }) },
  { name: 'fireHydrant', make: () => fireHydrant() },
  { name: 'manhole', make: () => manhole() },
  { name: 'newsKiosk', make: () => newsKiosk() },
  { name: 'holoAd', make: () => holoAd() },
  { name: 'holoAdPink', make: () => holoAd({ hue: 320, text: 'SERENE', w: 1.2, h: 2.2 }) },
  { name: 'holoAdWide', make: () => holoAd({ hue: 40, text: 'HALCYON+', w: 2.6, h: 1.5 }) },
  { name: 'broadcastSpeaker', make: () => broadcastSpeaker() },
  { name: 'phoneBooth', make: () => phoneBooth() },
  { name: 'evacTent', make: () => evacTent() },
  { name: 'cot', make: () => cot() },
  { name: 'supplyCrate', make: () => supplyCrate() },
  { name: 'supplyCrateOpen', make: () => supplyCrate({ open: true }) },
  { name: 'sandbags', make: () => sandbags() },
  { name: 'robotHousehold', make: () => robotCorpse({ kind: 'household', seed: 1 }) },
  { name: 'robotHousehold2', make: () => robotCorpse({ kind: 'household', seed: 4 }) },
  { name: 'robotSecurity', make: () => robotCorpse({ kind: 'security', seed: 2 }) },
  { name: 'robotSecurity2', make: () => robotCorpse({ kind: 'security', seed: 7 }) },
  { name: 'robotCourier', make: () => robotCorpse({ kind: 'courier', seed: 3 }) },
  { name: 'deliveryDrone', make: () => deliveryDrone() },
  { name: 'droneCrashed', make: () => deliveryDrone({ crashed: true }) },
  { name: 'scooter', make: () => scooter() },
  { name: 'chargingStation', make: () => chargingStation() },
  { name: 'subwayEntrance', make: () => subwayEntrance() },
  { name: 'rooftopAC', make: () => rooftopAC() },
  { name: 'waterTank', make: () => waterTank() },
  { name: 'antennaMast', make: () => antennaMast() },
  { name: 'skyBridge', make: () => skyBridge({ length: 12 }) },
  { name: 'emergencyLightBar', make: () => emergencyLightBar() },
  { name: 'billboard', make: () => billboard({ text: 'HALCYON TRANSIT' }) },
  { name: 'billboardGlyph', make: () => billboard({ glyph: true }) },
];
