/* Textures.js - every surface in the city is painted here, in code.

   Each set is three tileable canvases: colour (albedo), roughness and a
   normal map derived from a height field. Wet asphalt keeps mirror-smooth
   puddles in its roughness map so the neon can reflect in them; plaster
   peels, concrete stains under drips, painted metal chips down to rust.

   Mat(name) returns a cached MeshStandardMaterial. Materials are shared, so
   never change one in place - clone it first. */
import * as THREE from '../../lib/three.module.js';

const cache = new Map();
const texCache = new Map();
let anisotropy = 4;
export function setAnisotropy(a) { anisotropy = a; }

/* ---------------- tileable noise ---------------- */
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** periodic value noise: period p cells */
function vnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % p) + p) % p;
  const a = hash2(m(xi), m(yi), s), b = hash2(m(xi + 1), m(yi), s), c = hash2(m(xi), m(yi + 1), s), d = hash2(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** fbm in 0..1 over a unit tile (u,v in 0..1) with base frequency f */
function fbm(u, v, f, oct = 4, s = 1) {
  let t = 0, amp = 0.5, norm = 0, fr = f;
  for (let i = 0; i < oct; i++) { t += vnoise(u * fr, v * fr, fr, s + i * 17) * amp; norm += amp; amp *= 0.5; fr *= 2; }
  return t / norm;
}
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------------- painting harness ---------------- */
/** paint(N) returns {col: Float32Array rgb, rough: Float32Array, h: Float32Array, emi?: Float32Array rgb} */
function makeSet(N, paint) {
  const col = new Float32Array(N * N * 3), rough = new Float32Array(N * N), h = new Float32Array(N * N);
  const out = { col, rough, h, emi: null, N };
  paint(out);
  const canvasOf = (fill) => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N); fill(img.data); g.putImageData(img, 0, 0); return c; };
  const cC = canvasOf(d => { for (let i = 0; i < N * N; i++) { d[i * 4] = clamp255(col[i * 3]); d[i * 4 + 1] = clamp255(col[i * 3 + 1]); d[i * 4 + 2] = clamp255(col[i * 3 + 2]); d[i * 4 + 3] = 255; } });
  const cR = canvasOf(d => { for (let i = 0; i < N * N; i++) { const r = clamp255(rough[i]); d[i * 4] = 0; d[i * 4 + 1] = r; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; } });
  const cN = canvasOf(d => {
    const st = out.normalStrength ?? 2.2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)], u = h[((y - 1 + N) % N) * N + x], dn = h[((y + 1) % N) * N + x];
      let nx = (l - r) * st, ny = (dn - u) * st, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
      const i = (y * N + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  const set = { map: T(cC, true), roughnessMap: T(cR), normalMap: T(cN) };
  if (out.emi) { const cE = canvasOf(d => { for (let i = 0; i < N * N; i++) { d[i * 4] = clamp255(out.emi[i * 3]); d[i * 4 + 1] = clamp255(out.emi[i * 3 + 1]); d[i * 4 + 2] = clamp255(out.emi[i * 3 + 2]); d[i * 4 + 3] = 255; } }); set.emissiveMap = T(cE, true); }
  return set;
}
const clamp255 = v => (v < 0 ? 0 : v > 1 ? 255 : v * 255) | 0;
const mix = (a, b, t) => a + (b - a) * t;
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hex(c) { const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

/* ---------------- the surfaces ---------------- */
const PAINTERS = {
  concrete(o, opt = {}) {
    const { N, col, rough, h } = o; const base = hex(opt.color || '#8a8a86'); const R = rnd(7);
    const cracks = []; for (let i = 0; i < 5; i++) cracks.push({ x: R(), y: R(), a: R() * 6.28, l: 0.15 + R() * 0.3 });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const n1 = fbm(u, v, 4, 5, 3), n2 = fbm(u, v, 32, 3, 9), stain = sstep(0.55, 0.8, fbm(u, v * 0.5, 3, 4, 21) + (1 - v) * 0.08);
      const pores = hash2(x, y, 5) > 0.985 ? 1 : 0;
      let k = 0.82 + n1 * 0.3 + (n2 - 0.5) * 0.12 - stain * 0.28 - pores * 0.25;
      // drips running down
      const dr = fbm(u * 1, v * 0.06, 16, 2, 44); k -= sstep(0.62, 0.75, dr) * 0.12;
      col[i * 3] = base[0] * k; col[i * 3 + 1] = base[1] * k; col[i * 3 + 2] = base[2] * k * 0.98;
      rough[i] = 0.82 + n2 * 0.15 - stain * 0.25;
      h[i] = n1 * 0.6 + n2 * 0.4 - pores * 0.5;
    }
    o.normalStrength = 3;
  },
  asphalt(o) {
    const { N, col, rough, h } = o;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const g = hash2(x, y, 3), n = fbm(u, v, 6, 5, 11), pud = fbm(u, v, 3, 4, 77);
      const puddle = sstep(0.56, 0.6, pud);
      const k = 0.11 + n * 0.08 + (g > 0.9 ? 0.06 : 0) - puddle * 0.04;
      col[i * 3] = k; col[i * 3 + 1] = k * 1.02; col[i * 3 + 2] = k * 1.08;
      rough[i] = mix(0.55 + g * 0.3, 0.04, puddle);
      h[i] = mix(n * 0.5 + g * 0.5, 0.2, puddle);
    }
    o.normalStrength = 1.6;
  },
  pavers(o) {
    const { N, col, rough, h } = o; const C = 8;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const row = Math.floor(v * C), off = row % 2 ? 0.5 / C : 0, cu = (u + off) * C, cv = v * C;
      const fu = cu - Math.floor(cu), fv = cv - Math.floor(cv), edge = Math.min(fu, 1 - fu, fv * 2, (1 - fv) * 2);
      const groove = sstep(0.02, 0.06, edge); const tint = hash2(Math.floor(cu) % C, row, 9) * 0.12;
      const n = fbm(u, v, 16, 3, 5), pud = sstep(0.58, 0.63, fbm(u, v, 2, 4, 31));
      const k = (0.36 + tint + n * 0.12) * mix(0.35, 1, groove) - pud * 0.05;
      col[i * 3] = k; col[i * 3 + 1] = k * 0.99; col[i * 3 + 2] = k * 0.96;
      rough[i] = mix(mix(0.9, 0.7, groove), 0.06, pud * groove);
      h[i] = groove * 0.8 + n * 0.2;
    }
  },
  plaster(o, opt = {}) {
    const { N, col, rough, h } = o; const base = hex(opt.color || '#b9b4a8');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const n = fbm(u, v, 8, 4, 2), peel = sstep(0.72, 0.735, fbm(u, v, 6, 5, 55)), damp = sstep(0.4, 1, (v) * fbm(u, v, 2, 3, 91) * 1.6);
      const k = (0.86 + n * 0.14) * (1 - damp * 0.3);
      const pc = hex('#6d655a');
      for (let c = 0; c < 3; c++) col[i * 3 + c] = mix(base[c] * k, pc[c] * (0.8 + n * 0.3), peel);
      rough[i] = 0.9 - damp * 0.2; h[i] = n * 0.2 + (1 - peel) * 0.5;
    }
    o.normalStrength = 2.5;
  },
  panel(o, opt = {}) {
    // pre-collapse architecture: big cladding panels with seams and bolts
    const { N, col, rough, h } = o; const base = hex(opt.color || '#d6d8d8'); const P = opt.grid || 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const pu = u * P, pv = v * P, fu = pu - Math.floor(pu), fv = pv - Math.floor(pv);
      const seam = sstep(0.004, 0.012, Math.min(fu, 1 - fu, fv, 1 - fv));
      const bolt = (Math.hypot(fu - 0.04, fv - 0.04) < 0.012 || Math.hypot(fu - 0.96, fv - 0.04) < 0.012 || Math.hypot(fu - 0.04, fv - 0.96) < 0.012 || Math.hypot(fu - 0.96, fv - 0.96) < 0.012) ? 1 : 0;
      const n = fbm(u, v, 10, 4, 4), grime = sstep(0.45, 0.85, fbm(u, v, 3, 4, 8) * 0.7 + (fv) * 0.35);
      const k = (0.92 + n * 0.1 - grime * 0.35) * mix(0.4, 1, seam);
      for (let c = 0; c < 3; c++) col[i * 3 + c] = base[c] * k * (c === 2 ? 1.0 : 0.98);
      rough[i] = 0.35 + grime * 0.45 + n * 0.1; h[i] = seam * 0.7 + bolt * 0.6 + n * 0.05;
    }
  },
  metal(o, opt = {}) {
    // painted metal with chipped paint and rust
    const { N, col, rough, h } = o; const base = hex(opt.color || '#3c4650'); const rustAmt = opt.rust ?? 0.5;
    const rc = hex('#6b3a1e'), rc2 = hex('#a05a2a');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const n = fbm(u, v, 6, 5, 13), sc = fbm(u * 6, v * 0.3, 8, 2, 4);
      const rust = sstep(1 - rustAmt * 0.55, 1 - rustAmt * 0.55 + 0.08, fbm(u, v, 4, 5, 19) + (v) * 0.1);
      const rn = fbm(u, v, 24, 3, 27);
      for (let c = 0; c < 3; c++) col[i * 3 + c] = mix(base[c] * (0.85 + n * 0.25 - (sc > 0.62 ? 0.06 : 0)), mix(rc[c], rc2[c], rn), rust);
      rough[i] = mix(0.45 + n * 0.2, 0.92, rust); h[i] = rust * (0.5 + rn * 0.5) + n * 0.1;
    }
  },
  steel(o) {
    // bare brushed steel / machine parts
    const { N, col, rough, h } = o;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const br = fbm(u * 0.05, v, 64, 2, 3), n = fbm(u, v, 5, 4, 8), sm = sstep(0.6, 0.8, fbm(u, v, 3, 4, 61));
      const k = 0.52 + br * 0.12 + n * 0.08 - sm * 0.2;
      col[i * 3] = k; col[i * 3 + 1] = k * 1.01; col[i * 3 + 2] = k * 1.04;
      rough[i] = 0.28 + br * 0.15 + sm * 0.35; h[i] = br * 0.2;
    }
    o.normalStrength = 0.8;
  },
  tiles(o, opt = {}) {
    const { N, col, rough, h } = o; const C = opt.count || 8; const base = hex(opt.color || '#dfe3e2');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const cu = u * C, cv = v * C, fu = cu - Math.floor(cu), fv = cv - Math.floor(cv);
      const grout = sstep(0.015, 0.05, Math.min(fu, 1 - fu, fv, 1 - fv));
      const n = fbm(u, v, 6, 4, 6), dirt = sstep(0.5, 0.9, fbm(u, v, 3, 4, 17)), crack = hash2(Math.floor(cu), Math.floor(cv), 2) > 0.93 && Math.abs(fu - fv * 0.7 - 0.15) < 0.01 ? 1 : 0;
      const g = hex('#5a5852'), t = hash2(Math.floor(cu), Math.floor(cv), 1) * 0.06;
      for (let c = 0; c < 3; c++) col[i * 3 + c] = mix(g[c], base[c] * (0.94 - t + n * 0.06) * (1 - dirt * 0.3) * (1 - crack * 0.5), grout);
      rough[i] = mix(0.9, 0.18 + dirt * 0.5, grout); h[i] = grout * 0.6 - crack * 0.4;
    }
  },
  wood(o, opt = {}) {
    const { N, col, rough, h } = o; const base = hex(opt.color || '#6a4a32'); const B = 6;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const plank = Math.floor(v * B), off = hash2(plank, 0, 3), fv = v * B - plank;
      const end = ((u + off) * 2) % 1;
      const grain = fbm((u + off) * 0.15, v * 4, 32, 3, plank + 5), seam = sstep(0.01, 0.04, Math.min(fv, 1 - fv)) * sstep(0.003, 0.01, Math.min(end, 1 - end));
      const k = (0.75 + grain * 0.45 + hash2(plank, 1, 9) * 0.15) * mix(0.35, 1, seam), wear = fbm(u, v, 4, 3, 99);
      for (let c = 0; c < 3; c++) col[i * 3 + c] = base[c] * k * (0.9 + wear * 0.2);
      rough[i] = 0.55 + grain * 0.2 - wear * 0.15; h[i] = seam * 0.5 + grain * 0.1;
    }
  },
  carpet(o, opt = {}) {
    const { N, col, rough, h } = o; const base = hex(opt.color || '#3d4a5a');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const f = hash2(x, y, 4), n = fbm(u, v, 6, 4, 2), st = sstep(0.6, 0.9, fbm(u, v, 3, 3, 71));
      const k = 0.75 + f * 0.25 + n * 0.15 - st * 0.35;
      for (let c = 0; c < 3; c++) col[i * 3 + c] = base[c] * k;
      rough[i] = 0.97; h[i] = f * 0.5;
    }
  },
  grate(o) {
    const { N, col, rough, h } = o; const C = 16;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const fu = (u * C) % 1, fv = (v * C) % 1, bar = Math.min(fu, 1 - fu) < 0.12 || Math.min(fv, 1 - fv) < 0.12 ? 1 : 0;
      const n = fbm(u, v, 8, 3, 1), rust = sstep(0.6, 0.75, fbm(u, v, 4, 4, 5));
      const k = bar ? 0.3 + n * 0.15 : 0.03;
      col[i * 3] = mix(k, k * 1.6, rust); col[i * 3 + 1] = mix(k, k * 0.9, rust); col[i * 3 + 2] = mix(k * 1.05, k * 0.6, rust);
      rough[i] = bar ? 0.5 + rust * 0.4 : 1; h[i] = bar;
    }
    o.normalStrength = 4;
  },
  hazard(o) {
    const { N, col, rough, h } = o; const yel = hex('#d9a521'), blk = hex('#1b1b1b');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const s = ((u + v) * 4) % 1 < 0.5 ? 1 : 0, n = fbm(u, v, 8, 4, 3), wear = sstep(0.55, 0.75, fbm(u, v, 5, 4, 8));
      for (let c = 0; c < 3; c++) col[i * 3 + c] = mix(s ? yel[c] : blk[c], 0.25, wear * 0.7) * (0.85 + n * 0.2);
      rough[i] = 0.6 + wear * 0.3; h[i] = n * 0.1;
    }
  },
  tunnel(o) {
    // segmented concrete lining with ribs and water streaks
    const { N, col, rough, h } = o;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const seg = (u * 2) % 1, rib = sstep(0.02, 0.05, Math.min(seg, 1 - seg));
      const n = fbm(u, v, 6, 5, 23), wet = sstep(0.5, 0.75, fbm(u * 3, v * 0.2, 6, 3, 31)), moss = sstep(0.75, 0.85, fbm(u, v, 4, 4, 41)) * sstep(0.6, 1, v);
      const k = (0.42 + n * 0.22) * mix(0.55, 1, rib) * (1 - wet * 0.35);
      col[i * 3] = k * (1 - moss * 0.4); col[i * 3 + 1] = k * (1 + moss * 0.15); col[i * 3 + 2] = k * 0.97 * (1 - moss * 0.3);
      rough[i] = mix(0.9, 0.25, wet); h[i] = rib * 0.5 + n * 0.4;
    }
  },
  facade(o, opt = {}) {
    // a skyscraper skin: window grid, some lit, some broken (emissive map)
    const { N, col, rough, h } = o; const C = opt.cols || 8, Rr = opt.rows || 8, lit = opt.lit ?? 0.18, warm = hex(opt.warm || '#ffcf8a'), cool = hex(opt.cool || '#9fd8ff');
    const base = hex(opt.color || '#4a5058');
    o.emi = new Float32Array(N * N * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      const cu = u * C, cv = v * Rr, fu = cu - Math.floor(cu), fv = cv - Math.floor(cv), wi = Math.floor(cu), wj = Math.floor(cv);
      const win = fu > 0.12 && fu < 0.88 && fv > 0.18 && fv < 0.82;
      const n = fbm(u, v, 8, 3, 2), r = hash2(wi, wj, opt.seed || 1), broken = hash2(wi, wj, 77) > 0.9;
      if (win) {
        const refl = 0.05 + fbm(u, v, 2, 3, 5) * 0.08;
        col[i * 3] = refl; col[i * 3 + 1] = refl * 1.1; col[i * 3 + 2] = refl * 1.3;
        rough[i] = broken ? 0.8 : 0.08; h[i] = 0.1;
        if (r < lit && !broken) { const c = hash2(wi, wj, 5) > 0.5 ? warm : cool, b = 0.5 + hash2(wi, wj, 8) * 0.5, blind = fv > 0.5 && hash2(wi, wj, 12) > 0.6 ? 0.25 : 1; for (let c2 = 0; c2 < 3; c2++) o.emi[i * 3 + c2] = c[c2] * b * blind; }
        if (broken) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.02; }
      } else {
        const k = 0.7 + n * 0.35;
        for (let c = 0; c < 3; c++) col[i * 3 + c] = base[c] * k;
        rough[i] = 0.6; h[i] = 0.6 + n * 0.1;
      }
    }
    o.normalStrength = 3;
  },
  rubber(o) {
    const { N, col, rough, h } = o;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, n = fbm(x / N, y / N, 16, 3, 3); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.06 + n * 0.04; rough[i] = 0.85; h[i] = n; }
  },
};

