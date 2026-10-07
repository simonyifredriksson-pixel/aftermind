/* EnemyArt.js - the infected machines of AFTERMIND, built entirely in code.

   Every enemy used to be a product: a ceramic-shelled service robot, a
   municipal security unit, a construction rig. The virus did not rebuild
   them, it wore them. So each model is first an honest piece of industrial
   design (panel seams, serial plates, rubber boots, brushed steel), then
   corrupted: red light leaking from cracks and seams (an emissive crack map
   in every shell), the recurring virus glyph (a ring with three inward
   ticks) glowing on the bodies, flickering sensor eyes, rust and damage.

   makeEnemy(type) -> EnemyModel { root, height, radius, eyes, weakPoints,
   update(dt, state), setEyes(hex, intensity) }. Rigs are real hierarchies
   of pivots; legs are solved with two-bone IK against the ground so feet
   plant, hydraulic pistons re-aim themselves between their anchors every
   frame. */
import * as THREE from '../../lib/three.module.js';
import { Mat, Flat, Glow } from '../core/Textures.js';

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));
const fract = v => v - Math.floor(v);
/** cheap deterministic 1D noise in -1..1 (for twitches) */
const n1 = (x, s = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const h = k => { const v = Math.sin((k + s * 57.13) * 127.1) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; }; return lerp(h(i), h(i + 1), u); };
const rnd = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/* ================================================================ textures */
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const mx = a => ((a % px) + px) % px, my = a => ((a % py) + py) % py;
  const a = hash2(mx(xi), my(yi), s), b = hash2(mx(xi + 1), my(yi), s), c = hash2(mx(xi), my(yi + 1), s), d = hash2(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** tileable fbm over the unit square, separate base frequencies per axis */
function fbm(u, v, fx, fy, oct, s) {
  let t = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) { t += vn(u * fx, v * fy, fx, fy, s + i * 17) * amp; norm += amp; amp *= 0.5; fx *= 2; fy *= 2; }
  return t / norm;
}
const hexRGB = c => { const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const c255 = v => (v < 0 ? 0 : v > 1 ? 255 : v * 255) | 0;

/* shell palettes: a ceramic/painted shell with seams, chips, rust streaks,
   scratches and glowing cracks (emissive map) */
const SHELLS = {
  white: { color: '#d6d9d7', chip: 0.5, rust: 0.35, cracks: 10, seams: 3, gloss: 0.3, grime: 0.45, metal: 0.05, seed: 3 },
  police: { color: '#dfe2e2', chip: 0.42, rust: 0.3, cracks: 9, seams: 2, gloss: 0.28, grime: 0.5, metal: 0.05, seed: 21 },
  dark: { color: '#3b4248', chip: 0.42, rust: 0.25, cracks: 9, seams: 3, gloss: 0.34, grime: 0.3, metal: 0.35, primer: '#7c8186', seed: 5 },
  grey: { color: '#8a9196', chip: 0.45, rust: 0.35, cracks: 8, seams: 3, gloss: 0.32, grime: 0.4, metal: 0.3, seed: 7 },
  yellow: { color: '#d39a1d', chip: 0.9, rust: 0.8, cracks: 6, seams: 2, gloss: 0.45, grime: 0.6, metal: 0.2, seed: 9 },
  orange: { color: '#bf5a22', chip: 0.6, rust: 0.5, cracks: 7, seams: 3, gloss: 0.38, grime: 0.5, metal: 0.15, seed: 11 },
  mannequin: { color: '#d9d0c3', chip: 0.12, rust: 0.0, cracks: 7, seams: 0, gloss: 0.2, grime: 0.25, metal: 0.0, seed: 13 },
  medic: { color: '#eceee9', chip: 0.28, rust: 0.12, cracks: 7, seams: 2, gloss: 0.22, grime: 0.35, metal: 0.0, seed: 15 },
  olive: { color: '#575c52', chip: 0.6, rust: 0.55, cracks: 9, seams: 3, gloss: 0.42, grime: 0.45, metal: 0.4, primer: '#8a8d86', seed: 17 },
  foreman: { color: '#b9bbb6', chip: 0.55, rust: 0.6, cracks: 10, seams: 4, gloss: 0.38, grime: 0.6, metal: 0.25, seed: 19 },
};
const shellCache = new Map();
function shellSet(name) {
  if (shellCache.has(name)) return shellCache.get(name);
  const o = SHELLS[name], N = 512, S = o.seed;
  const col = new Float32Array(N * N * 3), rough = new Float32Array(N * N), h = new Float32Array(N * N), emi = new Float32Array(N * N);
  const base = hexRGB(o.color), primer = hexRGB(o.primer || '#3d4247'), rc1 = hexRGB('#5e2f17'), rc2 = hexRGB('#a4582a');
  const R = rnd(S * 977);
  const sx = [], sy = [];
  for (let i = 0; i < o.seams; i++) { sx.push(R()); sy.push(R()); }
  const leakN = (u, v) => fbm(u, v, 3, 3, 2, S + 41);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const n = fbm(u, v, 6, 6, 4, S), fine = fbm(u, v, 48, 48, 2, S + 3);
    const grime = sstep(0.5, 0.85, fbm(u, v, 3, 3, 4, S + 7)) * o.grime;
    let dpx = 99;
    for (let k = 0; k < sx.length; k++) {
      let du = Math.abs(u - sx[k]); du = Math.min(du, 1 - du); let dv = Math.abs(v - sy[k]); dv = Math.min(dv, 1 - dv);
      dpx = Math.min(dpx, du * N, dv * N);
    }
    const seam = 1 - sstep(0.7, 1.7, dpx), bevel = sstep(1.7, 2.6, dpx) * (1 - sstep(2.6, 4, dpx));
    const chipN = fbm(u, v, 7, 7, 5, S + 11) + (fine - 0.5) * 0.25, ct = 1 - o.chip * 0.33;
    const chip = o.chip > 0 ? sstep(ct, ct + 0.012, chipN) : 0, edge = o.chip > 0 ? sstep(ct - 0.025, ct, chipN) * (1 - chip) : 0;
    const streak = sstep(0.55, 0.8, fbm(u, v, 24, 2, 3, S + 13)) * sstep(0.42, 0.7, fbm(u, v, 4, 4, 3, S + 17));
    const rust = clamp(Math.max(chip * sstep(0.4, 0.65, fbm(u, v, 12, 12, 3, S + 19)), streak * 0.75) * o.rust * 1.4, 0, 1);
    const sc = Math.max(sstep(0.93, 0.97, vn(u * 160, v * 6, 160, 6, S + 23)), sstep(0.94, 0.98, vn(u * 5, v * 140, 5, 140, S + 29))) * (0.3 + o.chip);
    const rn = fbm(u, v, 24, 24, 2, S + 31);
    for (let c = 0; c < 3; c++) {
      let k = base[c] * (0.9 + n * 0.18 - grime * 0.45);
      k = lerp(k, 0.85, sc * 0.25);
      k = lerp(k, primer[c] * (0.75 + fine * 0.5), chip);
      k += edge * 0.07;
      k = lerp(k, lerp(rc1[c], rc2[c], rn), rust);
      k *= 1 - seam * 0.72;
      k += bevel * 0.03;
      col[i * 3 + c] = k;
    }
    rough[i] = clamp(o.gloss + n * 0.12 + grime * 0.3 + sc * 0.12, 0, 1);
    rough[i] = lerp(rough[i], 0.55, chip); rough[i] = lerp(rough[i], 0.92, rust); rough[i] = lerp(rough[i], 0.8, seam);
    h[i] = 0.55 - seam * 0.5 + bevel * 0.06 - chip * 0.22 + rust * rn * 0.15 + fine * 0.03 - sc * 0.05;
    // infection seeping from the panel seams in places
    emi[i] = 0.035 + seam * sstep(0.56, 0.72, leakN(u, v)) * 0.9;
  }
  // glowing cracks: branching random walks, wrapped so the tile repeats
  const stamp = (fx, fy, r) => {
    const x0 = Math.floor(fx - r - 1), x1 = Math.ceil(fx + r + 1), y0 = Math.floor(fy - r - 1), y1 = Math.ceil(fy + r + 1);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const d = Math.hypot(xx - fx, yy - fy); if (d > r + 1) continue;
      const i = (((yy % N) + N) % N) * N + (((xx % N) + N) % N);
      const core = 1 - sstep(0.2, 1.1, d), glow = (1 - sstep(0, r + 1, d)) * 0.35;
      emi[i] = Math.max(emi[i], core + glow);
      const dk = 1 - core * 0.85 - glow * 0.4;
      col[i * 3] *= dk; col[i * 3 + 1] *= dk; col[i * 3 + 2] *= dk; h[i] -= core * 0.35; rough[i] = Math.max(rough[i], 0.7 * core);
    }
  };
  const walk = (x, y, a, len, depth) => {
    for (let s = 0; s < len; s++) {
      a += (R() - 0.5) * 0.7; x += Math.cos(a) * 1.3; y += Math.sin(a) * 1.3;
      stamp(x, y, 2.6 - depth * 0.6);
      if (depth < 2 && R() < 0.03) walk(x, y, a + (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.8), len * 0.45 | 0, depth + 1);
    }
  };
  for (let c = 0; c < o.cracks; c++) walk(R() * N, R() * N, R() * TAU, 40 + R() * 110 | 0, 0);
  const canvasOf = fill => { const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'); const img = g.createImageData(N, N); fill(img.data); g.putImageData(img, 0, 0); return cv; };
  const T = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const set = {
    map: T(canvasOf(d => { for (let i = 0; i < N * N; i++) { d[i * 4] = c255(col[i * 3]); d[i * 4 + 1] = c255(col[i * 3 + 1]); d[i * 4 + 2] = c255(col[i * 3 + 2]); d[i * 4 + 3] = 255; } }), true),
    roughnessMap: T(canvasOf(d => { for (let i = 0; i < N * N; i++) { d[i * 4 + 1] = c255(rough[i]); d[i * 4 + 3] = 255; } })),
    normalMap: T(canvasOf(d => {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)], up = h[((y - 1 + N) % N) * N + x], dn = h[((y + 1) % N) * N + x];
        let nx = (l - r) * 2.4, ny = (dn - up) * 2.4, nz = 1; const L = Math.hypot(nx, ny, nz);
        const i = (y * N + x) * 4; d[i] = (nx / L * 0.5 + 0.5) * 255; d[i + 1] = (ny / L * 0.5 + 0.5) * 255; d[i + 2] = (nz / L * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    })),
    emissiveMap: T(canvasOf(d => { for (let i = 0; i < N * N; i++) { const e = c255(emi[i]); d[i * 4] = e; d[i * 4 + 1] = e; d[i * 4 + 2] = e; d[i * 4 + 3] = 255; } }), true),
  };
  const m = new THREE.MeshStandardMaterial({ map: set.map, roughnessMap: set.roughnessMap, normalMap: set.normalMap, roughness: 1, metalness: o.metal, emissiveMap: set.emissiveMap, emissive: new THREE.Color(0xff3a14), emissiveIntensity: 1.2 });
  m.name = 'shell_' + name;
  shellCache.set(name, m);
  return m;
}

