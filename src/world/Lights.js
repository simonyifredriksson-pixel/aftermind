/* Lights.js - the light pool.

   The city has hundreds of lamps, signs and emergency lights, but a forward
   renderer can only afford a handful of real lights. Every lamp registers
   here; each frame the brightest few near the camera (in zones that are
   being drawn) are handed one of the pooled PointLights, faded in and out so
   nothing pops. Lamps far away still glow through their emissive fixtures
   and the bloom.

   A light can belong to a power circuit (game.power[circuit]); flicker makes
   it stutter like a failing tube; dead lights stay dark. */
import * as THREE from '../../lib/three.module.js';

export class Lights {
  constructor(game, n = 8) {
    this.g = game; this.list = []; this.pool = []; this.t = 0;
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 2);
      L.userData.entry = null; L.userData.level = 0;
      game.scene.add(L); this.pool.push(L);
    }
  }
  add(e) {
    e.level = 0; e.seed = Math.random() * 100; e.mult = 1;
    this.list.push(e); return e;
  }
  /** current brightness factor 0..1 of an entry (power, flicker, scripted dimming) */
  factor(e, t) {
    if (!e.on) return 0;
    if (e.power && !this.g.power[e.power]) return 0;
    let f = e.mult;
    if (e.flicker > 0) {
      const s = Math.sin(t * 13.1 + e.seed) * Math.sin(t * 7.3 + e.seed * 2) + Math.sin(t * 31 + e.seed * 3) * 0.3;
      const cut = Math.sin(t * 0.7 + e.seed) > 1 - e.flicker * 0.9 ? (s > 0 ? 0.05 : 1) : 1;
      f *= cut * (1 - e.flicker * 0.25 + 0.25 * e.flicker * Math.sin(t * 50 + e.seed));
    }
    if (this.g.director && this.g.director.blackout > 0) f *= 1 - this.g.director.blackout;
    return Math.max(0, f);
  }
  update(dt, cam) {
    this.t += dt;
    const t = this.t, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    // score candidates
    const cand = [];
    for (const e of this.list) {
      if (!e.zone.visible) continue;
      const d2 = (e.x - cx) ** 2 + (e.y - cy) ** 2 * 2 + (e.z - cz) ** 2;
      if (d2 > (e.distance + 22) ** 2) continue;
      const f = this.factor(e, t);
      e.cur = f;
      if (f <= 0.01 && !e.assigned) continue;
      e.score = e.intensity * e.distance * (0.3 + f) / (d2 + 4);
      cand.push(e);
    }
    cand.sort((a, b) => b.score - a.score);
    const want = new Set(cand.slice(0, this.pool.length));
    // release lights whose entry is no longer wanted (after fading out)
    for (const L of this.pool) {
      const e = L.userData.entry;
      if (e && !want.has(e)) { L.userData.level = Math.max(0, L.userData.level - dt * 3); if (L.userData.level <= 0) { e.assigned = false; L.userData.entry = null; } }
    }
    for (const e of want) {
      if (e.assigned) continue;
      const free = this.pool.find(L => !L.userData.entry);
      if (!free) break;
      free.userData.entry = e; e.assigned = true; free.userData.level = 0;
      free.position.set(e.x, e.y, e.z); free.color.copy(e.color); free.distance = e.distance;
    }
    for (const L of this.pool) {
      const e = L.userData.entry;
      // never toggle .visible: a change in the light count recompiles every shader
      if (!e) { L.intensity = 0; continue; }
      if (want.has(e)) L.userData.level = Math.min(1, L.userData.level + dt * 2.5);
      L.position.set(e.x, e.y, e.z);
      L.intensity = e.intensity * (e.cur ?? 1) * L.userData.level;
    }
  }
}
