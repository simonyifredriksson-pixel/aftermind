/* GuideArt.js - GUIDE, the small salvage-repair robot that walks with you.

   Everything is generated here: smooth lathe / rounded-box shells, a painted
   PBR "worn ceramic-plastic" texture set (grime, rust blooms, drip streaks,
   chipped paint down to bare metal, scratches, soot), a face screen drawn on
   a canvas every frame, tank-tread boots with moving links, and a damaged
   variant on the same rig (torn chest, missing forearm, cracked dead visor).

   Rig (all Groups, rotations only, forward = +Z, feet at y = 0):
     root > body > pelvis > hipL/R > kneeL/R > ankleL/R (boot)
                          > spine (torso) > shL/R > elL/R > wrL/R (hand, fingers)
                                          > neck > head (visor, ears, antennas)
   Robot's LEFT is +X, RIGHT is -X. */
import * as THREE from '../../lib/three.module.js';
import { Mat, Flat, Glow } from '../core/Textures.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sat = v => clamp(v, 0, 1);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const kDamp = (rate, dt) => 1 - Math.exp(-rate * dt);

/* =====================================================================
   noise (tileable) + texture painting
   ===================================================================== */
export function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const mx = a => ((a % px) + px) % px, my = a => ((a % py) + py) % py;
  const a = hash2(mx(xi), my(yi), s), b = hash2(mx(xi + 1), my(yi), s), c = hash2(mx(xi), my(yi + 1), s), d = hash2(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(u, v, fx, fy, oct = 4, s = 1) {
  let t = 0, amp = 0.5, norm = 0, ax = fx, ay = fy;
  for (let i = 0; i < oct; i++) { t += vnoise(u * ax, v * ay, ax, ay, s + i * 17) * amp; norm += amp; amp *= 0.5; ax *= 2; ay *= 2; }
  return t / norm;
}
export const fbm = (u, v, f, oct = 4, s = 1) => fbm2(u, v, f, f, oct, s);
export function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const c255 = v => (v < 0 ? 0 : v > 1 ? 255 : v * 255) | 0;

/** build {map, rmMap, normalMap} canvases from float arrays. rm: [rough, metal] per px */
export function texFromArrays(N, col, rm, h, strength = 2) {
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N); fill(img.data); g.putImageData(img, 0, 0); return c; };
  const cC = mk(d => { for (let i = 0; i < N * N; i++) { d[i * 4] = c255(col[i * 3]); d[i * 4 + 1] = c255(col[i * 3 + 1]); d[i * 4 + 2] = c255(col[i * 3 + 2]); d[i * 4 + 3] = 255; } });
  const cR = mk(d => { for (let i = 0; i < N * N; i++) { d[i * 4] = 0; d[i * 4 + 1] = c255(rm[i * 2]); d[i * 4 + 2] = c255(rm[i * 2 + 1]); d[i * 4 + 3] = 255; } });
  const cN = mk(d => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)], u = h[((y - 1 + N) % N) * N + x], dn = h[((y + 1) % N) * N + x];
      let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1; const L = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4; d[i] = (nx / L * 0.5 + 0.5) * 255; d[i + 1] = (ny / L * 0.5 + 0.5) * 255; d[i + 2] = (nz / L * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: T(cC, true), rmMap: T(cR), normalMap: T(cN) };
}

/** worn painted shell: grime, rust blooms + drip streaks, chips to bare metal, scratches, soot */
export function paintShell(N, o) {
  const s = o.seed || 1, base = o.base, R = rnd(s * 977 + 3);
  const col = new Float32Array(N * N * 3), rm = new Float32Array(N * N * 2), h = new Float32Array(N * N), scr = new Float32Array(N * N);
  const nS = (o.scratches || 0) * (N / 512) * (N / 512);
  for (let k = 0; k < nS; k++) {
    let x = R() * N, y = R() * N, ang = R() * TAU; const len = (0.01 + R() * R() * 0.14) * N, curv = (R() - 0.5) * 0.04, dep = 0.3 + R() * 0.7;
    for (let t = 0; t < len; t += 0.5) {
      ang += curv * 0.5; x += Math.cos(ang) * 0.5; y += Math.sin(ang) * 0.5;
      const xi = ((Math.round(x) % N) + N) % N, yi = ((Math.round(y) % N) + N) % N, idx = yi * N + xi;
      const w = dep * Math.sin(Math.PI * t / len); if (w > scr[idx]) scr[idx] = w;
    }
  }
  const rust1 = [0.2, 0.09, 0.035], rust2 = [0.66, 0.32, 0.1], stain = [0.5, 0.31, 0.15], grimeC = o.grimeC || [0.36, 0.33, 0.28], chipC = o.chipC || [0.47, 0.48, 0.49], soot = [0.03, 0.027, 0.025];
  const c = [0, 0, 0];
  const mixc = (t, k) => { if (k <= 0) return; c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k; };
  const rt = lerp(0.75, 0.6, o.rust || 0), ct = 1 - (o.chip || 0) * 0.33, st = lerp(0.74, 0.56, o.soot || 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const n = fbm(u, v, 4, 4, s), fine = fbm(u, v, 32, 2, s + 3), sp = hash2(x, y, s + 11);
    const grime = sstep(0.42, 0.85, fbm(u, v, 3, 5, s + 5)) * (o.grime || 0);
    const rn = fbm(u, v, 10, 5, s + 7) * 0.8 + fbm(u, v, 3, 3, s + 23) * 0.2 + (fine - 0.5) * 0.14;
    const rust = o.rust ? sstep(rt, rt + 0.03, rn) : 0;
    const halo = o.rust ? sstep(rt - 0.1, rt, rn) * (1 - rust) : 0;
    const streak = o.rust ? sstep(0.56, 0.8, fbm2(u, v, 24, 2, 3, s + 13)) * sstep(0.48, 0.68, fbm(u, v, 3, 3, s + 17)) * o.rust : 0;
    const cn = fbm(u, v, 9, 5, s + 9) + (fine - 0.5) * 0.08;
    const chip = o.chip ? sstep(ct, ct + 0.01, cn) : 0, edge = o.chip ? sstep(ct - 0.022, ct, cn) * (1 - chip) : 0;
    const so = o.soot ? sstep(st - 0.05, st + 0.3, fbm(u, v, 5, 5, s + 19) + (fine - 0.5) * 0.25) * (0.35 + 0.65 * fbm(u, v, 16, 3, s + 29)) : 0;
    const sc = scr[i] * (1 - rust);
    const tone = 0.9 + n * 0.14 + (fine - 0.5) * 0.06 - (sp > 0.996 ? 0.25 : 0);
    c[0] = base[0] * tone; c[1] = base[1] * tone; c[2] = base[2] * tone;
    mixc(grimeC, grime * 0.5);
    mixc(stain, halo * 0.55 + streak * 0.5);
    mixc([c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], edge * 0.7);
    mixc(chipC, chip);
    mixc(o.scrC || chipC, sc * 0.75);
    const rf = clamp(fine * 1.4 - 0.2, 0, 1);
    mixc([lerp(rust1[0], rust2[0], rf), lerp(rust1[1], rust2[1], rf), lerp(rust1[2], rust2[2], rf)], rust);
    mixc(soot, sat(so * 1.15));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    let r = (o.rough ?? 0.32) + n * 0.1 + grime * 0.3;
    r = lerp(r, 0.38, chip); r = lerp(r, 0.5, sc); r = lerp(r, 0.93, rust); r = lerp(r, 0.88, so);
    let m = (o.metal ?? 0) * (1 - chip) + chip * 0.9; m = lerp(m, 0.8, sc); m = lerp(m, 0.15, rust); m *= 1 - so * 0.8;
    rm[i * 2] = r; rm[i * 2 + 1] = m;
    h[i] = n * 0.08 - chip * 0.45 - edge * 0.12 - sc * 0.3 + rust * (0.2 + fine * 0.6) + so * 0.04;
  }
  return texFromArrays(N, col, rm, h, o.ns ?? 2);
}

/* =====================================================================
   geometry helpers
   ===================================================================== */
/** smooth lathe from [r, y] control points (y ascending) */
export function lathe(pts, segs = 40, n = 32, phiStart = 0, phiLen = TAU) {
  const sp = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(n);
  for (const p of sp) p.x = Math.max(0, p.x);
  return new THREE.LatheGeometry(sp, segs, phiStart, phiLen);
}
/** lathe of raw points (no smoothing) */
export function latheRaw(pts, segs = 32) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), Math.min(segs, 34)); }
export function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
/** rounded box with properly curved edges */
export function rbox(w, h, d, r, m = 2) {
  const n = 2 * m + 1, g = new THREE.BoxGeometry(w, h, d, n, n, n);
  const P = g.attributes.position, Nn = g.attributes.normal, hs = [w / 2, h / 2, d / 2];
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const remap = (c, hh) => {
    const idx = Math.round((c + hh) / (2 * hh) * n);
    if (idx <= m) return -hh + r - r * Math.cos((idx / m) * Math.PI / 2);
    return hh - r + r * Math.cos(((n - idx) / m) * Math.PI / 2);
  };
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    p[0] = remap(P.getX(i), hs[0]); p[1] = remap(P.getY(i), hs[1]); p[2] = remap(P.getZ(i), hs[2]);
    let L = 0; for (let k = 0; k < 3; k++) { const inn = clamp(p[k], -(hs[k] - r), hs[k] - r); q[k] = p[k] - inn; L += q[k] * q[k]; }
    L = Math.sqrt(L);
    if (L > 1e-7) { for (let k = 0; k < 3; k++) { p[k] = p[k] - q[k] + q[k] / L * r; } Nn.setXYZ(i, q[0] / L, q[1] / L, q[2] / L); }
    P.setXYZ(i, p[0], p[1], p[2]);
  }
  return uvScale(g, Math.max(w, d) / 0.4, h / 0.4);
}
/** tube with optional ribs (corrugated hose) and radius taper */
export function ribTube(curve, r, segs = 48, rad = 10, ribs = 0, ribAmp = 0.18, r1 = r) {
  const fr = curve.computeFrenetFrames(segs, false), pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), Nv = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, P);
    const rr = lerp(r, r1, t) * (1 + (ribs ? ribAmp * Math.pow(Math.abs(Math.sin(t * ribs * Math.PI)), 0.6) : 0));
    for (let j = 0; j <= rad; j++) {
      const v = j / rad * TAU, cs = -Math.cos(v), sn = Math.sin(v);
      Nv.set(cs * fr.normals[i].x + sn * fr.binormals[i].x, cs * fr.normals[i].y + sn * fr.binormals[i].y, cs * fr.normals[i].z + sn * fr.binormals[i].z).normalize();
      pos.push(P.x + Nv.x * rr, P.y + Nv.y * rr, P.z + Nv.z * rr); nor.push(Nv.x, Nv.y, Nv.z); uv.push(t * 4, j / rad);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
export function merge(geos) {
  const list = geos.map(g => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    if (!list.every(g => g.attributes[name])) continue;
    const isz = list[0].attributes[name].itemSize; let n = 0; for (const g of list) n += g.attributes[name].count;
    const arr = new Float32Array(n * isz); let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, isz));
  }
  return out;
}
/** sum of sines: smooth irregular edge offset around an angle */
function jag(a, seed, amp) { const R = rnd(seed); return amp * (0.5 * Math.sin(3 * a + R() * 6) + 0.3 * Math.sin(7 * a + R() * 6) + 0.2 * Math.sin(13 * a + R() * 6) + 0.12 * Math.sin(23 * a + R() * 6)); }
/** remove (or keep) the triangles whose centroid has field < 0; add soot vertex colours near the cut */
function cutHole(geo, field, sootW = 0.03, keepInside = false) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
  const pos = [], nor = [], uv = [], col = [], v = new THREE.Vector3(), f = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); f[i] = field(v); }
  for (let t = 0; t < P.count; t += 3) {
    const fc = (f[t] + f[t + 1] + f[t + 2]) / 3;
    if ((fc < 0) !== keepInside) continue;
    for (let k = 0; k < 3; k++) {
      const i = t + k; pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); uv.push(U.getX(i), U.getY(i));
      const sd = 1 - sstep(0, sootW, Math.abs(f[i])), wob = 0.85 + hash2(i, 7, 3) * 0.15;
      col.push(lerp(1, 0.07, sd) * wob, lerp(1, 0.06, sd) * wob, lerp(1, 0.05, sd) * wob);
    }
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return o;
}
/** a grid of vertices produced by fn(u, v) -> Vector3 (u, v in 0..1) */
function gridGeo(nu, nv, fn) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i / nu, j / nv); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* =====================================================================
   materials (two sets: repaired / damaged, swapped on the same meshes)
   ===================================================================== */