const texCache = new Map();
function canvasTex(key, w, h, draw, opt = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (opt.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t); return t;
}
/** the virus glyph: a ring with three inward ticks (white on transparent) */
function glyphTex() {
  return canvasTex('glyph', 256, 256, (g) => {
    const draw = (lw, blur, a) => {
      g.save(); g.shadowColor = 'rgba(255,255,255,' + a + ')'; g.shadowBlur = blur; g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineCap = 'round';
      g.lineWidth = lw; g.beginPath(); g.arc(128, 128, 78, 0, TAU); g.stroke();
      for (let k = 0; k < 3; k++) { const an = -PI / 2 + k * TAU / 3; g.beginPath(); g.moveTo(128 + Math.cos(an) * 78, 128 + Math.sin(an) * 78); g.lineTo(128 + Math.cos(an) * 40, 128 + Math.sin(an) * 40); g.stroke(); }
      g.restore();
    };
    draw(26, 30, 0.35); draw(14, 10, 1);
  });
}
/** a printed decal: serial plates, warnings, livery text */
function labelTex(key, lines, o = {}) {
  const w = o.w || 512, h = o.h || 128;
  return canvasTex('lbl_' + key, w, h, (g) => {
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
    if (o.stripes) { g.save(); g.beginPath(); g.rect(0, 0, w, h * 0.22); g.clip(); for (let x = -h; x < w + h; x += 40) { g.fillStyle = '#e0a020'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 20 - h * 0.22, h * 0.22); g.lineTo(x - h * 0.22, h * 0.22); g.fill(); } g.restore(); }
    g.fillStyle = o.fg || '#1a1c1e'; g.textBaseline = 'middle';
    let y = o.stripes ? h * 0.36 : h * 0.18; const step = (h - (o.stripes ? h * 0.3 : 0)) / (lines.length + 0.2);
    lines.forEach((ln, i) => {
      const size = ln.size || (i === 0 ? step * 0.7 : step * 0.5);
      g.font = (ln.bold !== false && i === 0 ? 'bold ' : '') + Math.round(size) + 'px ' + (ln.font || 'Arial, Helvetica, sans-serif');
      g.fillText(ln.t || ln, 8, y + step * 0.45 - step * 0.45 + (i === 0 ? step * 0.35 : step * 0.3)); y += step;
    });
    if (o.barcode) { const R = rnd(key.length * 31 + 7); let x = w * 0.68; while (x < w - 10) { const bw = 1 + (R() * 4 | 0); g.fillRect(x, h * 0.55, bw, h * 0.35); x += bw + 1 + (R() * 3 | 0); } }
    // wear: scratch the print away in places
    g.globalCompositeOperation = 'destination-out';
    const R = rnd(key.length * 13 + 3);
    for (let i = 0; i < (o.wear ?? 30); i++) { g.globalAlpha = 0.3 + R() * 0.7; g.lineWidth = 1 + R() * 3; g.beginPath(); const x = R() * w, y2 = R() * h; g.moveTo(x, y2); g.lineTo(x + (R() - 0.5) * 120, y2 + (R() - 0.5) * 40); g.stroke(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  });
}
const decalMatCache = new Map();
function decalMat(tex, emissive = 0) {
  const k = tex.uuid + emissive;
  if (!decalMatCache.has(k)) decalMatCache.set(k, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.08, roughness: 0.6, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  return decalMatCache.get(k);
}

/* ================================================================ geometry */
const geoCache = new Map();
const cached = (key, f) => { if (!geoCache.has(key)) geoCache.set(key, f()); return geoCache.get(key); };
/** smooth normals across duplicated vertices (position-welded) */
function smoothNormals(g) {
  const p = g.attributes.position, idx = g.index, map = new Map(), key = i => Math.round(p.getX(i) * 1e4) + '_' + Math.round(p.getY(i) * 1e4) + '_' + Math.round(p.getZ(i) * 1e4);
  const acc = new Float32Array(p.count * 3), ids = new Int32Array(p.count);
  for (let i = 0; i < p.count; i++) { const k = key(i); if (!map.has(k)) map.set(k, map.size); ids[i] = map.get(k); }
  const sum = new Float32Array(map.size * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : p.count / 3;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    b.sub(a); c.sub(a); b.cross(c);
    for (const i of [i0, i1, i2]) { const j = ids[i] * 3; sum[j] += b.x; sum[j + 1] += b.y; sum[j + 2] += b.z; }
  }
  for (let i = 0; i < p.count; i++) { const j = ids[i] * 3; const L = Math.hypot(sum[j], sum[j + 1], sum[j + 2]) || 1; acc[i * 3] = sum[j] / L; acc[i * 3 + 1] = sum[j + 1] / L; acc[i * 3 + 2] = sum[j + 2] / L; }
  g.setAttribute('normal', new THREE.BufferAttribute(acc, 3));
  return g;
}
/** rounded box with edge segments concentrated in the rounded zone */
function rbox(w, h, d, r = 0.02, seg = 2) {
  return cached(`rb${w}|${h}|${d}|${r}|${seg}`, () => {
    r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const n = seg * 2 + 1, g = new THREE.BoxGeometry(1, 1, 1, n, n, n), p = g.attributes.position, nr = g.attributes.normal;
    const remap = (u, half) => { const k = Math.round((u + 0.5) * n); if (k <= seg) return -half + r * (1 - Math.cos(k / seg * PI / 2)); const k2 = n - k; return half - r * (1 - Math.cos(k2 / seg * PI / 2)); };
    const hx = w / 2, hy = h / 2, hz = d / 2, v = new THREE.Vector3(), inner = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(remap(p.getX(i), hx), remap(p.getY(i), hy), remap(p.getZ(i), hz));
      inner.set(clamp(v.x, -hx + r, hx - r), clamp(v.y, -hy + r, hy - r), clamp(v.z, -hz + r, hz - r));
      const dn = v.clone().sub(inner); if (dn.lengthSq() < 1e-12) dn.set(nr.getX(i), nr.getY(i), nr.getZ(i)); dn.normalize();
      v.copy(inner).addScaledVector(dn, r); p.setXYZ(i, v.x, v.y, v.z); nr.setXYZ(i, dn.x, dn.y, dn.z);
    }
    return g;
  });
}
/** copy a cached geometry and bend it with fn(v: Vector3) */
function deform(src, fn, key) {
  const build = () => { const g = src.clone(), p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); } return smoothNormals(g); };
  return key ? cached('df' + key, build) : build();
}
/** box tapered along y: top scaled by (tx,tz), optional forward shift of the top */
function tbox(w, h, d, r, tx, tz, shift = 0, seg = 3) {
  return deform(rbox(w, h, d, r, seg), v => { const k = v.y / h + 0.5; v.x *= lerp(1, tx, k); v.z *= lerp(1, tz, k); v.z += shift * k; }, `tb${w}|${h}|${d}|${r}|${tx}|${tz}|${shift}|${seg}`);
}
const cyl = (rt, rb, h, s = 20, open = false) => cached(`cy${rt}|${rb}|${h}|${s}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open));
const sph = (r, ws = 24, hs = 16) => cached(`sp${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const tor = (R, r, rs = 10, ts = 32, arc = TAU) => cached(`to${R}|${r}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const cap = (r, l, cs = 6, rs = 14) => cached(`ca${r}|${l}|${cs}|${rs}`, () => new THREE.CapsuleGeometry(r, l, cs, rs));
const lathe = (pts, s = 28, key) => cached('la' + (key || JSON.stringify(pts)) + s, () => smoothNormals(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), s)));
const plane = (w, h) => cached(`pl${w}|${h}`, () => new THREE.PlaneGeometry(w, h));
const circ = (r, s = 24) => cached(`ci${r}|${s}`, () => new THREE.CircleGeometry(r, s));
/** smooth tube through points (static cables, hoses) */
function tube(pts, r, ts = 24, rs = 8) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), ts, r, rs, false); }
/** a ribbed rubber boot / bellows */
function bellows(r0, r1, h, ribs = 6, s = 18) {
  const pts = []; for (let i = 0; i <= ribs * 4; i++) { const k = i / (ribs * 4); pts.push([lerp(r0, r1, k) * (1 + 0.12 * Math.cos(k * ribs * TAU)), (k - 0.5) * h]); }
  return lathe(pts, s, `bel${r0}|${r1}|${h}|${ribs}`);
}
/** tapered blade (for claws, fingers, cutters) pointing along +y */
function blade(len, w, t, curve = 0) {
  return cached(`bl${len}|${w}|${t}|${curve}`, () => {
    const g = new THREE.CylinderGeometry(0.0001, 1, 1, 4, 6); g.translate(0, 0.5, 0); g.rotateY(PI / 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); let x = p.getX(i) * w, z = p.getZ(i) * t; z += curve * len * y * y; p.setXYZ(i, x, y * len, z); }
    return smoothNormals(g);
  });
}
/** zig-zag ribbon used for electric sparks */
function boltGeo(seed) {
  const R = rnd(seed), pts = [], n = 6; let x = 0, y = 0;
  for (let i = 0; i <= n; i++) { pts.push([x, y]); x += (R() - 0.5) * 0.08; y += 0.03 + R() * 0.03; }
  const pos = []; const w = 0.006;
  for (let i = 0; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; pos.push(ax - w, ay, 0, bx - w, by, 0, bx + w, by, 0, ax - w, ay, 0, bx + w, by, 0, ax + w, ay, 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}

/* ================================================================ scene helpers */
function M(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (s !== undefined) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
  parent.add(m); return m;
}
function G(parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); parent.add(g); return g; }
/** objects that must never cast shadows (decals, glows) even if a scene traversal says so */
function noShadow(o) { Object.defineProperty(o, 'castShadow', { get: () => false, set: () => {}, configurable: true }); return o; }
/** a mesh stretched between two points (in parent space) */
function between(m, a, b, axisLen = 1) { const d = b.clone().sub(a), L = d.length(); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Y, d.normalize()); m.scale.set(1, L / axisLen, 1); return m; }
const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();

/* ================================================================ rig parts */
/** two-bone leg in a vertical plane: yawG -> hip(rx) -> knee(rx) -> ankle(rx).
    s=+1 knee bends toward +Z (human knee / spider knee up), s=-1 bends back. */
class Leg {
  constructor(parent, at, a, b, s = 1, o = {}) {
    this.parent = parent; this.at = at.clone(); this.a = a; this.b = b; this.s = s; this.free = !!o.free; this.baseYaw = o.yaw || 0;
    this.yawG = G(parent, at.x, at.y, at.z, 0, this.baseYaw, 0);
    this.hip = G(this.yawG); this.knee = G(this.hip, 0, -a, 0); this.ankle = G(this.knee, 0, -b, 0);
    this.c = o.c || 0; this.cAng = o.cAng || 0;
    if (this.c) this.toe = G(this.ankle, 0, -this.c, 0);
  }
  /** t: target (foot tip) in parent space; pitch: desired foot pitch; pp: parent pitch to cancel */
  solve(t, pitch = 0, pp = 0) {
    const dx = t.x - this.at.x, dy = t.y - this.at.y, dz = t.z - this.at.z;
    let fwd;
    if (this.free) { const yaw = Math.atan2(dx, dz); this.yawG.rotation.y = yaw; fwd = Math.hypot(dx, dz); }
    else { const by = this.baseYaw; fwd = dx * Math.sin(by) + dz * Math.cos(by); }
    let fz = fwd, fy = dy;
    if (this.c) { const ca = this.cAng + pp; fz -= this.c * Math.sin(ca); fy += this.c * Math.cos(ca); }
    const a = this.a, b = this.b, D = clamp(Math.hypot(fz, fy), Math.abs(a - b) + 1e-3, a + b - 1e-4);
    const th = Math.atan2(fz, -fy), al = Math.acos(clamp((a * a + D * D - b * b) / (2 * a * D), -1, 1)), be = PI - Math.acos(clamp((a * a + b * b - D * D) / (2 * a * b), -1, 1));
    this.hip.rotation.x = -(th + this.s * al); this.knee.rotation.x = this.s * be;
    const tot = this.hip.rotation.x + this.knee.rotation.x;
    if (this.c) { this.ankle.rotation.x = -(this.cAng) - tot - pp; this.toe.rotation.x = this.cAng - pitch; }
    else this.ankle.rotation.x = -pitch - tot - pp;
  }
}
/** foot path for a gait cycle: stance slides back on the ground, swing arcs forward */
function gait(ph, stride, lift, duty = 0.6) {
  ph = fract(ph);
  if (ph < duty) { const k = ph / duty; return { z: stride * (0.5 - k), y: 0, st: 1 }; }
  const k = (ph - duty) / (1 - duty), e = 0.5 - 0.5 * Math.cos(k * PI);
  return { z: stride * (-0.5 + e), y: lift * Math.sin(k * PI) * (1 - 0.3 * k), st: 0 };
}
/** telescoping hydraulic cylinder between two anchors (any nodes of the rig) */
class Piston {
  constructor(root, a, b, rb, rr, matBody, matRod) {
    this.root = root; this.a = a; this.b = b;
    this.body = M(cyl(rb, rb, 1, 14), matBody, root); this.rod = M(cyl(rr, rr, 1, 10), matRod, root);
    this.capA = M(sph(rb * 1.05, 12, 8), matBody, root); this.capB = M(cyl(rr * 1.6, rr * 1.6, rr * 3, 10), matBody, root);
    this.rest = -1;
  }
  update() {
    const pa = this.a.getWorldPosition(_v), pb = this.b.getWorldPosition(_v2);
    this.root.worldToLocal(pa); this.root.worldToLocal(pb);
    const d = pb.clone().sub(pa), L = Math.max(1e-4, d.length()); d.multiplyScalar(1 / L);
    if (this.rest < 0) this.rest = L;
    const lb = this.rest * 0.6, lr = this.rest * 0.62;
    const q = new THREE.Quaternion().setFromUnitVectors(Y, d);
    this.body.quaternion.copy(q); this.body.scale.set(1, lb, 1); this.body.position.copy(pa).addScaledVector(d, lb / 2);
    this.rod.quaternion.copy(q); this.rod.scale.set(1, lr, 1); this.rod.position.copy(pb).addScaledVector(d, -lr / 2);
    this.capA.position.copy(pa); this.capB.position.copy(pb); this.capB.quaternion.copy(q);
  }
}

/* ================================================================ per-instance materials */
class Kit {
  constructor() {
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });
    this.infMat = new THREE.MeshBasicMaterial({ color: 0xff3a14, toneMapped: false });
    this.glyphMat = new THREE.MeshBasicMaterial({ map: glyphTex(), color: 0xff3a14, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fd0ff).multiplyScalar(4), toneMapped: false, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shells = [];
    this.extraGlow = []; // [{mat, base: Color, k}] glows that follow infection pulse
  }
  shell(name) { const m = shellSet(name).clone(); this.shells.push(m); return m; }
  /** an extra emissive that dies with the machine */
  glow(color, intensity) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }); this.extraGlow.push({ mat: m, base: new THREE.Color(color).multiplyScalar(intensity) }); return m; }
}
function glyph(e, parent, size, x, y, z, rx = 0, ry = 0, rz = 0) { return noShadow(M(plane(1, 1), e.kit.glyphMat, parent, x, y, z, rx, ry, rz, [size, size, 1])); }
function label(parent, tex, w, h, x, y, z, rx = 0, ry = 0, rz = 0) { return noShadow(M(plane(1, 1), decalMat(tex), parent, x, y, z, rx, ry, rz, [w, h, 1])); }

/* ================================================================ the model */
const AMBER = 0xffa040, RED = 0xff2a2a, BLUE = 0x4aa8ff;
export class EnemyModel {
  constructor(type) {
    this.type = type;
    this.root = new THREE.Group(); this.root.name = 'enemy_' + type;
    this.height = 1; this.radius = 0.5;
    this.eyes = []; this.weakPoints = []; this.nodes = {};
    this.kit = new Kit();
    this.hoverHeight = 0;
    this._eyeHex = AMBER; this._eyeI = 2.6; this._manual = false;
    this.time = 0; this.deadK = 0; this.stunK = 0; this.anim = ''; this.blendT = 0; this.phase = 0; this.rate = 10; this.dt = 0;
    this.pistons = []; this.sparkNodes = []; this.sparks = []; this.owned = [];
    this._anim = () => {};
    this.eyeColor = new THREE.Color(AMBER); // the colour the eyes currently show (for attaching lights)
    this.eyeLevel = 1; // 0..1 brightness the eyes currently show
  }
  setEyes(colorHex, intensity = 2.6) { this._eyeHex = colorHex; this._eyeI = intensity; this._manual = true; }
  /** hand eye colour back to the automatic mood colours (amber idle, red hunting) */
  autoEyes() { this._manual = false; this._eyeI = 2.6; }
  /** free per-instance materials (shared geometry/textures stay cached) */
  dispose() {
    this.root.removeFromParent();
    const k = this.kit;
    [k.eyeMat, k.infMat, k.glyphMat, k.sparkMat, ...k.shells, ...k.extraGlow.map(g => g.mat), ...this.owned].forEach(m => m.dispose());
  }
  /** damp a joint toward a target, fast once the current animation has blended in */
  j(o, ax, v) { o.rotation[ax] = damp(o.rotation[ax], v, this.rate, this.dt); }
  p(o, ax, v) { o.position[ax] = damp(o.position[ax], v, this.rate, this.dt); }
  /** a root-space point -> local space of a rig node (root matrices must be current) */
  toLocal(node, x, y, z) { const v = new THREE.Vector3(x, y, z); this.root.localToWorld(v); return node.worldToLocal(v); }
  weak(id, label, node, r) { this.weakPoints.push({ id, label, node, r }); this.nodes[id] = node; }
  _buildSparks() {
    for (let i = 0; i < 7; i++) { const m = noShadow(M(boltGeo(i * 7 + 3), this.kit.sparkMat, this.root)); m.visible = false; m.frustumCulled = false; this.sparks.push(m); }
  }
  update(dt, s = {}) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1); this.dt = dt;
    const anim = s.anim || 'idle';
    if (anim !== this.anim) { this.anim = anim; this.blendT = 0; }
    this.blendT += dt; this.time += dt;
    this.rate = 6 + 70 * sstep(0.05, 0.7, this.blendT);
    this.deadK = anim === 'dead' ? Math.min(1, this.deadK + dt / 1.1) : Math.max(0, this.deadK - dt / 0.6);
    this.stunK = damp(this.stunK, anim === 'stunned' ? 1 : 0, 8, dt);
    const hunting = anim === 'alert' || anim === 'attack' || anim === 'run' || anim === 'special';
    const S = {
      anim, t: s.t ?? this.blendT,
      speed: s.speed ?? (anim === 'walk' ? 1.5 : anim === 'run' ? 4.5 : 0),
      aimYaw: s.aimYaw || 0, aimPitch: s.aimPitch || 0, lit: s.lit || 0, hurtT: s.hurtT ?? 99,
      alert: s.alert ?? (hunting ? 1 : 0),
    };
    if (S.anim === 'walk' && !S.speed) S.speed = 1.5;
    if (S.anim === 'run' && !S.speed) S.speed = 4.5;
    this._anim(dt, S);
    // eyes ------------------------------------------------------------
    const T = this.time, k = this.kit;
    const col = _c.set(this._manual ? this._eyeHex : AMBER);
    if (!this._manual) col.lerp(new THREE.Color(RED), sat(S.alert));
    let I = this._eyeI;
    if (this.stunK > 0.01) { col.lerp(new THREE.Color(BLUE), this.stunK); I *= 1 - this.stunK * 0.6 * (n1(T * 30, 3) > 0.2 ? 1 : 0); }
    let flick = 1 + 0.08 * n1(T * 9, 1);
    if (n1(T * 3.1, 7) > 0.82) flick *= n1(T * 47, 5) > 0 ? 0.25 : 1; // corrupted dropouts
    if (this.flicker) flick *= this.flicker(T, S);
    const dead = this.deadK, life = dead > 0 ? (dead < 0.6 ? (n1(T * 25, 2) > 0 ? 1 - dead : 0.15) : 0) : 1;
    this.eyeLevel = sat(flick * life);
    this.eyeColor.copy(col);
    k.eyeMat.color.copy(col).multiplyScalar(I * flick * life);
    // infection glow -----------------------------------------------------
    const pulse = 0.75 + 0.25 * Math.sin(T * 2.3) + 0.12 * n1(T * 6, 4);
    const inf = _c.set(0xff3a14);
    if (this.stunK > 0.01) inf.lerp(new THREE.Color(0x60b0ff), this.stunK * (n1(T * 20, 9) > 0 ? 1 : 0.4));
    const alive = 1 - sstep(0, 0.9, dead);
    k.infMat.color.copy(inf).multiplyScalar(2.2 * pulse * alive + 0.02);
    k.glyphMat.color.copy(inf).multiplyScalar(1.7 * pulse * alive);
    for (const g of k.extraGlow) g.mat.color.copy(g.base).multiplyScalar((0.85 + 0.15 * pulse) * (g.k ?? 1) * alive);
    const hurt = S.hurtT < 0.25 ? 1 - S.hurtT / 0.25 : 0;
    for (const m of k.shells) {
      m.emissive.copy(inf).lerp(new THREE.Color(0xffffff), hurt * 0.8);
      m.emissiveIntensity = ((m.userData.ei ?? 0.95) * pulse * alive + 0.02) + hurt * 9;
    }
    // stun sparks ----------------------------------------------------------
    if (this.sparks.length) {
      const on = this.stunK > 0.3 || (dead > 0 && dead < 0.5);
      this.root.updateMatrixWorld(true);
      for (let i = 0; i < this.sparks.length; i++) {
        const sp = this.sparks[i];
        const live = on && n1(T * 14 + i * 3.3, i) > 0.15;
        sp.visible = live && this.sparkNodes.length > 0;
        if (sp.visible) {
          const nd = this.sparkNodes[(Math.floor(T * 9 + i * 2.7) + i) % this.sparkNodes.length];
          nd.getWorldPosition(_v); this.root.worldToLocal(_v);
          sp.position.copy(_v); sp.rotation.set(n1(T * 11, i) * 3, n1(T * 13, i + 9) * 3, n1(T * 17, i + 4) * 3);
          sp.scale.setScalar((0.8 + 0.6 * Math.abs(n1(T * 21, i))) * (this.sparkScale || 1));
        }
      }
    }
    this.root.updateMatrixWorld(true);
    for (const p of this.pistons) p.update();
  }
}

/* ================================================================ 1. SCOUT */
function buildScout(e) {
  e.height = 1.75; e.radius = 0.32; e.hoverHeight = 1.45;
  const white = e.kit.shell('white'), dark = e.kit.shell('dark'), steel = Mat('steel'), rub = Mat('rubber'), blk = Flat(0x0b0c0e, 0.35, 0.4);
  const hover = G(e.root, 0, 1.45, 0), tilt = G(hover);
  e.nodes.body = tilt;
  // central hub: a flattened ceramic dome
  M(lathe([[0, 0.065], [0.05, 0.062], [0.09, 0.045], [0.112, 0.018], [0.116, 0], [0.105, -0.022], [0.07, -0.04], [0, -0.046]], 36), white, tilt);
  M(tor(0.112, 0.006, 6, 48), e.kit.infMat, tilt, 0, 0.004, 0, PI / 2);
  M(cyl(0.045, 0.05, 0.02, 24), dark, tilt, 0, 0.07, 0);
  glyph(e, tilt, 0.07, 0, 0.0675, -0.035, -PI / 2 + 0.25);
  // three arms with ducted rotors (two forward-side, one rear)
  const rotors = [];
  [PI / 3, -PI / 3, PI].forEach((ang, i) => {
    const arm = G(tilt, 0, 0, 0, 0, ang, 0);
    M(rbox(0.04, 0.022, 0.2, 0.009), dark, arm, 0, -0.016, 0.15);
    M(deform(rbox(0.06, 0.026, 0.17, 0.012), v => { v.x *= 1 - (v.z + 0.085) * 1.6; v.y += Math.max(0, -v.z) * 0.12; }, 'scoutArm'), white, arm, 0, 0.004, 0.16);
    const pod = G(arm, 0, 0.0, 0.27, 0, 0, i === 2 ? 0.12 : 0);
    M(tor(0.078, 0.014, 10, 40), white, pod, 0, 0, 0, PI / 2);
    M(cyl(0.078, 0.078, 0.045, 32, true), Flat(0x1c1f22, 0.6, 0.3), pod);
    M(cyl(0.02, 0.024, 0.05, 16), steel, pod, 0, -0.005, 0);
    for (let s = 0; s < 3; s++) { const st = G(pod, 0, -0.01, 0, 0, s * TAU / 3 + PI / 3); M(rbox(0.005, 0.008, 0.07, 0.002), dark, st, 0, 0, 0.04); }
    const rot = G(pod, 0, 0.012, 0); rotors.push(rot);
    for (let b = 0; b < 3; b++) { const bp = G(rot, 0, 0, 0, 0, b * TAU / 3, 0); M(rbox(0.016, 0.003, 0.068, 0.0015), Flat(0x2a2d30, 0.4, 0.5), bp, 0, 0, 0.036, 0, 0, 0.25); }
    M(tor(0.05, 0.004, 6, 32), e.kit.infMat, pod, 0, -0.026, 0, PI / 2);
    if (i === 2) M(tor(0.078, 0.015, 10, 12, 1.2), Flat(0x111111, 0.9), pod, 0, 0.002, 0, PI / 2, 0, 2.1); // scorched broken duct section
    e.sparkNodes.push(pod);
  });
  // antenna mast + little dish
  const ant = G(tilt, -0.03, 0.06, -0.05, -0.35, 0, -0.1);
  M(cyl(0.004, 0.006, 0.26, 8), steel, ant, 0, 0.13, 0);
  const tip = M(sph(0.009, 10, 8), e.kit.infMat, ant, 0, 0.265, 0);
  M(cyl(0.012, 0.012, 0.03, 10), blk, ant, 0, 0.02, 0);
  const dish = G(tilt, 0.05, 0.065, -0.03, -0.6, 0.6, 0);
  M(lathe([[0.001, 0], [0.025, 0.006], [0.035, 0.014]], 20), Flat(0xcfd2d0, 0.4, 0.2), dish);
  M(cyl(0.003, 0.003, 0.03, 6), steel, dish, 0, 0.015, 0);
  // gimbal: yaw ring -> fork -> pitch -> optical sphere with the lens
  const yawG = G(tilt, 0, -0.045, 0);
  M(cyl(0.035, 0.04, 0.025, 20), steel, yawG, 0, -0.01, 0);
  for (const sx of [-1, 1]) { M(rbox(0.018, 0.13, 0.05, 0.008), dark, yawG, sx * 0.118, -0.08, 0); M(cyl(0.02, 0.02, 0.02, 16), steel, yawG, sx * 0.108, -0.135, 0, 0, 0, PI / 2); }
  M(tor(0.118, 0.01, 8, 32, PI), dark, yawG, 0, -0.03, 0, 0, 0, PI);
  const pitchG = G(yawG, 0, -0.135, 0);
  M(sph(0.098, 32, 24), white, pitchG);
  M(tor(0.0985, 0.004, 6, 48), e.kit.infMat, pitchG, 0, 0, -0.01); // glowing seam around the eye ball
  for (let f = 0; f < 6; f++) M(rbox(0.004, 0.06, 0.035, 0.0015, 1), steel, pitchG, (f - 2.5) * 0.013, 0, -0.095);
  const barrel = G(pitchG, 0, 0, 0.05);
  M(cyl(0.07, 0.075, 0.08, 36), dark, barrel, 0, 0, 0.0, PI / 2);
  M(tor(0.071, 0.007, 8, 40), steel, barrel, 0, 0, 0.04);
  M(cyl(0.064, 0.064, 0.012, 36), blk, barrel, 0, 0, 0.038, PI / 2);
  // the iris: overlapping blades that close around a glowing pupil
  const iris = G(barrel, 0, 0, 0.045); const blades = [];
  for (let b = 0; b < 8; b++) { const piv = G(iris, Math.cos(b * TAU / 8) * 0.056, Math.sin(b * TAU / 8) * 0.056, 0, 0, 0, b * TAU / 8 + PI / 2); M(rbox(0.05, 0.022, 0.002, 0.0008, 1), Flat(0x1a1b1d, 0.3, 0.8), piv, 0.022, 0, 0); blades.push(piv); }
  const pupil = M(circ(0.034, 32), e.kit.eyeMat, barrel, 0, 0, 0.0445);
  M(tor(0.047, 0.0025, 6, 40), e.kit.eyeMat, barrel, 0, 0, 0.043);
  M(circ(0.011, 20), Glow(0xfff4e0, 3), barrel, 0, 0, 0.0455);
  const glass = M(sph(0.068, 32, 12, 0), new THREE.MeshPhysicalMaterial({ color: 0x223040, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.25, clearcoat: 1, depthWrite: false }), barrel, 0, 0, 0.03, 0, 0, 0, [1, 1, 0.45]);
  noShadow(glass);
  const lensNode = G(barrel, 0, 0, 0.05);
  e.eyes.push(lensNode);
  e.weak('lens', 'Optical lens', lensNode, 0.075);
  label(pitchG, labelTex('scout', ['OCULUS-3', 'CITY WATCH  SN 4471-OC'], { fg: '#2a2d30', w: 256, h: 64 }), 0.09, 0.022, 0.1, 0.02, 0.0, 0, PI / 2, 0);
  // a torn cable dangling from the hub
  M(tube([[0.03, -0.03, -0.06], [0.05, -0.1, -0.08], [0.04, -0.2, -0.05], [0.06, -0.26, -0.07]], 0.005, 16, 6), Flat(0x111111, 0.6), tilt);
  e.sparkNodes.push(pitchG, tip);
  e._buildSparks();
  let spin = 0, ext = 0;
  e._anim = (dt, S) => {
    const t = e.time, dead = e.deadK, a = S.anim;
    const moving = sat(S.speed / 4);
    // hover bob and drift
    const bob = Math.sin(t * 2.1) * 0.035 + Math.sin(t * 3.7) * 0.012;
    const fall = sstep(0, 0.8, dead);
    hover.position.y = lerp(1.45 + bob * (1 - e.stunK * 0.5) - e.stunK * 0.25, 0.14, fall);
    const stun = e.stunK;
    e.j(tilt, 'x', lerp(moving * 0.35 + Math.sin(t * 1.3) * 0.04 + stun * n1(t * 20, 1) * 0.3, 0.5, fall));
    e.j(tilt, 'z', lerp(Math.sin(t * 1.7) * 0.05 + stun * n1(t * 18, 2) * 0.35, -0.9, fall));
    spin += dt * (1 - fall) * (60 + moving * 30) * (stun > 0.5 ? (n1(t * 6, 3) > 0 ? 1 : 0.2) : 1);
    rotors.forEach((r, i) => { r.rotation.y = spin * (i % 2 ? 1 : -1); });
    // lens aims (in idle it scans by itself)
    const scan = a === 'idle' ? Math.sin(t * 0.6) * 0.9 + n1(t * 0.9, 6) * 0.3 : 0;
    e.j(yawG, 'y', (S.aimYaw + scan) * (1 - fall) + stun * n1(t * 15, 4) * 0.6);
    e.j(pitchG, 'x', clamp(-S.aimPitch, -1, 1.1) * (1 - fall) + (a === 'idle' ? 0.15 + Math.sin(t * 0.8) * 0.1 : 0) + fall * 0.9);
    // alert: the lens telescopes out and the iris snaps
    ext = damp(ext, a === 'alert' || a === 'attack' ? 1 : 0, 10, dt);
    barrel.position.z = 0.05 + ext * 0.05;
    let irisK = 0.35 + 0.15 * Math.sin(t * 0.7) + sat(S.lit) * 0.5 + ext * 0.35;
    if (a === 'alert') irisK += Math.sin(t * 18) > 0.3 ? 0.2 : 0;
    irisK = clamp(irisK, 0, 0.95);
    blades.forEach(b => { b.children[0].rotation.z = -irisK * 0.9; b.children[0].position.x = 0.022 - irisK * 0.012; });
    pupil.scale.setScalar(1 - irisK * 0.6);
    tip.visible = fract(t * 1.2) < 0.15 || a === 'alert';
  };
  e.flicker = (t, S) => (S.anim === 'alert' ? (Math.sin(t * 22) > 0 ? 1.6 : 0.35) : 1);
}

/* ================================================================ 2. HUNTER */
function buildHunter(e) {
  e.height = 1.9; e.radius = 0.45;
  const sh = e.kit.shell('dark'), steel = Mat('steel'), rub = Mat('rubber'), metal = Mat('metal');
  const orange = Flat(0xc8581a, 0.45, 0.2), blk = Flat(0x0e0f11, 0.5, 0.4);
  const H0 = 0.98;
  const pelvis = G(e.root, 0, H0, 0);
  M(tbox(0.3, 0.16, 0.22, 0.05, 0.8, 0.9), sh, pelvis, 0, 0.0, -0.01);
  M(cyl(0.05, 0.05, 0.38, 16), steel, pelvis, 0, -0.03, 0, 0, 0, PI / 2);
  // legs: reverse knee, exposed hydraulics
  const legs = [];
  for (const sx of [-1, 1]) {
    const L = new Leg(pelvis, new THREE.Vector3(sx * 0.17, -0.03, 0), 0.47, 0.56, -1);
    M(cyl(0.065, 0.065, 0.07, 20), metal, L.hip, 0, 0, 0, 0, 0, PI / 2);
    M(tbox(0.12, 0.44, 0.15, 0.04, 0.7, 0.8), sh, L.hip, 0, -0.21, 0.0);
    M(rbox(0.05, 0.36, 0.06, 0.015), steel, L.hip, -sx * 0.045, -0.22, -0.03);
    // knee: the hydraulic knee assembly, glowing reservoir = weak point
    M(cyl(0.07, 0.07, 0.13, 24), steel, L.knee, 0, 0, 0, 0, 0, PI / 2);
    M(cyl(0.075, 0.075, 0.03, 24), blk, L.knee, sx * 0.07, 0, 0, 0, 0, PI / 2);
    const res = G(L.knee, 0, 0.02, -0.075);
    M(cap(0.028, 0.06, 4, 12), Flat(0x3a1a10, 0.2, 0.1), res, 0, 0, 0, PI / 2 + 0.3);
    M(cap(0.018, 0.06, 4, 10), e.kit.infMat, res, 0, 0, -0.012, PI / 2 + 0.3);
    M(tor(0.031, 0.005, 6, 16), steel, res, 0, 0.02, -0.03, 0.3);
    e.weak(sx < 0 ? 'knee_r' : 'knee_l', sx < 0 ? 'Right hydraulic knee' : 'Left hydraulic knee', L.knee, 0.11);
    // shin: twin struts + a front guard
    M(rbox(0.032, 0.52, 0.03, 0.012), steel, L.knee, sx * 0.03, -0.27, 0.0);
    M(rbox(0.032, 0.52, 0.03, 0.012), steel, L.knee, -sx * 0.03, -0.27, 0.0);
    M(tbox(0.1, 0.4, 0.06, 0.025, 0.6, 0.7), sh, L.knee, 0, -0.24, 0.04);
    M(rbox(0.07, 0.02, 0.05, 0.008), orange, L.knee, 0, -0.08, 0.072);
    // ankle + raptor foot
    M(cyl(0.045, 0.045, 0.1, 16), metal, L.ankle, 0, 0, 0, 0, 0, PI / 2);
    M(rbox(0.11, 0.05, 0.14, 0.02), sh, L.ankle, 0, -0.035, 0.04);
    for (let tI = -1; tI <= 1; tI++) { const toe = G(L.ankle, tI * 0.035, -0.04, 0.1, 0, tI * 0.22, 0); M(blade(0.14, 0.022, 0.03, 0.4), steel, toe, 0, 0, 0, PI / 2 + 0.25); }
    const spur = G(L.ankle, 0, -0.02, -0.05, 0, 0, 0); M(blade(0.09, 0.015, 0.02, -0.3), steel, spur, 0, 0, 0, -PI / 2 - 0.5);
    M(rbox(0.12, 0.012, 0.16, 0.005), rub, L.ankle, 0, -0.062, 0.04);
    // pistons across the knee (front) and from pelvis to thigh
    const a1 = G(L.hip, 0, -0.12, 0.08), b1 = G(L.knee, 0, -0.16, 0.05);
    e.pistons.push(new Piston(e.root, a1, b1, 0.017, 0.01, Flat(0x2b2f33, 0.4, 0.6), steel));
    const a2 = G(pelvis, sx * 0.17, 0.08, -0.1), b2 = G(L.hip, 0, -0.18, -0.07);
    e.pistons.push(new Piston(e.root, a2, b2, 0.015, 0.009, Flat(0x2b2f33, 0.4, 0.6), steel));
    legs.push(L); e.sparkNodes.push(L.knee);
  }
  // spine + torso
  const spine = G(pelvis, 0, 0.06, -0.02);
  M(cyl(0.03, 0.035, 0.26, 12), steel, spine, 0, 0.12, -0.02);
  for (let v = 0; v < 4; v++) M(cyl(0.05 - v * 0.003, 0.05 - v * 0.003, 0.025, 14), blk, spine, 0, 0.04 + v * 0.06, -0.02);
  M(tube([[0.06, 0, 0.04], [0.08, 0.12, 0.05], [0.06, 0.26, 0.03]], 0.01, 10, 6), rub, spine);
  M(tube([[-0.06, 0, 0.04], [-0.085, 0.12, 0.06], [-0.06, 0.26, 0.03]], 0.01, 10, 6), Flat(0x4a1a12, 0.5), spine);
  const chest = G(spine, 0, 0.26, 0);
  M(deform(rbox(0.44, 0.38, 0.26, 0.08, 4), v => { const k = v.y / 0.38 + 0.5; v.x *= lerp(0.62, 1, k); v.z *= lerp(0.8, 1, k); v.z += Math.max(0, v.z) * 0.25 * (1 - Math.abs(v.x) / 0.22); }, 'huntChest'), sh, chest, 0, 0.2, 0);
  M(tbox(0.3, 0.2, 0.08, 0.03, 1.1, 1), Flat(0x16181a, 0.5, 0.5), chest, 0, 0.18, 0.12); // inner chest recess
  for (let r = 0; r < 4; r++) M(rbox(0.26 - r * 0.02, 0.016, 0.03, 0.006), steel, chest, 0, 0.1 + r * 0.04, 0.155);
  M(tor(0.03, 0.006, 6, 24), e.kit.infMat, chest, 0, 0.19, 0.15);
  M(cyl(0.026, 0.026, 0.02, 20), Flat(0x2a0a06, 0.3, 0.2), chest, 0, 0.19, 0.145, PI / 2);
  glyph(e, chest, 0.11, 0.0, 0.3, 0.145, -0.3);
  label(chest, labelTex('hunter', ['VECTOR PURSUIT UNIT', 'MUNICIPAL ENFORCEMENT  HX-12  SN 20-0093'], { fg: '#c8581a', w: 512, h: 96 }), 0.24, 0.045, 0, 0.27, -0.135, 0, PI, 0);
  // dorsal vertebra fins: an animal ridge on a machine
  for (let r = 0; r < 5; r++) M(blade(0.07 + r * 0.012, 0.02, 0.008, 0.2), sh, chest, 0, 0.06 + r * 0.075, -0.12 - r * 0.005, -2.2 + r * 0.1);
  // neck + head
  const neck = G(chest, 0, 0.36, 0.08);
  M(bellows(0.04, 0.035, 0.16, 6), rub, neck, 0, 0.08, 0);
  M(tube([[0.04, 0, -0.03], [0.05, 0.1, -0.02], [0.03, 0.16, 0.0]], 0.008, 8, 6), steel, neck);
  const head = G(neck, 0, 0.17, 0.02);
  const skull = deform(rbox(0.14, 0.13, 0.32, 0.05, 4), v => { const k = (v.z / 0.32 + 0.5); v.x *= lerp(1.05, 0.55, k); v.y *= lerp(1.1, 0.55, k); v.y -= k * 0.02; }, 'huntSkull');
  M(skull, sh, head, 0, 0.0, 0.07);
  M(deform(rbox(0.12, 0.05, 0.22, 0.02, 3), v => { const k = (v.z / 0.22 + 0.5); v.x *= lerp(1, 0.5, k); }, 'huntJaw'), blk, head, 0, -0.055, 0.07, 0.08);
  // slit visor: a dark glass band following the skull taper with a glowing slit in it
  const halfW = z => 0.07 * lerp(1.05, 0.55, clamp((z - 0.07) / 0.32 + 0.5, 0, 1));
  const fitted = (h, d, zc, grow, key) => deform(rbox(0.1, h, d, Math.min(h, d) * 0.45, 3), v => { v.x *= halfW(v.z + zc) / 0.05 * grow; }, key);
  M(fitted(0.04, 0.2, 0.12, 1.06, 'huntVisor'), Flat(0x07080a, 0.08, 0.6), head, 0, 0.012, 0.12);
  const slit = M(fitted(0.009, 0.17, 0.13, 1.1, 'huntSlit'), e.kit.eyeMat, head, 0, 0.016, 0.13);
  const eyeN = G(head, 0, 0.016, 0.2); e.eyes.push(eyeN);
  for (const sx of [-1, 1]) M(blade(0.13, 0.022, 0.008, 0.6), sh, head, sx * 0.045, 0.05, -0.05, -2.5, 0, sx * 0.25);
  // arms: long, with blade fingers
  const arms = [];
  for (const sx of [-1, 1]) {
    const sho = G(chest, sx * 0.25, 0.3, 0.0);
    M(sph(0.075, 20, 14), sh, sho, sx * 0.02, 0.02, 0, 0, 0, 0, [1.1, 0.8, 1]);
    M(cyl(0.05, 0.05, 0.1, 16), steel, sho, 0, 0, 0, 0, 0, PI / 2);
    const up = G(sho, sx * 0.03, 0, 0);
    M(tbox(0.08, 0.4, 0.09, 0.03, 0.75, 0.8), sh, up, 0, -0.2, 0);
    M(rbox(0.03, 0.34, 0.03, 0.01), steel, up, 0, -0.2, -0.05);
    const el = G(up, 0, -0.42, 0);
    M(cyl(0.04, 0.04, 0.09, 16), metal, el, 0, 0, 0, 0, 0, PI / 2);
    M(tbox(0.07, 0.42, 0.075, 0.025, 0.65, 0.7), sh, el, 0, -0.22, 0.0);
    M(rbox(0.02, 0.4, 0.02, 0.008), steel, el, sx * 0.03, -0.22, -0.035);
    const wr = G(el, 0, -0.45, 0);
    M(rbox(0.07, 0.07, 0.04, 0.015), blk, wr, 0, -0.03, 0);
    const fingers = [];
    for (let f = 0; f < 3; f++) {
      const fp = G(wr, (f - 1) * 0.024, -0.06, 0.01, 0, 0, (f - 1) * -0.12 * sx);
      M(rbox(0.016, 0.07, 0.016, 0.005), metal, fp, 0, -0.035, 0);
      const fd = G(fp, 0, -0.07, 0);
      M(blade(0.22, 0.016, 0.006, 0.0), Flat(0xb8bec4, 0.18, 1), fd, 0, 0, 0, PI);
      fingers.push(fp, fd);
    }
    const th = G(wr, -sx * 0.03, -0.04, 0.03, 0.5, 0, sx * 0.5); M(blade(0.12, 0.014, 0.006), Flat(0xb8bec4, 0.18, 1), th, 0, 0, 0, PI);
    arms.push({ sho, up, el, wr, fingers, sx }); e.sparkNodes.push(el, wr);
  }
  e.sparkNodes.push(head, chest);
  e._buildSparks();
  const strideMem = { amp: 0 };
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK;
    const run = a === 'run', walk = a === 'walk', atk = a === 'attack', alert = a === 'alert';
    const moving = (run || walk) ? 1 : 0;
    strideMem.amp = damp(strideMem.amp, moving, 6, dt);
    const stride = run ? 1.9 : 0.9, duty = run ? 0.38 : 0.62, lift = run ? 0.3 : 0.12;
    e.phase += dt * (moving ? S.speed * duty / stride : 0.0);
    const ph = e.phase;
    // body pose targets
    let hip = H0 - 0.04, lean = 0.5, twist = 0, pz = 0, roll = 0;
    if (a === 'idle') { hip = 0.9 + Math.sin(t * 1.6) * 0.008; lean = 0.68 + Math.sin(t * 1.6) * 0.02; }
    if (walk) { hip = 0.9 - Math.abs(Math.sin(ph * TAU)) * 0.03; lean = 0.78; roll = Math.sin(ph * TAU) * 0.04; }
    if (run) { hip = 0.86 + Math.cos(ph * TAU * 2) * 0.05; lean = 0.95 + Math.sin(ph * TAU * 2) * 0.05; roll = Math.sin(ph * TAU) * 0.05; }
    if (alert) { hip = 1.0; lean = 0.15 + n1(t * 4, 1) * 0.05; }
    let atkK = 0, slash = 0;
    if (atk) { const k = fract(S.t / 1.1); atkK = k < 0.35 ? sstep(0, 0.35, k) : k < 0.55 ? 1 : 1 - sstep(0.55, 1, k); slash = sstep(0.35, 0.52, k) * (1 - sstep(0.7, 1, k)); hip = 0.9 - atkK * 0.14 + slash * 0.06; lean = 0.6 + atkK * 0.25 + slash * 0.3; pz = slash * 0.35 - atkK * 0.08; twist = -0.45 * atkK + slash * 0.9; }
    if (stun) { hip -= stun * 0.06; lean += stun * n1(t * 13, 2) * 0.2; twist += stun * n1(t * 11, 5) * 0.35; roll += stun * n1(t * 9, 8) * 0.12; }
    const dk = sstep(0, 1, dead);
    hip = lerp(hip, 0.32, dk); lean = lerp(lean, 1.45, dk); roll = lerp(roll, 0.25, dk);
    e.p(pelvis, 'y', hip); e.p(pelvis, 'z', pz); e.j(pelvis, 'z', roll * 0.5); e.j(pelvis, 'x', dk * 0.3);
    e.j(spine, 'x', lean); e.j(spine, 'y', twist); e.j(spine, 'z', roll);
    // head: stays level-ish, follows aim, twitchy scanning when idle
    const scan = a === 'idle' ? (n1(t * 0.7, 3) * 0.7 + (n1(t * 2.3, 4) > 0.6 ? 0.25 : 0)) : 0;
    e.j(neck, 'x', -lean * 0.55 - 0.15);
    e.j(head, 'x', clamp(-lean * 0.45 + 0.1 - S.aimPitch * 0.8 + dk * 0.6, -1.2, 1.2) + (alert ? n1(t * 8, 6) * 0.1 : 0));
    e.j(head, 'y', clamp(S.aimYaw * 0.8 + scan + stun * n1(t * 17, 3) * 0.6, -1.3, 1.3) * (1 - dk));
    e.j(head, 'z', (a === 'idle' ? n1(t * 0.5, 9) * 0.15 : 0) + dk * 0.6 + (alert ? 0.25 * Math.sin(t * 2) : 0));
    // legs: feet on the ground
    e.root.updateMatrixWorld(true);
    legs.forEach((L, i) => {
      const g = gait(ph + i * 0.5, stride * strideMem.amp, lift * strideMem.amp, duty);
      let fz = g.z + 0.04, fx = (i ? 1 : -1) * 0.2, fy = 0.07 + g.y;
      if (atk) { fz = (i ? -0.25 : 0.3) * atkK + fz * (1 - atkK); fx *= 1 + atkK * 0.3; }
      if (alert) fz += i ? -0.12 : 0.12;
      if (dead) { fz = lerp(fz, i ? 0.25 : -0.05, dk); fx *= 1 + dk * 0.6; fy = lerp(fy, 0.08, dk); }
      const tl = e.toLocal(pelvis, fx, fy, fz);
      L.solve(tl, g.st ? 0 : -0.4 * strideMem.amp, pelvis.rotation.x);
      if (stun) L.knee.rotation.x += stun * n1(t * 23, i + 3) * 0.08;
    });
    // arms
    arms.forEach((A, i) => {
      const side = i ? 1 : -1, opp = i ? 0 : 0.5;
      let sx = 0.25, ex = -0.5, sz = side * 0.15, wx = -0.2, curl = 0.25, sy = 0;
      if (a === 'idle') { sx = -lean - 0.12 + Math.sin(t * 1.6 + i) * 0.03; ex = -0.55; curl = 0.3 + n1(t * 1.3, i) * 0.25; sz = side * 0.12; }
      if (walk) { sx = -lean - 0.15 + Math.sin((ph + opp) * TAU) * 0.35; ex = -0.7; curl = 0.35; }
      if (run) { sx = -lean - 0.45 + Math.sin((ph + opp) * TAU) * 0.7; ex = -0.9 + Math.cos((ph + opp) * TAU) * 0.3; sz = side * 0.35; curl = -0.1; wx = 0.3; }
      if (alert) { sx = -lean - 0.55; ex = -0.9; sz = side * 0.7; curl = -0.2; wx = 0.4; sy = side * 0.3; }
      if (atk) {
        if (i === 1) { sx = lerp(-lean * 0.4, -2.6, atkK) + slash * 2.4 - lean * 0.2; ex = -0.4 - atkK * 0.9 + slash * 0.9; sz = side * (0.3 + atkK * 0.4 - slash * 0.9); curl = -0.3; wx = 0.5 - slash; }
        else { sx = -lean - 0.5; ex = -1.2; sz = side * 0.5; curl = 0.1; }
      }
      if (dead) { sx = lerp(sx, -lean - 0.2, dk); ex = lerp(ex, -0.2, dk); sz = lerp(sz, side * 0.5, dk); curl = lerp(curl, 0.6, dk); }
      if (stun) { sx += stun * n1(t * 19, i + 1) * 0.5; ex += stun * n1(t * 16, i + 4) * 0.5; curl += stun * n1(t * 25, i) * 0.6; }
      e.j(A.sho, 'x', sx); e.j(A.sho, 'z', sz); e.j(A.sho, 'y', sy); e.j(A.el, 'x', ex); e.j(A.wr, 'x', wx);
      A.fingers.forEach((f, k) => e.j(f, 'x', k % 2 ? curl * 0.8 : curl));
    });
  };
}

/* ================================================================ 3. SENTINEL */
function beamTex() {
  return canvasTex('beam', 64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.97, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function buildSentinel(e) {
  e.height = 2.6; e.radius = 0.85;
  const sh = e.kit.shell('police'), dk = e.kit.shell('dark'), steel = Mat('steel'), rub = Mat('rubber'), metal = Mat('metal');
  const blue = Flat(0x1f3f78, 0.4, 0.3), blk = Flat(0x0e0f11, 0.5, 0.4), haz = Mat('hazard');
  const H0 = 1.12;
  const pelvis = G(e.root, 0, H0, 0);
  M(tbox(0.62, 0.26, 0.4, 0.07, 1.05, 1), dk, pelvis, 0, 0, 0);
  M(rbox(0.66, 0.06, 0.44, 0.02), haz, pelvis, 0, 0.1, 0);
  M(tbox(0.26, 0.24, 0.12, 0.04, 1.3, 1), sh, pelvis, 0, -0.08, 0.2, -0.15);
  const legs = [];
  for (const sx of [-1, 1]) {
    const L = new Leg(pelvis, new THREE.Vector3(sx * 0.29, -0.06, 0), 0.56, 0.56, 1);
    M(sph(0.13, 20, 14), metal, L.hip);
    M(tbox(0.27, 0.48, 0.32, 0.08, 0.8, 0.85), sh, L.hip, 0, -0.26, 0.01);
    M(rbox(0.05, 0.4, 0.04, 0.015), blue, L.hip, sx * 0.137, -0.26, 0.04);
    M(cyl(0.1, 0.1, 0.24, 20), steel, L.knee, 0, 0, 0, 0, 0, PI / 2);
    M(lathe([[0, 0.11], [0.08, 0.1], [0.13, 0.06], [0.15, 0]], 24), sh, L.knee, 0, 0.0, 0.08, PI / 2);
    M(tbox(0.25, 0.5, 0.3, 0.07, 1.1, 1.05), sh, L.knee, 0, -0.28, -0.02);
    M(rbox(0.2, 0.12, 0.04, 0.015), blk, L.knee, 0, -0.18, 0.135);
    M(sph(0.09, 16, 12), metal, L.ankle);
    const foot = G(L.ankle, 0, -0.04, 0);
    M(rbox(0.28, 0.13, 0.44, 0.05), dk, foot, 0, -0.03, 0.07);
    M(rbox(0.3, 0.04, 0.47, 0.015), rub, foot, 0, -0.1, 0.07);
    M(rbox(0.28, 0.08, 0.12, 0.03), sh, foot, 0, 0.02, 0.25, 0.3);
    const a1 = G(L.hip, 0, -0.12, -0.15), b1 = G(L.knee, 0, -0.32, -0.16);
    e.pistons.push(new Piston(e.root, a1, b1, 0.035, 0.02, Flat(0x2b2f33, 0.4, 0.6), steel));
    legs.push(L); e.sparkNodes.push(L.knee);
  }
  M(bellows(0.24, 0.22, 0.2, 5, 24), rub, pelvis, 0, 0.2, 0);
  const torso = G(pelvis, 0, 0.26, 0);
  const chestGeo = deform(rbox(1.0, 0.78, 0.62, 0.16, 3), v => { const k = v.y / 0.78 + 0.5; v.x *= lerp(0.62, 1, Math.sqrt(k)); v.z *= lerp(0.75, 1, k); if (v.z > 0) v.z += 0.06 * (1 - (v.x / 0.5) ** 2) * k; }, 'sentChest');
  M(chestGeo, sh, torso, 0, 0.42, 0);
  M(tbox(0.5, 0.2, 0.06, 0.03, 1.2, 1), blue, torso, 0, 0.62, 0.34, -0.05);
  label(torso, labelTex('sent', ['CIVIC SECURITY', 'AEGIS-7 PUBLIC ORDER UNIT  SN 7741-K'], { fg: '#e8ecee', w: 512, h: 96 }), 0.46, 0.085, 0, 0.62, 0.372, -0.05);
  label(torso, labelTex('sent07', [{ t: '07', size: 110 }], { fg: '#1f3f78', w: 128, h: 128, wear: 12 }), 0.16, 0.16, -0.26, 0.38, 0.35, -0.05, -0.25);
  glyph(e, torso, 0.2, 0.25, 0.36, 0.352, -0.05, 0.28);
  for (let r = 0; r < 3; r++) M(rbox(0.36 - r * 0.06, 0.03, 0.04, 0.01), steel, torso, 0, 0.14 + r * 0.06, 0.29 - r * 0.01);
  // back: the cooling vent (weak point)
  const vent = G(torso, 0, 0.42, -0.33);
  M(rbox(0.46, 0.4, 0.08, 0.04), blk, vent, 0, 0, 0.02);
  const ventGlow = e.kit.glow(0xff5a1a, 2.4);
  M(plane(0.4, 0.34), ventGlow, vent, 0, 0, -0.025, 0, PI, 0);
  for (let s = 0; s < 8; s++) M(rbox(0.44, 0.012, 0.05, 0.004, 1), steel, vent, 0, -0.16 + s * 0.045, -0.03, -0.5);
  for (const sx of [-1, 1]) { M(cyl(0.06, 0.07, 0.16, 16), dk, torso, sx * 0.28, 0.76, -0.24, -0.4); M(cyl(0.045, 0.045, 0.02, 14), ventGlow, torso, sx * 0.28, 0.84, -0.27, -0.4); }
  label(torso, labelTex('ventw', ['! HOT EXHAUST', 'DO NOT OBSTRUCT'], { fg: '#111', stripes: true, bg: '#d9d4c8', w: 256, h: 96 }), 0.2, 0.075, 0, 0.7, -0.29, 0.25, PI, 0);
  e.weak('vent', 'Rear cooling vent', vent, 0.24);
  e.nodes.ventGlow = ventGlow;
  // pauldrons
  const shoulders = [];
  for (const sx of [-1, 1]) {
    const pd = G(torso, sx * 0.56, 0.74, 0);
    M(lathe([[0, 0.2], [0.12, 0.19], [0.22, 0.13], [0.28, 0.03], [0.3, -0.06], [0.29, -0.09]], 28), sh, pd, sx * 0.04, 0, 0, 0, 0, -sx * 0.25, [1.05, 0.9, 1.0]);
    M(lathe([[0.27, 0.0], [0.305, -0.03], [0.315, -0.11], [0.29, -0.14], [0.26, -0.14]], 32), haz, pd, sx * 0.04, -0.04, 0, 0, 0, -sx * 0.25, [1.05, 1, 1.0]);
    if (sx > 0) { M(cyl(0.035, 0.04, 0.05, 14), blk, pd, 0.12, 0.2, -0.05); M(sph(0.032, 14, 10), e.kit.infMat, pd, 0.12, 0.235, -0.05); }
    const sho = G(torso, sx * 0.6, 0.6, 0);
    M(sph(0.12, 18, 12), metal, sho);
    const el = G(sho, 0, -0.5, 0);
    M(tbox(0.2, 0.42, 0.22, 0.06, 0.85, 0.85), sh, sho, 0, -0.24, 0);
    M(cyl(0.085, 0.085, 0.2, 18), steel, el, 0, 0, 0, 0, 0, PI / 2);
    M(tbox(0.22, 0.46, 0.24, 0.07, 1.15, 1.1), dk, el, 0, -0.25, 0);
    const hand = G(el, 0, -0.5, 0);
    M(rbox(0.17, 0.15, 0.17, 0.05), dk, hand, 0, -0.06, 0);
    for (let f = 0; f < 4; f++) M(rbox(0.035, 0.09, 0.05, 0.015), metal, hand, -0.06 + f * 0.04, -0.16, 0.04, 0.6);
    shoulders.push({ sho, el, hand, sx }); e.sparkNodes.push(el, hand);
  }
  // left forearm (+x): the riot shield
  const shield = G(shoulders[1].el, 0.04, -0.24, 0.2, 0.95, 0.42, 0);
  const shGeo = deform(rbox(0.72, 1.12, 0.05, 0.02, 2), v => { v.z -= (v.x * v.x) * 0.55; }, 'sentShield');
  const shieldMat = e.kit.shell('grey');
  M(shGeo, shieldMat, shield);
  M(deform(rbox(0.5, 0.06, 0.02, 0.008, 1), v => { v.z -= (v.x * v.x) * 0.55; }, 'sentSlit'), Flat(0x0a1016, 0.05, 0.5), shield, 0, 0.36, 0.03);
  label(shield, labelTex('shield', [{ t: 'CIVIC', size: 58 }, { t: 'SECURITY', size: 58 }], { fg: '#e8ecee', w: 256, h: 160, wear: 50 }), 0.5, 0.31, 0, 0.0, 0.035);
  M(deform(rbox(0.74, 0.06, 0.07, 0.02, 1), v => { v.z -= (v.x * v.x) * 0.55; }, 'sentShRim'), haz, shield, 0, -0.55, 0);
  glyph(e, shield, 0.16, 0.18, -0.3, 0.04);
  M(rbox(0.06, 0.3, 0.12, 0.02), steel, shield, 0, 0, -0.08);
  // right forearm (-x): stun baton
  const baton = G(shoulders[0].hand, 0, -0.12, 0.06, PI / 2, 0, 0);
  M(cyl(0.035, 0.035, 0.8, 14), blk, baton, 0, -0.32, 0);
  for (let r = 0; r < 3; r++) M(tor(0.038, 0.008, 6, 18), e.kit.infMat, baton, 0, -0.55 - r * 0.07, 0, PI / 2);
  M(sph(0.04, 12, 8), steel, baton, 0, -0.72, 0);
  // neck + searchlight head
  const neck = G(torso, 0, 0.8, 0.04);
  M(bellows(0.13, 0.11, 0.14, 4), rub, neck, 0, 0.05, 0);
  const yaw = G(neck, 0, 0.12, 0);
  M(cyl(0.13, 0.15, 0.04, 22), dk, yaw);
  for (const sx of [-1, 1]) M(rbox(0.035, 0.24, 0.12, 0.012), dk, yaw, sx * 0.2, 0.1, 0);
  const lamp = G(yaw, 0, 0.17, 0);
  M(cyl(0.175, 0.16, 0.32, 32), sh, lamp, 0, 0, -0.02, PI / 2);
  M(cyl(0.02, 0.02, 0.44, 10), steel, lamp, 0, 0, 0, 0, 0, PI / 2);
  M(tor(0.172, 0.022, 10, 40), blk, lamp, 0, 0, 0.14);
  for (let r = 0; r < 4; r++) M(cyl(0.15 - r * 0.012, 0.15 - r * 0.012, 0.012, 28), blk, lamp, 0, 0, -0.2 - r * 0.03, PI / 2);
  M(cyl(0.155, 0.155, 0.01, 32), Flat(0x2a2c2e, 0.2, 0.9), lamp, 0, 0, 0.13, PI / 2);
  const lens = M(circ(0.135, 40), e.kit.eyeMat, lamp, 0, 0, 0.142);
  for (let r = 1; r < 4; r++) M(tor(r * 0.034, 0.003, 4, 36), Flat(0x111111, 0.3, 0.5), lamp, 0, 0, 0.145);
  M(sph(0.135, 32, 10, 0), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.15, clearcoat: 1, depthWrite: false }), lamp, 0, 0, 0.14, 0, 0, 0, [1, 1, 0.18]);
  for (const sx of [-1, 1]) { M(cyl(0.025, 0.025, 0.05, 12), blk, lamp, sx * 0.13, 0.12, 0.1, PI / 2); M(circ(0.014, 12), e.kit.eyeMat, lamp, sx * 0.13, 0.12, 0.126); }
  M(rbox(0.1, 0.03, 0.05, 0.01), haz, lamp, 0, 0.17, -0.05);
  // the beam: additive light cone, coloured like the eyes
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, opacity: 1 });
  const beam = noShadow(M(cyl(0.14, 0.95, 3.6, 32, true), beamMat, lamp, 0, 0, 0.14 + 1.8, -PI / 2));
  beam.renderOrder = 5; e.owned.push(beamMat);
  e.eyes.push(lens); e.sparkNodes.push(lamp, torso);
  e._buildSparks(); e.sparkScale = 2;
  const st = { amp: 0 };
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const walk = a === 'walk', run = a === 'run', atk = a === 'attack', alert = a === 'alert';
    const moving = walk || run ? 1 : 0;
    st.amp = damp(st.amp, moving, 4, dt);
    const stride = run ? 1.5 : 0.95, duty = run ? 0.5 : 0.64, lift = run ? 0.22 : 0.14;
    e.phase += dt * (moving ? S.speed * duty / stride : 0);
    const ph = e.phase;
    const impact = Math.exp(-fract(ph * 2) * 12) * st.amp;
    let hip = 1.08 + Math.sin(t * 1.2) * 0.008, lean = 0.04, roll = 0, twist = 0, pz = 0;
    if (moving) { hip = 1.06 + 0.035 * Math.cos(ph * TAU * 2) - impact * 0.05; roll = Math.sin(ph * TAU) * 0.06; twist = Math.sin(ph * TAU) * 0.08; lean = run ? 0.2 : 0.08; }
    if (alert) { hip = 1.04; lean = 0.1; }
    let bash = 0, slam = 0, wind = 0;
    if (atk) { const k = fract(S.t / 1.6); wind = sstep(0, 0.2, k) * (1 - sstep(0.2, 0.3, k)); bash = sstep(0.2, 0.3, k) * (1 - sstep(0.4, 0.55, k)); slam = sstep(0.55, 0.75, k) * (1 - sstep(0.75, 0.82, k)); const slamDn = sstep(0.75, 0.82, k) * (1 - sstep(0.9, 1, k)); twist = wind * 0.4 - bash * 0.35 + slam * 0.2 - slamDn * 0.3; pz = bash * 0.2 + slamDn * 0.1; lean = 0.1 + bash * 0.15 + slamDn * 0.3; hip = 1.05 - slamDn * 0.1; st.slamDn = slamDn; } else st.slamDn = 0;
    if (stun) { lean += stun * (0.15 + n1(t * 9, 1) * 0.08); twist += stun * n1(t * 13, 2) * 0.15; hip -= stun * 0.06; }
    hip = lerp(hip, 0.56, dkk); lean = lerp(lean, 0.8, dkk);
    e.p(pelvis, 'y', hip); e.p(pelvis, 'z', pz); e.j(pelvis, 'z', roll * 0.4);
    e.j(torso, 'x', lean); e.j(torso, 'y', twist); e.j(torso, 'z', roll * 0.6 + dkk * 0.15);
    // searchlight: sweeps when idle, locks on when hunting
    const sweep = a === 'idle' || walk ? Math.sin(t * 0.45) * 0.8 : 0;
    e.j(yaw, 'y', clamp(S.aimYaw + sweep - twist, -1.4, 1.4) * (1 - dkk) + stun * n1(t * 10, 5) * 0.4);
    e.j(lamp, 'x', clamp(-S.aimPitch + (a === 'idle' ? 0.25 + Math.sin(t * 0.3) * 0.1 : 0.1) - lean * 0.5, -0.8, 0.9) + dkk * 0.6 + stun * 0.4);
    beamMat.color.copy(e.eyeColor).multiplyScalar(0.2 * e.eyeLevel * (alert || atk ? 1.6 : 1));
    beam.visible = e.eyeLevel > 0.02;
    ventGlow.color.setRGB(1, 0.35, 0.1).multiplyScalar((2 + Math.sin(t * 3) * 0.6 + (moving ? 0.8 : 0)) * (1 - dkk));
    // legs
    e.root.updateMatrixWorld(true);
    legs.forEach((L, i) => {
      const g = gait(ph + i * 0.5, stride * st.amp, lift * st.amp, duty);
      let fx = (i ? 1 : -1) * 0.31, fz = g.z + 0.02, fy = 0.14 + g.y;
      if (atk) fz += (i ? 0.25 : -0.2);
      if (alert) fz += i ? 0.15 : -0.1;
      if (dead) { fz = lerp(fz, -0.55, dkk); fy = lerp(fy, 0.16, dkk); }
      L.solve(e.toLocal(pelvis, fx, fy, fz), g.st || dead ? 0 : -0.25 * st.amp, pelvis.rotation.x);
      if (dead) L.ankle.rotation.x = lerp(L.ankle.rotation.x, 1.0, dkk);
    });
    // arms: shield up in guard, baton ready
    const [R, Lf] = shoulders;
    let lsx = -0.45, lsz = 0.1, lsy = -0.5, lex = -0.55, rsx = -0.1, rsz = -0.12, rex = -0.5, rsy = 0;
    if (moving) { rsx = -0.1 - Math.sin(ph * TAU) * 0.25; lsx = -0.45 + Math.sin(ph * TAU) * 0.05; }
    if (alert) { lsx = -0.75; lex = -0.9; lsy = -0.7; rsx = -0.6; rex = -1.2; }
    if (atk) { lsx = -0.45 + wind * 0.4 - bash * 0.75; lex = -0.55 - wind * 0.4 + bash * 0.45; lsy = -0.5 + bash * 0.2; rsx = lerp(-0.4, -2.8, slam) + st.slamDn * 2.2; rex = -0.6 - slam * 0.6 + st.slamDn * 0.4; rsz = -0.2; }
    if (stun) { lsx += stun * n1(t * 15, 3) * 0.3; rsx += stun * n1(t * 14, 6) * 0.4; rex += stun * n1(t * 18, 7) * 0.4; }
    if (dead) { lsx = lerp(lsx, -0.9, dkk); lex = lerp(lex, -0.1, dkk); rsx = lerp(rsx, -0.7, dkk); rex = lerp(rex, -0.2, dkk); lsy = lerp(lsy, -0.2, dkk); }
    e.j(Lf.sho, 'x', lsx); e.j(Lf.sho, 'z', lsz); e.j(Lf.sho, 'y', lsy); e.j(Lf.el, 'x', lex);
    e.j(R.sho, 'x', rsx); e.j(R.sho, 'z', rsz); e.j(R.sho, 'y', rsy); e.j(R.el, 'x', rex);
  };
}

/* ================================================================ 4. CRAWLER */
function buildCrawler(e) {
  e.height = 0.45; e.radius = 0.5;
  const sh = e.kit.shell('orange'), dk = e.kit.shell('dark'), steel = Mat('steel'), metal = Mat('metal'), rub = Mat('rubber');
  const blk = Flat(0x0e0f11, 0.4, 0.5);
  const body = G(e.root, 0, 0.26, 0);
  // thorax + head plate
  M(deform(sph(0.15, 32, 20), v => { v.x *= 1.0; v.y *= 0.5; v.z *= 1.1; if (v.y > 0) v.y *= 1 + 0.3 * (1 - Math.abs(v.z) / 0.16); }, 'crThorax'), sh, body, 0, 0.0, 0.02);
  M(tor(0.15, 0.008, 6, 40), e.kit.infMat, body, 0, -0.005, 0.02, PI / 2, 0, 0, [1, 1.1, 1]);
  M(deform(rbox(0.16, 0.08, 0.1, 0.03), v => { v.x *= 1 - v.z * 2.5; }, 'crFace'), blk, body, 0, 0.0, 0.15);
  // sensor eye cluster
  const eyesG = G(body, 0, 0.015, 0.2);
  [[0, 0.012, 0.018], [-0.035, 0.0, 0.012], [0.035, 0.0, 0.012], [-0.022, 0.026, 0.008], [0.022, 0.026, 0.008], [-0.05, 0.022, 0.006], [0.05, 0.022, 0.006], [0, -0.016, 0.007]].forEach(([x, y, r]) => {
    M(sph(r * 1.35, 10, 8), Flat(0x050505, 0.2, 0.6), eyesG, x, y, -0.004);
    M(sph(r, 12, 8), e.kit.eyeMat, eyesG, x, y, 0.0);
  });
  e.eyes.push(eyesG);
  // abdomen: segmented tool canister
  const abd = G(body, 0, 0.03, -0.12, -0.25);
  M(deform(sph(0.13, 28, 18), v => { v.z *= 1.45; v.y *= 0.8; }, 'crAbd'), sh, abd, 0, 0.02, -0.14);
  for (let r = 0; r < 3; r++) M(tor(0.118 - r * 0.012, 0.012, 8, 32), dk, abd, 0, 0.02, -0.06 - r * 0.07, 0, 0, 0, [1, 0.82, 1]);
  M(cyl(0.025, 0.035, 0.05, 12), steel, abd, 0, 0.02, -0.34, PI / 2);
  label(abd, labelTex('crawl', ['MAINT-8 ARACHNE', 'UTILITY CRAWLER  SN 88-1204'], { fg: '#171717', w: 512, h: 96 }), 0.13, 0.025, 0.0, 0.12, -0.14, -PI / 2 + 0.1, 0, 0);
  glyph(e, abd, 0.1, 0, 0.125, -0.24, -PI / 2 + 0.25);
  // underside glowing core (weak point)
  const coreN = G(body, 0, -0.07, 0.0);
  const coreGlow = e.kit.glow(0xff6a20, 3.2);
  M(sph(0.045, 20, 14), coreGlow, coreN);
  M(tor(0.05, 0.006, 6, 24), steel, coreN, 0, 0, 0, PI / 2);
  for (let c = 0; c < 4; c++) M(tor(0.05, 0.004, 4, 16, PI), steel, coreN, 0, 0, 0, 0, c * PI / 4, 0);
  e.weak('core', 'Underside power core', coreN, 0.07);
  // eight legs
  const legs = [], ang = [0.55, 1.05, 1.75, 2.35];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1, k = i % 4, a = ang[k] * side;
    const hipP = new THREE.Vector3(Math.sin(a) * 0.12, 0.0, Math.cos(a) * 0.12 + 0.02);
    const L = new Leg(body, hipP, 0.23, 0.36, 1, { free: true, yaw: a });
    M(sph(0.026, 12, 10), metal, L.hip);
    M(tbox(0.034, 0.23, 0.045, 0.014, 0.7, 0.7), sh, L.hip, 0, -0.115, 0);
    M(cyl(0.006, 0.006, 0.21, 6), steel, L.hip, 0, -0.115, -0.026);
    M(sph(0.02, 12, 10), metal, L.knee);
    M(cyl(0.011, 0.007, 0.3, 8), steel, L.knee, 0, -0.15, 0);
    M(tbox(0.026, 0.14, 0.03, 0.01, 0.6, 0.6), dk, L.knee, 0, -0.08, 0.0);
    M(sph(0.012, 8, 6), metal, L.ankle, 0, 0.04, 0);
    M(blade(0.06, 0.007, 0.007), Flat(0xb8bec4, 0.2, 1), L.ankle, 0, 0.04, 0, PI);
    legs.push({ L, a, side, k }); if (k === 0 || k === 2) e.sparkNodes.push(L.knee);
  }
  // front tool arms: cutter disc (left) and stabbing needle (right)
  const tools = [];
  for (const sx of [-1, 1]) {
    const sho = G(body, sx * 0.05, -0.04, 0.17);
    M(sph(0.018, 10, 8), metal, sho);
    M(rbox(0.02, 0.13, 0.02, 0.006, 1), steel, sho, 0, -0.065, 0);
    const el = G(sho, 0, -0.13, 0);
    M(sph(0.015, 10, 8), metal, el);
    M(rbox(0.018, 0.12, 0.018, 0.006, 1), dk, el, 0, -0.06, 0);
    const tip = G(el, 0, -0.12, 0);
    let spin = null;
    if (sx < 0) { spin = G(tip, 0, -0.03, 0, 0, 0, PI / 2); M(cyl(0.045, 0.045, 0.004, 24), Flat(0xb0b6bb, 0.25, 1), spin); M(cyl(0.012, 0.012, 0.012, 10), metal, spin); for (let s = 0; s < 12; s++) M(blade(0.012, 0.006, 0.002), Flat(0xb0b6bb, 0.25, 1), spin, Math.cos(s * TAU / 12) * 0.045, 0, Math.sin(s * TAU / 12) * 0.045, 0, -s * TAU / 12, -PI / 2); }
    else { M(cyl(0.012, 0.014, 0.04, 10), metal, tip, 0, -0.02, 0); M(blade(0.16, 0.007, 0.007), Flat(0xc8ced2, 0.15, 1), tip, 0, -0.035, 0, PI); M(tor(0.012, 0.003, 4, 12), e.kit.infMat, tip, 0, -0.04, 0, PI / 2); }
    tools.push({ sho, el, tip, spin, sx });
  }
  e.sparkNodes.push(body, eyesG);
  e._buildSparks(); e.sparkScale = 0.7;
  const st = { amp: 0, saw: 0 };
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const run = a === 'run', walk = a === 'walk', atk = a === 'attack', alert = a === 'alert';
    const moving = run || walk ? 1 : 0;
    st.amp = damp(st.amp, moving, 8, dt);
    const stride = run ? 0.36 : 0.22, duty = run ? 0.5 : 0.58, lift = run ? 0.09 : 0.06;
    e.phase += dt * (moving ? S.speed * duty / stride : 0);
    const ph = e.phase;
    let by = 0.24 + Math.sin(t * 2) * 0.004, bx = 0, bz = 0, rear = 0;
    if (moving) { by = 0.23 + Math.cos(ph * TAU * 2) * 0.012; bz = Math.sin(ph * TAU) * 0.03; }
    if (alert) { by = 0.3; bx = -0.12; }
    let stab = 0;
    if (atk) { const k = fract(S.t / 0.9); rear = sstep(0, 0.25, Math.min(S.t, 0.25)); stab = Math.pow(Math.max(0, Math.sin(k * TAU)), 3); by = 0.32; bx = -0.55 * rear + stab * 0.15; }
    if (stun) { by -= stun * 0.04; bz += stun * n1(t * 20, 2) * 0.12; bx += stun * n1(t * 17, 1) * 0.1; }
    by = lerp(by, 0.07, dkk); bx = lerp(bx, 0.1, dkk);
    e.p(body, 'y', by); e.j(body, 'x', bx); e.j(body, 'z', bz);
    e.j(body, 'y', moving ? Math.sin(ph * TAU) * 0.04 : n1(t * 0.4, 3) * 0.1 * (1 - dkk));
    e.root.updateMatrixWorld(true);
    for (const lg of legs) {
      const { L, a: an, side, k } = lg;
      const grp = (k + (side > 0 ? 0 : 1)) % 2;
      const g = gait(ph + grp * 0.5 + k * 0.08, stride * st.amp, lift * st.amp, duty);
      const reach = 0.41 + (k === 0 || k === 3 ? 0.04 : 0);
      let fx = Math.sin(an) * reach, fz = Math.cos(an) * reach + 0.02 + g.z, fy = g.y;
      if (a === 'idle' && n1(t * 0.7 + k * 3 + side, k) > 0.75) fy += 0.03; // idle leg taps
      if (atk && k === 0) { fx = side * 0.2; fz = 0.42 + stab * 0.05; fy = 0.45 + Math.sin(t * 9 + side) * 0.04; }
      if (atk && k === 1) { fx = side * 0.42; fz = 0.3; fy = 0.12 * rear; }
      if (alert && k === 0) fy += Math.max(0, Math.sin(t * 7 + side * 1.6)) * 0.08;
      L.solve(e.toLocal(body, fx, fy, fz));
      if (stun) L.knee.rotation.x += stun * n1(t * 25, k + side * 4) * 0.25;
      if (dead) { L.hip.rotation.x = lerp(L.hip.rotation.x, -1.9, dkk); L.knee.rotation.x = lerp(L.knee.rotation.x, 2.5, dkk); L.yawG.rotation.y = lerp(L.yawG.rotation.y, an, dkk); }
    }
    // tool arms
    st.saw += dt * (atk || alert ? 50 : 14) * (1 - dkk);
    tools.forEach(T => {
      let sx = -1.2, ex = 1.4, sz = 0;
      if (a === 'idle' || moving) { sx = -1.2 + n1(t * 1.4, T.sx + 3) * 0.15; ex = 0.55 + n1(t * 1.1, T.sx) * 0.15; }
      if (alert) { sx = -1.7; ex = 0.9; }
      if (atk) { if (T.sx > 0) { sx = -1.6 - stab * 0.5; ex = 0.6 - stab * 0.55; } else { sx = -1.9 + Math.sin(t * 6) * 0.2; ex = 0.8; } }
      if (dead) { sx = lerp(sx, -0.5, dkk); ex = lerp(ex, 2, dkk); }
      e.j(T.sho, 'x', sx + stun * n1(t * 22, T.sx) * 0.4); e.j(T.sho, 'z', sz); e.j(T.el, 'x', ex);
      if (T.spin) T.spin.rotation.y = st.saw;
    });
  };
}

/* ================================================================ 5. STALKER */
function buildStalker(e) {
  e.height = 2.5; e.radius = 0.4;
  const sh = e.kit.shell('mannequin'); sh.userData.ei = 0.8;
  const steel = Mat('steel'), joint = Flat(0x2a2c2f, 0.35, 0.8), blk = Flat(0x0a0a0b, 0.4, 0.3);
  const H0 = 1.32;
  const pelvis = G(e.root, 0, H0, 0);
  M(lathe([[0.0, -0.1], [0.1, -0.09], [0.15, -0.04], [0.16, 0.02], [0.13, 0.08], [0.09, 0.1], [0, 0.1]], 28), sh, pelvis, 0, 0, 0, 0, 0, 0, [1, 1, 0.68]);
  const legs = [];
  for (const sx of [-1, 1]) {
    const L = new Leg(pelvis, new THREE.Vector3(sx * 0.09, -0.06, 0), 0.63, 0.6, 1);
    M(sph(0.052, 16, 12), joint, L.hip);
    M(lathe([[0.0, 0.0], [0.06, -0.02], [0.068, -0.12], [0.06, -0.35], [0.045, -0.58], [0.035, -0.63], [0, -0.64]], 20), sh, L.hip, 0, -0.02, 0, 0, 0, 0, [0.9, 0.96, 0.9]);
    M(sph(0.042, 14, 10), joint, L.knee);
    M(lathe([[0.0, -0.02], [0.04, -0.04], [0.048, -0.18], [0.034, -0.5], [0.025, -0.6], [0, -0.62]], 18), sh, L.knee, 0, 0, 0, 0, 0, 0, [0.9, 0.96, 0.9]);
    M(sph(0.03, 12, 10), joint, L.ankle);
    const foot = G(L.ankle, 0, 0, 0);
    M(deform(rbox(0.075, 0.06, 0.24, 0.028), v => { v.y *= v.z > 0 ? 1 - v.z * 2.2 : 1; v.x *= v.z > 0 ? 1 - v.z * 1.4 : 1; }, 'stFoot'), sh, foot, 0, -0.04, 0.05);
    legs.push(L); e.sparkNodes.push(L.knee);
  }
  // the old display-stand socket bolted to the right calf, rod snapped off
  M(cyl(0.035, 0.035, 0.08, 14), steel, legs[0].knee, 0, -0.42, -0.04, PI / 2);
  M(cyl(0.012, 0.012, 0.26, 8), steel, legs[0].knee, 0, -0.52, -0.16, 0.9);
  // exposed spine at the waist (the mannequin is in two pieces)
  const spine = G(pelvis, 0, 0.09, 0);
  M(cyl(0.018, 0.022, 0.16, 10), steel, spine, 0, 0.08, -0.01);
  for (let v = 0; v < 3; v++) M(tor(0.024, 0.008, 6, 14), joint, spine, 0, 0.03 + v * 0.05, -0.01, PI / 2);
  M(tube([[0.03, 0.0, 0.02], [0.05, 0.08, 0.03], [0.025, 0.16, 0.02]], 0.005, 10, 6), Flat(0x5a1810, 0.5), spine);
  const chest = G(spine, 0, 0.16, 0);
  M(lathe([[0.0, 0.0], [0.08, 0.0], [0.095, 0.06], [0.13, 0.24], [0.145, 0.36], [0.15, 0.44], [0.12, 0.5], [0.05, 0.53], [0, 0.53]], 30), sh, chest, 0, 0, 0, 0, 0, 0, [1, 1, 0.6]);  glyph(e, chest, 0.1, 0.0, 0.3, 0.108, -0.12);
  label(chest, labelTex('stalk', ['LUMEN ATELIER', 'DISPLAY ANDROID  MODEL D-9  SN 3317'], { fg: '#58524a', w: 512, h: 96, wear: 15 }), 0.15, 0.028, 0, 0.36, -0.105, 0, PI, 0);
  // a shell piece missing at the left shoulder: steel mechanics underneath
  M(rbox(0.07, 0.07, 0.06, 0.01), blk, chest, 0.13, 0.42, 0.0);
  M(cyl(0.012, 0.012, 0.1, 8), steel, chest, 0.13, 0.42, 0.0, 0, 0, PI / 2);
  // neck + head
  const neck = G(chest, 0, 0.52, 0);
  M(cyl(0.015, 0.02, 0.3, 10), steel, neck, 0, 0.15, 0);
  for (let r = 0; r < 5; r++) M(tor(0.02, 0.006, 6, 14), joint, neck, 0, 0.03 + r * 0.06, 0, PI / 2);
  const head = G(neck, 0, 0.3, 0);
  M(sph(0.105, 32, 24), sh, head, 0, 0.11, 0.0, 0, 0, 0, [0.82, 1.2, 0.95]);
  // the sensor cluster: an asymmetric clump of pinprick lights in a shallow pit
  const sens = G(head, 0.025, 0.12, 0.085, 0, 0.25, 0);
  M(sph(0.03, 16, 12), blk, sens, 0, 0, -0.012, 0, 0, 0, [1, 1.2, 0.5]);
  const R = rnd(91);
  for (let i = 0; i < 11; i++) { const an = R() * TAU, rr = Math.sqrt(R()) * 0.026; M(sph(0.0025 + R() * 0.004, 8, 6), e.kit.eyeMat, sens, Math.cos(an) * rr, Math.sin(an) * rr * 1.2, 0.004); }
  e.eyes.push(sens);
  e.weak('sensors', 'Sensor cluster', sens, 0.05);
  // arms: too long, hands with long fingers
  const arms = [];
  for (const sx of [-1, 1]) {
    const sho = G(chest, sx * 0.158, 0.45, 0);
    M(sph(0.045, 14, 10), joint, sho);
    M(lathe([[0, 0.0], [0.045, -0.03], [0.048, -0.12], [0.036, -0.5], [0.03, -0.56], [0, -0.57]], 18), sh, sho, 0, -0.01, 0, 0, 0, 0, [0.9, 1.14, 0.9]);
    const el = G(sho, 0, -0.66, 0);
    M(sph(0.033, 12, 10), joint, el);
    if (sx > 0) { M(cyl(0.012, 0.012, 0.64, 8), steel, el, 0, -0.33, 0); M(cyl(0.006, 0.006, 0.56, 6), steel, el, 0.018, -0.33, 0); M(lathe([[0.034, -0.4], [0.032, -0.52], [0.024, -0.57], [0, -0.58]], 16), sh, el, 0, 0, 0, 0, 0, 0, [0.9, 1.15, 0.9]); }
    else M(lathe([[0, 0.0], [0.034, -0.03], [0.036, -0.12], [0.026, -0.52], [0.022, -0.57], [0, -0.58]], 18), sh, el, 0, 0, 0, 0, 0, 0, [0.9, 1.15, 0.9]);
    const wr = G(el, 0, -0.67, 0);
    M(sph(0.022, 10, 8), joint, wr);
    M(rbox(0.065, 0.1, 0.022, 0.01), sh, wr, 0, -0.06, 0);
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      let p = G(wr, (f - 1.5) * 0.017, -0.11, 0, 0, 0, (f - 1.5) * 0.06); const segs = [p];
      for (let s = 0; s < 3; s++) { M(cap(0.0065, 0.055 - s * 0.01, 3, 6), sh, p, 0, -0.03, 0); M(sph(0.0075, 6, 5), joint, p); if (s < 2) { p = G(p, 0, -0.065 + s * 0.01, 0); segs.push(p); } }
      fingers.push(segs);
    }
    const th = G(wr, -sx * 0.03, -0.05, 0.012, 0.3, 0, -sx * 0.5); M(cap(0.007, 0.06, 3, 6), sh, th, 0, -0.035, 0);
    if (sx < 0) { const tag = G(wr, 0, -0.02, 0.0); M(cyl(0.001, 0.001, 0.06, 4), Flat(0xdddddd, 0.6), tag, 0, -0.03, 0.02); label(tag, labelTex('tag', ['SALE', 'D-9  -40%'], { fg: '#9a1a1a', bg: '#f0ece2', w: 128, h: 96, wear: 4 }), 0.045, 0.034, 0, -0.075, 0.02); }
    arms.push({ sho, el, wr, fingers, sx }); e.sparkNodes.push(el, wr);
  }
  e.sparkNodes.push(head, chest);
  e._buildSparks();
  const st = { clock: 0, frozen: 0, amp: 0, last: 0, freezePose: 0 };
  e.flicker = (t, S) => (S.lit > 0.5 ? (n1(t * 40, 2) > 0.1 ? 1.8 : 0.05) : 1);
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const lit = S.lit > 0.5 && !dead;
    st.frozen = lit ? 1 : 0;
    st.freezePose = damp(st.freezePose, st.frozen, 30, dt);
    if (!lit) st.clock += dt;
    // stop motion: poses only update in steps, with occasional stutters
    const fps = a === 'run' ? 10 : a === 'attack' ? 12 : 6;
    const stutter = n1(st.clock * 0.8, 5) > 0.6 ? 0.5 : 1;
    const tq = Math.floor(st.clock * fps * stutter) / (fps * stutter);
    const run = a === 'run', walk = a === 'walk', atk = a === 'attack', alert = a === 'alert';
    const moving = run || walk ? 1 : 0;
    st.amp = moving ? 1 : damp(st.amp, 0, 5, dt);
    const stride = run ? 1.7 : 1.0, duty = run ? 0.45 : 0.6;
    if (!lit) e.phase += dt * (moving ? S.speed * duty / stride : 0);
    const ph = Math.floor(e.phase * fps * 2) / (fps * 2);
    const set = (o, ax, v) => { o.rotation[ax] = v; };
    let hip = 1.31, lean = 0.1, twist = 0, roll = 0;
    if (moving) { hip = 1.27 + Math.cos(ph * TAU * 2) * 0.02; lean = run ? 0.45 : 0.12; roll = Math.sin(ph * TAU) * 0.05; }
    let lunge = 0;
    if (atk) { const k = fract(S.t / 1.2); lunge = k < 0.35 ? 0 : k < 0.6 ? 1 : 0.4; lean = 0.2 + lunge * 0.5; hip = 1.2 - lunge * 0.1; }
    if (alert) { lean = -0.06; twist = n1(tq * 2, 3) * 0.3; }
    // the lit freeze: an awkward held pose
    const fz = st.freezePose;
    twist += fz * 0.45; roll += fz * -0.12; lean += fz * 0.15;
    if (stun) { lean += stun * n1(t * 14, 1) * 0.2; twist += stun * n1(t * 12, 2) * 0.3; }
    hip = lerp(hip, 0.18, dkk); lean = lerp(lean, -0.9, dkk);
    pelvis.position.y = hip; set(pelvis, 'x', dkk * -0.5); set(pelvis, 'z', roll * 0.5);
    set(spine, 'x', lean * 0.5); set(spine, 'y', twist * 0.5); set(chest, 'x', lean * 0.5 + 0.12 * (1 - dkk)); set(chest, 'y', twist * 0.5); set(chest, 'z', roll);
    // head: slow uncanny tilt in idle (smooth), snaps when hunting
    let hr = 0, hy = 0, hx = 0;
    if (a === 'idle') { hr = Math.sin(t * 0.35) * 0.55 + Math.sin(t * 0.13) * 0.2; hy = Math.sin(t * 0.21) * 0.25; hx = 0.1; }
    else { hy = clamp(S.aimYaw, -1.4, 1.4); hx = clamp(-S.aimPitch, -0.8, 0.8) - lean * 0.6; hr = alert ? (n1(tq * 1.5, 4) > 0 ? 0.7 : -0.4) : 0.35; }
    if (atk) hr = 1.1;
    hr = lerp(hr, 1.25, fz); hy = lerp(hy, hy + 0.6, fz);
    if (stun) { hr += stun * n1(t * 18, 6) * 0.6; hx += stun * n1(t * 16, 7) * 0.4; }
    hx -= 0.32;
    hr = lerp(hr, 0.8, dkk); hx = lerp(hx, -0.6, dkk);
    const smoothHead = a === 'idle' && !lit;
    if (smoothHead) { e.j(head, 'z', hr); e.j(head, 'y', hy); e.j(head, 'x', hx); }
    else { set(head, 'z', hr); set(head, 'y', hy); set(head, 'x', hx); }
    set(neck, 'x', lean * -0.3 + 0.32);
    // legs
    e.root.updateMatrixWorld(true);
    legs.forEach((L, i) => {
      const g = gait(ph + i * 0.5, stride * st.amp, (run ? 0.22 : 0.13) * st.amp, duty);
      let fx = (i ? 1 : -1) * 0.12, fz = g.z + 0.02, fy = 0.07 + g.y;
      if (atk) fz += (i ? 0.35 : -0.15) * lunge;
      if (dead) { fz = lerp(fz, i ? 0.75 : 0.6, dkk); fx *= 1 + dkk * 1.5; fy = lerp(fy, 0.06, dkk); }
      L.solve(e.toLocal(pelvis, fx, fy, fz), 0, pelvis.rotation.x);
    });
    // arms: hang too long, swing late; reach in attack; one arm lifts when frozen
    arms.forEach((A, i) => {
      const side = i ? 1 : -1;
      let sx = -lean * 0.9 + 0.05, ex = -0.12, sz = side * 0.06, fc = 0.25, wx = 0;
      if (moving) { sx += Math.sin((ph + (i ? 0 : 0.5)) * TAU) * (run ? 0.6 : 0.25); if (run) { sx += 0.5; ex = -0.2; } }
      if (a === 'idle') { fc = 0.2 + (n1(t * 0.5, i + 3) > 0.7 ? 0.6 : 0); }
      if (alert) { sx = -0.3; ex = -0.4; sz = side * 0.25; fc = -0.1; }
      if (atk) { sx = lerp(-0.3, -2.0, lunge); ex = lerp(-0.6, -0.1, lunge); sz = side * (0.15 - lunge * 0.12); fc = lunge ? -0.3 : 0.6; wx = 0.3 * lunge; }
      if (i === 1) { sx = lerp(sx, -1.55, fz); ex = lerp(ex, -1.35, fz); sz = lerp(sz, 0.35, fz); fc = lerp(fc, -0.25, fz); wx = lerp(wx, 0.9, fz); }
      else { sx = lerp(sx, 0.35, fz); sz = lerp(sz, -0.25, fz); fc = lerp(fc, 0.9, fz); }
      if (stun) { sx += stun * n1(t * 15, i + 2) * 0.6; ex += stun * n1(t * 19, i + 6) * 0.5; fc += stun * n1(t * 23, i) * 0.8; }
      if (dead) { sx = lerp(sx, 0.4 - side * 0.2, dkk); sz = lerp(sz, side * 0.9, dkk); ex = lerp(ex, -0.4, dkk); fc = lerp(fc, 0.5, dkk); }
      set(A.sho, 'x', sx); set(A.sho, 'z', sz); set(A.el, 'x', ex); set(A.wr, 'x', wx);
      A.fingers.forEach((segs, f) => segs.forEach((s, k) => { s.rotation.x = fc * (1 + k * 0.3) + (a === 'idle' && f === 2 ? Math.max(0, n1(tq * 2, f) * 0.5) : 0); }));
    });
  };
}

/* ================================================================ 6. CONSTRUCTION */
function buildConstruction(e) {
  e.height = 3.4; e.radius = 1.35;
  const yel = e.kit.shell('yellow'), dk = e.kit.shell('dark'), steel = Mat('steel'), rub = Mat('rubber'), metal = Mat('metal'), haz = Mat('hazard'), rust = Mat('rust');
  const blk = Flat(0x0e0f11, 0.5, 0.4), oil = Flat(0x1a1a1a, 0.3, 0.7);
  // ---- tracks: instanced cleats running around a stadium path
  const TR = 0.31, TZ = 0.82, TY = 0.33, TL = 2 * TZ * 2 + TAU * TR;
  const trackPos = (s, out) => {
    s = ((s % TL) + TL) % TL;
    if (s < 2 * TZ) { out.set(TZ - s, TY - TR, 0, -1); return out; }
    s -= 2 * TZ;
    if (s < PI * TR) { const a = s / TR; out.set(-TZ - Math.sin(a) * TR, TY - Math.cos(a) * TR, -Math.sin(a), -Math.cos(a)); return out; }
    s -= PI * TR;
    if (s < 2 * TZ) { out.set(-TZ + s, TY + TR, 0, 1); return out; }
    s -= 2 * TZ; const a = s / TR; out.set(TZ + Math.sin(a) * TR, TY + Math.cos(a) * TR, Math.sin(a), Math.cos(a)); return out;
  };
  const NC = 40, tracks = [], wheels = [];
  const cleatGeo = rbox(0.46, 0.06, 0.11, 0.015, 1);
  for (const sx of [-1, 1]) {
    const tg = G(e.root, sx * 0.82, 0, 0);
    const inst = new THREE.InstancedMesh(cleatGeo, Flat(0x2a2b2c, 0.7, 0.6), NC); tg.add(inst); tracks.push(inst);
    M(rbox(0.3, 0.5, 1.75, 0.08), yel, tg, 0, TY, 0);
    M(rbox(0.32, 0.08, 1.9, 0.03), dk, tg, 0, TY + 0.2, 0);
    for (const z of [-TZ, TZ]) { const w = G(tg, 0, TY, z); M(cyl(0.27, 0.27, 0.42, 24), metal, w, 0, 0, 0, 0, 0, PI / 2); for (let s = 0; s < 6; s++) M(rbox(0.44, 0.05, 0.08, 0.01, 1), steel, w, 0, Math.cos(s * PI / 3) * 0.27, Math.sin(s * PI / 3) * 0.27, -s * PI / 3); wheels.push({ w, r: 0.3 }); }
    for (let k = 0; k < 4; k++) { const w = G(tg, 0, 0.14, -0.55 + k * 0.37); M(cyl(0.12, 0.12, 0.36, 18), oil, w, 0, 0, 0, 0, 0, PI / 2); M(cyl(0.05, 0.05, 0.4, 10), steel, w, 0, 0, 0, 0, 0, PI / 2); wheels.push({ w, r: 0.15 }); }
    M(rbox(0.04, 0.28, 1.4, 0.02, 1), haz, tg, sx * 0.16, TY + 0.06, 0);
    e.sparkNodes.push(tg);
  }
  M(rbox(1.3, 0.34, 1.5, 0.06), dk, e.root, 0, 0.5, 0);
  // ---- upper body on a turntable
  const turn = G(e.root, 0, 0.72, 0);
  M(cyl(0.7, 0.75, 0.12, 36), metal, turn, 0, 0.0, 0);
  const upper = G(turn, 0, 0.06, 0);
  const houseGeo = deform(rbox(1.6, 1.05, 2.0, 0.14, 3), v => { if (v.z > 0.4 && v.y > 0) v.z -= (v.z - 0.4) * (v.y / 0.52) * 0.6; }, 'cxHouse');
  M(houseGeo, yel, upper, 0, 0.55, -0.05);
  M(rbox(1.64, 0.12, 2.04, 0.03), dk, upper, 0, 0.06, -0.05);
  for (const sx of [-1, 1]) { M(rbox(0.04, 0.6, 0.9, 0.02, 1), blk, upper, sx * 0.8, 0.6, -0.3); for (let s = 0; s < 7; s++) M(rbox(0.05, 0.03, 0.86, 0.01, 1), steel, upper, sx * 0.81, 0.36 + s * 0.08, -0.3); }
  M(rbox(0.2, 1.0, 0.06, 0.02, 1), haz, upper, -0.7, 0.55, -1.06); M(rbox(0.2, 1.0, 0.06, 0.02, 1), haz, upper, 0.7, 0.55, -1.06);
  label(upper, labelTex('cx', ['KORVAX HEAVY INDUSTRIES', 'AUTONOMOUS CONSTRUCTION UNIT CX-40  SN 40-00812'], { fg: '#1a1a1a', w: 512, h: 96 }), 0.9, 0.17, 0.805, 0.95, 0.3, 0, PI / 2, 0);
  label(upper, labelTex('cxw', ['DANGER', 'KEEP 10 M CLEAR OF WORKING ARMS'], { fg: '#111', stripes: true, bg: '#d6a21c', w: 512, h: 128, wear: 40 }), 0.6, 0.15, -0.805, 0.95, 0.2, 0, -PI / 2, 0);
  glyph(e, upper, 0.55, 0.806, 0.55, -0.55, 0, PI / 2, 0);
  glyph(e, upper, 0.4, 0, 1.081, -0.2, -PI / 2, 0, 0);
  // exhaust stacks
  const flaps = [];
  for (const [x, z] of [[-0.5, -0.65], [-0.25, -0.75]]) {
    M(cyl(0.075, 0.085, 1.6, 18), rust, upper, x, 1.85, z);
    M(cyl(0.095, 0.095, 0.12, 18), metal, upper, x, 1.3, z);
    M(cyl(0.065, 0.065, 0.02, 16), e.kit.glow(0xff5010, 1.6), upper, x, 2.651, z);
    const fl = G(upper, x, 2.66, z - 0.07); M(cyl(0.085, 0.085, 0.012, 18), metal, fl, 0, 0, 0.075, 0, 0, 0); flaps.push(fl);
  }
  // fuel cell on the back (weak point)
  const fuel = G(upper, 0.1, 0.7, -1.33);
  for (const x of [-0.35, 0.35]) M(rbox(0.08, 0.5, 0.3, 0.02, 1), dk, upper, 0.1 + x, 0.62, -1.15);
  M(cap(0.26, 0.8, 8, 24), Flat(0x9aa3a6, 0.35, 0.7), fuel, 0, 0, 0, 0, 0, PI / 2);
  const fcGlow = e.kit.glow(0x6aff9a, 2.2);
  for (const x of [-0.25, 0, 0.25]) M(tor(0.262, 0.018, 8, 36), fcGlow, fuel, x, 0, 0, 0, PI / 2, 0);
  for (const x of [-0.42, 0.42]) M(tor(0.27, 0.03, 8, 36), blk, fuel, x, 0, 0, 0, PI / 2, 0);
  label(fuel, labelTex('fuel', ['H2 FUEL CELL', 'PRESSURISED - NO OPEN FLAME'], { fg: '#111', stripes: true, bg: '#e8e2d2', w: 512, h: 128 }), 0.36, 0.09, -0.12, 0.0, -0.262, 0, PI, 0);
  M(tube([[0.45, 0, 0.1], [0.6, 0.1, 0.25], [0.55, -0.2, 0.5]], 0.025, 12, 8), rub, fuel);
  e.weak('fuelcell', 'Hydrogen fuel cell', fuel, 0.4);
  // sensor head + warning beacon
  const headYaw = G(upper, 0, 1.08, 0.55);
  M(cyl(0.14, 0.16, 0.12, 20), metal, headYaw, 0, 0.05, 0);
  const head = G(headYaw, 0, 0.18, 0);
  M(deform(rbox(0.66, 0.32, 0.42, 0.08), v => { if (v.z > 0) v.y *= 1 - v.z * 0.6; }, 'cxHead'), yel, head, 0, 0.08, 0);
  M(deform(rbox(0.56, 0.1, 0.06, 0.03), v => { v.z -= v.x * v.x * 0.5; }, 'cxVisor'), Flat(0x06080a, 0.06, 0.6), head, 0, 0.08, 0.205);
  for (const x of [-0.17, 0, 0.17]) { M(cyl(0.035, 0.035, 0.04, 14), blk, head, x, 0.08, 0.215 - x * x * 0.5, PI / 2); const ey = M(circ(0.026, 16), e.kit.eyeMat, head, x, 0.08, 0.236 - x * x * 0.5); e.eyes.push(ey); }
  const beacon = G(head, 0.0, 0.26, -0.08);
  M(cyl(0.09, 0.1, 0.05, 20), blk, beacon);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, toneMapped: false }); e.owned.push(beaconMat);
  const refl = G(beacon, 0, 0.1, 0); M(rbox(0.12, 0.1, 0.02, 0.01, 1), beaconMat, refl, 0, 0, 0.03); M(cyl(0.02, 0.02, 0.12, 8), steel, refl);
  M(sph(0.085, 20, 12), new THREE.MeshPhysicalMaterial({ color: 0xffa020, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, emissive: 0x803000, emissiveIntensity: 0.6 }), beacon, 0, 0.08, 0, 0, 0, 0, [1, 1.2, 1]);
  // ---- arms (forward = +z): boom -> stick -> tool
  const arms = [];
  for (const sx of [-1, 1]) {
    const mount = G(upper, sx * 0.66, 0.85, 0.85);
    M(rbox(0.36, 0.4, 0.36, 0.06), dk, mount);
    const boom = G(mount, sx * 0.0, 0.05, 0.05);
    M(cyl(0.11, 0.11, 0.42, 18), steel, boom, 0, 0, 0, 0, 0, PI / 2);
    M(deform(rbox(0.24, 0.3, 1.3, 0.06), v => { v.y *= 1 - Math.abs(v.z) * 0.35; }, 'cxBoom'), yel, boom, 0, 0, 0.62);
    M(rbox(0.06, 0.06, 1.0, 0.02, 1), haz, boom, sx * 0.125, 0.0, 0.62);
    const stick = G(boom, 0, 0, 1.28);
    M(cyl(0.09, 0.09, 0.32, 16), steel, stick, 0, 0, 0, 0, 0, PI / 2);
    M(deform(rbox(0.18, 0.22, 1.05, 0.05), v => { v.y *= 1 - (v.z + 0.5) * 0.25; }, 'cxStick'), yel, stick, 0, 0, 0.5);
    const tool = G(stick, 0, 0, 1.02);
    M(cyl(0.08, 0.08, 0.26, 16), steel, tool, 0, 0, 0, 0, 0, PI / 2);
    let spin = null, jaws = [];
    if (sx < 0) {
      // circular saw with guard
      M(rbox(0.12, 0.14, 0.32, 0.03), dk, tool, 0, 0, 0.16);
      spin = G(tool, -0.1, 0, 0.42, 0, 0, PI / 2);
      M(cyl(0.48, 0.48, 0.012, 64), Flat(0xb6bcc0, 0.22, 1), spin);
      M(cyl(0.1, 0.1, 0.05, 20), metal, spin);
      for (let s = 0; s < 32; s++) M(blade(0.04, 0.02, 0.008), Flat(0xa0a6aa, 0.3, 1), spin, Math.cos(s * TAU / 32) * 0.48, 0, Math.sin(s * TAU / 32) * 0.48, 0, -s * TAU / 32 + PI / 2, -PI / 2);
      M(cyl(0.5, 0.5, 0.012, 32, false), rust, spin, 0, 0, 0, 0, 0, 0, [0.6, 1.01, 0.6]);
      M(tor(0.5, 0.06, 8, 40, PI * 0.9), yel, tool, -0.1, 0, 0.42, 0, -PI / 2, PI * 0.05);
    } else {
      // hydraulic clamp
      M(rbox(0.24, 0.2, 0.26, 0.04), dk, tool, 0, 0, 0.14);
      for (const s2 of [-1, 1]) { const j = G(tool, 0, s2 * 0.08, 0.26); M(deform(rbox(0.12, 0.06, 0.6, 0.02), v => { const k = (v.z + 0.3) / 0.6; v.y += s2 * (Math.sin(k * PI) * 0.12 - k * k * 0.15); }, 'cxJaw' + s2), dk, j, 0, 0, 0.28); M(blade(0.1, 0.04, 0.04), steel, j, 0, -s2 * 0.08, 0.58, s2 > 0 ? PI : 0); jaws.push({ j, s2 }); }
    }
    const pA = G(mount, 0, -0.2, 0.1), pB = G(boom, 0, -0.17, 0.55);
    e.pistons.push(new Piston(e.root, pA, pB, 0.06, 0.035, Flat(0x2b2f33, 0.4, 0.6), steel));
    const qA = G(boom, 0, 0.17, 0.4), qB = G(stick, 0, 0.14, 0.25);
    e.pistons.push(new Piston(e.root, qA, qB, 0.05, 0.03, Flat(0x2b2f33, 0.4, 0.6), steel));
    arms.push({ boom, stick, tool, spin, jaws, sx }); e.sparkNodes.push(stick, tool);
  }
  e.sparkNodes.push(head, fuel);
  e._buildSparks(); e.sparkScale = 2.5;
  const st = { s: 0, saw: 0, bspin: 0 }, tmp = new THREE.Vector4(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler();
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const moving = a === 'walk' || a === 'run', atk = a === 'attack', alert = a === 'alert';
    const v = moving ? S.speed : 0;
    st.s += v * dt * (1 - dkk);
    tracks.forEach(inst => { for (let i = 0; i < NC; i++) { trackPos(st.s + i * TL / NC, tmp); pos.set(0, tmp.y, tmp.x); eul.set(Math.atan2(tmp.z, tmp.w), 0, 0); q.setFromEuler(eul); m4.compose(pos, q, one); inst.setMatrixAt(i, m4); } inst.instanceMatrix.needsUpdate = true; });
    wheels.forEach(w => { w.w.rotation.x = -st.s / w.r; });
    // engine rumble + sway
    const rumble = (1 - dkk) * (0.004 + (moving ? 0.006 : 0));
    upper.position.y = 0.06 + Math.sin(t * 47) * rumble + (stun ? n1(t * 20, 1) * 0.02 * stun : 0);
    e.j(upper, 'z', moving ? Math.sin(t * 2.6) * 0.012 : 0 + dkk * 0.06 + stun * n1(t * 9, 2) * 0.05);
    e.j(upper, 'x', (atk ? 0.04 : 0) + dkk * 0.08);
    e.j(turn, 'y', clamp(S.aimYaw * 0.5, -0.6, 0.6) * (1 - dkk) + stun * n1(t * 7, 3) * 0.2);
    e.j(headYaw, 'y', clamp(S.aimYaw * 0.5 + (a === 'idle' ? Math.sin(t * 0.5) * 0.6 : 0), -1.2, 1.2) * (1 - dkk));
    e.j(head, 'x', clamp(-S.aimPitch, -0.5, 0.5) + dkk * 0.4 + (alert ? -0.1 : 0));
    // beacon: rotating amber, red & fast when hunting
    st.bspin += dt * (alert || atk || moving ? 9 : 5) * (1 - dkk);
    refl.rotation.y = st.bspin;
    const hunt = S.alert > 0.5;
    beaconMat.color.set(hunt ? 0xff2a10 : 0xffaa22).multiplyScalar(2.6 * (1 - dkk) * (stun ? (n1(t * 30, 4) > 0 ? 1 : 0.1) : 1));
    flaps.forEach((f, i) => { f.rotation.x = -(0.15 + Math.max(0, Math.sin(t * 13 + i * 2)) * (moving || atk ? 0.6 : 0.25)) * (1 - dkk); });
    // arms
    st.saw += dt * (atk ? 40 : alert ? 25 : 8) * (1 - dkk);
    arms.forEach((A, i) => {
      let bx = -0.35, sx = 1.0, tx = 0.3, by = 0, open = 0.2;
      if (a === 'idle') { bx = -0.3 + Math.sin(t * 0.7 + i * 2) * 0.05; sx = 1.05 + Math.sin(t * 0.9 + i) * 0.05; }
      if (moving) { bx = -0.25; sx = 1.2; }
      if (alert) { bx = -0.85; sx = 0.6; tx = -0.2; open = 0.6; }
      if (atk) {
        const k = fract(S.t / 1.8 + i * 0.5);
        const up = sstep(0, 0.4, k) * (1 - sstep(0.5, 0.6, k)), down = sstep(0.5, 0.6, k) * (1 - sstep(0.85, 1, k));
        bx = -0.3 - up * 0.9 + down * 0.7; sx = 1.0 - up * 0.6 + down * 0.1; tx = 0.3 - up * 0.4; by = (i ? -1 : 1) * 0.15 * up;
        open = A.jaws.length ? (up > 0.5 ? 0.6 : 0.05) : 0;
      }
      if (stun) { bx += stun * n1(t * 13, i + 3) * 0.2; sx += stun * n1(t * 11, i + 5) * 0.2; }
      if (dead) { bx = lerp(bx, 0.35, dkk); sx = lerp(sx, 0.7, dkk); tx = lerp(tx, 0.4, dkk); open = lerp(open, 0.3, dkk); }
      e.j(A.boom, 'x', bx); e.j(A.boom, 'y', by); e.j(A.stick, 'x', sx); e.j(A.tool, 'x', tx);
      if (A.spin) A.spin.rotation.y = st.saw;
      A.jaws.forEach(J => e.j(J.j, 'x', -J.s2 * open));
    });
  };
}

/* ================================================================ 7. MEDIC */
function patch(r, h, arc, rs = 16) { return cached(`pa${r}|${h}|${arc}`, () => new THREE.CylinderGeometry(r, r, h, rs, 1, true, -arc / 2, arc)); }
function crossTex() {
  return canvasTex('cross', 256, 256, (g) => {
    g.fillStyle = '#c8161c'; g.fillRect(88, 28, 80, 200); g.fillRect(28, 88, 200, 80);
    g.globalCompositeOperation = 'destination-out';
    const R = rnd(77);
    for (let i = 0; i < 40; i++) { g.globalAlpha = 0.4 + R() * 0.6; g.lineWidth = 2 + R() * 12; g.lineCap = 'round'; g.beginPath(); const x = R() * 256, y = R() * 256; g.moveTo(x, y); g.lineTo(x + 40 + R() * 140, y + (R() - 0.5) * 50); g.stroke(); }
    g.globalAlpha = 1; g.beginPath(); g.ellipse(190, 170, 70, 45, 0.4, 0, TAU); g.fill();
  });
}
function buildMedic(e) {
  e.height = 1.8; e.radius = 0.45;
  const sh = e.kit.shell('medic'), dk = e.kit.shell('dark'), steel = Mat('steel'), rub = Mat('rubber'), metal = Mat('metal');
  const blk = Flat(0x0e0f11, 0.4, 0.4), glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeee8, roughness: 0.05, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false });
  const fluid = e.kit.glow(0x58ff70, 1.8);
  // wheeled base
  const base = G(e.root);
  M(lathe([[0.0, 0.05], [0.3, 0.05], [0.33, 0.1], [0.32, 0.2], [0.27, 0.32], [0.2, 0.36], [0, 0.36]], 40), sh, base);
  M(tor(0.315, 0.03, 10, 48), rub, base, 0, 0.1, 0, PI / 2);
  M(tor(0.3, 0.008, 6, 48), e.kit.infMat, base, 0, 0.045, 0, PI / 2);
  const casters = [];
  for (let c = 0; c < 3; c++) { const cg = G(base, Math.sin(c * TAU / 3) * 0.2, 0.05, Math.cos(c * TAU / 3) * 0.2); const w = G(cg); M(cyl(0.045, 0.045, 0.03, 16), rub, w, 0, 0, 0, 0, 0, PI / 2); casters.push(w); }
  // body (sways on the base)
  const body = G(base, 0, 0.34, 0);
  M(lathe([[0.0, 0.0], [0.22, 0.0], [0.26, 0.08], [0.27, 0.28], [0.25, 0.48], [0.22, 0.62], [0.235, 0.78], [0.22, 0.9], [0.15, 0.98], [0.06, 1.0], [0, 1.0]], 40), sh, body, 0, 0, 0, 0, 0, 0, [1, 1, 0.82]);
  M(tor(0.225, 0.01, 6, 48), e.kit.infMat, body, 0, 0.62, 0, PI / 2, 0, 0, [1, 0.82, 1]);
  M(tor(0.262, 0.012, 6, 48), blk, body, 0, 0.3, 0, PI / 2, 0, 0, [1, 0.82, 1]);
  noShadow(M(patch(0.244, 0.2, 0.8), decalMat(crossTex()), body, 0, 0.73, 0, 0, 0, 0, [1, 1, 0.82]));
  label(body, labelTex('medic', ['ASCLEPIA CARE SYSTEMS', 'WARD ASSISTANT MK II  SN 0457-W'], { fg: '#2a2d30', w: 512, h: 96 }), 0.24, 0.045, 0.0, 0.42, 0.226, 0, 0, 0);
  glyph(e, body, 0.12, -0.14, 0.2, 0.2, 0, -0.6, 0);
  // the chemical tank on the back (weak point) + IV pole
  const tank = G(body, 0, 0.62, -0.25);
  M(cyl(0.11, 0.11, 0.44, 28, true), glass, tank);
  const fl = M(cyl(0.095, 0.095, 1, 24), fluid, tank, 0, -0.2, 0); fl.geometry = cyl(0.095, 0.095, 1, 24);
  for (const y of [-0.24, 0.24]) M(cyl(0.125, 0.125, 0.05, 28), metal, tank, 0, y, 0);
  for (let c = 0; c < 4; c++) M(cyl(0.008, 0.008, 0.44, 6), steel, tank, Math.cos(c * TAU / 4 + 0.4) * 0.12, 0, Math.sin(c * TAU / 4 + 0.4) * 0.12);
  const bubbles = [];
  for (let b = 0; b < 6; b++) { const bb = M(sph(0.008 + (b % 3) * 0.004, 8, 6), Glow(0xc8ffd0, 2.5), tank, 0, 0, 0); bubbles.push(bb); }
  label(tank, labelTex('tankl', ['BIOHAZARD', 'SEDATIVE COMPOUND 9'], { fg: '#111', stripes: true, bg: '#e8e4d8', w: 256, h: 96 }), 0.12, 0.05, 0, 0.05, -0.112, 0, PI, 0);
  e.weak('tank', 'Chemical tank', tank, 0.2);
  const pole = G(body, 0.12, 0.9, -0.24);
  M(cyl(0.008, 0.008, 0.62, 8), steel, pole, 0, 0.31, 0);
  M(tor(0.03, 0.004, 4, 12, PI), steel, pole, 0.03, 0.62, 0, 0, 0, 0);
  const bag = G(pole, 0.06, 0.58, 0);
  M(deform(rbox(0.08, 0.13, 0.025, 0.012), v => { v.z *= 1 + 0.6 * (0.5 - Math.abs(v.y) / 0.13); }, 'ivbag'), glass, bag, 0, -0.08, 0);
  M(rbox(0.06, 0.08, 0.015, 0.006, 1), e.kit.glow(0x58ff70, 1.2), bag, 0, -0.1, 0);
  // hoses from the tank to the shoulders
  M(tube([[0, 0.24, 0.05], [0.12, 0.34, 0.1], [0.24, 0.32, 0.22], [0.27, 0.32, 0.27]], 0.009, 16, 6), Flat(0x7ad08a, 0.3, 0, 0x206a30, 0.6), tank);
  M(tube([[0, 0.24, 0.05], [-0.14, 0.32, 0.1], [-0.26, 0.3, 0.22], [-0.27, 0.3, 0.27]], 0.009, 16, 6), Flat(0x7ad08a, 0.3, 0, 0x206a30, 0.6), tank);
  // four thin arms
  const arms = [];
  const tool = (wr, kind) => {
    if (kind === 'syringe' || kind === 'syringe2') {
      const s = kind === 'syringe' ? 1 : 0.75;
      M(cyl(0.022 * s, 0.022 * s, 0.16 * s, 16, true), glass, wr, 0, -0.1 * s, 0);
      M(cyl(0.017 * s, 0.017 * s, 0.1 * s, 12), fluid, wr, 0, -0.12 * s, 0);
      M(cyl(0.03 * s, 0.03 * s, 0.012, 12), steel, wr, 0, -0.02, 0);
      M(cyl(0.004, 0.001, 0.12 * s, 6), Flat(0xd8dde0, 0.15, 1), wr, 0, -0.24 * s, 0);
    } else if (kind === 'scalpel') {
      M(rbox(0.016, 0.1, 0.01, 0.004, 1), steel, wr, 0, -0.05, 0);
      M(blade(0.09, 0.022, 0.003, 0), Flat(0xd8dde0, 0.12, 1), wr, 0, -0.1, 0, PI);
    } else {
      for (let f = 0; f < 3; f++) { const fg = G(wr, 0, -0.03, 0, 0, f * TAU / 3, 0); const p = G(fg, 0, 0, 0.012, 0.4); M(rbox(0.01, 0.07, 0.008, 0.003, 1), steel, p, 0, -0.035, 0); }
    }
  };
  [[0.25, 0.86, 'syringe'], [-0.25, 0.86, 'scalpel'], [0.25, 0.45, 'syringe2'], [-0.25, 0.45, 'grip']].forEach(([x, y, kind], i) => {
    const sho = G(body, x, y, 0.02);
    M(sph(0.04, 14, 10), metal, sho);
    M(cap(0.028, 0.24, 4, 10), sh, sho, 0, -0.16, 0);
    M(cyl(0.008, 0.008, 0.3, 6), steel, sho, 0.015 * Math.sign(x), -0.16, -0.02);
    const el = G(sho, 0, -0.32, 0);
    M(sph(0.026, 12, 8), metal, el);
    M(cyl(0.012, 0.009, 0.3, 8), steel, el, 0, -0.15, 0);
    M(cap(0.018, 0.12, 4, 8), sh, el, 0, -0.1, 0);
    const wr = G(el, 0, -0.31, 0);
    M(sph(0.016, 10, 8), metal, wr);
    tool(wr, kind);
    arms.push({ sho, el, wr, sx: Math.sign(x), lower: i >= 2, kind }); e.sparkNodes.push(el);
  });
  // neck + tablet face
  const neck = G(body, 0, 0.98, 0.02);
  M(cyl(0.012, 0.012, 0.14, 8), steel, neck, -0.03, 0.07, 0); M(cyl(0.012, 0.012, 0.14, 8), steel, neck, 0.03, 0.07, 0);
  M(bellows(0.035, 0.03, 0.1, 4, 12), rub, neck, 0, 0.06, 0);
  const head = G(neck, 0, 0.14, 0);
  M(rbox(0.38, 0.28, 0.07, 0.05), sh, head, 0, 0.14, 0);
  M(rbox(0.33, 0.23, 0.02, 0.025), Flat(0x050607, 0.1, 0.3), head, 0, 0.14, 0.031);
  const fc = document.createElement('canvas'); fc.width = 256; fc.height = 176;
  const ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshBasicMaterial({ map: ftex, toneMapped: false, color: 0xffffff });
  const face = M(plane(0.31, 0.21), faceMat, head, 0, 0.14, 0.0425);
  e.owned.push(faceMat, ftex);
  for (const sx of [-1, 1]) M(cyl(0.012, 0.012, 0.03, 8), metal, head, sx * 0.2, 0.14, 0, 0, 0, PI / 2);
  e.eyes.push(face);
  const drawFace = (t, mode) => {
    const g = fc.getContext('2d'), W = fc.width, H = fc.height;
    g.fillStyle = '#020303'; g.fillRect(0, 0, W, H);
    if (mode === 'off') { if (e.deadK < 0.7) { for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(200,220,210,${Math.random() * 0.4})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 2); } } return; }
    const c = e.eyeColor, col = `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`;
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.shadowColor = col; g.shadowBlur = 10;
    const grin = mode === 'grin' ? 1 : 0;
    // eyes: happy arcs that sometimes go wrong
    g.lineWidth = 9;
    const wrong = n1(t * 0.9, 3) > 0.55;
    for (const sx of [-1, 1]) {
      g.beginPath();
      if (wrong && sx > 0) { g.arc(W / 2 + sx * 52, 62, 16, 0, TAU); g.stroke(); g.beginPath(); g.arc(W / 2 + sx * 52, 62, 4, 0, TAU); g.fill(); }
      else { g.arc(W / 2 + sx * 52, 70, 22, PI * 1.15, PI * 1.85); g.stroke(); }
    }
    // the smile: too wide, with teeth
    g.lineWidth = 7; g.beginPath(); const sw = 70 + grin * 22; g.arc(W / 2, 92 - grin * 10, sw, PI * 0.18, PI * 0.82); g.stroke();
    g.lineWidth = 3; for (let k = -4; k <= 4; k++) { const an = PI / 2 + k * 0.11; const x = W / 2 + Math.cos(an) * sw, y = 92 - grin * 10 + Math.sin(an) * sw; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 12 - grin * 6); g.stroke(); }
    g.shadowBlur = 0;
    g.font = 'bold 13px monospace'; g.fillText(n1(t * 0.5, 9) > 0.3 ? 'H0W ARE WE FEEL1NG T0DAY?' : 'HOW ARE WE FEELING TODAY?', 26, 164);
    // corruption: slice shifts, scanlines, colour split
    const R = rnd((t * 13) | 0);
    const sl = mode === 'grin' ? 9 : 4;
    for (let i = 0; i < sl; i++) { const y = R() * H | 0, h = 2 + R() * 14 | 0, dx = (R() - 0.5) * (mode === 'grin' ? 70 : 30); g.drawImage(fc, 0, y, W, h, dx, y, W, h); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    if (R() < 0.3) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,0,40,0.18)'; g.fillRect(0, R() * H, W, 10 + R() * 30); g.globalCompositeOperation = 'source-over'; }
    ftex.needsUpdate = true;
  };
  e.sparkNodes.push(head, tank, body);
  e._buildSparks();
  const st = { faceT: -1, roll: 0, mode: '' };
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const moving = a === 'walk' || a === 'run', atk = a === 'attack', alert = a === 'alert';
    st.roll += (moving ? S.speed : 0) * dt / 0.045 * (1 - dkk);
    casters.forEach(w => { w.rotation.x = st.roll; });
    // body glides: leans into motion, floats a little
    let lean = moving ? Math.min(0.15, S.speed * 0.03) : 0, sway = Math.sin(t * 0.9) * 0.025;
    if (atk) lean = 0.18; if (alert) lean = -0.05;
    if (stun) { lean += stun * n1(t * 11, 1) * 0.12; sway += stun * n1(t * 13, 2) * 0.15; }
    lean = lerp(lean, 0.55, dkk);
    e.j(body, 'x', lean); e.j(body, 'z', sway * (1 - dkk) + dkk * 0.12);
    e.p(body, 'y', 0.34 + Math.sin(t * 1.7) * 0.006 - dkk * 0.04);
    // head: tilts, sweet and wrong
    let hz = Math.sin(t * 0.5) * 0.22, hy = S.aimYaw * 0.6, hx = -S.aimPitch * 0.5;
    if (atk) { hz = 0.55; } if (alert) { hz = n1(t * 3, 4) > 0 ? -0.45 : 0.35; }
    if (stun) { hz += stun * n1(t * 20, 5) * 0.6; hx += stun * n1(t * 17, 6) * 0.4; }
    hz = lerp(hz, 0.3, dkk); hx = lerp(hx, 0.85, dkk); hy *= 1 - dkk;
    e.j(head, 'z', hz); e.j(head, 'y', clamp(hy, -1, 1)); e.j(head, 'x', hx);
    // face screen
    const mode = dead > 0.15 ? 'off' : atk || alert ? 'grin' : 'smile';
    if (t - st.faceT > (stun ? 0.05 : 0.12) || mode !== st.mode) { st.faceT = t; st.mode = mode; drawFace(t, mode); }
    faceMat.color.setScalar(mode === 'off' ? 0.6 : (stun ? (n1(t * 30, 2) > 0 ? 1.6 : 0.3) : 1.5) * Math.max(0.3, e.eyeLevel));
    // tank fluid sloshes, bubbles rise
    const lvl = 0.32 + Math.sin(t * 1.3) * 0.01;
    fl.scale.y = lvl; fl.position.y = -0.21 + lvl / 2; fl.rotation.z = (moving ? Math.sin(t * 3) * 0.04 : 0) + sway * 0.4;
    bubbles.forEach((b, i) => { const k = fract(t * (0.3 + i * 0.07) + i * 0.37); b.position.set(Math.sin(i * 2.1) * 0.05, -0.2 + k * lvl, Math.cos(i * 1.7) * 0.05); b.visible = dead < 0.5; });
    // arms: slow undulation, spread when alert, injection when attacking
    arms.forEach((A, i) => {
      const ph = t * 0.8 + i * 1.3;
      let sx = -0.35 + Math.sin(ph) * 0.12, sz = A.sx * (0.35 + Math.sin(ph * 0.7) * 0.08), ex = -0.9 + Math.sin(ph + 1) * 0.15, wx = -0.2, sy = 0;
      if (A.lower) { sx = -0.6 + Math.sin(ph) * 0.1; sz = A.sx * 0.5; ex = -0.7; }
      if (moving) { sx -= 0.0; sz += A.sx * 0.1; }
      if (alert) { sx = -0.9 - (A.lower ? 0 : 0.4); sz = A.sx * 0.75; ex = -0.5; wx = -0.4; }
      if (atk) {
        if (A.kind === 'syringe') { const k = fract(S.t / 0.9); const jab = k < 0.45 ? -0.3 * sstep(0, 0.45, k) : Math.max(0, 1 - (k - 0.45) * 4) * 1.0; sx = -1.1 - jab * 0.5; sz = 0.15; ex = -0.9 + jab * 0.95; wx = -0.6 + jab * 0.4; sy = -0.3; }
        else { sx = -1.0 + n1(t * 4, i) * 0.15; sz = A.sx * 0.55; ex = -0.8 + n1(t * 5, i + 2) * 0.3; wx = -0.4; }
      }
      if (stun) { sx += stun * n1(t * 16, i + 1) * 0.6; ex += stun * n1(t * 19, i + 4) * 0.6; }
      if (dead) { sx = lerp(sx, 0.05, dkk); sz = lerp(sz, A.sx * 0.15, dkk); ex = lerp(ex, -0.1, dkk); wx = lerp(wx, 0, dkk); }
      e.j(A.sho, 'x', sx); e.j(A.sho, 'z', sz); e.j(A.sho, 'y', sy); e.j(A.el, 'x', ex); e.j(A.wr, 'x', wx);
    });
  };
}

/* ================================================================ 8. DOG */
function buildDog(e) {
  e.height = 1.0; e.radius = 0.55;
  const sh = e.kit.shell('grey'), dk = e.kit.shell('dark'), steel = Mat('steel'), rub = Mat('rubber'), metal = Mat('metal');
  const blk = Flat(0x0e0f11, 0.45, 0.4), haz = Mat('hazard');
  const torso = G(e.root, 0, 0.8, 0);
  // chest, waist, hips
  M(deform(rbox(0.3, 0.3, 0.44, 0.1, 3), v => { if (v.y < 0) v.z *= 1 + v.y * 0.6; v.x *= 1 + v.y * 0.25; }, 'dogChest'), sh, torso, 0, -0.01, 0.24);
  M(rbox(0.16, 0.14, 0.3, 0.04), blk, torso, 0, -0.02, -0.06);
  M(cyl(0.025, 0.025, 0.34, 10), steel, torso, 0, 0.04, -0.06, PI / 2);
  M(deform(rbox(0.26, 0.22, 0.32, 0.08, 3), v => { v.x *= 1 + v.y * 0.3; }, 'dogHips'), sh, torso, 0, 0.02, -0.33);
  for (let p = 0; p < 6; p++) M(deform(rbox(0.22 - Math.abs(p - 2.5) * 0.015, 0.04, 0.14, 0.02), v => { v.y -= v.x * v.x * 1.5; }, 'dogPlate' + p), dk, torso, 0, 0.13 + (p > 1 && p < 4 ? -0.02 : 0), 0.33 - p * 0.13, -0.08);
  M(rbox(0.04, 0.05, 0.3, 0.01, 1), haz, torso, 0.13, 0.05, 0.25);
  label(torso, labelTex('dog', ['K9-SEC CANID', 'PERIMETER UNIT  SN 9-2210'], { fg: '#1a1a1a', w: 512, h: 96 }), 0.22, 0.04, 0.152, -0.02, 0.24, 0, PI / 2, 0);
  glyph(e, torso, 0.12, -0.152, 0.0, 0.25, 0, -PI / 2, 0);
  M(tube([[0.06, -0.05, 0.1], [0.08, -0.1, -0.05], [0.07, -0.06, -0.2]], 0.012, 10, 6), rub, torso);
  M(tube([[-0.06, -0.05, 0.1], [-0.08, -0.11, -0.05], [-0.07, -0.06, -0.2]], 0.012, 10, 6), Flat(0x4a1a12, 0.5), torso);
  // legs
  const legs = [];
  const mk = (sx, front) => {
    const at = new THREE.Vector3(sx * 0.13, -0.06, front ? 0.3 : -0.36);
    const L = front ? new Leg(torso, at, 0.32, 0.34, -1, { c: 0.1, cAng: 0.25 }) : new Leg(torso, at, 0.32, 0.34, 1, { c: 0.2, cAng: 0.15 });
    M(sph(0.065, 14, 10), metal, L.hip);
    M(tbox(0.11, 0.3, 0.14, 0.04, 0.7, 0.75), sh, L.hip, 0, -0.14, 0);
    M(sph(0.045, 12, 10), metal, L.knee);
    M(tbox(0.07, 0.32, 0.08, 0.025, 0.65, 0.7), front ? dk : sh, L.knee, 0, -0.16, 0);
    M(cyl(0.012, 0.012, 0.3, 8), steel, L.knee, 0, -0.16, front ? 0.04 : -0.045);
    M(sph(0.03, 10, 8), metal, L.ankle);
    M(cyl(0.022, 0.018, L.c, 10), steel, L.ankle, 0, -L.c / 2, 0);
    const paw = G(L.toe);
    M(rbox(0.075, 0.035, 0.1, 0.015), rub, paw, 0, -0.005, 0.02);
    for (let c = -1; c <= 1; c++) M(blade(0.035, 0.008, 0.01), steel, paw, c * 0.022, -0.01, 0.07, PI / 2 - 0.3);
    if (!front) { const a1 = G(L.hip, 0, -0.06, -0.06), b1 = G(L.knee, 0, -0.2, -0.04); e.pistons.push(new Piston(e.root, a1, b1, 0.016, 0.009, Flat(0x2b2f33, 0.4, 0.6), steel)); }
    legs.push({ L, sx, front }); e.sparkNodes.push(L.knee);
  };
  mk(1, true); mk(-1, true); mk(1, false); mk(-1, false);
  // neck + sensor snout
  const neck = G(torso, 0, 0.08, 0.44, -0.6);
  M(bellows(0.06, 0.05, 0.2, 5, 14), rub, neck, 0, 0.1, 0);
  M(cyl(0.015, 0.015, 0.22, 8), steel, neck, 0, 0.1, -0.05);
  const head = G(neck, 0, 0.2, 0.0, 0.6);
  M(deform(rbox(0.16, 0.14, 0.4, 0.05, 3), v => { const k = v.z / 0.4 + 0.5; v.x *= lerp(1.05, 0.6, k); v.y *= lerp(1.0, 0.6, k); v.y += k * 0.01; }, 'dogSnout'), sh, head, 0, 0.0, 0.12);
  const jaw = G(head, 0, -0.04, -0.02);
  M(deform(rbox(0.12, 0.04, 0.32, 0.015, 2), v => { const k = v.z / 0.32 + 0.5; v.x *= lerp(1, 0.55, k); }, 'dogJaw'), dk, jaw, 0, -0.015, 0.15);
  for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) M(blade(0.02, 0.006, 0.006), steel, jaw, sx * (0.045 - k * 0.006), 0.005, 0.1 + k * 0.04);
  // sensor face: dark glass with a column of lenses
  M(deform(rbox(0.1, 0.08, 0.02, 0.01, 2), v => { v.z -= v.x * v.x * 2; }, 'dogFace'), Flat(0x050607, 0.05, 0.6), head, 0, 0.005, 0.315);
  const eyeN = G(head, 0, 0.005, 0.33);
  [[-0.025, 0.012, 0.011], [0.025, 0.012, 0.011], [-0.03, -0.014, 0.006], [0.03, -0.014, 0.006], [0, -0.004, 0.007]].forEach(([x, y, r]) => M(circ(r, 14), e.kit.eyeMat, eyeN, x, y, 0));
  e.eyes.push(eyeN);
  const lidar = G(head, 0, 0.085, 0.02);
  M(cyl(0.05, 0.055, 0.025, 20), blk, lidar, 0, -0.012, 0);
  const spin = G(lidar, 0, 0.015, 0);
  M(cyl(0.045, 0.045, 0.03, 20), Flat(0x1c2024, 0.2, 0.7), spin);
  M(rbox(0.012, 0.016, 0.004, 0.002, 1), e.kit.eyeMat, spin, 0, 0, 0.046);
  M(cyl(0.045, 0.045, 0.004, 20), e.kit.infMat, spin, 0, 0.0, 0);
  for (const sx of [-1, 1]) M(blade(0.09, 0.025, 0.006, -0.4), dk, head, sx * 0.05, 0.05, -0.05, -1.9, 0, sx * 0.3);
  const snoutN = G(head, 0, 0, 0.2);
  e.weak('snout', 'Sensor snout', snoutN, 0.13);
  // tail antenna
  const tail = G(torso, 0, 0.06, -0.5, -0.9);
  M(cyl(0.004, 0.008, 0.3, 6), steel, tail, 0, 0.15, 0); M(sph(0.01, 8, 6), e.kit.infMat, tail, 0, 0.3, 0);
  e.sparkNodes.push(head, torso);
  e._buildSparks();
  const st = { amp: 0, gal: 0, lid: 0 };
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const walk = a === 'walk', run = a === 'run', atk = a === 'attack', alert = a === 'alert';
    const moving = walk || run ? 1 : 0;
    st.amp = damp(st.amp, moving, 6, dt); st.gal = damp(st.gal, run ? 1 : 0, 5, dt);
    const stride = run ? 1.7 : 0.62, duty = run ? 0.36 : 0.6, lift = run ? 0.16 : 0.09;
    e.phase += dt * (moving ? S.speed * duty / stride : 0);
    const ph = e.phase;
    // trot: diagonal pairs; gallop: rotary sequence
    const offs = run ? [0.45, 0.55, 0.0, 0.1] : [0, 0.5, 0.5, 0];
    let ty = 0.79 + Math.sin(t * 1.8) * 0.004, tp = 0, tr = 0, tz = 0;
    if (walk) { ty = 0.78 + Math.cos(ph * TAU * 2) * 0.012; tr = Math.sin(ph * TAU) * 0.02; }
    if (run) { ty = 0.74 + Math.sin(ph * TAU) * 0.05; tp = Math.cos(ph * TAU) * 0.1; }
    if (alert) { ty = 0.74; tp = 0.12; }
    let lunge = 0;
    if (atk) { const k = fract(S.t / 0.8); lunge = sstep(0.1, 0.35, k) * (1 - sstep(0.55, 0.9, k)); ty = 0.7 + lunge * 0.06; tp = 0.15 - lunge * 0.05; tz = -0.08 + lunge * 0.3; }
    if (stun) { ty -= stun * 0.05; tr += stun * n1(t * 15, 1) * 0.15; tp += stun * n1(t * 12, 2) * 0.1; }
    ty = lerp(ty, 0.22, dkk); tr = lerp(tr, 1.3, dkk); tp *= 1 - dkk;
    e.p(torso, 'y', ty); e.p(torso, 'z', tz); e.j(torso, 'x', tp); e.j(torso, 'z', tr);
    // head: sniffing (alert), scanning, biting
    let nx = -0.6, hx = 0.6, hy = 0, hz = 0, jawO = 0;
    if (a === 'idle') { hy = n1(t * 0.6, 3) * 0.6; hx = 0.6 + n1(t * 0.5, 4) * 0.15; }
    if (moving) { nx = run ? -0.95 : -0.7; hx = run ? 0.95 : 0.65; }
    if (alert) { nx = 0.2; hx = 0.45 + Math.max(0, n1(t * 6, 5)) * 0.25; hy = n1(t * 4, 6) * 0.35 + Math.sin(t * 22) * 0.04; }
    if (atk) { nx = -1.0 - lunge * 0.2; hx = 0.9 + lunge * 0.1; jawO = lunge > 0.3 ? 0.5 : 0.05; }
    hy += clamp(S.aimYaw, -0.9, 0.9) * (a === 'idle' ? 0.5 : 1); hx += clamp(-S.aimPitch, -0.6, 0.6);
    if (stun) { hy += stun * n1(t * 18, 7) * 0.5; hz += stun * n1(t * 14, 8) * 0.4; }
    nx = lerp(nx, 0.3, dkk); hx = lerp(hx, 0.5, dkk); jawO = lerp(jawO, 0.25, dkk);
    e.j(neck, 'x', nx); e.j(head, 'x', hx); e.j(head, 'y', hy * (1 - dkk)); e.j(head, 'z', hz); e.j(jaw, 'x', jawO);
    st.lid += dt * (alert ? 25 : moving ? 14 : 6) * (1 - dkk); spin.rotation.y = st.lid;
    // legs
    e.root.updateMatrixWorld(true);
    legs.forEach((lg, i) => {
      const { L, sx, front } = lg;
      const g = gait(ph + offs[i], stride * st.amp, lift * st.amp, duty);
      let fx = sx * 0.15, fz = (front ? 0.36 : -0.3) + g.z + tz * (front ? 0.2 : 0), fy = 0.02 + g.y;
      if (alert && front) fz += 0.05;
      if (atk) fz += front ? 0.12 + lunge * 0.15 : -0.1;
      if (!dead) L.solve(e.toLocal(torso, fx, fy, fz), g.st ? 0 : -0.5 * st.amp, torso.rotation.x);
      else { e.j(L.hip, 'x', front ? -0.5 : 0.5); e.j(L.knee, 'x', front ? 0.3 : -0.3 + (sx > 0 ? 0.6 : 0)); e.j(L.ankle, 'x', 0.3); }
      if (stun) L.knee.rotation.x += stun * n1(t * 22, i) * 0.15;
    });
  };
}

/* ================================================================ 9. HEAVY */
function buildHeavy(e) {
  e.height = 3.0; e.radius = 1.2;
  const sh = e.kit.shell('olive'), dk = e.kit.shell('dark'), steel = Mat('steel'), rub = Mat('rubber'), metal = Mat('metal'), haz = Mat('hazard');
  sh.userData.ei = 0.6; dk.userData.ei = 0.6;
  const blk = Flat(0x0d0e10, 0.45, 0.5), gun = Flat(0x26292c, 0.35, 0.85);
  const pelvis = G(e.root, 0, 1.3, -0.5);
  M(tbox(0.8, 0.36, 0.6, 0.1, 1.1, 1), dk, pelvis);
  const legs = [];
  for (const sx of [-1, 1]) {
    const L = new Leg(pelvis, new THREE.Vector3(sx * 0.42, -0.08, 0), 0.7, 0.68, 1);
    M(sph(0.17, 18, 12), metal, L.hip);
    M(tbox(0.4, 0.62, 0.44, 0.12, 0.85, 0.85), sh, L.hip, 0, -0.33, 0);
    M(cyl(0.13, 0.13, 0.4, 20), steel, L.knee, 0, 0, 0, 0, 0, PI / 2);
    M(tbox(0.36, 0.62, 0.4, 0.1, 1.15, 1.1), sh, L.knee, 0, -0.33, -0.02);
    M(rbox(0.3, 0.16, 0.06, 0.02), haz, L.knee, 0, -0.2, 0.2);
    M(sph(0.12, 14, 10), metal, L.ankle);
    const foot = G(L.ankle);
    M(rbox(0.46, 0.18, 0.6, 0.06), dk, foot, 0, -0.06, 0.1);
    M(rbox(0.48, 0.05, 0.62, 0.02), rub, foot, 0, -0.15, 0.1);
    for (const tx of [-0.14, 0, 0.14]) M(rbox(0.12, 0.12, 0.16, 0.04), sh, foot, tx, -0.07, 0.42);
    legs.push(L); e.sparkNodes.push(L.knee);
  }
  const torso = G(pelvis, 0, 0.12, 0.05);
  M(tbox(0.9, 0.5, 0.7, 0.12, 1.2, 1.1), dk, torso, 0, 0.25, 0);
  M(bellows(0.3, 0.32, 0.35, 5, 24), rub, torso, 0, 0.3, 0);
  const chestGeo = deform(rbox(1.7, 1.05, 1.1, 0.26, 3), v => { const k = v.y / 1.05 + 0.5; v.x *= lerp(0.7, 1, k); if (v.z < 0) v.z *= lerp(0.8, 1.15, k); }, 'hvChest');
  M(chestGeo, sh, torso, 0, 0.95, 0.08);
  M(deform(rbox(1.2, 0.5, 0.8, 0.2, 3), v => { v.x *= 1 - Math.max(0, v.y) * 0.8; }, 'hvHump'), sh, torso, 0, 1.42, -0.18);
  M(rbox(1.0, 0.08, 0.06, 0.02), haz, torso, 0, 0.5, 0.63);
  label(torso, labelTex('heavy', ['TITAN SIEGE FRAME', 'CIVIL DEFENCE DIRECTORATE  T-3  SN 0019'], { fg: '#e4e1d6', w: 512, h: 96 }), 0.5, 0.09, 0.62, 1.2, 0.47, -0.2, 0.4, 0);
  glyph(e, torso, 0.32, -0.6, 1.15, 0.5, -0.15, -0.55, 0);
  // chest core behind armoured doors
  const coreN = G(torso, 0, 0.88, 0.52);
  M(cyl(0.3, 0.3, 0.12, 28), blk, coreN, 0, 0, -0.04, PI / 2);
  const coreGlow = e.kit.glow(0xff7a2a, 3.0);
  const coreMesh = M(sph(0.22, 28, 18), coreGlow, coreN, 0, 0, 0.0);
  for (let r = 0; r < 3; r++) M(tor(0.24, 0.012, 6, 32), steel, coreN, 0, 0, 0, 0, r * PI / 3, 0);
  e.weak('core', 'Chest power core', coreN, 0.28);
  const doors = [];
  for (const sx of [-1, 1]) { const d = G(torso, sx * 0.44, 0.88, 0.64); M(rbox(0.44, 0.62, 0.08, 0.03), dk, d, -sx * 0.22, 0, 0); M(rbox(0.06, 0.6, 0.1, 0.02, 1), haz, d, -sx * 0.42, 0, 0.0); M(cyl(0.035, 0.035, 0.66, 10), steel, d); doors.push({ d, sx }); }
  // back vents
  const vents = [];
  for (const x of [-0.35, 0, 0.35]) { const v = G(torso, x, 1.55, -0.45, -0.7); M(cyl(0.09, 0.11, 0.3, 16), dk, v, 0, 0.12, 0); const gm = e.kit.glow(0xff5a1a, 1.5); M(cyl(0.07, 0.07, 0.01, 14), gm, v, 0, 0.275, 0); vents.push(gm); }
  for (let f = 0; f < 6; f++) M(rbox(0.9, 0.02, 0.25, 0.008, 1), steel, torso, 0, 1.05 + f * 0.06, -0.52, -0.3);
  // sunk head with a narrow visor
  const head = G(torso, 0, 1.25, 0.6);
  M(deform(rbox(0.42, 0.34, 0.44, 0.12, 3), v => { if (v.z > 0) v.x *= 1 - v.z * 0.6; }, 'hvHead'), dk, head, 0, 0, 0.08);
  M(deform(rbox(0.34, 0.05, 0.05, 0.02, 2), v => { v.z -= v.x * v.x * 1.4; }, 'hvVisor'), e.kit.eyeMat, head, 0, 0.03, 0.31);
  M(rbox(0.46, 0.08, 0.4, 0.03), sh, head, 0, 0.17, 0.06, 0.1);
  const eyeN = G(head, 0, 0.03, 0.33); e.eyes.push(eyeN);
  // arms with cannons
  const arms = [], barrels = [];
  for (const sx of [-1, 1]) {
    const L = new Leg(torso, new THREE.Vector3(sx * 0.95, 1.12, 0.12), 1.08, 1.12, -1);
    M(deform(sph(0.38, 24, 16), v => { v.y *= 0.8; if (v.y < -0.1) v.y = -0.1; }, 'hvPaul'), sh, L.yawG, sx * 0.08, 0.12, 0);
    M(sph(0.2, 18, 12), metal, L.hip);
    M(tbox(0.36, 1.0, 0.38, 0.1, 0.8, 0.8), sh, L.hip, 0, -0.5, 0);
    M(cyl(0.16, 0.16, 0.42, 20), steel, L.knee, 0, 0, 0, 0, 0, PI / 2);
    M(tbox(0.42, 1.0, 0.44, 0.12, 1.25, 1.2), dk, L.knee, 0, -0.52, 0);
    if (sx < 0) {
      const rot = G(L.knee, sx * 0.33, -0.55, 0.0);
      M(cyl(0.13, 0.13, 0.25, 20), gun, rot, 0, 0.3, 0);
      const spinG = G(rot); barrels.push(spinG);
      for (let b = 0; b < 6; b++) M(cyl(0.035, 0.035, 1.05, 10), gun, spinG, Math.cos(b * TAU / 6) * 0.08, -0.1, Math.sin(b * TAU / 6) * 0.08);
      M(cyl(0.12, 0.12, 0.06, 20), steel, spinG, 0, -0.5, 0); M(cyl(0.12, 0.12, 0.06, 20), steel, spinG, 0, 0.2, 0);
      M(tube([[0, 0.45, 0.1], [0.15, 0.4, 0.25], [0.3, 0.3, 0.2]], 0.03, 10, 6), rub, rot);
    } else {
      const can = G(L.knee, sx * 0.34, -0.5, 0.0);
      M(cyl(0.12, 0.14, 1.1, 22), gun, can, 0, -0.1, 0);
      M(cyl(0.16, 0.16, 0.22, 22), dk, can, 0, -0.62, 0);
      for (let s = 0; s < 4; s++) M(rbox(0.06, 0.14, 0.34, 0.01, 1), steel, can, 0, -0.62, 0, 0, s * PI / 4, 0);
      M(circ(0.08, 16), e.kit.infMat, can, 0, -0.735, 0, PI / 2);
      barrels.push(null);
    }
    const fist = G(L.ankle);
    M(rbox(0.38, 0.3, 0.4, 0.08), dk, fist, 0, -0.08, 0.04);
    for (let k = 0; k < 4; k++) M(rbox(0.085, 0.12, 0.12, 0.03), metal, fist, -0.135 + k * 0.09, -0.22, 0.12);
    M(rbox(0.38, 0.05, 0.3, 0.02), rub, fist, 0, -0.27, 0.0);
    arms.push({ L, sx }); e.sparkNodes.push(L.knee, fist);
  }
  e.sparkNodes.push(head, torso);
  e._buildSparks(); e.sparkScale = 2.2;
  const st = { amp: 0, open: 0, spin: 0 };
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const walk = a === 'walk', run = a === 'run', atk = a === 'attack', alert = a === 'alert', sp = a === 'special';
    const moving = walk || run ? 1 : 0;
    st.amp = damp(st.amp, moving, 4, dt);
    const stride = run ? 2.0 : 1.0, duty = run ? 0.45 : 0.7, lift = run ? 0.3 : 0.18;
    e.phase += dt * (moving ? S.speed * duty / stride : 0);
    const ph = e.phase;
    const offs = run ? { lh: 0, rh: 0.1, la: 0.5, ra: 0.6 } : { lh: 0, la: 0.25, rh: 0.5, ra: 0.75 };
    let py = 1.24 + Math.sin(t * 1.1) * 0.012, lean = 0.78 + Math.sin(t * 1.1) * 0.02, roll = 0, yaw = 0, pz = -0.5;
    if (moving) { py = 1.22 + Math.cos(ph * TAU * 2) * 0.03; roll = Math.sin(ph * TAU) * 0.05; yaw = Math.sin(ph * TAU) * 0.08; if (run) { lean = 0.9 + Math.sin(ph * TAU) * 0.08; py = 1.18 + Math.sin(ph * TAU) * 0.06; } }
    if (alert) { lean = 0.55; py = 1.3; }
    let rise = 0, slam = 0;
    if (atk) { const k = fract(S.t / 1.7); rise = sstep(0.0, 0.4, k) * (1 - sstep(0.5, 0.6, k)); slam = sstep(0.5, 0.6, k) * (1 - sstep(0.85, 1, k)); lean = 0.78 - rise * 0.75 + slam * 0.25; py = 1.24 + rise * 0.12 - slam * 0.12; }
    if (sp) { lean = 0.42; py = 1.3; }
    if (stun) { lean += stun * n1(t * 9, 1) * 0.1; roll += stun * n1(t * 11, 2) * 0.1; }
    py = lerp(py, 0.55, dkk); lean = lerp(lean, 1.25, dkk);
    e.p(pelvis, 'y', py); e.p(pelvis, 'z', pz); e.j(pelvis, 'z', roll * 0.5); e.j(pelvis, 'y', yaw * 0.5);
    e.j(torso, 'x', lean); e.j(torso, 'z', roll * 0.5 + dkk * 0.2); e.j(torso, 'y', yaw);
    e.j(head, 'x', clamp(-lean + 0.15 - S.aimPitch, -1.2, 0.4)); e.j(head, 'y', clamp(S.aimYaw + (a === 'idle' ? Math.sin(t * 0.4) * 0.4 : 0), -1, 1) * (1 - dkk));
    // the core vents: armour opens, core and vents blaze
    st.open = damp(st.open, sp ? 1 : 0, sp ? 5 : 3, dt);
    doors.forEach(D => { D.d.rotation.y = D.sx * st.open * 1.35; });
    const heat = 1 + st.open * 1.6 + (atk ? 0.3 : 0);
    coreGlow.color.setRGB(1, 0.42 + st.open * 0.3, 0.12 + st.open * 0.2).multiplyScalar(3 * heat * (1 - dkk) * (0.85 + 0.15 * Math.sin(t * 7)));
    coreMesh.scale.setScalar(1 + st.open * 0.08 * Math.sin(t * 9));
    vents.forEach((v, i) => v.color.setRGB(1, 0.35, 0.1).multiplyScalar((1.5 + st.open * 3 + Math.sin(t * 5 + i) * 0.3) * (1 - dkk)));
    st.spin += dt * (atk || alert ? 25 : 1.5) * (1 - dkk);
    barrels.forEach(b => b && (b.rotation.y = st.spin));
    // limbs
    e.root.updateMatrixWorld(true);
    legs.forEach((L, i) => {
      const g = gait(ph + (i ? offs.rh : offs.lh), stride * st.amp, lift * st.amp, duty);
      let fz = g.z - 0.35, fy = 0.21 + g.y, fx = (i ? 1 : -1) * 0.48;
      if (dead) { fz = lerp(fz, -1.0, dkk); fy = lerp(fy, 0.25, dkk); }
      L.solve(e.toLocal(pelvis, fx, fy, fz), 0, pelvis.rotation.x);
    });
    arms.forEach((A, i) => {
      const g = gait(ph + (i ? offs.ra : offs.la), stride * st.amp, lift * st.amp, duty);
      let fz = 0.75 + g.z, fy = 0.3 + g.y, fx = A.sx * 1.08;
      if (alert) { fz = 0.85; fx = A.sx * 1.2; }
      if (sp) { fz = 0.9; fx = A.sx * 1.35; }
      if (dead) { fz = lerp(fz, 1.5, dkk); fx = lerp(fx, A.sx * 1.4, dkk); }
      A.L.solve(e.toLocal(torso, fx, fy, fz), 0, torso.rotation.x);
      // attack: arms leave the ground, rise overhead and slam
      if (atk) {
        const w = Math.max(rise, slam);
        A.L.hip.rotation.x = lerp(A.L.hip.rotation.x, -2.4 + slam * 1.6, w);
        A.L.knee.rotation.x = lerp(A.L.knee.rotation.x, -0.9 + slam * 0.5, w);
        A.L.yawG.rotation.y = A.sx * -0.15 * rise;
      } else A.L.yawG.rotation.y = 0;
      if (stun) { A.L.hip.rotation.x += stun * n1(t * 14, i + 3) * 0.2; A.L.knee.rotation.x += stun * n1(t * 17, i + 5) * 0.2; }
    });
  };
}

/* ================================================================ 10. UNKNOWN */
function buildUnknown(e) {
  e.height = 2.5; e.radius = 0.9; e.hoverHeight = 1.6;
  const obs = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, flatShading: true });
  const obsSmooth = new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.08, metalness: 0.6, clearcoat: 1, envMapIntensity: 2 });
  const pale = e.kit.glow(0xdfeaff, 3.2), paleDim = e.kit.glow(0xb8c8ff, 1.4);
  const hover = G(e.root, 0, 1.6, 0);
  // the heart: a pale light inside a cage of thin arcs
  const heart = G(hover);
  const heartMesh = M(sph(0.11, 32, 24), pale, heart);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = noShadow(M(sph(0.17, 24, 16), haloMat, heart));
  const halo2Mat = haloMat.clone(); halo2Mat.opacity = 0.1;
  const halo2 = noShadow(M(sph(0.26, 24, 16), halo2Mat, heart));
  for (let k = 0; k < 5; k++) M(tor(0.15, 0.003, 4, 48, PI * 1.3), paleDim, heart, 0, 0, 0, k * 0.7, k * 1.3, k * 0.4);
  e.eyes.push(heart);
  e.weak('heart', 'Pale heart', heart, 0.16);
  // interlocking rings
  const rings = [];
  [[0.34, 0.018], [0.46, 0.024], [0.6, 0.02], [0.76, 0.028]].forEach(([R, r], i) => {
    const gim = G(hover);
    const ring = G(gim);
    M(tor(R, r, 8, 96), obsSmooth, ring);
    M(tor(R, r * 0.35, 4, 96), paleDim, ring, 0, 0, r * 0.9);
    // engraved segments: glowing marks in an alien script
    const Rn = rnd(i * 17 + 5);
    for (let s = 0; s < 10 + i * 3; s++) { const an = Rn() * TAU, len = 0.02 + Rn() * 0.08; const m = M(rbox(len, r * 0.6, r * 0.3, r * 0.1, 1), pale, ring, Math.cos(an) * R, Math.sin(an) * R, -r * 0.9); m.rotation.z = an + PI / 2; }
    for (let s = 0; s < 3; s++) { const an = s * TAU / 3 + i; M(blade(0.07 + i * 0.02, 0.018, 0.008), obs, ring, Math.cos(an) * R, Math.sin(an) * R, 0, 0, 0, an - PI / 2); }
    rings.push({ gim, ring, i, ax: new THREE.Vector3(Rn() - 0.5, Rn() - 0.5, Rn() - 0.5).normalize(), sp: 0.25 + i * 0.12 });
  });
  // the shard swarm
  const shards = [], Rr = rnd(333);
  const shardGeo = cached('octa', () => new THREE.OctahedronGeometry(1, 0));
  for (let i = 0; i < 28; i++) {
    const s = G(hover);
    const L = 0.08 + Rr() * 0.22;
    M(shardGeo, obs, s, 0, 0, 0, 0, 0, 0, [0.022 + Rr() * 0.03, L, 0.02 + Rr() * 0.025]);
    if (i % 3 === 0) M(rbox(0.004, L * 1.2, 0.004, 0.001, 1), pale, s);
    shards.push({ s, r: 0.55 + Rr() * 0.55, inc: (Rr() - 0.5) * 2.2, node: Rr() * TAU, sp: (0.3 + Rr() * 0.5) * (Rr() < 0.3 ? -1 : 1), ph: Rr() * TAU, wob: Rr(), L, ground: new THREE.Vector3((Rr() - 0.5) * 1.8, 0, (Rr() - 0.5) * 1.8), spin: Rr() * TAU });
  }
  // threads of light from the heart to a few shards
  const threadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8d8ff).multiplyScalar(1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  e.owned.push(obs, obsSmooth, haloMat, halo2Mat, threadMat);
  const threads = [0, 4, 9, 15, 21].map(i => ({ m: noShadow(M(cyl(0.0025, 0.0025, 1, 4, true), threadMat, hover)), sh: shards[i] }));
  e.sparkNodes.push(heart, ...rings.map(r => r.ring));
  e._buildSparks();
  const st = { form: 0, burst: 0, spread: 0, tilt: 0 }, q = new THREE.Quaternion(), qa = new THREE.Quaternion(), up = new THREE.Vector3();
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const moving = a === 'walk' || a === 'run', atk = a === 'attack', alert = a === 'alert', sp = a === 'special';
    st.form = damp(st.form, alert || atk ? 1 : 0, 5, dt);
    st.spread = damp(st.spread, sp ? 1 : 0, 3, dt);
    const fall = sstep(0, 0.7, dead);
    hover.position.y = lerp(1.6 + Math.sin(t * 0.9) * 0.06, 0.35, fall);
    st.tilt = damp(st.tilt, moving ? Math.min(0.35, S.speed * 0.06) : 0, 3, dt);
    hover.rotation.x = st.tilt + stun * n1(t * 13, 1) * 0.15; hover.rotation.z = stun * n1(t * 11, 2) * 0.15;
    hover.rotation.y = clamp(S.aimYaw, -PI, PI) * st.form;
    // heart pulse (a slow double beat)
    const beat = Math.pow(Math.max(0, Math.sin(t * 2.4)), 12) + 0.6 * Math.pow(Math.max(0, Math.sin(t * 2.4 - 0.5)), 12);
    const life = 1 - sstep(0, 1, dead);
    pale.color.setRGB(0.87, 0.92, 1).multiplyScalar((2.6 + beat * 2.5 + st.spread * 2) * life * (stun ? (n1(t * 25, 3) > 0 ? 1 : 0.2) : 1) + 0.05);
    heartMesh.scale.setScalar(1 + beat * 0.12 + st.spread * 0.2);
    haloMat.color.copy(e.eyeColor).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(e.eyeLevel * (1 + beat));
    halo2Mat.color.copy(e.eyeColor).multiplyScalar(e.eyeLevel * 0.8);
    halo.scale.setScalar(1 + beat * 0.3); halo2.scale.setScalar(1 + st.spread * 0.6 + beat * 0.2);
    // rings: each tumbles on its own axis; when hunting they snap into an aligned lens facing forward
    rings.forEach(R => {
      qa.setFromAxisAngle(R.ax, t * R.sp * (1 + stun * 3) * (1 - dkk)); R.ring.quaternion.copy(qa);
      q.setFromAxisAngle(up.set(0, 0, 1), t * 0.5 * (R.i % 2 ? 1 : -1));
      R.ring.quaternion.slerp(q, st.form);
      const sc = 1 + st.spread * (0.35 + R.i * 0.1);
      R.ring.scale.setScalar(sc);
      if (dead) { R.ring.quaternion.slerp(q.setFromAxisAngle(up.set(1, 0, 0), PI / 2 + R.i * 0.06), dkk); R.gim.position.y = lerp(0, -0.33 + R.i * 0.03, fall); }
    });
    // shards: orbit; form a spearhead when alert; burst forward when attacking; drop when dead
    const atkK = atk ? fract(S.t / 1.3) : 0;
    shards.forEach((s, i) => {
      const w = t * s.sp * (1 + (moving ? 0.6 : 0)) * (1 - dkk) + s.ph;
      const ci = Math.cos(s.inc), si = Math.sin(s.inc);
      let x = Math.cos(w) * s.r * (1 + st.spread * 0.4), z = Math.sin(w) * s.r * (1 + st.spread * 0.4), y = 0;
      const y2 = z * si; z = z * ci; y = y2 + Math.sin(t * 0.7 + s.wob * 6) * 0.05;
      const cn = Math.cos(s.node), sn = Math.sin(s.node); [x, z] = [x * cn - z * sn, x * sn + z * cn];
      // formation: a cone pointing forward
      const k = i / shards.length, ring = 0.12 + k * 0.5, fa = i * 2.39996;
      const fx = Math.cos(fa) * ring, fy = Math.sin(fa) * ring, fz = 0.3 + (1 - k) * 0.9;
      x = lerp(x, fx, st.form); y = lerp(y, fy, st.form); z = lerp(z, fz, st.form);
      if (atk) { const d = sat((atkK - k * 0.3) * 3); const out = Math.sin(d * PI); z += out * (2.5 + k); x *= 1 - out * 0.7; y *= 1 - out * 0.7; }
      if (stun) { x += stun * n1(t * 20, i) * 0.06; y += stun * n1(t * 23, i + 50) * 0.06; z += stun * n1(t * 19, i + 90) * 0.06; }
      if (dead) { const gy = -hover.position.y + 0.03 + s.L * 0.3; x = lerp(x, s.ground.x, fall); y = lerp(y, gy, fall); z = lerp(z, s.ground.z, fall); }
      s.s.position.set(x, y, z);
      // orientation: along the orbit, or pointing forward in formation
      s.s.rotation.set(lerp(w * 0.5 + s.spin, PI / 2, st.form), lerp(s.spin, 0, st.form), lerp(w, 0, st.form));
      if (dead) s.s.rotation.set(lerp(s.s.rotation.x, PI / 2, dkk), s.spin, 0);
    });
    threads.forEach(T => { const p = T.sh.s.position; between(T.m, new THREE.Vector3(0, 0, 0), p); T.m.visible = !dead && (n1(t * 3, T.sh.ph) > -0.3); });
    threadMat.opacity = 0.35 + 0.3 * beat + st.form * 0.3;
  };
}

/* ================================================================ 11. FOREMAN (boss) */
/** merge [geometry, Matrix4] parts into one geometry (one draw call) */
function merge(parts) {
  const pos = [], nor = [], uv = [];
  for (const [g, m] of parts) {
    const ng = (g.index ? g.toNonIndexed() : g.clone()); ng.applyMatrix4(m);
    pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array);
    if (ng.attributes.uv) uv.push(...ng.attributes.uv.array); else for (let i = 0; i < ng.attributes.position.count; i++) uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function beamM(a, b, t, t2 = t) { const d = b.clone().sub(a), L = d.length(); const m = new THREE.Matrix4(); m.compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()), new THREE.Vector3(t, L, t2)); return m; }
/** lattice girder hanging along -y: 4 chords + zig-zag lacing, tapering */
function truss(len, w0, w1, chord = 0.07, lace = 0.035) {
  return cached(`tr${len}|${w0}|${w1}`, () => {
    const parts = [], V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const cw = y => lerp(w0, w1, -y / len) / 2;
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (const [cx, cz] of corners) parts.push([unitBox, beamM(V3(cx * cw(0), 0, cz * cw(0)), V3(cx * cw(-len), -len, cz * cw(-len)), chord)]);
    const n = Math.max(2, Math.round(len / ((w0 + w1) / 2)));
    for (let f = 0; f < 4; f++) {
      const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
      for (let i = 0; i < n; i++) {
        const y0 = -len * i / n, y1 = -len * (i + 1) / n;
        const p0 = i % 2 ? V3(ax * cw(y0), y0, az * cw(y0)) : V3(bx * cw(y0), y0, bz * cw(y0));
        const p1 = i % 2 ? V3(bx * cw(y1), y1, bz * cw(y1)) : V3(ax * cw(y1), y1, az * cw(y1));
        parts.push([unitBox, beamM(p0, p1, lace)]);
      }
    }
    return merge(parts);
  });
}
function ledTex() {
  const t = canvasTex('leds', 256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const R = rnd(5);
    for (let y = 4; y < h; y += 8) { const rowOn = R() < 0.55; for (let x = 6; x < w; x += 10) { if (!rowOn || R() < 0.7 || (x % 64) > 40) continue; const c = R(); g.fillStyle = c < 0.55 ? '#3cff7a' : c < 0.8 ? '#ffb030' : '#ff3020'; g.fillRect(x, y, 4, 2); } }
    g.fillStyle = '#000'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
  }, { repeat: true });
  return t;
}
function rackTex() {
  return canvasTex('rack', 256, 256, (g, w, h) => {
    g.fillStyle = '#1b1e21'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { g.fillStyle = y % 16 ? '#25292d' : '#2d3237'; g.fillRect(2, y + 1, w - 4, 6); }
    g.fillStyle = '#0c0d0f'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
  }, { repeat: true });
}
/** an industrial robot arm: base(yaw) -> shoulder(pitch) -> upper -> elbow -> fore -> wrist -> tool; links along +y */
function robotArm(e, parent, x, y, z, L1, L2, mat, kind) {
  const steel = Mat('steel'), dk = e.kit.shell('dark'), rub = Mat('rubber');
  const base = G(parent, x, y, z);
  M(cyl(0.32, 0.38, 0.22, 24), dk, base, 0, 0.11, 0);
  const sh = G(base, 0, 0.3, 0);
  M(rbox(0.5, 0.42, 0.5, 0.12), mat, sh, 0, 0.0, 0);
  M(cyl(0.2, 0.2, 0.6, 20), steel, sh, 0, 0, 0, 0, 0, PI / 2);
  M(deform(rbox(0.32, L1, 0.36, 0.1, 2), v => { const k = v.y / L1 + 0.5; v.x *= lerp(1.1, 0.8, k); v.z *= lerp(1.1, 0.8, k); }, 'raU' + L1), mat, sh, 0.0, L1 / 2, 0);
  const el = G(sh, 0, L1, 0);
  M(cyl(0.17, 0.17, 0.46, 20), steel, el, 0, 0, 0, 0, 0, PI / 2);
  M(deform(rbox(0.26, L2, 0.28, 0.08, 2), v => { const k = v.y / L2 + 0.5; v.x *= lerp(1.1, 0.65, k); v.z *= lerp(1.1, 0.65, k); }, 'raF' + L2), mat, el, 0, L2 / 2, 0);
  M(tube([[0.18, 0.1, -0.1], [0.3, L2 * 0.4, -0.2], [0.15, L2 * 0.9, -0.1]], 0.035, 12, 6), rub, el);
  const wr = G(el, 0, L2, 0);
  M(cyl(0.12, 0.12, 0.3, 16), steel, wr, 0, 0, 0, 0, 0, PI / 2);
  const tool = G(wr, 0, 0.12, 0);
  const out = { base, sh, el, wr, tool, kind, fingers: [], spin: null, arc: null };
  if (kind === 'claw') {
    M(cyl(0.16, 0.12, 0.16, 18), dk, tool, 0, 0.08, 0);
    for (let f = 0; f < 3; f++) { const fg = G(tool, 0, 0.16, 0, 0, f * TAU / 3, 0); const p = G(fg, 0, 0, 0.1); M(rbox(0.09, 0.32, 0.07, 0.03), mat, p, 0, 0.16, 0); const p2 = G(p, 0, 0.32, 0); M(blade(0.22, 0.05, 0.05, 0.3), steel, p2, 0, 0, 0, 0, 0, 0); out.fingers.push(p, p2); }
  } else if (kind === 'saw') {
    M(rbox(0.22, 0.3, 0.2, 0.05), dk, tool, 0, 0.15, 0);
    out.spin = G(tool, 0.16, 0.5, 0, 0, 0, PI / 2);
    M(cyl(0.55, 0.55, 0.014, 64), Flat(0xb6bcc0, 0.22, 1), out.spin);
    M(cyl(0.1, 0.1, 0.06, 20), steel, out.spin);
    for (let s = 0; s < 36; s++) M(blade(0.045, 0.024, 0.01), Flat(0x9aa0a4, 0.3, 1), out.spin, Math.cos(s * TAU / 36) * 0.55, 0, Math.sin(s * TAU / 36) * 0.55, 0, -s * TAU / 36 + PI / 2, -PI / 2);
    M(tor(0.58, 0.05, 8, 40, PI * 0.8), mat, tool, 0.16, 0.5, 0, 0, PI / 2, -PI * 0.4);
  } else {
    // welder: torch with a blinding arc
    M(cyl(0.1, 0.13, 0.3, 16), dk, tool, 0, 0.15, 0);
    M(cyl(0.035, 0.06, 0.4, 12), Flat(0x8a6a3a, 0.3, 0.9), tool, 0, 0.5, 0);
    M(tor(0.07, 0.015, 6, 16), steel, tool, 0, 0.32, 0, PI / 2);
    out.arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); e.owned.push(out.arcMat);
    out.arc = M(sph(0.035, 10, 8), out.arcMat, tool, 0, 0.72, 0);
    out.arcHalo = noShadow(M(sph(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fb8ff).multiplyScalar(0.8), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), tool, 0, 0.72, 0));
    M(tube([[0, 0.2, -0.12], [-0.2, -0.3, -0.3], [-0.1, -1.0, -0.2]], 0.025, 12, 6), rub, tool);
  }
  e.sparkNodes.push(el, tool);
  return out;
}
function buildForeman(e) {
  e.height = 6.2; e.radius = 2.8;
  const sh = e.kit.shell('foreman'), dk = e.kit.shell('dark'), arm = e.kit.shell('orange'), steel = Mat('steel'), rub = Mat('rubber'), metal = Mat('metal'), haz = Mat('hazard');
  const yelMetal = Mat('metalYellow'), blk = Flat(0x0d0e10, 0.45, 0.5);
  const B = 2.6;
  const base = G(e.root, 0, B, 0);
  // gantry frame
  const frame = merge([
    [unitBox, new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 1.25), new THREE.Quaternion(), new THREE.Vector3(3.4, 0.4, 0.3))],
    [unitBox, new THREE.Matrix4().compose(new THREE.Vector3(0, 0, -1.25), new THREE.Quaternion(), new THREE.Vector3(3.4, 0.4, 0.3))],
    [unitBox, new THREE.Matrix4().compose(new THREE.Vector3(1.55, 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.4, 2.8))],
    [unitBox, new THREE.Matrix4().compose(new THREE.Vector3(-1.55, 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.4, 2.8))],
    [unitBox, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.69, 0)), new THREE.Vector3(0.2, 0.3, 4.2))],
    [unitBox, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.69, 0)), new THREE.Vector3(0.2, 0.3, 4.2))],
  ]);
  M(frame, yelMetal, base);
  for (const z of [-1.42, 1.42]) M(rbox(3.0, 0.12, 0.04, 0.01, 1), haz, base, 0, 0.0, z);
  M(cyl(1.15, 1.25, 0.3, 32), metal, base, 0, 0.3, 0);
  label(base, labelTex('fm1', ['OMNIFAB FOUNDRY 4', 'LINE CONTROLLER "FOREMAN"  SN 000-001'], { fg: '#111', stripes: true, bg: '#d8d2c2', w: 512, h: 128 }), 1.2, 0.3, 0, -0.05, 1.42, 0, 0, 0);
  // four gantry legs
  const legs = [], corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  corners.forEach(([cx, cz], i) => {
    const hp = new THREE.Vector3(cx * 1.55, -0.1, cz * 1.25);
    const L = new Leg(base, hp, 2.0, 2.75, 1, { free: true, yaw: Math.atan2(cx, cz) });
    M(cyl(0.26, 0.26, 0.5, 20), steel, L.hip, 0, 0, 0, 0, 0, PI / 2);
    M(truss(2.0, 0.5, 0.42), yelMetal, L.hip);
    M(cyl(0.22, 0.22, 0.6, 20), metal, L.knee, 0, 0, 0, 0, 0, PI / 2);
    M(rbox(0.5, 0.5, 0.5, 0.08), dk, L.knee);
    M(truss(2.6, 0.44, 0.26), yelMetal, L.knee);
    M(cyl(0.06, 0.06, 2.4, 10), steel, L.knee, 0, -1.3, 0.0);
    const foot = G(L.ankle);
    M(cyl(0.38, 0.45, 0.16, 24), dk, foot, 0, -0.06, 0);
    M(cyl(0.12, 0.15, 0.25, 14), steel, foot, 0, 0.1, 0);
    const a1 = G(base, cx * 1.2, 0.25, cz * 0.9), b1 = G(L.hip, 0, -1.1, 0.25);
    e.pistons.push(new Piston(e.root, a1, b1, 0.1, 0.06, Flat(0x2b2f33, 0.4, 0.6), steel));
    legs.push({ L, cx, cz, i }); e.sparkNodes.push(L.knee);
  });
  // server-core torso
  const torso = G(base, 0, 0.45, 0);
  const rackMat = new THREE.MeshStandardMaterial({ map: rackTex(), emissiveMap: ledTex().clone(), emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.5 });
  e.owned.push(rackMat, rackMat.emissiveMap);
  rackMat.emissiveMap.needsUpdate = true; rackMat.emissiveMap.repeat.set(2, 2); rackMat.map.repeat.set(2, 2);
  M(cyl(1.08, 1.12, 2.4, 8), rackMat, torso, 0, 1.2, 0, 0, PI / 8, 0);
  for (let k = 0; k < 8; k++) { const an = k * PI / 4; M(rbox(0.1, 2.5, 0.12, 0.02, 1), sh, torso, Math.sin(an) * 1.1, 1.2, Math.cos(an) * 1.1, 0, an, 0); }
  M(cyl(1.2, 1.2, 0.18, 8), sh, torso, 0, 2.45, 0, 0, PI / 8, 0); M(cyl(1.2, 1.25, 0.18, 8), sh, torso, 0, 0.05, 0, 0, PI / 8, 0);
  M(cyl(0.9, 1.15, 0.35, 8), dk, torso, 0, 2.7, 0, 0, PI / 8, 0);
  glyph(e, torso, 0.9, 0, 2.0, 1.115, -0.05);
  // the core behind shutters
  const coreN = G(torso, 0, 1.0, 1.08);
  M(cyl(0.5, 0.55, 0.16, 28), blk, coreN, 0, 0, -0.06, PI / 2);
  M(tor(0.44, 0.06, 10, 40), dk, coreN, 0, 0, 0.0);
  const coreGlow = e.kit.glow(0xffe0c0, 3.5);
  const coreMesh = M(sph(0.3, 32, 24), coreGlow, coreN, 0, 0, 0.02);
  M(sph(0.12, 16, 12), Glow(0xfff2e0, 4), coreN, 0, 0, 0.25);  for (let r = 0; r < 3; r++) M(tor(0.34, 0.016, 8, 40), steel, coreN, 0, 0, 0.02, 0, r * PI / 3, r * 0.4);
  for (const sx of [-1, 1]) M(rbox(0.08, 1.2, 0.42, 0.02, 1), sh, torso, sx * 0.66, 1.0, 1.2);
  M(rbox(1.4, 0.1, 0.42, 0.02, 1), sh, torso, 0, 1.6, 1.2); M(rbox(1.4, 0.1, 0.42, 0.02, 1), sh, torso, 0, 0.4, 1.2);
  e.weak('core', 'Server core', coreN, 0.42);
  const shutters = [];
  for (const sx of [-1, 1]) { const d = G(torso, sx * 0.62, 1.0, 1.42); M(rbox(0.62, 1.15, 0.12, 0.04), dk, d, -sx * 0.31, 0, 0); for (let r = 0; r < 4; r++) M(rbox(0.5, 0.04, 0.03, 0.01, 1), steel, d, -sx * 0.31, -0.42 + r * 0.28, 0.065); M(rbox(0.08, 1.1, 0.14, 0.02, 1), haz, d, -sx * 0.6, 0, 0); M(cyl(0.05, 0.05, 1.2, 12), steel, d); shutters.push({ d, sx }); }
  // cooling radiators (not weak points)
  const fins = [];
  [[-0.75, 1.15, -0.55, 0.35, 1.2], [0, 1.6, -0.7, 0, 1.5], [0.75, 1.15, -0.55, -0.35, 1.2]].forEach(([x, hgt, z, rz, w], i) => {
    const f = G(torso, x, 2.7, z, -0.3, 0, rz);
    M(rbox(0.12, hgt, 0.9, 0.03, 1), dk, f, -w * 0.0, hgt / 2, 0);
    const finMat = e.kit.glow(0xff4a18, 1.0);
    for (let k = 0; k < 9; k++) { M(rbox(0.5, hgt * 0.9, 0.02, 0.006, 1), steel, f, 0, hgt * 0.5, -0.4 + k * 0.1); M(rbox(0.5, 0.03, 0.022, 0.006, 1), finMat, f, 0, hgt * 0.95, -0.4 + k * 0.1); }
    e.nodes['cooling_' + (i + 1)] = f; fins.push({ f, finMat });
  });
  // camera eye cluster
  const neck = G(torso, 0, 2.85, 0.55);
  M(cyl(0.18, 0.25, 0.3, 16), dk, neck, 0, 0.1, 0);
  const head = G(neck, 0, 0.35, 0.1);
  M(deform(rbox(0.9, 0.55, 0.55, 0.16, 3), v => { if (v.z > 0) v.y *= 1 - v.z * 0.5; }, 'fmHead'), sh, head);
  const lenses = [];
  [[0, 0.02, 0.13], [-0.25, 0.1, 0.08], [0.25, 0.08, 0.09], [-0.2, -0.12, 0.06], [0.2, -0.13, 0.055], [0.0, -0.17, 0.045], [-0.36, -0.06, 0.04], [0.37, -0.04, 0.035]].forEach(([x, y, r]) => {
    const l = G(head, x, y, 0.27);
    M(cyl(r * 1.3, r * 1.4, 0.12, 20), blk, l, 0, 0, 0.0, PI / 2);
    const barrel = G(l); M(cyl(r * 1.1, r * 1.15, 0.1, 20), metal, barrel, 0, 0, 0.06, PI / 2); M(circ(r, 20), e.kit.eyeMat, barrel, 0, 0, 0.112); M(circ(r * 0.35, 12), Glow(0xffffff, 2), barrel, 0, 0, 0.113);
    lenses.push(barrel);
  });
  e.eyes.push(head);
  // robot arms: claw (left), saw (right), welder (overhead)
  const arms = [
    robotArm(e, torso, -1.2, 1.9, 0.35, 1.5, 1.4, arm, 'claw'),
    robotArm(e, torso, 1.2, 1.9, 0.35, 1.5, 1.4, arm, 'saw'),
    robotArm(e, torso, 0, 2.75, -0.35, 1.3, 1.5, arm, 'welder'),
  ];
  arms[0].base.rotation.z = 0.5; arms[1].base.rotation.z = -0.5;
  // trailing cables (still plugged into the factory)
  const cab = [
    [[-0.5, 0.3, -1.0], [-0.8, -0.8, -1.8], [-1.1, -2.2, -3.0], [-1.6, -2.55, -4.2]],
    [[0.0, 0.5, -1.05], [0.1, -1.0, -2.2], [0.3, -2.5, -3.4], [0.6, -2.56, -4.8]],
    [[0.5, 0.2, -1.0], [0.9, -1.2, -1.7], [1.4, -2.45, -2.6], [2.1, -2.55, -3.6]],
    [[-1.0, 0.6, -0.6], [-1.6, -0.6, -1.0], [-2.0, -1.8, -1.2], [-2.3, -2.5, -1.8]],
    [[0.9, 0.9, -0.7], [1.2, 0.2, -1.2], [1.3, -0.4, -1.3], [1.2, -0.6, -1.25]],
  ];
  cab.forEach((p, i) => M(tube(p, i === 4 ? 0.04 : 0.07, 28, 8), i % 2 ? rub : Flat(0x2a2016, 0.6, 0.2), torso));
  M(sph(0.06, 8, 6), e.kit.infMat, torso, 1.2, -0.62, -1.25);
  e.sparkNodes.push(head, coreN, torso);
  e._buildSparks(); e.sparkScale = 4;
  const st = { amp: 0, open: 0, led: 0 };
  e._anim = (dt, S) => {
    const t = e.time, a = S.anim, dead = e.deadK, stun = e.stunK, dkk = sstep(0, 1, dead);
    const moving = a === 'walk' || a === 'run', atk = a === 'attack', alert = a === 'alert', sp = a === 'special';
    st.amp = damp(st.amp, moving ? 1 : 0, 3, dt);
    const stride = a === 'run' ? 2.4 : 1.6, duty = 0.62, lift = 0.4;
    e.phase += dt * (moving ? S.speed * duty / stride : 0);
    const ph = e.phase;
    let by = B + Math.sin(t * 0.8) * 0.02, bp = 0, br = 0, ty = 0;
    if (moving) { by = B - 0.05 + Math.cos(ph * TAU * 2) * 0.06; br = Math.sin(ph * TAU) * 0.025; bp = Math.cos(ph * TAU) * 0.02; }
    if (sp) by = B - 0.45;
    if (alert) by = B + 0.1;
    if (stun) { by -= stun * 0.15; br += stun * n1(t * 8, 1) * 0.05; bp += stun * n1(t * 7, 2) * 0.05; }
    by = lerp(by, 1.0, dkk); bp = lerp(bp, 0.18, dkk); br = lerp(br, -0.1, dkk);
    e.p(base, 'y', by); e.j(base, 'x', bp); e.j(base, 'z', br);
    ty = clamp(S.aimYaw * 0.6, -0.8, 0.8) + (a === 'idle' ? Math.sin(t * 0.25) * 0.25 : 0);
    e.j(torso, 'y', ty * (1 - dkk)); e.j(torso, 'x', dkk * 0.25);
    e.j(neck, 'y', clamp(S.aimYaw - ty, -0.9, 0.9) * (1 - dkk)); e.j(head, 'x', clamp(-S.aimPitch + 0.15, -0.6, 0.6) + dkk * 0.5);
    // camera lenses focus in and out
    lenses.forEach((l, i) => { l.position.z = (alert || atk ? 0.06 : 0.0) + Math.max(0, n1(t * 0.8, i)) * 0.05; });
    // core shutters
    st.open = damp(st.open, sp ? 1 : 0, sp ? 4 : 2.5, dt);
    shutters.forEach(D => { D.d.rotation.y = D.sx * st.open * 1.45; });
    coreGlow.color.setRGB(1, 0.5 - st.open * 0.12, 0.22 - st.open * 0.1).multiplyScalar((1.8 + st.open * 0.9 + Math.sin(t * 6) * 0.25) * (1 - dkk));
    coreMesh.scale.setScalar(1 + st.open * 0.06 * Math.sin(t * 10));
    fins.forEach((F, i) => F.finMat.color.setRGB(1, 0.3, 0.08).multiplyScalar((1 + st.open * 2.5 + (atk ? 0.6 : 0) + 0.3 * Math.sin(t * 2 + i)) * (1 - dkk)));
    st.led += dt; rackMat.emissiveMap.offset.y = Math.floor(st.led * 6) * 0.03125 * (1 - dkk); rackMat.emissiveIntensity = 1.6 * (1 - dkk) * (stun ? (n1(t * 30, 3) > 0 ? 1 : 0.1) : 1);
    // legs
    e.root.updateMatrixWorld(true);
    legs.forEach(lg => {
      const { L, cx, cz } = lg;
      const grp = (cx * cz > 0) ? 0 : 0.5;
      const g = gait(ph + grp, stride * st.amp, lift * st.amp, duty);
      let fx = cx * 2.6, fz = cz * 2.2 + g.z, fy = 0.14 + g.y;
      if (sp || dead) { fx *= 1 + 0.15 * (sp ? 1 : dkk); fz *= 1 + 0.15 * (sp ? 1 : dkk); }
      L.solve(e.toLocal(base, fx, fy, fz));
      if (stun) L.knee.rotation.x += stun * n1(t * 15, lg.i) * 0.05;
    });
    // arms: idle palps, raised when alert, staggered strikes, flung wide when exposed
    arms.forEach((A, i) => {
      let yaw = [-0.5, 0.5, 0][i], sh = [0.7, 0.7, 1.1][i], el = [1.3, 1.3, 1.2][i], wr = [0.6, 0.6, 0.9][i], grip = 0.3;
      const pal = t * 0.6 + i * 2.1;
      sh += Math.sin(pal) * 0.08; el += Math.sin(pal * 1.3) * 0.1; yaw += Math.sin(pal * 0.7) * 0.15;
      if (moving) { sh += Math.sin(ph * TAU + i) * 0.06; }
      if (alert) { sh = [0.2, 0.2, 0.5][i]; el = [1.2, 1.2, 1.0][i]; wr = 0.3; grip = 0.7; yaw = [-0.2, 0.2, 0][i]; }
      if (atk) {
        const k = fract(S.t / 2.4 + i / 3);
        const wind = sstep(0, 0.35, k) * (1 - sstep(0.45, 0.5, k)), hit = sstep(0.45, 0.55, k) * (1 - sstep(0.75, 1, k));
        sh = lerp(0.6, -0.3, wind) + hit * 1.3; el = lerp(1.3, 1.6, wind) - hit * 0.9; wr = 0.5 - hit * 0.3; yaw = [-0.35, 0.35, 0][i] * (1 - hit); grip = i === 0 ? (hit > 0.5 ? 0.05 : 0.8) : grip;
      }
      if (sp) { sh = 0.1; el = 0.6; yaw = [-1.0, 1.0, 0][i]; wr = -0.2; grip = 0.8; if (i === 2) { sh = -0.6; el = 0.9; } }
      if (stun) { sh += stun * n1(t * 9, i) * 0.3; el += stun * n1(t * 11, i + 3) * 0.3; }
      if (dead) { sh = lerp(sh, 1.9, dkk); el = lerp(el, 0.4, dkk); wr = lerp(wr, 0.4, dkk); }
      e.j(A.base, 'y', yaw); e.j(A.sh, 'x', sh); e.j(A.el, 'x', el); e.j(A.wr, 'x', wr);
      A.fingers.forEach((f, k) => e.j(f, 'x', k % 2 ? -grip * 0.8 : grip));
      if (A.spin) A.spin.rotation.y += dt * (atk ? 35 : alert ? 20 : 6) * (1 - dkk);
      if (A.arc) { const fl = (n1(t * 40, 7) > -0.2 ? 1 : 0) * (1 - dkk) * (atk || alert || sp ? 1 : 0.6); A.arcMat.color.setRGB(0.8, 0.9, 1).multiplyScalar(8 * fl); A.arcHalo.visible = fl > 0; A.arcHalo.scale.setScalar(0.7 + Math.random() * 0.6); }
    });
  };
}

// @@BUILDERS

/* ================================================================ exports */
const BUILDERS = { scout: buildScout, hunter: buildHunter, sentinel: buildSentinel, crawler: buildCrawler, stalker: buildStalker, construction: buildConstruction, medic: buildMedic, dog: buildDog, heavy: buildHeavy, unknown: buildUnknown, foreman: buildForeman };
export const ENEMY_TYPES = ['scout', 'hunter', 'sentinel', 'crawler', 'stalker', 'construction', 'medic', 'dog', 'heavy', 'unknown', 'foreman'];
export function makeEnemy(type) {
  const e = new EnemyModel(type);
  const b = BUILDERS[type];
  if (!b) throw new Error('unknown enemy type ' + type);
  b(e);
  e.root.userData.enemy = e;
  e.update(0, { anim: 'idle', t: 0 });
  return e;
}
/** build the shared textures/geometry for these types up front (loading screen), so the first spawn doesn't hitch */
export function warmEnemyArt(types = ENEMY_TYPES) { for (const t of types) makeEnemy(t).dispose(); }
export const LINEUP =ENEMY_TYPES.filter(t => BUILDERS[t]).map(t => ({ name: t, make: () => { const e = makeEnemy(t); e.root.userData.update = (dt, s) => e.update(dt, s); return e.root; } }));
