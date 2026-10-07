/* PlayerArt.js - the survivor avatar that co-op partners see.

   A 1.78 m adult in a hooded waterproof jacket, cargo pants, boots and
   gloves, scarf pulled up over the mouth, a pack with a rolled blanket and a
   swinging lantern, and a flashlight clipped to the chest strap. Clothing is
   lathe/rounded-box geometry with painted fabric textures (ripstop nylon,
   twill, leather, knit) whose colour comes from the chosen LOOK.

   Rig: root > body > pelvis > hipL/R > kneeL/R > ankleL/R
                           > spine > shL/R > elL/R > wrL/R > hand (fingers)
                                   > neck > head (hood, scarf, face)
   Faces +Z, feet at y = 0. Character's LEFT is +X. */
import * as THREE from '../../lib/three.module.js';
import { Glow } from '../core/Textures.js';
import { fbm, fbm2, rnd, hash2, texFromArrays, lathe, latheRaw, rbox, ribTube, uvScale } from './GuideArt.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sat = v => clamp(v, 0, 1);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const kDamp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const LOOKS = [
  { name: 'Ranger', jacket: 0x55663f, pants: 0x6a5a44, accent: 0xd9772b },
  { name: 'Rescue', jacket: 0x9a2c24, pants: 0x393c41, accent: 0xe3c23b },
  { name: 'Arctic', jacket: 0x3c5d80, pants: 0x2a303c, accent: 0x52b8cc },
  { name: 'Scavenger', jacket: 0xa3832f, pants: 0x4c5244, accent: 0xb8392f },
];

/* ---------------- fabric textures (neutral, tinted by material colour) ---------------- */
const TEX = {};
function fabricTex(kind) {
  if (TEX[kind]) return TEX[kind];
  const N = kind === 'skin' ? 256 : 512, s = { nylon: 3, twill: 7, leather: 11, knit: 13, skin: 17, canvas: 19 }[kind] || 1;
  const col = new Float32Array(N * N * 3), rm = new Float32Array(N * N * 2), h = new Float32Array(N * N);
  const dirtC = [0.42, 0.34, 0.26];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const n = fbm(u, v, 4, 4, s), fine = fbm(u, v, 64, 2, s + 1), wr = fbm2(u, v, 3, 9, 4, s + 2), wr2 = fbm2(u, v, 7, 2, 3, s + 5);
    const dirt = sstep(0.5, 0.85, fbm(u, v, 3, 5, s + 3)), mud = sstep(0.62, 0.7, fbm(u, v, 6, 4, s + 4)) * (1 - v * 0.6);
    let k = 0.84 + n * 0.12 + (fine - 0.5) * 0.06 + (wr - 0.5) * 0.08, hg = (wr * 0.6 + wr2 * 0.4) * 0.45 + fine * 0.04, r = 0.8, m = 0;
    if (kind === 'nylon') {
      hg = wr * 0.35 + fine * 0.03; r = 0.42 + n * 0.15 + dirt * 0.3;
      const wet = sstep(0.55, 0.7, fbm2(u, v, 6, 1, 3, s + 9)); r = lerp(r, 0.18, wet * 0.6);
    } else if (kind === 'twill' || kind === 'canvas') {
      const d = ((x + y) % 6) < 3 ? 1 : 0; k *= 0.94 + d * 0.06; hg += d * 0.12; r = 0.88;
      const wear = sstep(0.62, 0.75, fbm(u, v, 5, 4, s + 6)); k = lerp(k, 1.08, wear * 0.4);
    } else if (kind === 'leather') {
      const gr = fbm(u, v, 48, 3, s + 7), cr = sstep(0.58, 0.6, fbm2(u, v, 3, 14, 3, s + 8)); k *= 0.85 + gr * 0.2 - cr * 0.15; hg = gr * 0.4 - cr * 0.5 + wr * 0.3; r = 0.5 + gr * 0.2 + dirt * 0.25;
      const scuff = sstep(0.68, 0.74, fbm(u, v, 8, 4, s + 10)); k = lerp(k, 1.3, scuff * 0.5); r = lerp(r, 0.8, scuff);
    } else if (kind === 'knit') {
      const rib = Math.abs(Math.sin(u * TAU * 64)), st = Math.abs(Math.sin(v * TAU * 96 + (Math.floor(u * 64) % 2) * 1.5));
      k *= 0.8 + rib * 0.15 + st * 0.08; hg = rib * 0.6 + st * 0.3 + n * 0.2; r = 0.95;
    } else if (kind === 'skin') {
      const mott = fbm(u, v, 12, 4, s + 11), pore = hash2(x, y, 5) > 0.97 ? 1 : 0;
      k = 0.93 + mott * 0.1 - pore * 0.04; hg = mott * 0.1 - pore * 0.2; r = 0.5 + mott * 0.15;
    }
    const dd = kind === 'skin' ? dirt * 0.1 : dirt * 0.25 + mud * 0.28;
    col[i * 3] = lerp(k, dirtC[0], dd); col[i * 3 + 1] = lerp(k, dirtC[1], dd); col[i * 3 + 2] = lerp(k, dirtC[2], dd);
    if (kind === 'skin') { col[i * 3] *= 1; col[i * 3 + 1] *= 0.97; col[i * 3 + 2] *= 0.95; }
    rm[i * 2] = clamp(r + mud * 0.2, 0, 1); rm[i * 2 + 1] = m; h[i] = hg;
  }
  return (TEX[kind] = texFromArrays(N, col, rm, h, kind === 'knit' ? 3 : 2));
}
function fabricMat(kind, color, o = {}) {
  const t = fabricTex(kind);
  const m = new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.rmMap, normalMap: t.normalMap, color, roughness: 1, metalness: 0, side: o.side || THREE.FrontSide });
  m.normalScale.set(o.ns ?? 0.8, o.ns ?? 0.8); return m;
}
function plaidTex() {
  if (TEX.plaid) return TEX.plaid;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#7a2a22'; g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 0.55; g.fillStyle = '#1a1a1a';
  for (let i = 0; i < 256; i += 64) { g.fillRect(i, 0, 28, 256); g.fillRect(0, i, 256, 28); }
  g.globalAlpha = 0.4; g.fillStyle = '#d8c79a'; for (let i = 40; i < 256; i += 64) { g.fillRect(i, 0, 4, 256); g.fillRect(0, i, 256, 4); }
  g.globalAlpha = 0.15; for (let i = 0; i < 4000; i++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return (TEX.plaid = t);
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const M = {};
  M.skin = fabricMat('skin', 0xb98a74, { ns: 0.3 });
  M.lip = new THREE.MeshStandardMaterial({ color: 0x8a5a4a, roughness: 0.6 });
  M.eyeW = new THREE.MeshStandardMaterial({ color: 0xcfc8c0, roughness: 0.25 });
  M.iris = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.15 });
  M.hair = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.8 });
  M.glove = fabricMat('leather', 0x2a2724, { ns: 0.6 });
  M.boot = fabricMat('leather', 0x4a3626, { ns: 0.8 });
  M.sole = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  M.pack = fabricMat('canvas', 0x4b4a40);
  M.packDark = fabricMat('canvas', 0x2c2c2a);
  M.strap = fabricMat('twill', 0x26272a);
  M.blanket = new THREE.MeshStandardMaterial({ map: plaidTex(), roughness: 0.95 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.35, metalness: 1 });
  M.metalDark = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.45, metalness: 0.8 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.5 });
  M.lanternGreen = new THREE.MeshStandardMaterial({ color: 0x2f4a36, roughness: 0.5, metalness: 0.6 });
  M.lanternGlass = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
  M.flame = Glow(0xffa548, 3.0);
  M.lensOff = new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.05, metalness: 0.6 });
  M.lensOn = Glow(0xfff4dc, 4.0);
  M.prodGlow = Glow(0x5fd8ff, 3.0);
  SHARED = M; return M;
}