const MATSETS = [null, null];
let FACE_SHARED = null;
function shellMaterial(tex, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({ map: tex.map, roughnessMap: tex.rmMap, metalnessMap: tex.rmMap, normalMap: tex.normalMap, roughness: 1, metalness: 1, clearcoat: o.cc ?? 0.25, clearcoatRoughness: 0.4 });
  m.normalScale.set(o.ns ?? 0.7, o.ns ?? 0.7);
  return m;
}
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function badgeTex(damaged) {
  return canvasTex(256, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.font = 'bold 66px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.strokeText('GUIDE', W / 2, 62);
    g.fillStyle = '#1b3a6e'; g.fillText('GUIDE', W / 2, 62);
    g.beginPath(); g.arc(W / 2, 170, 54, 0, TAU); g.fillStyle = '#2f66b3'; g.fill();
    g.lineWidth = 7; g.strokeStyle = '#8fd0ff'; g.stroke();
    g.beginPath(); g.arc(W / 2, 170, 44, 0, TAU); g.lineWidth = 2; g.strokeStyle = 'rgba(200,235,255,0.6)'; g.stroke();
    g.fillStyle = '#ffffff'; g.font = 'bold 50px Arial, Helvetica, sans-serif'; g.fillText('AI', W / 2, 172);
    // wear: scuffs knocked out of the print
    const R = rnd(damaged ? 91 : 17); g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < (damaged ? 160 : 45); i++) { g.globalAlpha = 0.3 + R() * 0.7; g.lineWidth = 0.5 + R() * 2.5; g.beginPath(); const x = R() * W, y = R() * H, a = R() * TAU, l = 4 + R() * 26; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = damaged ? 0.75 : 0.25;
    for (let i = 0; i < 30; i++) { g.fillStyle = damaged ? 'rgba(20,14,10,0.6)' : 'rgba(110,80,50,0.35)'; g.beginPath(); g.arc(R() * W, R() * H, 6 + R() * 26, 0, TAU); g.fill(); }
  });
}
function screenTex(dead) {
  return canvasTex(64, 80, (g, W, H) => {
    g.fillStyle = dead ? '#050708' : '#06343c'; g.fillRect(0, 0, W, H);
    if (dead) { g.strokeStyle = 'rgba(160,180,190,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(10, 0); g.lineTo(30, 40); g.lineTo(22, 80); g.moveTo(30, 40); g.lineTo(64, 52); g.stroke(); return; }
    for (let i = 0; i < 4; i++) { g.fillStyle = '#8ff6ff'; g.fillRect(9, 10 + i * 17, W - 18, 8); g.fillStyle = 'rgba(160,255,255,0.35)'; g.fillRect(6, 8 + i * 17, W - 12, 12); }
  });
}
function grilleTex() {
  return canvasTex(128, 128, (g, W, H) => {
    g.fillStyle = '#4a4f55'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#08090a';
    for (let y = 8; y < H; y += 11) for (let x = 8 + ((y / 11) % 2) * 5; x < W; x += 11) { if (Math.hypot(x - 64, y - 64) < 56) { g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); } }
  });
}
function crackTex() {
  return canvasTex(320, 230, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const R = rnd(4242), ix = W * 0.7, iy = H * 0.3;
    const branch = (x, y, a, len, w, depth) => {
      let cx = x, cy = y;
      g.beginPath(); g.moveTo(cx, cy);
      for (let l = 0; l < len; l += 6) { a += (R() - 0.5) * 0.5; cx += Math.cos(a) * 6; cy += Math.sin(a) * 6; g.lineTo(cx, cy); if (depth < 3 && R() < 0.06) { g.stroke(); branch(cx, cy, a + (R() - 0.5) * 1.8, len * 0.5, w * 0.7, depth + 1); g.beginPath(); g.moveTo(cx, cy); } }
      g.lineWidth = w; g.stroke();
    };
    g.lineCap = 'round'; g.strokeStyle = 'rgba(215,232,240,0.85)';
    for (let i = 0; i < 9; i++) branch(ix, iy, (i / 9) * TAU + R() * 0.4, 50 + R() * 170, 2.2, 0);
    // impact rings
    for (let k = 1; k < 4; k++) { g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU, r = k * 11 + R() * 5; g.lineTo(ix + Math.cos(a) * r, iy + Math.sin(a) * r); } g.stroke(); }
    g.fillStyle = 'rgba(230,240,245,0.5)'; g.beginPath(); g.arc(ix, iy, 7, 0, TAU); g.fill();
    // grime on the glass
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${60 + R() * 40},${50 + R() * 30},${40},${0.05 + R() * 0.12})`; g.beginPath(); g.arc(R() * W, R() * H, 4 + R() * 30, 0, TAU); g.fill(); }
  });
}

function getMats(d) {
  const k = d ? 1 : 0; if (MATSETS[k]) return MATSETS[k];
  const W = { base: d ? [0.78, 0.77, 0.74] : [0.87, 0.88, 0.87], rust: d ? 0.72 : 0.5, chip: d ? 0.8 : 0.42, grime: d ? 0.95 : 0.5, soot: d ? 0.62 : 0, scratches: d ? 300 : 120, seed: d ? 21 : 3, rough: 0.3, chipC: [0.4, 0.41, 0.42] };
  const B = { base: [0.2, 0.4, 0.68], rust: d ? 0.75 : 0.25, chip: d ? 0.7 : 0.4, grime: d ? 0.7 : 0.3, soot: d ? 0.7 : 0, scratches: d ? 260 : 140, seed: d ? 33 : 5, rough: 0.34, metal: 0.2, chipC: [0.55, 0.56, 0.58], scrC: [0.62, 0.66, 0.7] };
  const J = { base: [0.16, 0.36, 0.7], rust: d ? 0.6 : 0.12, chip: d ? 0.5 : 0.2, grime: d ? 0.6 : 0.15, soot: d ? 0.6 : 0, scratches: d ? 200 : 90, seed: d ? 41 : 7, rough: 0.22, metal: 0.35, chipC: [0.6, 0.62, 0.64], scrC: [0.7, 0.74, 0.78] };
  const O = { base: [0.93, 0.47, 0.13], rust: d ? 0.7 : 0.25, chip: d ? 0.6 : 0.3, grime: d ? 0.7 : 0.3, soot: d ? 0.65 : 0, scratches: d ? 150 : 80, seed: d ? 53 : 9, rough: 0.35 };
  const tW = paintShell(1024, W), tB = paintShell(512, B), tJ = paintShell(512, J), tO = paintShell(256, O);
  const M = {};
  M.shell = shellMaterial(tW, { cc: d ? 0.05 : 0.35 });
  M.shellHoled = M.shell.clone(); M.shellHoled.vertexColors = true; M.shellHoled.side = THREE.DoubleSide;
  M.blue = shellMaterial(tB, { cc: d ? 0.05 : 0.3 });
  M.blueHoled = M.blue.clone(); M.blueHoled.vertexColors = true; M.blueHoled.side = THREE.DoubleSide;
  M.joint = shellMaterial(tJ, { cc: d ? 0.1 : 0.6, ns: 0.5 });
  M.orange = shellMaterial(tO, { cc: 0.2 });
  M.dark = new THREE.MeshStandardMaterial({ color: d ? 0x15171a : 0x1d2126, roughness: d ? 0.75 : 0.5, metalness: 0.3 });
  M.darkRib = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.55, metalness: 0.5 });
  M.steel = d ? Mat('rust') : Mat('steel');
  M.steelClean = Mat('steel');
  M.rubber = new THREE.MeshStandardMaterial({ color: d ? 0x2a1d14 : 0x1b1a19, roughness: 0.9, metalness: 0.05 });
  if (d) { const r = Mat('rust'); M.rubber = r; }
  M.glow = d ? new THREE.MeshStandardMaterial({ color: 0x0e1a1f, roughness: 0.25, metalness: 0.3 }) : Glow(0x40e4ff, 2.6);
  M.glowSoft = d ? M.glow : Glow(0x40e4ff, 1.4);
  M.inner = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.85, metalness: 0.2 });
  M.board = new THREE.MeshStandardMaterial({ color: 0x15301f, roughness: 0.6, metalness: 0.2 });
  M.copper = new THREE.MeshStandardMaterial({ color: 0xc87a3a, roughness: 0.35, metalness: 1 });
  M.ember = Glow(0xff6a1a, d ? 2.2 : 0.5);
  M.badge = new THREE.MeshStandardMaterial({ map: badgeTex(d), transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.screen = d ? new THREE.MeshStandardMaterial({ map: screenTex(true), roughness: 0.15 }) : new THREE.MeshBasicMaterial({ map: screenTex(false), color: new THREE.Color(1.8, 1.8, 1.8), toneMapped: false });
  M.grille = new THREE.MeshStandardMaterial({ map: grilleTex(), roughness: 0.55, metalness: 0.15, color: 0xc8ccd0 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: d ? 0x08090a : 0x05080b, roughness: d ? 0.35 : 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: d ? 0.4 : 0.05, envMapIntensity: 1.6 });
  const wcol = [0xb3261e, 0xe0752a, 0xd8b52c, 0x1a1a1a, 0x2a5fb8, 0xd8d8d0, 0x2f8a3a];
  wcol.forEach((c, i) => { M['wire' + i] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }); });
  MATSETS[k] = M; return M;
}
function applyMats(obj, d) {
  const M = getMats(d);
  obj.traverse(o => { if (o.isMesh && o.userData.mk) o.material = M[o.userData.mk]; });
}

/* =====================================================================
   face screen
   ===================================================================== */
export const EXPRESSIONS = ['happy', 'neutral', 'curious', 'sad', 'scared', 'thinking', 'scan', 'talk', 'glitch', 'off'];
const FW = 320, FH = 232;
function drawFace(g, st) {
  const W = FW, H = FH;
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.shadowBlur = 0;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  let ex = st.expr; if (ex === 'off') return;
  if (ex === 'talk') ex = 'neutral';
  const glitch = ex === 'glitch'; if (glitch) ex = st.gbase || 'neutral';
  const C = '#5ff1ff';
  g.save();
  g.shadowColor = '#22d4ff'; g.shadowBlur = 16; g.strokeStyle = C; g.fillStyle = C; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 13;
  const cx = W / 2 + st.lx * 16, ey = H * 0.42 - st.ly * 12, dx = 66, open = 1 - st.blink;
  const pill = (x, y, w, h) => { h = Math.max(h, 7); g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2); g.fill(); };
  const mouthY = H * 0.74 - st.ly * 6;
  let mouth = null;
  if (ex === 'happy') {
    for (const sx of [-1, 1]) { g.beginPath(); const yy = ey + 10, rr = 27; g.save(); g.translate(cx + sx * dx, yy); g.scale(1, lerp(0.25, 1, open)); g.arc(0, 0, rr, Math.PI * 1.12, Math.PI * 1.88); g.restore(); g.stroke(); }
    mouth = () => { g.beginPath(); g.arc(cx, mouthY - 44, 46, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); };
  } else if (ex === 'neutral') {
    for (const sx of [-1, 1]) pill(cx + sx * dx, ey, 34, 58 * open);
    mouth = () => { g.beginPath(); g.moveTo(cx - 26, mouthY); g.quadraticCurveTo(cx, mouthY + 8, cx + 26, mouthY); g.stroke(); };
  } else if (ex === 'curious') {
    pill(cx - dx, ey - 4, 44, 74 * open); pill(cx + dx, ey + 6, 28, 38 * open);
    g.lineWidth = 9; g.beginPath(); g.moveTo(cx + dx - 22, ey - 30); g.lineTo(cx + dx + 20, ey - 22); g.stroke();
    mouth = () => { g.lineWidth = 9; g.beginPath(); g.arc(cx + 18, mouthY, 11, 0, TAU); g.stroke(); };
  } else if (ex === 'sad') {
    for (const sx of [-1, 1]) {
      pill(cx + sx * dx, ey + 8, 36, 50 * open);
      g.save(); g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; g.beginPath();
      g.moveTo(cx + sx * dx - 30, ey - 30 + (sx < 0 ? 26 : 0)); g.lineTo(cx + sx * dx + 30, ey - 30 + (sx < 0 ? 0 : 26)); g.lineTo(cx + sx * dx + 30, ey - 60); g.lineTo(cx + sx * dx - 30, ey - 60); g.fill(); g.restore();
    }
    mouth = () => { g.beginPath(); g.arc(cx, mouthY + 36, 34, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); };
  } else if (ex === 'scared') {
    g.lineWidth = 9;
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(cx + sx * dx, ey, 30 * Math.max(0.15, open), 0, TAU); g.stroke(); pill(cx + sx * dx + st.jx * 4, ey + st.jy * 3, 12, 12 * open); }
    mouth = () => { g.lineWidth = 8; g.beginPath(); for (let i = 0; i <= 8; i++) g.lineTo(cx - 36 + i * 9, mouthY + (i % 2 ? -7 : 7)); g.stroke(); };
  } else if (ex === 'thinking') {
    for (const sx of [-1, 1]) {
      pill(cx + sx * dx + 14, ey - 14, 34, 46 * open);
      g.save(); g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; g.fillRect(cx + sx * dx - 10, ey + 2, 50, 30); g.restore();
    }
    const n = Math.floor(st.t * 2.5) % 4;
    for (let i = 0; i < 3; i++) { g.globalAlpha = i < n ? 1 : 0.25; g.beginPath(); g.arc(W * 0.78 + i * 16, H * 0.14, 5, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    mouth = () => { g.lineWidth = 10; g.beginPath(); g.moveTo(cx - 6, mouthY); g.lineTo(cx + 30, mouthY - 4); g.stroke(); };
  } else if (ex === 'scan') {
    for (const sx of [-1, 1]) pill(cx + sx * dx, ey, 46, 10);
    g.shadowBlur = 0; g.globalAlpha = 0.18; g.lineWidth = 1;
    for (let x = 0; x < W; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const by = (Math.sin(st.t * 2.6) * 0.5 + 0.5) * (H - 20) + 10, dir = Math.cos(st.t * 2.6) > 0 ? -1 : 1;
    for (let k = 0; k < 22; k++) { g.globalAlpha = 0.5 * (1 - k / 22); g.fillRect(0, by + dir * k * 3, W, 3); }
    g.globalAlpha = 1; g.shadowBlur = 18; g.fillRect(0, by - 2, W, 5);
    g.globalAlpha = 1;
  }
  if (st.talking && ex !== 'scan') { const o = st.mouth; pill(cx, mouthY - 4, 44 + o * 8, 8 + o * 30); }
  else if (mouth) mouth();
  g.restore();
  if (glitch) {
    const R = rnd((st.gseed * 7919) | 0);
    for (let k = 0; k < 7; k++) { const y = R() * H, h = 4 + R() * 26, sh = (R() - 0.5) * 70; g.drawImage(g.canvas, 0, y, W, h, sh, y, W, h); }
    for (let k = 0; k < 10; k++) { g.fillStyle = R() < 0.5 ? 'rgba(255,60,200,0.55)' : 'rgba(120,255,255,0.6)'; g.fillRect(R() * W, R() * H, 6 + R() * 50, 2 + R() * 8); }
    if (R() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 0, W, H); }
    for (let k = 0; k < 300; k++) { const v = R() * 200 | 0; g.fillStyle = `rgb(${v * 0.4 | 0},${v},${v})`; g.fillRect(R() * W, R() * H, 2, 2); }
  }
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.38)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
}

/* =====================================================================
   the robot
   ===================================================================== */
// torso profile (r, y), y from waist 0 to 0.272
const TORSO_PTS = [[0, -0.004], [0.085, -0.002], [0.122, 0.02], [0.145, 0.06], [0.155, 0.115], [0.156, 0.165], [0.148, 0.205], [0.125, 0.24], [0.085, 0.263], [0.035, 0.272], [0, 0.274]];
const TORSO_Z = 0.8;
let TORSO_LUT = null;
function torsoR(y) {
  if (!TORSO_LUT) { const sp = new THREE.SplineCurve(TORSO_PTS.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(200); TORSO_LUT = sp.filter((p, i) => i === 0 || p.y > sp[i - 1].y); }
  const L = TORSO_LUT; if (y <= L[0].y) return L[0].x; if (y >= L[L.length - 1].y) return L[L.length - 1].x;
  let lo = 0, hi = L.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m].y < y) lo = m; else hi = m; }
  const t = (y - L[lo].y) / (L[hi].y - L[lo].y); return lerp(L[lo].x, L[hi].x, t);
}
/** point on the (scaled) torso surface at height y and lathe angle phi (0 = front, +pi/2 = +X) */
function torsoPt(y, phi, off = 0) { const r = torsoR(y) + off; return new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r * TORSO_Z); }
/** point on the front of the torso with given x */
function torsoFront(x, y, off = 0) { const r = torsoR(y); const phi = Math.asin(clamp(x / r, -1, 1)); return torsoPt(y, phi, off); }

const HEAD_R = 0.135, VIS_A = 0.097, VIS_B = 0.071, VIS_ZC = -0.01, VIS_R = 0.152;
const superPt = (th, a, b, n = 4.2) => { const c = Math.cos(th), s = Math.sin(th); return [a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]; };
const visorZ = (x, y, off = 0) => VIS_ZC + Math.sqrt(Math.max(0, (VIS_R + off) ** 2 - x * x - y * y));
const headZ = (x, y, off = 0) => Math.sqrt(Math.max(0, (HEAD_R + off) ** 2 - x * x - y * y));
/** radial grid over the rounded-rect visor outline; proj(x, y, ringFrac) -> z */
function visorGrid(scales, proj, segs = 80, uvFace = true) {
  const pos = [], uv = [], idx = [], nr = scales.length;
  for (let k = 0; k < nr; k++) for (let j = 0; j <= segs; j++) {
    const [px, py] = superPt(j / segs * TAU, VIS_A, VIS_B); const x = px * scales[k], y = py * scales[k];
    pos.push(x, y, proj(x, y, k / (nr - 1), k)); uv.push(uvFace ? x / (2 * VIS_A) + 0.5 : j / segs, uvFace ? y / (2 * VIS_B) + 0.5 : k / (nr - 1));
  }
  for (let k = 0; k < nr - 1; k++) for (let j = 0; j < segs; j++) { const a = k * (segs + 1) + j, b = a + segs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** the forearm (below the elbow pivot) with wrist + hand. side: +1 left, -1 right. torn: 'stump' | 'loose' | null */
function buildForearm(side, add, torn = null) {
  const s = side, fore = new THREE.Group(); fore.name = 'forearm';
  const shellG = uvScale(lathe([[0, -0.127], [0.036, -0.126], [0.043, -0.114], [0.043, -0.085], [0.038, -0.05], [0.03, -0.027], [0.022, -0.017], [0, -0.014]], 24, 12), 1, 1);
  const cutY = -0.05;
  const field = (p) => (p.y - cutY) + jag(Math.atan2(p.z, p.x), 77, 0.014);
  if (torn === 'loose') add(cutHole(shellG, field, 0.025, true), 'shellHoled', fore);
  else add(shellG, 'shell', fore);
  // inner dark sleeve visible through the torn end
  if (torn === 'loose') add(new THREE.CylinderGeometry(0.03, 0.034, 0.07, 20, 1, true).translate(0, -0.085, 0), 'inner', fore);
  // orange cuff
  add(latheRaw([[0.03, -0.144], [0.04, -0.143], [0.0455, -0.138], [0.0465, -0.131], [0.044, -0.125], [0.036, -0.122]], 36), 'orange', fore);
  // panel line + bolt on the gauntlet
  const bolt = new THREE.SphereGeometry(0.004, 6, 4);
  for (const a of [0.6, 2.2, 3.8, 5.3]) add(bolt.clone().translate(Math.sin(a) * 0.043, -0.1, Math.cos(a) * 0.043), 'steelClean', fore);
  const wrist = new THREE.Group(); wrist.name = 'wrist'; wrist.position.y = -0.15; fore.add(wrist);
  add(new THREE.CylinderGeometry(0.018, 0.022, 0.02, 20).translate(0, 0.002, 0), 'darkRib', wrist);
  const hand = new THREE.Group(); hand.name = 'hand'; hand.scale.setScalar(1.3); wrist.add(hand);
  // palm: thin along X (palm faces -s X, toward the body)
  add(rbox(0.03, 0.05, 0.054, 0.012, 3).translate(0, -0.032, 0), 'joint', hand);
  add(new THREE.SphereGeometry(0.009, 10, 6).translate(-s * 0.015, -0.03, 0), 'glowSoft', hand); // palm light
  const fingers = [];
  const segGeo1 = new THREE.CapsuleGeometry(0.0088, 0.014, 1, 7).translate(0, -0.011, 0);
  const segGeo2 = new THREE.CapsuleGeometry(0.0082, 0.01, 1, 7).translate(0, -0.009, 0);
  const tipGeo = new THREE.SphereGeometry(0.0072, 8, 6).translate(0, -0.019, 0);
  const mkFinger = (parent, x, y, z) => {
    const f1 = new THREE.Group(); f1.position.set(x, y, z); parent.add(f1);
    add(new THREE.SphereGeometry(0.0095, 8, 5), 'darkRib', f1);
    add(segGeo1, 'joint', f1);
    const f2 = new THREE.Group(); f2.position.y = -0.024; f1.add(f2);
    add(segGeo2, 'joint', f2); add(tipGeo, 'glow', f2);
    return [f1, f2];
  };
  for (const z of [0.017, 0, -0.017]) fingers.push(mkFinger(hand, 0, -0.058, z));
  const thumb = mkFinger(hand, -s * 0.006, -0.022, 0.028);
  thumb[0].rotation.x = -0.9;
  return { fore, wrist, hand, fingers, thumb };
}

/** dangling torn wires: returns {group, tips[]} */
function buildWires(add, seed, n = 7, len = 0.1, down = new THREE.Vector3(0, -1, 0)) {
  const g = new THREE.Group(), R = rnd(seed), tips = [];
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, r0 = R() * 0.016, l = len * (0.5 + R() * 0.7), side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const p0 = new THREE.Vector3(Math.cos(a) * r0, 0.005, Math.sin(a) * r0);
    const p1 = p0.clone().addScaledVector(down, l * 0.35).addScaledVector(side, l * (0.15 + R() * 0.3));
    const p2 = p0.clone().addScaledVector(down, l * 0.75).addScaledVector(side, l * (0.25 + R() * 0.4));
    const p3 = p0.clone().addScaledVector(down, l).addScaledVector(side, l * (0.1 + R() * 0.5));
    const crv = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    const rr = 0.0022 + R() * 0.0018;
    add(ribTube(crv, rr, 20, 6), 'wire' + (i % 7), g);
    const tipDir = crv.getTangentAt(1);
    const tip = new THREE.Group(); tip.position.copy(p3); g.add(tip); tips.push(tip);
    const cu = new THREE.CylinderGeometry(rr * 0.6, rr * 0.4, 0.008, 6); cu.translate(0, 0.004, 0);
    const m = add(cu, 'copper', tip); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipDir);
  }
  return { group: g, tips };
}

/** stadium (tank tread) path in the foot's YZ plane */
function trackPath(L) { // returns fn(s in 0..1) -> {y, z, ty, tz}
  const { zA, zB, yc, rr } = L, st = zB - zA, per = 2 * st + TAU * rr;
  return (u) => {
    let d = (((u % 1) + 1) % 1) * per;
    if (d < st) return { y: yc - rr, z: zB - d, ty: 0, tz: -1 };
    d -= st;
    if (d < Math.PI * rr) { const a = d / rr; return { y: yc - Math.cos(a) * rr, z: zA - Math.sin(a) * rr, ty: Math.sin(a), tz: -Math.cos(a) }; }
    d -= Math.PI * rr;
    if (d < st) return { y: yc + rr, z: zA + d, ty: 0, tz: 1 };
    d -= st; const a = d / rr; return { y: yc + Math.cos(a) * rr, z: zB + Math.sin(a) * rr, ty: -Math.sin(a), tz: Math.cos(a) };
  };
}
const TRACK = { zA: -0.048, zB: 0.072, yc: -0.0835, rr: 0.0265, n: 26 };

export class GuideModel {
  constructor({ damaged = false } = {}) {
    this.root = new THREE.Group(); this.root.name = 'Guide';
    this._onlyR = []; this._onlyD = []; this._sparks = []; this._tracks = [];
    this._t = Math.random() * 20; this._ph = 0; this._tread = 0; this._walkA = 0; this._runA = 0;
    this._face = 'happy'; this._blink = 0; this._nextBlink = 2; this._mouth = 0; this._tilt = { t: 0, z: 0, y: 0, x: 0 };
    this._gw = 0; this._ant = [];
    this.J = {}; this.cur = {};
    this._build();
    this._buildFace();
    this.damaged = null;
    this.setDamaged(damaged);
    this.update(0.001, {});
  }

  /* ---------- construction ---------- */
  _add(geo, mk, parent, only) {
    const m = new THREE.Mesh(geo, getMats(false)[mk] || getMats(false).shell); m.userData.mk = mk; m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    if (only === 'r') this._onlyR.push(m); else if (only === 'd') this._onlyD.push(m);
    return m;
  }
  _joint(name, obj, keys) { for (const k of keys) { this.J[name + '.' + k] = { o: obj, k, base: obj.position.clone() }; } }

  _build() {
    const add = (g, mk, p, only) => this._add(g, mk, p, only);
    const body = this.body = new THREE.Group(); body.name = 'body'; this.root.add(body);
    this._joint('body', body, ['x', 'z', 'py']);

    /* ---- pelvis ---- */
    const pelvis = this.pelvis = new THREE.Group(); pelvis.position.y = 0.47; body.add(pelvis);
    const pelG = new THREE.Group(); pelG.scale.z = 0.78; pelvis.add(pelG);
    add(uvScale(lathe([[0, -0.072], [0.07, -0.07], [0.108, -0.055], [0.122, -0.025], [0.124, 0.012], [0.112, 0.035], [0.07, 0.045], [0, 0.047]], 34, 12), 2, 1), 'shell', pelG);
    add(uvScale(latheRaw([[0.098, -0.064], [0.112, -0.058], [0.123, -0.044], [0.1265, -0.032], [0.1265, -0.02], [0.124, -0.016]], 48), 2, 1), 'blue', pelG);
    add(latheRaw([[0.124, -0.015], [0.1275, -0.013], [0.1275, -0.008], [0.1245, -0.006]], 48), 'orange', pelG);
    // waist bellows
    const bel = []; for (let i = 0; i <= 15; i++) { const y = 0.02 + i / 15 * 0.075; bel.push([0.082 + 0.006 * Math.abs(Math.sin(i / 15 * Math.PI * 5)), y]); }
    add(latheRaw(bel, 26), 'darkRib', pelvis);

    /* ---- legs ---- */
    this.legs = {};
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      const hip = new THREE.Group(); hip.position.set(s * 0.074, -0.035, 0); pelvis.add(hip); this._joint('hip' + L, hip, ['x', 'z']);
      add(new THREE.SphereGeometry(0.043, 16, 10), 'joint', hip);
      const thighG = uvScale(lathe([[0, -0.137], [0.04, -0.135], [0.049, -0.12], [0.052, -0.085], [0.05, -0.045], [0.042, -0.022], [0, -0.016]], 24, 12), 1, 1);
      add(thighG, 'shell', hip, s > 0 ? 'r' : null);
      if (s > 0) { // chunk knocked out of the left thigh when damaged
        const f = p => (Math.hypot(p.x - 0.03, p.y + 0.08) - 0.022 + jag(Math.atan2(p.y + 0.08, p.x - 0.03), 5, 0.006)) + (p.z < 0 ? 1 : 0);
        add(cutHole(thighG, f, 0.02), 'shellHoled', hip, 'd');
        add(new THREE.CylinderGeometry(0.032, 0.032, 0.1, 16).translate(0, -0.075, 0), 'inner', hip, 'd');
      }
      add(latheRaw([[0.04, -0.142], [0.046, -0.139], [0.047, -0.134], [0.044, -0.131]], 36), 'darkRib', hip);
      const knee = new THREE.Group(); knee.position.y = -0.15; hip.add(knee); this._joint('kn' + L, knee, ['x']);
      add(new THREE.SphereGeometry(0.042, 18, 12), 'joint', knee);
      add(new THREE.TorusGeometry(0.036, 0.004, 5, 24).rotateY(Math.PI / 2), 'darkRib', knee);
      add(uvScale(lathe([[0, -0.168], [0.047, -0.166], [0.056, -0.148], [0.058, -0.105], [0.052, -0.06], [0.044, -0.03], [0.034, -0.02], [0, -0.016]], 24, 12), 1, 1), 'shell', knee);
      add(latheRaw([[0.04, -0.182], [0.052, -0.18], [0.0575, -0.174], [0.058, -0.165], [0.054, -0.158], [0.046, -0.155]], 40), 'orange', knee);
      const ankle = new THREE.Group(); ankle.position.y = -0.175; knee.add(ankle); this._joint('an' + L, ankle, ['x']);
      // boot
      add(new THREE.CylinderGeometry(0.028, 0.034, 0.03, 20).translate(0, -0.012, 0), 'darkRib', ankle);
      add(rbox(0.1, 0.05, 0.142, 0.022, 2).translate(0, -0.045, 0.014), 'shell', ankle);
      add(rbox(0.104, 0.016, 0.146, 0.008, 2).translate(0, -0.06, 0.014), 'orange', ankle);
      add(rbox(0.07, 0.02, 0.05, 0.009, 2).translate(0, -0.03, 0.06).rotateX(0.0), 'blue', ankle);
      // track frame + wheels
      add(rbox(0.092, 0.042, 0.11, 0.014, 2).translate(0, TRACK.yc, (TRACK.zA + TRACK.zB) / 2), 'dark', ankle);
      const wheel = new THREE.CylinderGeometry(0.021, 0.021, 0.098, 24).rotateZ(Math.PI / 2);
      const hub = new THREE.CylinderGeometry(0.011, 0.011, 0.104, 16).rotateZ(Math.PI / 2);
      for (const z of [TRACK.zA, TRACK.zB, (TRACK.zA + TRACK.zB) / 2]) { add(wheel.clone().translate(0, TRACK.yc, z), 'steel', ankle); add(hub.clone().translate(0, TRACK.yc, z), 'orange', ankle); }
      // links (instanced, they roll)
      const link = merge([new THREE.BoxGeometry(0.104, 0.006, 0.0125), new THREE.BoxGeometry(0.1, 0.005, 0.0035).translate(0, 0.005, 0)]);
      const im = new THREE.InstancedMesh(link, getMats(false).rubber, TRACK.n); im.userData.mk = 'rubber'; im.castShadow = true; ankle.add(im);
      this._tracks.push(im);
      this.legs[L] = { hip, knee, ankle };
    }
    this._trackFn = trackPath(TRACK);

    /* ---- torso ---- */
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.06; pelvis.add(spine); this._joint('spine', spine, ['x', 'y', 'z']);
    const tShape = new THREE.Group(); tShape.scale.z = TORSO_Z; spine.add(tShape);
    const torsoGeo = uvScale(lathe(TORSO_PTS, 40, 22), 2, 1);
    add(torsoGeo, 'shell', tShape, 'r');
    const holeF = (p) => (p.z < 0.02 ? 1 : (Math.hypot((p.x - 0.004) / 0.082, (p.y - 0.13) / 0.088) - 1 + jag(Math.atan2(p.y - 0.13, p.x - 0.004), 11, 0.3)) * 0.07);
    add(cutHole(torsoGeo, holeF, 0.035), 'shellHoled', tShape, 'd');
    // side panels: blue, from a curved front edge (U-shaped white chest plate) to the back
    const phiF = y => lerp(0.5, 0.86, sstep(0.02, 0.2, y));
    for (const s of [1, -1]) {
      const g = gridGeo(12, 18, (u, v) => { const y = lerp(0.028, 0.232, v), a = lerp(phiF(y), 2.35, u); const r = torsoR(y) + 0.0025; return new THREE.Vector3(s * Math.sin(a) * r, y, Math.cos(a) * r); });
      if (s < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; } g.computeVertexNormals(); }
      add(g, 'blue', tShape, 'r'); add(cutHole(g, holeF, 0.03), 'blueHoled', tShape, 'd');
      // orange trim along the front edge + dark seam along the back edge
      const fp = [], bp = []; for (let i = 0; i <= 24; i++) { const y = lerp(0.03, 0.23, i / 24), r = torsoR(y) + 0.004; fp.push(new THREE.Vector3(s * Math.sin(phiF(y)) * r, y, Math.cos(phiF(y)) * r)); bp.push(new THREE.Vector3(s * Math.sin(2.35) * r, y, Math.cos(2.35) * r)); }
      add(ribTube(new THREE.CatmullRomCurve3(fp), 0.0042, 28, 6), 'orange', tShape);
      add(ribTube(new THREE.CatmullRomCurve3(bp), 0.0026, 18, 4), 'darkRib', tShape);
    }
    // lower blue band and orange belt line on the torso
    add(latheRaw([[0.084, -0.002], [0.1, 0.004], [0.122, 0.02], [0.134, 0.034], [0.138, 0.04]].map(p => [p[0] + 0.002, p[1]]), 56), 'blue', tShape);
    // collar ring
    add(latheRaw([[0.06, 0.262], [0.075, 0.262], [0.082, 0.267], [0.078, 0.273], [0.06, 0.275]], 40), 'darkRib', tShape);
    // chest badge decal
    const badge = gridGeo(16, 16, (u, v) => torsoFront(lerp(-0.066, 0.066, u), lerp(0.072, 0.204, v), 0.0018));
    add(badge, 'badge', spine, 'r');
    // chest side light (robot's right side of the chest)
    const lp = torsoFront(-0.088, 0.19, -0.002);
    const lightG = new THREE.CapsuleGeometry(0.0075, 0.018, 4, 12).rotateZ(0.25);
    const lm = add(lightG, 'glow', spine); lm.position.copy(lp);
    const lrim = add(new THREE.TorusGeometry(0.012, 0.0025, 4, 16).scale(1, 1.6, 1).rotateZ(0.25), 'darkRib', spine); lrim.position.copy(lp); lrim.lookAt(lp.clone().add(new THREE.Vector3(-0.4, 0, 1)));
    lrim.rotation.z += 0.25;
    // screws on the chest plate
    const screw = new THREE.SphereGeometry(0.0045, 10, 6).scale(1, 1, 0.5);
    for (const [x, y] of [[-0.05, 0.225], [0.05, 0.225], [-0.07, 0.05], [0.07, 0.05]]) { const p = torsoFront(x, y, 0); const m = add(screw, 'steelClean', spine); m.position.copy(p); m.lookAt(p.clone().multiply(new THREE.Vector3(1, 0, 2)).setY(p.y)); }

    /* ---- damaged chest internals ---- */
    const guts = new THREE.Group(); spine.add(guts); this._onlyD.push(guts);
    const gIn = new THREE.Group(); gIn.scale.set(0.9, 0.95, TORSO_Z * 0.62); guts.add(gIn);
    add(lathe(TORSO_PTS, 20, 12), 'inner', gIn);
    add(rbox(0.09, 0.07, 0.012, 0.004).translate(-0.01, 0.15, 0.085).rotateY(0.1), 'board', guts);
    const chipG = new THREE.BoxGeometry(0.014, 0.014, 0.004);
    for (const [x, y] of [[-0.03, 0.16], [0.0, 0.135], [0.02, 0.165], [-0.04, 0.13]]) add(chipG.clone().translate(x, y, 0.093), 'dark', guts);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.075, 18).translate(0.035, 0.12, 0.078), 'blue', guts);
    add(new THREE.CylinderGeometry(0.019, 0.019, 0.01, 18).translate(0.035, 0.16, 0.078), 'steel', guts);
    add(new THREE.SphereGeometry(0.004, 8, 6).translate(-0.045, 0.172, 0.094), 'ember', guts);
    const chestW = buildWires(add, 99, 7, 0.09, new THREE.Vector3(0.1, -1, 0.45).normalize());
    chestW.group.position.set(-0.01, 0.12, 0.085); guts.add(chestW.group);
    for (let i = 0; i < 4; i++) {
      const R = rnd(300 + i); const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.06 + R() * 0.03, 0.08 + R() * 0.03, 0.07), new THREE.Vector3(-0.03 + R() * 0.06, 0.12 + R() * 0.05, 0.11 + R() * 0.02), new THREE.Vector3(0.03 + R() * 0.03, 0.17 + R() * 0.03, 0.075)]);
      add(ribTube(c, 0.003, 20, 6), 'wire' + ((i * 3) % 7), guts);
    }
    const chestSpark = new THREE.Group(); chestSpark.position.set(-0.03, 0.17, 0.1); guts.add(chestSpark);
    this._sparks.push(chestSpark, chestW.tips[0], chestW.tips[3]);

    /* ---- backpack ---- */
    const pack = new THREE.Group(); pack.position.set(0, 0.14, -0.148); spine.add(pack);
    add(rbox(0.205, 0.19, 0.075, 0.022, 2), 'shell', pack);
    add(rbox(0.215, 0.05, 0.08, 0.012, 2).translate(0, -0.075, 0.004), 'blue', pack);
    add(rbox(0.17, 0.11, 0.008, 0.006, 2).translate(0, 0.03, -0.037), 'dark', pack);
    const scrG = new THREE.PlaneGeometry(0.052, 0.068).rotateY(Math.PI);
    const scrL = add(scrG.clone().translate(0.033, 0.03, -0.0425), 'screen', pack);
    add(scrG.clone().translate(-0.033, 0.03, -0.0425), 'screen', pack);
    for (const x of [0.033, -0.033]) add(rbox(0.06, 0.076, 0.006, 0.003, 1).translate(x, 0.03, -0.039), 'darkRib', pack);
    // speaker grille + vent slots
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 32).rotateX(Math.PI / 2).rotateY(Math.PI).translate(0.045, -0.055, -0.038), 'grille', pack);
    add(new THREE.TorusGeometry(0.029, 0.003, 4, 24).translate(0.045, -0.055, -0.04), 'darkRib', pack);
    for (let i = 0; i < 4; i++) add(rbox(0.05, 0.005, 0.006, 0.0024, 1).translate(-0.05, -0.04 - i * 0.011, -0.038), 'darkRib', pack);
    add(rbox(0.024, 0.01, 0.01, 0.004, 1).translate(-0.05, 0.088, -0.03), 'orange', pack); // handle tab
    // radio unit on the robot's left side
    const radio = new THREE.Group(); radio.position.set(0.118, 0.0, 0.005); pack.add(radio);
    add(rbox(0.036, 0.12, 0.06, 0.01, 2), 'blue', radio);
    add(rbox(0.006, 0.08, 0.04, 0.003, 1).translate(0.018, 0.0, 0), 'shell', radio);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.004, 0.003, 0.03).translate(0.022, -0.025 + i * 0.008, 0), 'darkRib', radio);
    add(new THREE.SphereGeometry(0.004, 10, 8).translate(0.02, 0.032, 0.012), 'glow', radio);
    const rAnt = new THREE.Group(); rAnt.position.set(0.006, 0.06, -0.015); radio.add(rAnt);
    add(new THREE.CylinderGeometry(0.0055, 0.0065, 0.016, 12).translate(0, 0.008, 0), 'dark', rAnt);
    add(new THREE.CylinderGeometry(0.0022, 0.0028, 0.13, 8).translate(0, 0.08, 0), 'steelClean', rAnt);
    add(new THREE.SphereGeometry(0.005, 10, 8).translate(0, 0.146, 0), 'dark', rAnt);
    this._ant.push({ o: rAnt, a: 0, v: 0, b: 0, bv: 0, ph: 1.3 });
    // hoses from the pack down to the hips (both sides) + a looping cable
    for (const s of [1, -1]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.07, 0.065, -0.17), new THREE.Vector3(s * 0.1, 0.0, -0.16), new THREE.Vector3(s * 0.135, -0.045, -0.09), new THREE.Vector3(s * 0.123, -0.06, -0.03)]);
      add(ribTube(c, 0.0095, 44, 7, 22, 0.16), 'darkRib', spine);
      const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.04, 0.065, -0.165), new THREE.Vector3(s * 0.06, -0.01, -0.175), new THREE.Vector3(s * 0.105, -0.06, -0.12), new THREE.Vector3(s * 0.11, -0.075, -0.06)]);
      add(ribTube(c2, 0.0045, 24, 6), s > 0 ? 'wire3' : 'wire4', spine);
      for (const p of [c.getPointAt(0), c.getPointAt(1)]) add(new THREE.CylinderGeometry(0.0125, 0.0125, 0.012, 16).translate(p.x, p.y, p.z), 'orange', spine);
    }

    /* ---- shoulders + arms ---- */
    this.arms = {};
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      // socket cup on the torso side with glowing ring
      const sock = new THREE.Group(); sock.position.set(s * 0.15, 0.19, 0); spine.add(sock);
      const cup = latheRaw([[0.0, -0.004], [0.038, -0.004], [0.05, 0.004], [0.055, 0.016], [0.052, 0.022], [0.044, 0.02], [0.04, 0.012]], 40);
      cup.rotateZ(-s * Math.PI / 2); add(cup, 'blue', sock);
      add(new THREE.TorusGeometry(0.046, 0.0045, 6, 36).rotateY(Math.PI / 2).translate(s * 0.02, 0, 0), 'glow', sock);
      const sh = new THREE.Group(); sh.position.set(s * 0.172, 0.19, 0); spine.add(sh); this._joint('sh' + L, sh, ['x', 'y', 'z', 'py']);
      add(new THREE.SphereGeometry(0.038, 16, 10), 'joint', sh);
      add(new THREE.TorusGeometry(0.037, 0.0035, 5, 24).rotateX(Math.PI / 2).translate(0, -0.028, 0), 'glowSoft', sh);
      add(uvScale(lathe([[0, -0.132], [0.03, -0.131], [0.037, -0.12], [0.04, -0.085], [0.039, -0.05], [0.033, -0.034], [0, -0.03]], 24, 12), 1, 1), 'shell', sh);
      add(latheRaw([[0.028, -0.14], [0.034, -0.138], [0.035, -0.133], [0.03, -0.13]], 30), 'darkRib', sh);
      const el = new THREE.Group(); el.position.y = -0.155; sh.add(el); this._joint('el' + L, el, ['x', 'z']);
      add(new THREE.SphereGeometry(0.033, 16, 10), 'joint', el);
      const fa = buildForearm(s, add);
      el.add(fa.fore); this._joint('wr' + L, fa.wrist, ['x', 'y', 'z']);
      this.arms[L] = { sh, el, ...fa };
      if (s > 0) {
        this._onlyR.push(fa.fore);
        // torn stump + wires (damaged)
        const stumpG = uvScale(lathe([[0, -0.127], [0.036, -0.126], [0.043, -0.114], [0.043, -0.085], [0.038, -0.05], [0.03, -0.027], [0.022, -0.017], [0, -0.014]], 24, 12), 1, 1);
        add(cutHole(stumpG, p => -0.042 + jag(Math.atan2(p.z, p.x), 77, 0.012) - p.y, 0.02, true), 'shellHoled', el, 'd');
        const w = buildWires(add, 7, 7, 0.11); w.group.position.y = -0.035; el.add(w.group); this._onlyD.push(w.group);
        const sp = new THREE.Group(); sp.position.y = -0.04; el.add(sp);
        this._sparks.push(sp, w.tips[1], w.tips[4]);
      }
    }

    /* ---- neck + head ---- */
    const neck = this.neck = new THREE.Group(); neck.position.y = 0.258; spine.add(neck); this._joint('neck', neck, ['x', 'y', 'z']);
    const nk = []; for (let i = 0; i <= 12; i++) nk.push([0.036 + 0.004 * Math.abs(Math.sin(i / 12 * Math.PI * 3)), i / 12 * 0.06]);
    add(latheRaw(nk, 20), 'darkRib', neck);
    const head = this._head = new THREE.Group(); head.name = 'head'; head.position.y = 0.136; head.scale.setScalar(1.07); neck.add(head);
    const headGeo = uvScale(new THREE.SphereGeometry(HEAD_R, 44, 30), 2, 1);
    add(headGeo, 'shell', head, 'r');
    const hd = new THREE.Vector3(0.48, 0.62, 0.62).normalize();
    const holeH = p => { const q = p.clone().normalize(); const d = q.angleTo(hd); const a = Math.atan2(q.y - hd.y, q.x - hd.x); return (d - 0.22 - jag(a, 3, 0.07)) * HEAD_R; };
    add(cutHole(headGeo, holeH, 0.03), 'shellHoled', head, 'd');
    add(new THREE.SphereGeometry(HEAD_R * 0.9, 16, 10), 'inner', head, 'd');
    { // broken bits inside the head hole
      const p = hd.clone().multiplyScalar(HEAD_R * 0.9);
      add(new THREE.BoxGeometry(0.03, 0.006, 0.02).translate(p.x, p.y, p.z), 'board', head, 'd');
      const w = buildWires(add, 55, 3, 0.04, hd.clone().add(new THREE.Vector3(0, -0.6, 0)).normalize()); w.group.position.copy(hd.clone().multiplyScalar(HEAD_R * 0.92)); head.add(w.group); this._onlyD.push(w.group);
    }
    // neck skirt (the head's bottom ring)
    add(latheRaw([[0.03, -0.128], [0.055, -0.13], [0.07, -0.124], [0.074, -0.117]], 40), 'darkRib', head);
    // visor: bezel, glass, face overlay (built per instance in _buildFace), crack overlay
    const bez = visorGrid([1.0, 1.0, 1.035, 1.08, 1.12], (x, y, f, k) => k === 0 ? visorZ(x, y, -0.003) : k === 1 ? visorZ(x, y, 0.004) : k === 2 ? visorZ(x, y, 0.0045) : k === 3 ? lerp(visorZ(x, y, 0.002), headZ(x, y, 0.002), 0.6) : headZ(x, y, 0.0005), 64, false);
    uvScale(bez, 3, 1); add(bez, 'dark', head);
    this._glassGeo = visorGrid([0, 0.3, 0.6, 0.82, 0.95, 1.0], (x, y) => visorZ(x, y, 0), 64);
    add(this._glassGeo, 'glass', head);
    // ear discs + antennas
    this._antEars = [];
    for (const s of [1, -1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.122, 0.0, -0.005); head.add(ear);
      const rot = g => g.rotateZ(-s * Math.PI / 2);
      add(rot(latheRaw([[0.03, 0.0], [0.052, 0.0], [0.058, 0.006], [0.059, 0.02], [0.055, 0.03], [0.046, 0.034], [0.036, 0.034]], 48)), 'joint', ear);
      add(rot(latheRaw([[0.0, 0.04], [0.02, 0.039], [0.033, 0.036], [0.038, 0.033], [0.038, 0.028]], 40)), 'shell', ear);
      add(rot(new THREE.TorusGeometry(0.036, 0.0025, 5, 32).rotateX(Math.PI / 2).translate(0, 0.034, 0)), 'glowSoft', ear);
      add(rot(new THREE.CylinderGeometry(0.009, 0.011, 0.012, 20).translate(0, 0.045, 0)), 'darkRib', ear);
      const ant = new THREE.Group(); ant.position.set(s * 0.035, 0.026, -0.006); ear.add(ant);
      add(new THREE.CylinderGeometry(0.006, 0.0075, 0.014, 14).translate(0, 0.007, 0), 'dark', ant);
      const straight = new THREE.Group(); ant.add(straight);
      add(new THREE.CylinderGeometry(0.0022, 0.003, 0.13, 8).translate(0, 0.078, 0), 'darkRib', straight);
      add(new THREE.SphereGeometry(0.0055, 12, 8).translate(0, 0.145, 0), 'dark', straight);
      ant.rotation.z = -s * 0.12; ant.rotation.x = -0.12;
      if (s > 0) { // bent antenna on the damaged left ear
        this._onlyR.push(straight);
        const bent = new THREE.Group(); ant.add(bent); this._onlyD.push(bent);
        const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.012, 0), new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.005, 0.068, -0.004), new THREE.Vector3(0.05, 0.085, -0.03), new THREE.Vector3(0.08, 0.08, -0.05)]);
        add(ribTube(c, 0.0026, 30, 6), 'darkRib', bent);
        add(new THREE.SphereGeometry(0.0055, 12, 8).translate(0.08, 0.08, -0.05), 'dark', bent);
      }
      this._ant.push({ o: ant, a: 0, v: 0, b: 0, bv: 0, ph: s, z0: ant.rotation.z, x0: ant.rotation.x });
    }
    this._ant[0].z0 = 0; this._ant[0].x0 = 0;
    // head-back module
    const hb = new THREE.Group(); hb.position.set(0, 0.03, -HEAD_R + 0.012); head.add(hb);
    add(rbox(0.094, 0.07, 0.04, 0.016, 2).translate(0, 0, -0.008), 'shell', hb);
    add(rbox(0.07, 0.048, 0.006, 0.005, 2).translate(0, 0, -0.029), 'blue', hb);
    for (let i = 0; i < 3; i++) add(rbox(0.04, 0.0045, 0.004, 0.002, 1).translate(0, 0.013 - i * 0.012, -0.0325), 'glowSoft', hb);
    // top panel seam ring
    add(new THREE.TorusGeometry(HEAD_R * 0.995, 0.0016, 3, 48).rotateY(Math.PI / 2), 'darkRib', head);
  }

  _buildFace() {
    const c = document.createElement('canvas'); c.width = FW; c.height = FH;
    this._fctx = c.getContext('2d');
    this._ftex = new THREE.CanvasTexture(c); this._ftex.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshBasicMaterial({ map: this._ftex, color: new THREE.Color(2.4, 2.4, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const fg = visorGrid([0, 0.3, 0.6, 0.82, 0.95, 1.0], (x, y) => visorZ(x, y, 0.0008), 64);
    this._faceMesh = new THREE.Mesh(fg, fm); this._faceMesh.renderOrder = 2; this._head.add(this._faceMesh);
    if (!FACE_SHARED) FACE_SHARED = new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, depthWrite: false, opacity: 0.95 });
    const cg = visorGrid([0, 0.3, 0.6, 0.82, 0.95, 1.0], (x, y) => visorZ(x, y, 0.0012), 64);
    const cm = new THREE.Mesh(cg, FACE_SHARED); cm.renderOrder = 3; this._head.add(cm); this._onlyD.push(cm);
    this._faceKey = '';
  }

  /* ---------- API ---------- */
  get head() { return this._head; }
  get handR() { return this.arms.R.hand; }
  sparkPoints() { return this._sparks.slice(); }
  setDamaged(d) {
    d = !!d; if (d === this.damaged) return; this.damaged = d;
    applyMats(this.root, d);
    for (const o of this._onlyR) o.visible = !d;
    for (const o of this._onlyD) o.visible = d;
    this._face = d ? 'off' : 'happy';
  }
  setFace(expr) { if (EXPRESSIONS.includes(expr)) this._face = expr; }

  update(dt, s = {}) {
    dt = Math.min(dt || 0, 0.1); this._t += dt; const t = this._t;
    const speed = s.speed || 0, G = s.gesture || null, gt = s.gestureT || 0;
    if (s.mood && EXPRESSIONS.includes(s.mood)) this._face = s.mood;
    // locomotion amplitudes
    this._walkA = lerp(this._walkA, clamp(speed / 1.2, 0, 1), kDamp(6, dt));
    this._runA = lerp(this._runA, sstep(1.8, 3.2, speed), kDamp(5, dt));
    const stride = lerp(0.62, 1.1, this._runA);
    this._ph += dt * (speed / stride) * TAU; const ph = this._ph, A = this._walkA, RA = this._runA;
    this._tread += dt * speed * 0.9;

    /* -------- base pose targets (damped) -------- */
    const T = {
      'body.x': 0, 'body.z': 0, 'body.py': 0, 'spine.x': 0.02, 'spine.y': 0, 'spine.z': 0, 'neck.x': 0, 'neck.y': 0, 'neck.z': 0,
      'hipL.x': 0, 'hipL.z': 0.02, 'hipR.x': 0, 'hipR.z': -0.02, 'knL.x': 0.06, 'knR.x': 0.06, 'anL.x': -0.04, 'anR.x': -0.04,
      fcL: 0.55, fcR: 0.55, fiL: 0.5, fiR: 0.5, ftL: 0.3, ftR: 0.3,
    };
    for (const [L, sd] of [['L', 1], ['R', -1]]) { T['sh' + L + '.x'] = 0.06; T['sh' + L + '.y'] = 0; T['sh' + L + '.z'] = sd * 0.14; T['sh' + L + '.py'] = 0; T['el' + L + '.x'] = -0.3; T['el' + L + '.z'] = 0; T['wr' + L + '.x'] = 0; T['wr' + L + '.y'] = 0; T['wr' + L + '.z'] = 0; }
    const add = {}; const ad = (k, v) => { add[k] = (add[k] || 0) + v; };

    // idle life: breathing, hover bob, occasional head tilts
    const idle = 1 - A;
    ad('body.py', Math.sin(t * 2.1) * 0.0035 * idle);
    ad('spine.x', Math.sin(t * 1.6) * 0.012);
    ad('shL.z', Math.sin(t * 1.6 + 0.5) * 0.012); ad('shR.z', -Math.sin(t * 1.6 + 0.5) * 0.012);
    this._tilt.t -= dt;
    if (this._tilt.t <= 0) { const R = Math.random; this._tilt.t = 2.5 + R() * 4; const big = R() < 0.35; this._tilt.z = big ? (R() - 0.5) * 0.4 : (R() - 0.5) * 0.08; this._tilt.y = (R() - 0.5) * (big ? 0.5 : 0.15); this._tilt.x = (R() - 0.5) * 0.12; }
    if (!G) { T['neck.z'] += this._tilt.z * idle; T['neck.y'] += this._tilt.y * idle; T['neck.x'] += this._tilt.x * idle; }

    // locomotion offsets (direct, not damped)
    if (A > 0.001) {
      const sn = Math.sin(ph), cs = Math.cos(ph);
      const hipAmp = lerp(0.42, 0.75, RA), kneeAmp = lerp(0.65, 1.25, RA);
      ad('hipL.x', -sn * hipAmp * A); ad('hipR.x', sn * hipAmp * A);
      ad('knL.x', (Math.max(0, cs) * kneeAmp + 0.1) * A); ad('knR.x', (Math.max(0, -cs) * kneeAmp + 0.1) * A);
      ad('anL.x', (-Math.max(0, cs) * 0.35 + sn * 0.15) * A); ad('anR.x', (-Math.max(0, -cs) * 0.35 - sn * 0.15) * A);
      ad('body.py', (Math.cos(2 * ph) * lerp(0.007, 0.018, RA) - lerp(0.004, 0.025, RA)) * A);
      ad('body.z', sn * 0.025 * A);
      T['spine.x'] += lerp(0.07, 0.24, RA) * A; ad('spine.y', sn * 0.08 * A);
      ad('neck.x', -lerp(0.05, 0.18, RA) * A);
      const armAmp = lerp(0.45, 0.85, RA);
      ad('shL.x', sn * armAmp * A); ad('shR.x', -sn * armAmp * A);
      T['elL.x'] += -lerp(0.15, 1.0, RA) * A; T['elR.x'] += -lerp(0.15, 1.0, RA) * A;
      ad('elL.x', -Math.max(0, -sn) * 0.3 * A); ad('elR.x', -Math.max(0, sn) * 0.3 * A);
    }

    // talking: little hand gestures + head bobs
    if (s.talking && !G) {
      const tk = 1 - A * 0.7;
      ad('neck.x', (Math.sin(t * 6.3) * 0.035 + Math.sin(t * 2.1) * 0.03) * tk);
      ad('neck.z', Math.sin(t * 1.3) * 0.05 * tk);
      T['shR.x'] += (-0.3 + Math.sin(t * 1.9) * 0.15) * tk; T['elR.x'] += (-0.55 + Math.sin(t * 2.7) * 0.25) * tk; T['wrR.y'] += -0.6 * tk; T.fcR = 0.25;
      T['shL.x'] += (-0.12 + Math.sin(t * 1.3 + 2) * 0.1) * tk; T['elL.x'] += (-0.3 + Math.sin(t * 2.2 + 1) * 0.18) * tk;
    }
    if (s.scanning && !G) { T['neck.z'] += Math.sin(t * 1.2) * 0.22; T['neck.y'] += Math.sin(t * 0.7) * 0.35; T['neck.x'] += 0.08; }

    // look
    const ly = clamp(s.lookYaw || 0, -1.4, 1.4), lp = clamp(s.lookPitch || 0, -0.7, 0.7);
    T['neck.y'] += ly * 0.78; T['spine.y'] += ly * 0.22; T['neck.x'] += -lp * 0.85; T['spine.x'] += -lp * 0.1;

    // gestures
    this._gw = lerp(this._gw, G ? 1 : 0, kDamp(6, dt));
    const gw = this._gw, ramp = sstep(0.15, 0.5, gt);
    if (G === 'wave') {
      T['shR.x'] = -0.25; T['shR.z'] = -1.2; T['shR.y'] = 0.2; T['elR.x'] = 0; T['elR.z'] = -1.45; T['wrR.y'] = 0.5; T.fcR = 0.08; T.fiR = 0.05; T.ftR = 0.05; T['neck.z'] = 0.12; T['spine.z'] = 0.04;
      ad('elR.z', Math.sin(gt * 9) * 0.38 * ramp);
    } else if (G === 'point') {
      T['shR.x'] = -1.42; T['shR.z'] = 0.05; T['elR.x'] = -0.08; T['wrR.y'] = -1.4; T.fcR = 1.5; T.fiR = 0.0; T.ftR = 0.9; T['spine.y'] = -0.15; T['neck.y'] = 0.1; T['shL.x'] = 0.1;
    } else if (G === 'shrug') {
      for (const [L, sd] of [['L', 1], ['R', -1]]) { T['sh' + L + '.py'] = 0.014 * Math.min(1, gt * 3) * (gt < 1.4 ? 1 : 0.4); T['sh' + L + '.z'] = sd * 0.42; T['sh' + L + '.x'] = -0.12; T['el' + L + '.x'] = -1.35; T['wr' + L + '.y'] = sd * 1.5; T['fc' + L] = 0.12; T['fi' + L] = 0.12; T['ft' + L] = 0.0; }
      T['neck.z'] = 0.2; T['neck.x'] = -0.06;
    } else if (G === 'nod') {
      ad('neck.x', (0.1 + Math.sin(gt * 9) * 0.22) * sstep(0, 0.15, gt) * (1 - sstep(1.2, 1.8, gt)));
    } else if (G === 'shake') {
      ad('neck.y', Math.sin(gt * 10) * 0.38 * sstep(0, 0.15, gt) * (1 - sstep(1.3, 1.9, gt)));
    } else if (G === 'slumped') {
      T['body.py'] = -0.395; T['body.x'] = 0; T['spine.x'] = -0.2; T['spine.z'] = 0.14; T['spine.y'] = 0.1;
      T['neck.x'] = 0.62; T['neck.z'] = 0.32; T['neck.y'] = -0.15;
      T['hipL.x'] = -1.42; T['hipR.x'] = -1.5; T['hipL.z'] = 0.2; T['hipR.z'] = -0.28; T['knL.x'] = 0.35; T['knR.x'] = 0.12; T['anL.x'] = 0.15; T['anR.x'] = 0.3;
      T['shL.x'] = 0.05; T['shL.z'] = 0.32; T['shR.x'] = -0.1; T['shR.z'] = -0.28; T['elL.x'] = -0.1; T['elR.x'] = -0.35; T['wrR.y'] = -0.4; T.fcR = 0.75; T.fcL = 0.75;
    } else if (G === 'hold') {
      T['shR.x'] = -0.55; T['shR.z'] = -0.12; T['elR.x'] = -1.05; T['wrR.y'] = -1.5; T['wrR.x'] = 0.15; T.fcR = 0.3; T.fiR = 0.3; T.ftR = 0.2; T['neck.x'] = 0.18; T['neck.y'] = -0.12;
    }
    // breathing / bob still applies a little when slumped; walking is suppressed by gesture 'slumped'
    if (G === 'slumped') { for (const k in add) if (!k.startsWith('body.py') && !k.startsWith('spine.x')) add[k] *= 0; }

    /* -------- apply -------- */
    const kk = kDamp(G ? 9 : 11, dt);
    for (const key in T) {
      const c = this.cur[key] === undefined ? T[key] : this.cur[key];
      this.cur[key] = c + (T[key] - c) * kk;
    }
    for (const key in this.J) {
      const j = this.J[key], v = (this.cur[key] || 0) + (add[key] || 0);
      if (j.k[0] === 'p') { const ax = j.k[1]; j.o.position[ax] = j.base[ax] + v; } else j.o.rotation[j.k] = v;
    }
    // hands
    for (const L of ['L', 'R']) {
      const a = this.arms[L], sd = L === 'L' ? 1 : -1;
      const fc = this.cur['fc' + L] + (add['fc' + L] || 0), fi = this.cur['fi' + L], ft = this.cur['ft' + L];
      a.fingers.forEach((f, i) => { const c = i === 0 ? fi : fc; f[0].rotation.z = -sd * c * 0.9; f[1].rotation.z = -sd * c * 1.1; });
      a.thumb[0].rotation.z = -sd * ft * 0.8; a.thumb[1].rotation.z = -sd * ft * 0.9;
    }
    // antennas: damped springs excited by head motion and steps
    const nyv = this._prevNy === undefined ? 0 : (this.neck.rotation.y - this._prevNy) / Math.max(dt, 1e-4); this._prevNy = this.neck.rotation.y;
    const by = this.body.position.y, bv = this._prevBy === undefined ? 0 : (by - this._prevBy) / Math.max(dt, 1e-4); this._prevBy = by;
    const bacc = this._prevBv === undefined ? 0 : (bv - this._prevBv) / Math.max(dt, 1e-4); this._prevBv = bv;
    for (const an of this._ant) {
      const tgtA = Math.sin(t * 1.7 + an.ph) * 0.035, tgtB = Math.sin(t * 1.3 + an.ph * 2) * 0.03;
      const fa = -90 * (an.a - tgtA) - 6 * an.v - nyv * 6, fb = -90 * (an.b - tgtB) - 6 * an.bv + clamp(bacc, -40, 40) * 0.08;
      an.v += fa * dt; an.a += an.v * dt; an.bv += fb * dt; an.b += an.bv * dt;
      an.a = clamp(an.a, -0.5, 0.5); an.b = clamp(an.b, -0.5, 0.5);
      an.o.rotation.z = (an.z0 || 0) + an.a; an.o.rotation.x = (an.x0 || 0) + an.b;
    }
    // treads
    const dummy = this._dummy || (this._dummy = new THREE.Object3D());
    for (const im of this._tracks) {
      for (let i = 0; i < TRACK.n; i++) {
        const p = this._trackFn(i / TRACK.n + this._tread / 0.4);
        dummy.position.set(0, p.y, p.z); dummy.rotation.set(Math.atan2(-p.ty, p.tz), 0, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    this._updateFace(dt, s);
  }

  _updateFace(dt, s) {
    const t = this._t;
    let ex = this._face;
    if (s.scanning) ex = 'scan';
    const talking = !!s.talking || ex === 'talk';
    // blink
    this._nextBlink -= dt;
    if (this._nextBlink <= 0) { this._blinkT = 0; this._nextBlink = 2 + Math.random() * 3.5; if (Math.random() < 0.15) this._nextBlink = 0.25; }
    let blink = 0; if (this._blinkT !== undefined) { this._blinkT += dt; const b = this._blinkT / 0.14; blink = b < 1 ? Math.sin(b * Math.PI) : 0; if (b >= 1) this._blinkT = undefined; }
    if (ex === 'scan' || ex === 'off' || ex === 'glitch') blink = 0;
    // mouth: syllable-like envelope
    const m = talking ? sat(0.15 + 0.85 * Math.abs(Math.sin(t * 11.3) * Math.sin(t * 4.1 + 1.2)) + (Math.sin(t * 23) > 0.7 ? 0.2 : 0)) : 0;
    this._mouth = lerp(this._mouth, m, kDamp(25, dt));
    const lx = clamp((s.lookYaw || 0) * 0.6, -1, 1), lyy = clamp((s.lookPitch || 0) * 0.8 + (ex === 'thinking' ? 0.8 : 0), -1, 1);
    const st = { expr: ex, blink, talking, mouth: this._mouth, lx: ex === 'thinking' ? 0.5 : lx, ly: lyy, t, jx: Math.sin(t * 37), jy: Math.cos(t * 41), gseed: Math.floor(t * 14), gbase: 'neutral' };
    const key = [ex, blink.toFixed(2), talking, this._mouth.toFixed(2), lx.toFixed(2), lyy.toFixed(2), (ex === 'scan' || ex === 'thinking' || ex === 'scared' || ex === 'glitch') ? t.toFixed(2) : ''].join('|');
    if (key !== this._faceKey) { this._faceKey = key; drawFace(this._fctx, st); this._ftex.needsUpdate = true; }
    // glitch flicker
    this._faceMesh.material.color.setScalar(ex === 'glitch' ? (Math.random() < 0.15 ? 0.3 : 2.4) : 2.4);
    this._faceMesh.visible = ex !== 'off';
  }
}

/** the torn-off left forearm + hand, lying on the floor (damaged look) */
export function buildLooseForearm() {
  const g = new THREE.Group(); g.name = 'GuideForearm';
  const holder = new THREE.Group(); g.add(holder);
  const add = (geo, mk, p) => { const m = new THREE.Mesh(geo, getMats(true)[mk]); m.userData.mk = mk; m.castShadow = m.receiveShadow = true; p.add(m); return m; };
  const fa = buildForearm(1, add, 'loose');
  holder.add(fa.fore);
  const w = buildWires(add, 13, 6, 0.07, new THREE.Vector3(0, 1, 0)); w.group.position.y = -0.06; fa.fore.add(w.group);
  // pose: fingers half curled, lying on its side
  fa.fingers.forEach((f, i) => { f[0].rotation.z = -(0.5 + i * 0.15); f[1].rotation.z = -0.7; });
  fa.thumb[0].rotation.z = -0.3;
  fa.wrist.rotation.set(0.2, 0, -0.25);
  holder.rotation.set(0, 0.5, Math.PI / 2 + 0.06);
  holder.rotateX(-0.6);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(holder); holder.position.y -= b.min.y - 0.001; holder.position.x -= (b.min.x + b.max.x) / 2; holder.position.z -= (b.min.z + b.max.z) / 2;
  g.userData.sparkPoints = w.tips;
  return g;
}

/* =====================================================================
   lineup
   ===================================================================== */
function guideEntry(name, opts = {}) {
  return {
    name, make: () => {
      const m = new GuideModel({ damaged: !!opts.damaged });
      if (opts.face) m.setFace(opts.face);
      m.root.userData.model = m;
      m.root.userData.update = (dt, st) => {
        const anim = st.anim || 'idle';
        const sp = st.speed || 0;
        m.update(dt, { speed: opts.gesture ? 0 : sp, talking: anim === 'talk' || !!opts.talk, scanning: !!opts.scan, gesture: opts.gesture || null, gestureT: st.t || 0, lookYaw: opts.lookYaw || 0, lookPitch: opts.lookPitch || 0 });
      };
      if (opts.rotY) m.root.rotation.y = opts.rotY;
      return m.root;
    },
  };
}
function facesEntry() {
  return {
    name: 'faces', make: () => {
      const g = new THREE.Group(); const models = [];
      const ex = ['happy', 'neutral', 'curious', 'sad', 'scared', 'thinking', 'scan', 'talk', 'glitch', 'off'];
      ex.forEach((e, i) => {
        const m = new GuideModel(); m.setFace(e); const h = m.head; h.removeFromParent();
        h.position.set((i % 5 - 2) * 0.42, 0.16 + (i < 5 ? 0.36 : 0), 0); g.add(h); models.push(m);
      });
      // one damaged (cracked) head
      g.userData.update = (dt, st) => { for (const m of models) m.update(dt, { talking: m._face === 'talk' }); };
      return g;
    },
  };
}
/** visible triangle count of an object (debug) */
export function triCount(obj) {
  let n = 0;
  obj.traverseVisible(o => { if (o.isMesh) { const g = o.geometry, c = g.index ? g.index.count / 3 : g.attributes.position.count / 3; n += c * (o.isInstancedMesh ? o.count : 1); } });
  return Math.round(n);
}
const statsEntry = {
  name: 'stats', make: () => {
    const a = new GuideModel(), b = new GuideModel({ damaged: true });
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:20px;left:10px;color:#fff;font:16px monospace;z-index:9';
    d.textContent = `guide repaired ${triCount(a.root)} tris, damaged ${triCount(b.root)} tris, forearm ${triCount(buildLooseForearm())}`;
    const by = {}; a.root.traverseVisible(o => { if (o.isMesh) { const g = o.geometry, c = (g.index ? g.index.count / 3 : g.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1); const k = g.type + ':' + o.userData.mk; by[k] = (by[k] || 0) + c; } });
    d.style.whiteSpace = 'pre'; d.textContent += '\n' + Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 25).map(e => e[0] + ' ' + Math.round(e[1])).join('\n');
    document.body.appendChild(d);
    return a.root;
  },
};
export const LINEUP = [
  guideEntry('repaired'),
  guideEntry('damaged', { damaged: true, gesture: 'slumped' }),
  { name: 'forearm', make: () => buildLooseForearm() },
  guideEntry('damaged_stand', { damaged: true }),
  guideEntry('wave', { gesture: 'wave' }),
  guideEntry('point', { gesture: 'point', face: 'curious' }),
  guideEntry('shrug', { gesture: 'shrug', face: 'thinking' }),
  guideEntry('hold', { gesture: 'hold', face: 'neutral' }),
  guideEntry('nod', { gesture: 'nod' }),
  guideEntry('talk', { talk: true }),
  guideEntry('scan', { scan: true }),
  facesEntry(),
];
if (typeof location !== 'undefined' && /[?&]only=[^&]*stats/.test(location.search)) LINEUP.push(statsEntry);