/** a cached texture set: name + options key */
export function texSet(kind, opt = {}, size = 512) {
  const key = kind + JSON.stringify(opt) + size;
  if (!texCache.has(key)) texCache.set(key, makeSet(size, o => PAINTERS[kind](o, opt)));
  return texCache.get(key);
}

/* ---------------- named materials ---------------- */
const DEFS = {
  concrete: () => std(texSet('concrete'), { roughness: 1 }),
  concreteDark: () => std(texSet('concrete', { color: '#5e5f5d' }), { roughness: 1 }),
  asphalt: () => std(texSet('asphalt', {}, 1024), { roughness: 1, normalScale: 0.6 }),
  pavers: () => std(texSet('pavers'), { roughness: 1 }),
  plaster: () => std(texSet('plaster'), { roughness: 1 }),
  plasterBlue: () => std(texSet('plaster', { color: '#7f93a0' }), { roughness: 1 }),
  plasterGreen: () => std(texSet('plaster', { color: '#8d9d88' }), { roughness: 1 }),
  panelWhite: () => std(texSet('panel'), { roughness: 1 }),
  panelGrey: () => std(texSet('panel', { color: '#80878c', grid: 3 }), { roughness: 1 }),
  panelDark: () => std(texSet('panel', { color: '#3a3f45', grid: 2 }), { roughness: 1, metalness: 0.3 }),
  metal: () => std(texSet('metal'), { roughness: 1, metalness: 0.55 }),
  metalYellow: () => std(texSet('metal', { color: '#b7892a', rust: 0.6 }), { roughness: 1, metalness: 0.45 }),
  metalRed: () => std(texSet('metal', { color: '#7a2a22', rust: 0.5 }), { roughness: 1, metalness: 0.45 }),
  metalBlue: () => std(texSet('metal', { color: '#2c4a72', rust: 0.35 }), { roughness: 1, metalness: 0.5 }),
  metalWhite: () => std(texSet('metal', { color: '#cfd3d4', rust: 0.25 }), { roughness: 1, metalness: 0.35 }),
  rust: () => std(texSet('metal', { color: '#5a3b28', rust: 1.3 }), { roughness: 1, metalness: 0.5 }),
  steel: () => std(texSet('steel'), { roughness: 1, metalness: 0.95 }),
  tiles: () => std(texSet('tiles'), { roughness: 1 }),
  tilesSmall: () => std(texSet('tiles', { count: 16, color: '#cdd6d4' }), { roughness: 1 }),
  tilesSubway: () => std(texSet('tiles', { count: 12, color: '#e6e1d2' }), { roughness: 1 }),
  tilesGreen: () => std(texSet('tiles', { count: 12, color: '#5f8a7c' }), { roughness: 1 }),
  wood: () => std(texSet('wood'), { roughness: 1 }),
  carpet: () => std(texSet('carpet'), { roughness: 1 }),
  carpetRed: () => std(texSet('carpet', { color: '#5a2c2c' }), { roughness: 1 }),
  grate: () => std(texSet('grate'), { roughness: 1, metalness: 0.6 }),
  hazard: () => std(texSet('hazard'), { roughness: 1 }),
  tunnel: () => std(texSet('tunnel'), { roughness: 1 }),
  rubber: () => std(texSet('rubber', {}, 128), { roughness: 1 }),
  facadeA: () => std(texSet('facade', { seed: 1, lit: 0.1, color: '#5a626c' }), { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.7 }),
  facadeB: () => std(texSet('facade', { seed: 2, cols: 6, rows: 10, color: '#454d58', lit: 0.07, cool: '#7fd2ff' }), { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.75 }),
  facadeC: () => std(texSet('facade', { seed: 3, cols: 12, rows: 12, color: '#7c766a', lit: 0.05 }), { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.7 }),
  facadeDead: () => std(texSet('facade', { seed: 4, cols: 8, rows: 8, color: '#3d3d3f', lit: 0.0 }), { roughness: 1 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x8fa6b0, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.22, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
  glassDirty: () => new THREE.MeshStandardMaterial({ color: 0x6f7c7a, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.7 }),
  plasticWhite: () => new THREE.MeshStandardMaterial({ color: 0xe6e8e8, roughness: 0.35 }),
  plasticDark: () => new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.45 }),
  fabric: () => new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.95 }),
  fabricRed: () => new THREE.MeshStandardMaterial({ color: 0x7a3a34, roughness: 0.95 }),
  trash: () => new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.25, metalness: 0.1 }),
  paper: () => new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9, side: THREE.DoubleSide }),
  water: () => new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0.85 }),
};
function std(set, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: set.map, roughnessMap: set.roughnessMap, normalMap: set.normalMap, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0 });
  if (o.normalScale) m.normalScale.set(o.normalScale, o.normalScale);
  if (set.emissiveMap) { m.emissiveMap = set.emissiveMap; m.emissive = new THREE.Color(o.emissive ?? 0xffffff); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  return m;
}
export function Mat(name) {
  if (!cache.has(name)) {
    const f = DEFS[name];
    if (!f) throw new Error('no material ' + name);
    const m = f(); m.name = name; cache.set(name, m);
  }
  return cache.get(name);
}
/** a plain coloured material, cached by its parameters */
export function Flat(color, rough = 0.6, metal = 0, emissive = 0, ei = 1) {
  const key = 'flat' + color + '|' + rough + '|' + metal + '|' + emissive + '|' + ei;
  if (!cache.has(key)) { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; } cache.set(key, m); }
  return cache.get(key);
}
/** a glowing material that ignores light (neon, screens, LEDs) - bloom picks it up */
export function Glow(color, intensity = 2) {
  const key = 'glow' + color + '|' + intensity;
  if (!cache.has(key)) { const c = new THREE.Color(color).multiplyScalar(intensity); cache.set(key, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); }
  return cache.get(key);
}
export const MAT_NAMES = Object.keys(DEFS);