/* flat webbing strap following points; out(p) gives the outward normal */
function strapGeo(pts, w, t, out) {
  const c = new THREE.CatmullRomCurve3(pts), n = 40, pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = c.getPointAt(i / n), T = c.getTangentAt(i / n), N = out(p).normalize(), S = new THREE.Vector3().crossVectors(T, N).normalize();
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = p.clone().addScaledVector(S, a * w / 2).addScaledVector(N, b * t / 2); pos.push(q.x, q.y, q.z); }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c2 = a + 4, d = b + 4; idx.push(a, c2, b, b, c2, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const uv = []; for (let i = 0; i <= n; i++) for (let k = 0; k < 4; k++) uv.push(k / 4, i / n * 6); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}

const THIGH = 0.43, SHIN = 0.415, ANKLE_H = 0.085, HIP_Y = 0.93;

export class SurvivorModel {
  constructor(look = 0) {
    this.root = new THREE.Group(); this.root.name = 'Survivor';
    this.J = {}; this.cur = {}; this._t = Math.random() * 10; this._ph = 0;
    this._walkA = 0; this._runA = 0; this._crA = 0; this._deadA = 0; this._tool = 'none';
    this._lan = { a: 0, v: 0, b: 0, bv: 0 };
    const S = shared();
    this.M = { jacket: fabricMat('nylon', 0xffffff), jacketIn: fabricMat('nylon', 0xffffff, { side: THREE.DoubleSide }), pants: fabricMat('twill', 0xffffff), accent: fabricMat('nylon', 0xffffff), scarf: fabricMat('knit', 0xffffff) };
    this.M.accentGlossy = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    this.S = S;
    this._build();
    this.setLook(look);
    this.update(0.001, {});
  }
  _add(geo, mat, parent) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  _joint(name, obj, keys) { for (const k of keys) this.J[name + '.' + k] = { o: obj, k, base: obj.position.clone() }; }

  _build() {
    const S = this.S, M = this.M, add = (g, m, p) => this._add(g, m, p);
    const body = this.body = new THREE.Group(); this.root.add(body); this._joint('body', body, ['x', 'y', 'z', 'py', 'pz']);
    /* pelvis (pants + belt) */
    const pelvis = new THREE.Group(); pelvis.position.y = 0.95; body.add(pelvis);
    const pg = new THREE.Group(); pg.scale.z = 0.68; pelvis.add(pg);
    add(uvScale(lathe([[0, -0.11], [0.11, -0.1], [0.155, -0.06], [0.165, 0.0], [0.162, 0.08], [0.15, 0.12], [0, 0.125]], 28, 12), 3, 1), M.pants, pg);
    add(latheRaw([[0.163, 0.055], [0.169, 0.058], [0.17, 0.088], [0.164, 0.092]], 32), S.strap, pg);
    add(rbox(0.05, 0.04, 0.014, 0.005).translate(0, 0.073, 0.118), S.metal, pelvis);
    add(rbox(0.07, 0.09, 0.05, 0.015).translate(-0.12, 0.03, 0.07).rotateY(-0.5), S.pack, pelvis); // belt pouch
    /* legs */
    this.legs = {};
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      const hip = new THREE.Group(); hip.position.set(s * 0.095, HIP_Y - 0.95, 0); pelvis.add(hip); this._joint('hip' + L, hip, ['x', 'z']);
      const tg = new THREE.Group(); tg.scale.z = 0.95; hip.add(tg);
      add(uvScale(lathe([[0, -0.45], [0.06, -0.445], [0.068, -0.36], [0.078, -0.22], [0.088, -0.09], [0.09, -0.01], [0.07, 0.04], [0, 0.05]], 22, 12), 2, 2), M.pants, tg);
      // cargo pocket on the outer thigh
      const pk = add(rbox(0.035, 0.13, 0.11, 0.014).translate(s * 0.078, -0.2, 0.0), M.pants, hip);
      add(rbox(0.038, 0.035, 0.115, 0.01).translate(s * 0.08, -0.142, 0.0), M.pants, hip);
      const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee); this._joint('kn' + L, knee, ['x']);
      add(new THREE.SphereGeometry(0.063, 14, 10).scale(1, 1.1, 1), M.pants, knee);
      add(rbox(0.085, 0.09, 0.03, 0.012).translate(0, -0.01, 0.058), M.pants, knee); // knee patch
      add(uvScale(lathe([[0, -0.36], [0.058, -0.355], [0.062, -0.27], [0.067, -0.17], [0.064, -0.07], [0.061, 0.0], [0, 0.03]], 20, 10), 2, 2), M.pants, knee);
      const ankle = new THREE.Group(); ankle.position.y = -SHIN; knee.add(ankle); this._joint('an' + L, ankle, ['x']);
      // boot: shaft, foot, sole, laces
      add(latheRaw([[0.06, -0.02], [0.065, 0.04], [0.068, 0.1], [0.072, 0.135], [0.074, 0.15], [0.068, 0.155]], 20), S.boot, ankle);
      add(rbox(0.105, 0.085, 0.27, 0.036).translate(0, -0.035, 0.05), S.boot, ankle);
      add(rbox(0.112, 0.026, 0.282, 0.011).translate(0, -0.072, 0.05), S.sole, ankle);
      for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.05, 0.004, 0.006).translate(0, 0.005 + (i < 3 ? 0 : (i - 2) * 0.03), 0.07 + (i < 3 ? i * 0.025 - 0.0 : 0.0)).rotateX(i < 3 ? -0.35 : 0), S.strap, ankle);
      this.legs[L] = { hip, knee, ankle };
    }
    /* spine + jacket */
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.07; pelvis.add(spine); this._joint('spine', spine, ['x', 'y', 'z']);
    const jg = new THREE.Group(); jg.scale.z = 0.6; spine.add(jg);
    const jp = [[0.172, -0.2], [0.18, -0.16], [0.172, -0.06], [0.168, 0.04], [0.185, 0.18], [0.2, 0.3], [0.205, 0.37], [0.195, 0.42], [0.15, 0.465], [0.09, 0.49], [0.07, 0.5]];
    add(uvScale(lathe(jp, 32, 20), 3, 2), M.jacketIn, jg);
    add(latheRaw([[0.165, -0.215], [0.183, -0.2], [0.186, -0.185], [0.179, -0.18]], 32), M.jacket, jg); // hem band
    // zipper + storm flap, chest pockets, reflective/accent stripe
    const zf = new THREE.CatmullRomCurve3([[0, -0.2], [0, 0.0], [0, 0.18], [0, 0.32], [0, 0.42], [0, 0.48]].map(([x, y]) => { const r = this._jr(jp, y); return new THREE.Vector3(0.012, y, r * 0.6 + 0.004); }));
    add(ribTube(zf, 0.006, 30, 5), M.jacket, spine);
    for (const s of [1, -1]) {
      const p = new THREE.Vector3(s * 0.085, 0.27, 0); p.z = Math.sqrt(Math.max(0, this._jr(jp, 0.27) ** 2 - p.x ** 2)) * 0.6;
      const pm = add(rbox(0.095, 0.11, 0.022, 0.01), M.jacket, spine); pm.position.copy(p); pm.rotation.y = s * 0.45;
      const fl = add(rbox(0.1, 0.035, 0.026, 0.008), M.accent, spine); fl.position.copy(p).add(new THREE.Vector3(0, 0.045, 0.004)); fl.rotation.y = s * 0.45;
    }
    { const band = latheRaw([[0.187, 0.2], [0.19, 0.205], [0.192, 0.225], [0.189, 0.23]].map(([r, y]) => [r + 0.003, y]), 34); band.scale(1, 1, 0.6); add(band, M.accent, spine); }
    // collar
    add(latheRaw([[0.072, 0.47], [0.085, 0.48], [0.092, 0.52], [0.09, 0.56], [0.08, 0.565]], 24).scale(1, 1, 0.9), M.jacketIn, spine);
    /* backpack */
    const pack = new THREE.Group(); pack.position.set(0, 0.2, -0.2); spine.add(pack); this.pack = pack;
    add(rbox(0.3, 0.42, 0.16, 0.055, 3), S.pack, pack);
    add(rbox(0.31, 0.09, 0.18, 0.035), S.packDark, pack).position.set(0, 0.2, -0.004);
    add(rbox(0.22, 0.17, 0.06, 0.025), S.pack, pack).position.set(0, -0.07, -0.095);
    add(rbox(0.2, 0.03, 0.065, 0.01), S.packDark, pack).position.set(0, 0.015, -0.098);
    for (const s of [1, -1]) {
      add(rbox(0.06, 0.18, 0.11, 0.022), S.pack, pack).position.set(s * 0.17, -0.08, 0);
      add(new THREE.BoxGeometry(0.022, 0.4, 0.004).translate(s * 0.09, 0, -0.082), S.strap, pack);
      add(new THREE.BoxGeometry(0.03, 0.024, 0.01).translate(s * 0.09, 0.08, -0.084), S.metalDark, pack);
    }
    // rolled blanket
    const bl = new THREE.Group(); bl.position.set(0, 0.29, 0.0); pack.add(bl);
    add(new THREE.CylinderGeometry(0.068, 0.068, 0.38, 22, 1).rotateZ(Math.PI / 2), S.blanket, bl);
    for (const s of [1, -1]) { add(new THREE.CircleGeometry(0.066, 22).rotateY(s * Math.PI / 2).translate(s * 0.191, 0, 0), S.blanket, bl); add(new THREE.TorusGeometry(0.07, 0.007, 4, 22).rotateY(Math.PI / 2).translate(s * 0.11, 0, 0), S.strap, bl); }
    // hanging lantern (right side of the pack)
    const hook = new THREE.Group(); hook.position.set(-0.2, -0.0, 0.0); pack.add(hook); this.lantern = hook;
    add(new THREE.TorusGeometry(0.014, 0.003, 4, 12).rotateY(Math.PI / 2), S.metal, hook);
    const lan = new THREE.Group(); lan.position.y = -0.03; hook.add(lan);
    add(new THREE.TorusGeometry(0.045, 0.0025, 4, 16, Math.PI).translate(0, -0.05, 0), S.metal, lan);
    add(new THREE.CylinderGeometry(0.02, 0.042, 0.03, 14).translate(0, -0.06, 0), S.lanternGreen, lan);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 14, 1, true).translate(0, -0.115, 0), S.lanternGlass, lan);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.08, 4).translate(Math.cos(a) * 0.033, -0.115, Math.sin(a) * 0.033), S.metalDark, lan); }
    this._flame = add(new THREE.SphereGeometry(0.009, 8, 6).scale(1, 1.8, 1).translate(0, -0.115, 0), S.flame, lan);
    add(new THREE.CylinderGeometry(0.044, 0.04, 0.03, 14).translate(0, -0.168, 0), S.lanternGreen, lan);
    this._lanG = lan;
    // shoulder straps + sternum strap
    const out = p => new THREE.Vector3(p.x, 0, p.z / 0.36);
    for (const s of [1, -1]) {
      const pts = [new THREE.Vector3(s * 0.08, 0.38, -0.13), new THREE.Vector3(s * 0.11, 0.47, -0.05), new THREE.Vector3(s * 0.115, 0.44, 0.07), new THREE.Vector3(s * 0.11, 0.33, 0.123), new THREE.Vector3(s * 0.13, 0.17, 0.115), new THREE.Vector3(s * 0.175, 0.06, 0.06), new THREE.Vector3(s * 0.15, 0.04, -0.11)];
      add(strapGeo(pts, 0.05, 0.012, p => (p.y > 0.44 ? new THREE.Vector3(0, 1, 0) : out(p))), S.strap, spine);
    }
    add(new THREE.BoxGeometry(0.2, 0.02, 0.008).translate(0, 0.3, 0.128), S.strap, spine);
    add(rbox(0.04, 0.03, 0.014, 0.006).translate(0, 0.3, 0.133), M.accentGlossy, spine);
    // chest flashlight on the left strap
    const fl = new THREE.Group(); fl.position.set(0.11, 0.36, 0.14); fl.rotation.x = 0.05; spine.add(fl); this._chestLight = fl;
    add(rbox(0.04, 0.05, 0.016, 0.006).translate(0, 0, -0.006), S.plastic, fl);
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.075, 16).rotateX(Math.PI / 2).translate(0, 0, 0.03), S.metalDark, fl);
    add(new THREE.CylinderGeometry(0.021, 0.016, 0.03, 16).rotateX(Math.PI / 2).translate(0, 0, 0.078), S.metalDark, fl);
    this._lensChest = add(new THREE.CircleGeometry(0.018, 16).translate(0, 0, 0.0935), S.lensOff, fl);
    this._anchorChest = new THREE.Object3D(); this._anchorChest.position.z = 0.095; fl.add(this._anchorChest);
    /* arms */
    this.arms = {};
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      const sh = new THREE.Group(); sh.position.set(s * 0.19, 0.42, -0.005); spine.add(sh); this._joint('sh' + L, sh, ['x', 'y', 'z']);
      add(new THREE.SphereGeometry(0.06, 16, 12).scale(1, 0.9, 1.05).translate(-s * 0.008, -0.01, 0), M.jacket, sh);
      add(uvScale(lathe([[0, -0.305], [0.047, -0.3], [0.051, -0.24], [0.055, -0.12], [0.057, -0.04], [0.055, 0.0], [0, 0.04]], 20, 12), 2, 2), M.jacket, sh);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el); this._joint('el' + L, el, ['x']);
      add(new THREE.SphereGeometry(0.05, 12, 10), M.jacket, el);
      add(uvScale(lathe([[0, -0.255], [0.045, -0.25], [0.051, -0.2], [0.055, -0.12], [0.052, -0.04], [0, 0.0]], 20, 10), 2, 2), M.jacket, el);
      add(latheRaw([[0.042, -0.272], [0.05, -0.268], [0.053, -0.25], [0.051, -0.232], [0.045, -0.228]], 20), M.accent, el);
      const wr = new THREE.Group(); wr.position.y = -0.27; el.add(wr); this._joint('wr' + L, wr, ['x', 'y', 'z']);
      const hand = new THREE.Group(); wr.add(hand);
      add(new THREE.CylinderGeometry(0.036, 0.04, 0.04, 14).translate(0, 0.0, 0), S.glove, hand);
      add(rbox(0.036, 0.09, 0.082, 0.016).translate(0, -0.055, 0.004), S.glove, hand);
      const fingers = [], fseg1 = new THREE.CapsuleGeometry(0.0105, 0.03, 2, 7).translate(0, -0.022, 0), fseg2 = new THREE.CapsuleGeometry(0.0098, 0.024, 2, 7).translate(0, -0.017, 0);
      for (const z of [0.031, 0.011, -0.009, -0.028]) {
        const f1 = new THREE.Group(); f1.position.set(0, -0.096, z); hand.add(f1); add(fseg1, S.glove, f1);
        const f2 = new THREE.Group(); f2.position.y = -0.045; f1.add(f2); add(fseg2, S.glove, f2);
        fingers.push([f1, f2]);
      }
      const th = new THREE.Group(); th.position.set(-s * 0.012, -0.03, 0.04); th.rotation.x = -0.7; hand.add(th); add(fseg1, S.glove, th);
      const th2 = new THREE.Group(); th2.position.y = -0.04; th.add(th2); add(fseg2, S.glove, th2);
      this.arms[L] = { sh, el, wr, hand, fingers, thumb: [th, th2] };
    }
    /* tools (in the right hand, local +Z = forward when the arm is in its tool pose) */
    const hR = this.arms.R.hand, mk = (rx) => { const g = new THREE.Group(); g.position.set(0, -0.06, 0.0); g.rotation.x = rx; g.visible = false; hR.add(g); return g; };
    this.tools = {};
    { // handheld flashlight
      const g = mk(1.45); this.tools.flashlight = g;
      add(new THREE.CylinderGeometry(0.017, 0.017, 0.2, 16).rotateX(Math.PI / 2).translate(0, 0, 0.02), S.metalDark, g);
      add(new THREE.CylinderGeometry(0.026, 0.018, 0.045, 16).rotateX(Math.PI / 2).translate(0, 0, 0.14), S.metalDark, g);
      this._lensHand = add(new THREE.CircleGeometry(0.023, 16).translate(0, 0, 0.1626), S.lensOff, g);
      this._anchorHand = new THREE.Object3D(); this._anchorHand.position.z = 0.165; g.add(this._anchorHand);
    }
    { // camera
      const g = mk(2.4); g.position.set(-0.03, -0.07, 0.02); this.tools.camera = g;
      add(rbox(0.12, 0.08, 0.06, 0.012), S.plastic, g).position.set(0.05, 0.0, 0.0);
      add(new THREE.CylinderGeometry(0.026, 0.028, 0.05, 18).rotateX(Math.PI / 2).translate(0.05, -0.004, 0.05), S.metalDark, g);
      add(new THREE.CircleGeometry(0.02, 18).translate(0.05, -0.004, 0.0752), S.lensOff, g);
      add(rbox(0.03, 0.02, 0.03, 0.005).translate(0.08, 0.05, -0.005), S.plastic, g);
      add(new THREE.SphereGeometry(0.005, 6, 4).translate(0.015, 0.03, 0.03), Glow(0xff3020, 3), g);
    }
    { // electric prod
      const g = mk(1.45); this.tools.prod = g;
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 12).rotateX(Math.PI / 2).translate(0, 0, -0.02), S.sole, g);
      add(new THREE.CylinderGeometry(0.011, 0.011, 0.55, 10).rotateX(Math.PI / 2).translate(0, 0, 0.37), S.metal, g);
      add(rbox(0.05, 0.03, 0.06, 0.008).translate(0, 0.02, 0.1), M.accentGlossy, g);
      for (const x of [-0.012, 0.012]) { add(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 6).rotateX(Math.PI / 2).translate(x, 0, 0.665), S.metal, g); add(new THREE.SphereGeometry(0.006, 8, 6).translate(x, 0, 0.69), S.prodGlow, g); }
    }
    /* neck + head */
    const neck = this.neck = new THREE.Group(); neck.position.y = 0.49; spine.add(neck); this._joint('neck', neck, ['x', 'y', 'z']);
    add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 14).translate(0, 0.05, 0), S.skin, neck);
    const head = this._head = new THREE.Group(); head.position.y = 0.13; neck.add(head);
    add(new THREE.SphereGeometry(0.1, 28, 20).scale(0.88, 1.08, 0.98), S.skin, head);
    // face: brow ridge, eyes with lids, nose bridge (the scarf covers the rest)
    add(new THREE.CapsuleGeometry(0.012, 0.062, 3, 10).rotateZ(Math.PI / 2).scale(1, 0.7, 0.8).translate(0, 0.03, 0.086), S.skin, head);
    for (const s of [1, -1]) {
      add(new THREE.SphereGeometry(0.0118, 12, 10).translate(s * 0.031, 0.012, 0.08), S.eyeW, head);
      add(new THREE.SphereGeometry(0.0058, 10, 8).translate(s * 0.031, 0.012, 0.0913), S.iris, head);
      add(new THREE.CapsuleGeometry(0.0038, 0.026, 2, 6).rotateZ(Math.PI / 2 + s * 0.1).translate(s * 0.032, 0.035, 0.095), S.hair, head);
      add(new THREE.SphereGeometry(0.0124, 12, 6, 0, TAU, 0, Math.PI / 2).rotateX(-0.2).scale(1.05, 0.6, 1).translate(s * 0.031, 0.0165, 0.0805), S.skin, head); // upper lid
      add(new THREE.SphereGeometry(0.0124, 12, 6, 0, TAU, Math.PI / 2, Math.PI / 2).rotateX(0.25).scale(1.05, 0.4, 1).translate(s * 0.031, 0.008, 0.0805), S.skin, head); // lower lid
    }
    add(rbox(0.017, 0.042, 0.03, 0.008).rotateX(-0.32).translate(0, -0.006, 0.094), S.skin, head);
    // scarf / face mask pulled up over the nose, wrapped round the neck
    add(uvScale(latheRaw([[0.078, -0.25], [0.085, -0.2], [0.09, -0.15], [0.098, -0.1], [0.103, -0.06], [0.104, -0.03], [0.1, -0.012], [0.094, -0.004], [0.086, -0.001]], 26).scale(1, 1, 1.08), 3, 1), M.scarf, head);
    add(new THREE.TorusGeometry(0.096, 0.013, 6, 26).rotateX(Math.PI / 2).scale(1, 1, 1.08).translate(0, -0.2, 0.004), M.scarf, head);
    // hood: a shell around the head with an oval opening for the face, plus a hemmed rim
    const hood = new THREE.Group(); hood.position.set(0, 0.012, -0.01); head.add(hood);
    const HR = 0.13, HS = [0.93, 1.0, 1.0], oc = -0.012, ow = 0.064, oh = 0.07;
    const hg = new THREE.SphereGeometry(HR, 34, 24, 0, TAU, 0, Math.PI * 0.8); hg.scale(...HS);
    const hood2 = (() => {
      const g = hg.toNonIndexed(), P = g.attributes.position, keep = [];
      for (let i = 0; i < P.count; i += 3) { let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += P.getX(i + k) / 3; cy += P.getY(i + k) / 3; cz += P.getZ(i + k) / 3; } if (!(cz > 0 && Math.hypot(cx / ow, (cy - oc) / oh) < 1)) keep.push(i); }
      const o = new THREE.BufferGeometry(); for (const nm of ['position', 'normal', 'uv']) { const a = g.attributes[nm], arr = new Float32Array(keep.length * 3 * a.itemSize); keep.forEach((i, j) => arr.set(a.array.subarray(i * a.itemSize, (i + 3) * a.itemSize), j * 3 * a.itemSize)); o.setAttribute(nm, new THREE.BufferAttribute(arr, a.itemSize)); }
      return uvScale(o, 3, 2);
    })();
    add(hood2, M.jacketIn, hood);
    const rimPts = []; for (let i = 0; i < 48; i++) { const a = i / 48 * TAU, x = Math.cos(a) * ow * 1.02, y = oc + Math.sin(a) * oh * 1.02; const z = Math.sqrt(Math.max(0, 1 - (x / (HR * HS[0])) ** 2 - (y / HR) ** 2)) * HR; rimPts.push(new THREE.Vector3(x, y, z)); }
    add(ribTube(new THREE.CatmullRomCurve3(rimPts, true), 0.0095, 64, 6), M.jacket, hood);
    const rimPts2 = rimPts.map(p => { const x = p.x * 1.16, y = oc + (p.y - oc) * 1.13; return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, 1 - (x / (HR * HS[0])) ** 2 - (y / HR) ** 2)) * HR + 0.001); });
    add(ribTube(new THREE.CatmullRomCurve3(rimPts2, true), 0.0035, 64, 4), M.accent, hood);
    // hair fringe under the hood at the forehead
    add(new THREE.SphereGeometry(0.1, 16, 6, Math.PI / 2 - 0.75, 1.5, 0.42, 0.42).scale(0.9, 1.08, 1.0).translate(0, 0.004, 0.002), S.hair, head);
  }
  _jr(jp, y) { // jacket radius at height y (piecewise linear over the control points)
    for (let i = 0; i < jp.length - 1; i++) if (y >= jp[i][1] && y <= jp[i + 1][1]) return lerp(jp[i][0], jp[i + 1][0], (y - jp[i][1]) / (jp[i + 1][1] - jp[i][1]));
    return jp[jp.length - 1][0];
  }

  setLook(i) {
    const L = LOOKS[((i % LOOKS.length) + LOOKS.length) % LOOKS.length]; this.look = L;
    this.M.jacket.color.setHex(L.jacket); this.M.jacketIn.color.setHex(L.jacket); this.M.pants.color.setHex(L.pants); this.M.accent.color.setHex(L.accent); this.M.accentGlossy.color.setHex(L.accent);
    const sc = new THREE.Color(L.pants).lerp(new THREE.Color(0x777068), 0.55); this.M.scarf.color.copy(sc);
  }
  get flashlightAnchor() { return this._tool === 'flashlight' ? this._anchorHand : this._anchorChest; }
  get head() { return this._head; }

  update(dt, s = {}) {
    dt = Math.min(dt || 0, 0.1); this._t += dt; const t = this._t;
    const speed = s.dead ? 0 : (s.speed || 0), pitch = clamp(s.pitch || 0, -1.2, 1.2), tool = s.tool || 'none';
    this._tool = tool;
    for (const k in this.tools) this.tools[k].visible = k === tool;
    const lightOn = !!s.flashlight;
    this._lensChest.material = lightOn && tool !== 'flashlight' ? this.S.lensOn : this.S.lensOff;
    this._lensHand.material = lightOn && tool === 'flashlight' ? this.S.lensOn : this.S.lensOff;
    this._flame.scale.setScalar(0.85 + Math.sin(t * 23) * 0.08 + Math.sin(t * 37) * 0.06);

    this._walkA = lerp(this._walkA, clamp(speed / 1.4, 0, 1), kDamp(6, dt));
    this._runA = lerp(this._runA, (s.sprint && speed > 1.5) || speed > 4 ? 1 : sstep(2.6, 4.5, speed), kDamp(5, dt));
    this._crA = lerp(this._crA, s.crouch ? 1 : 0, kDamp(7, dt));
    this._deadA = lerp(this._deadA, s.dead ? 1 : 0, kDamp(s.dead ? 3.5 : 5, dt));
    const A = this._walkA, RA = this._runA, CA = this._crA, DA = this._deadA;
    const cycle = lerp(lerp(1.5, 2.5, RA), 1.0, CA);
    this._ph += dt * (speed / cycle) * TAU; const ph = this._ph, sn = Math.sin(ph), cs = Math.cos(ph);

    const T = {}, add = {}; const ad = (k, v) => { add[k] = (add[k] || 0) + v; };
    for (const k in this.J) T[k] = 0;
    T['shL.z'] = 0.1; T['shR.z'] = -0.1; T['shL.x'] = 0.05; T['shR.x'] = 0.05; T['elL.x'] = -0.22; T['elR.x'] = -0.22;
    T.fcL = 0.55; T.fcR = 0.55; T.thL = 0.4; T.thR = 0.4;

    /* legs: analytic two-bone IK for the pelvis height, then the gait on top */
    const drop = CA * 0.36 + RA * 0.04 * A, pz = -CA * 0.1;
    T['body.pz'] = pz;
    const D = Math.min(HIP_Y - drop - ANKLE_H, THIGH + SHIN - 0.002), dzF = -pz * 0.6 + CA * 0.06;
    const Dl = Math.hypot(D, dzF), beta = Math.atan2(dzF, D);
    const th = Math.acos(clamp((THIGH * THIGH + Dl * Dl - SHIN * SHIN) / (2 * THIGH * Dl), -1, 1));
    const kb = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - Dl * Dl) / (2 * THIGH * SHIN), -1, 1));
    T['body.py'] = -drop;
    for (const L of ['L', 'R']) { T['hip' + L + '.x'] = -(th + beta); T['kn' + L + '.x'] = kb; T['an' + L + '.x'] = th + beta - kb; }
    T['hipL.z'] = 0.03 + CA * 0.08; T['hipR.z'] = -0.03 - CA * 0.08;
    T['spine.x'] = CA * 0.38 + RA * 0.18 * A + A * 0.04;
    if (A > 0.001) {
      const hipAmp = lerp(lerp(0.42, 0.75, RA), 0.35, CA), kneeAmp = lerp(lerp(0.6, 1.25, RA), 0.5, CA);
      const hl = -sn * hipAmp * A, hr = sn * hipAmp * A, kl = Math.max(0, cs) * kneeAmp * A + 0.06 * A, kr = Math.max(0, -cs) * kneeAmp * A + 0.06 * A;
      ad('hipL.x', hl); ad('hipR.x', hr); ad('knL.x', kl); ad('knR.x', kr);
      ad('anL.x', -(hl + kl) * 0.85 + Math.max(0, -sn) * 0.15 * A); ad('anR.x', -(hr + kr) * 0.85 + Math.max(0, sn) * 0.15 * A);
      ad('body.py', (Math.cos(2 * ph) * lerp(0.012, 0.03, RA) - lerp(0.008, 0.03, RA)) * A);
      ad('body.z', sn * 0.02 * A); ad('spine.y', sn * lerp(0.1, 0.16, RA) * A); ad('neck.y', -sn * lerp(0.08, 0.12, RA) * A);
      const armAmp = lerp(0.4, 0.9, RA) * (1 - CA * 0.5);
      ad('shL.x', sn * armAmp * A); ad('shR.x', -sn * armAmp * A);
      T['elL.x'] += -lerp(0.1, 1.2, RA) * A; T['elR.x'] += -lerp(0.1, 1.2, RA) * A;
    }
    // breathing idle
    ad('spine.x', Math.sin(t * 1.7) * 0.012); ad('shL.z', Math.sin(t * 1.7) * 0.01); ad('shR.z', -Math.sin(t * 1.7) * 0.01);
    // look pitch: head + upper body
    T['neck.x'] += -pitch * 0.6 - T['spine.x'] * 0.7; T['spine.x'] += -pitch * 0.3;
    /* tool arm poses (override the swing on the busy arm) */
    const toolArm = (L, sx, sz, ex, wx, wy) => { T['sh' + L + '.x'] = sx; T['sh' + L + '.z'] = sz; T['el' + L + '.x'] = ex; T['wr' + L + '.x'] = wx || 0; T['wr' + L + '.y'] = wy || 0; add['sh' + L + '.x'] = 0; };
    const pc = pitch * 0.7;
    if (tool === 'flashlight') { toolArm('R', -1.2 - pc, -0.12, -0.25, 0); T.fcR = 1.35; T.thR = 1.0; }
    else if (tool === 'camera') { toolArm('R', -0.95 - pc, 0.32, -1.45, 0); toolArm('L', -0.95 - pc, -0.3, -1.45, 0, 0.3); T.fcR = 1.1; T.fcL = 0.8; T.thR = 0.6; }
    else if (tool === 'prod') { toolArm('R', -0.45 - pc * 0.6, -0.15, -1.0, 0); toolArm('L', -0.85 - pc * 0.6, -0.42, -0.85, 0, 0.4); T.fcR = 1.35; T.thR = 1.0; T.fcL = 1.0; }
    // hurt flinch
    if (s.hurtT !== undefined && s.hurtT !== null && s.hurtT >= 0 && s.hurtT < 0.6) {
      const e = Math.sin(clamp(s.hurtT / 0.6, 0, 1) * Math.PI) * (1 - s.hurtT / 0.6 * 0.5);
      ad('spine.x', -0.3 * e); ad('neck.x', -0.25 * e); ad('spine.z', 0.12 * e); ad('shL.z', 0.3 * e); ad('shR.z', -0.3 * e); ad('elL.x', -0.6 * e); ad('elR.x', -0.6 * e);
    }
    // dead: fall onto the back, limbs slack
    if (DA > 0.001) {
      for (const k in T) if (k.startsWith('hip') || k.startsWith('kn') || k.startsWith('an') || k.startsWith('spine') || k.startsWith('neck')) T[k] *= 1 - DA;
      for (const k in add) add[k] *= 1 - DA;
      // the body group pivots at the feet, so lying flat means lifting it by the back's thickness and sliding it forward
      T['body.x'] = -Math.PI / 2 * DA; T['body.py'] = lerp(T['body.py'], 0.13, DA * DA); T['body.pz'] = lerp(T['body.pz'], 0.8, DA);
      T['shL.z'] = lerp(T['shL.z'], 1.1, DA); T['shR.z'] = lerp(T['shR.z'], -1.2, DA); T['shL.x'] = lerp(T['shL.x'], -0.3, DA); T['shR.x'] = lerp(T['shR.x'], 0.2, DA); T['elL.x'] = lerp(T['elL.x'], -0.5, DA); T['elR.x'] = lerp(T['elR.x'], -0.2, DA);
      T['neck.y'] = 0.5 * DA; T['neck.x'] = -0.15 * DA; T['kn' + 'L.x'] = 0.4 * DA; T['hipL.x'] = -0.2 * DA; T['hipR.z'] = -0.15 * DA; T['hipL.z'] = 0.12 * DA;
      T.fcL = T.fcR = 0.5;
    }

    const kk = kDamp(10, dt);
    for (const key in T) { const c = this.cur[key] === undefined ? T[key] : this.cur[key]; this.cur[key] = c + (T[key] - c) * kk; }
    for (const key in this.J) {
      const j = this.J[key], v = (this.cur[key] || 0) + (add[key] || 0);
      if (j.k[0] === 'p') { const ax = j.k[1]; j.o.position[ax] = j.base[ax] + v; } else j.o.rotation[j.k] = v;
    }
    for (const L of ['L', 'R']) {
      const a = this.arms[L], sd = L === 'L' ? 1 : -1, fc = this.cur['fc' + L], tc = this.cur['th' + L];
      a.fingers.forEach(f => { f[0].rotation.z = -sd * fc * 0.85; f[1].rotation.z = -sd * fc * 1.0; });
      a.thumb[0].rotation.z = -sd * tc * 0.6; a.thumb[1].rotation.z = -sd * tc * 0.5;
    }
    // lantern pendulum, excited by body motion
    const lz = this._lan, bacc = A * Math.sin(2 * ph) * lerp(3, 9, RA);
    const fa = -60 * lz.a - 2.2 * lz.v + bacc * 0.6 + Math.sin(ph) * A * 2.0, fb = -60 * lz.b - 2.2 * lz.bv - A * 6 * (0.3 + RA) + Math.cos(ph * 2) * A * 3;
    lz.v += fa * dt; lz.a += lz.v * dt; lz.bv += fb * dt; lz.b += lz.bv * dt;
    this._lanG.rotation.z = clamp(lz.a, -0.7, 0.7); this._lanG.rotation.x = clamp(lz.b, -0.7, 0.7) + (this.spine.rotation.x + (this.body.rotation.x || 0)) * -1;
  }
}

/* ---------------- lineup ---------------- */
function entry(name, look, st = {}) {
  return {
    name, make: () => {
      const m = new SurvivorModel(look);
      m.root.userData.model = m;
      m.root.userData.update = (dt, state) => {
        const anim = state.anim || 'idle';
        const sp = st.speed !== undefined ? st.speed : (anim === 'run' ? 5 : anim === 'walk' ? 1.4 : 0);
        m.update(dt, { speed: sp, sprint: anim === 'run' || !!st.sprint, crouch: !!st.crouch, pitch: st.pitch || 0, flashlight: st.flashlight !== undefined ? st.flashlight : true, tool: st.tool || 'none', hurtT: st.hurt ? (state.t % 1.2) : null, dead: !!st.dead });
      };
      return m.root;
    },
  };
}
export const LINEUP = [
  entry('ranger', 0),
  entry('rescue', 1, { tool: 'flashlight' }),
  entry('arctic', 2, { tool: 'camera' }),
  entry('scav', 3, { tool: 'prod' }),
  entry('crouch', 0, { crouch: true, tool: 'flashlight', pitch: -0.2 }),
  entry('lookup', 1, { pitch: 0.6, tool: 'flashlight' }),
  entry('hurt', 2, { hurt: true }),
  entry('dead', 3, { dead: true, flashlight: false }),
  // close-up helpers: sunk into the floor so the lineup camera frames the head
  ...[0, 1, 2, 3].map(i => ({ name: 'portrait' + i, make: () => { const o = entry('p', i, { flashlight: false }).make(); o.position.y = -0.8; return o; } })),
];
if (typeof location !== 'undefined' && /[?&]only=[^&]*stats/.test(location.search)) {
  LINEUP.push({ name: 'stats', make: () => {
    const m = new SurvivorModel(0); let n = 0;
    m.root.traverse(o => { if (o.isMesh && (o.visible || o.parent === m.tools.prod)) { const g = o.geometry; n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } });
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:20px;left:10px;color:#fff;font:16px monospace'; d.textContent = 'survivor ' + Math.round(n) + ' tris (incl. all tools)'; document.body.appendChild(d);
    return m.root;
  } });
}
