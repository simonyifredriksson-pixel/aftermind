/* Director.js - the horror director. Local to each player: everyone gets
   their own scares, at their own pace.

   It does not throw monsters at you. It plays the space: metal scraping
   somewhere ahead, footsteps behind that stop when you turn, a whisper of
   machine talk in a vent, a phone ringing in an empty flat, the lights
   stuttering - or a figure standing at the far end of a corridor that is
   gone when the lights come back. And sometimes it takes all the sound
   away. Events are rationed by a budget that refills slowly, by cooldowns
   per kind, and never fire while you are already being hunted. */
import * as THREE from '../../lib/three.module.js';
import { enemyModel } from '../art/Art.js';

const KINDS = {
  scrape:     { w: 3, cool: 50, cost: 1 },
  footsteps:  { w: 2, cool: 80, cost: 1.5, dark: true },
  whisper:    { w: 2, cool: 70, cost: 1 },
  flicker:    { w: 3, cool: 35, cost: 0.7 },
  blackout:   { w: 1, cool: 150, cost: 2.5, dark: true },
  silhouette: { w: 1.2, cool: 160, cost: 3, dark: true },
  bang:       { w: 2, cool: 60, cost: 0.6 },
  radio:      { w: 1.5, cool: 90, cost: 0.8 },
  silence:    { w: 1, cool: 140, cost: 1 },
};

export class Director {
  constructor(game) {
    this.g = game; this.budget = 1; this.cool = {}; this.t = 0; this.next = 25; this.enabled = true;
    this.blackout = 0; this.lightFail = 0; this.staticAmt = 0; this.tension = 0; this.silence = 0;
    this.fig = null; this._v = new THREE.Vector3();
  }
  onZone(z) { this.next = Math.max(this.next, 12); }
  update(dt) {
    const g = this.g, z = g.zone;
    this.t += dt;
    this.blackout = Math.max(0, this.blackout - dt * (this._boHold > 0 ? 0 : 0.6)); this._boHold = (this._boHold || 0) - dt;
    this.staticAmt = Math.max(0, this.staticAmt - dt * 1.5);
    this.silence = Math.max(0, this.silence - dt * (this._siHold > 0 ? 0 : 0.25)); this._siHold = (this._siHold || 0) - dt;
    this._figure(dt);
    const lvl = z?.horror ?? 0;
    this.tension += ((lvl * 0.35) - this.tension) * Math.min(1, dt * 0.2);
    if (!this.enabled || !lvl || g.phase !== 'play' || g.enemies.danger > 0.3 || g.story.cineOn) return;
    this.budget = Math.min(4, this.budget + dt * 0.012 * lvl);
    this.next -= dt;
    if (this.next > 0) return;
    this.next = 18 + Math.random() * 30 / lvl;
    const dark = !z.outdoor;
    const opts = Object.entries(KINDS).filter(([k, o]) => (this.cool[k] || -1e9) < this.t - o.cool && o.cost <= this.budget && (!o.dark || dark) && !(z.noScare || []).includes(k));
    if (!opts.length) return;
    let tot = opts.reduce((s, [, o]) => s + o.w, 0), r = Math.random() * tot, pick = opts[0][0];
    for (const [k, o] of opts) { r -= o.w; if (r <= 0) { pick = k; break; } }
    if (this.fire(pick)) { this.cool[pick] = this.t; this.budget -= KINDS[pick].cost; }
  }
  /** a point some distance ahead/behind the player, preferring nav nodes */
  _spot(ahead, dmin, dmax) {
    const g = this.g, p = g.player, f = p.forward(this._v).setY(0).normalize();
    let best = null, bs = -1e9;
    g.nav.nearby(p.pos.x, p.pos.z, n => {
      if (Math.abs(n.y - p.pos.y) > 1.5) return;
      const dx = n.x - p.pos.x, dz = n.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < dmin || d > dmax) return;
      const dot = (dx * f.x + dz * f.z) / d;
      const s = (ahead ? dot : -dot) + Math.random() * 0.3;
      if (s > bs) { bs = s; best = n; }
    }, 3);
    return best ? new THREE.Vector3(best.x, best.y, best.z) : null;
  }
  fire(k) {
    const g = this.g, a = g.audio, p = g.player;
    switch (k) {
      case 'scrape': { const s = this._spot(true, 9, 22); if (!s) return false; a.metalScrape?.(s); return true; }
      case 'footsteps': { const s = this._spot(false, 5, 12); if (!s) return false; a.footstepsFake?.(s); return true; }
      case 'whisper': { const s = this._spot(true, 4, 14) || p.pos; a.whisperMachine?.(s); this.staticAmt = 0.25; return true; }
      case 'bang': a.distantBang?.(); return true;
      case 'radio': a.radioStatic?.(null, 1.4); this.staticAmt = 0.4; return true;
      case 'flicker': this.flicker(2.5); return true;
      case 'blackout': this.doBlackout(3 + Math.random() * 3); return true;
      case 'silence': this.silence = 1; this._siHold = 7; return true;
      case 'silhouette': return this.silhouette();
    }
    return false;
  }
  flicker(dur) {
    const g = this.g, p = g.player.pos;
    for (const e of g.lights.list) {
      if (!e.zone.visible || Math.hypot(e.x - p.x, e.z - p.z) > 18) continue;
      const old = e.flicker; e.flicker = Math.max(old, 0.95); setTimeout(() => { e.flicker = old; }, dur * 1000);
    }
    g.audio.flicker?.();
  }
  doBlackout(dur) { this.blackout = 1; this._boHold = dur; this.g.audio.powerDown?.(); setTimeout(() => this.g.audio.powerUp?.(), dur * 1000 + 300); }
  /** a figure at the far end of the corridor, gone when the lights come back */
  silhouette() {
    const g = this.g;
    if (this.fig) return false;
    const s = this._spot(true, 12, 24);
    if (!s || !g.phys.clear(g.camera.position.x, g.camera.position.y, g.camera.position.z, s.x, s.y + 1.6, s.z)) return false;
    const m = enemyModel('stalker');
    m.root.position.copy(s); m.root.rotation.y = Math.atan2(g.player.pos.x - s.x, g.player.pos.z - s.z);
    m.update?.(0.016, { anim: 'idle', speed: 0, t: 0, lit: 1, alert: 0 }); m.setEyes?.(0xff3020, 1.5);
    g.scene.add(m.root);
    this.fig = { m, t: 0, seen: 0 };
    return true;
  }
  _figure(dt) {
    const f = this.fig; if (!f) return;
    const g = this.g; f.t += dt;
    const c = this._v.copy(f.m.root.position); c.y += 1.6;
    const seen = (() => { const v = c.clone().project(g.camera); return v.z < 1 && Math.abs(v.x) < 0.7 && Math.abs(v.y) < 0.8; })();
    if (seen) f.seen += dt;
    if (f.seen > 0.7 && !f.flick) { f.flick = true; this.flicker(1.2); g.audio.stinger?.('dread'); setTimeout(() => { if (this.fig === f) this._dropFig(); }, 500); }
    const d = g.player.pos.distanceTo(f.m.root.position);
    if (d < 7 || f.t > 25 || g.player.litAmount(c) > 0.5) { if (!f.flick) { f.flick = true; this.flicker(0.6); setTimeout(() => this._dropFig(), 250); } }
  }
  _dropFig() { if (!this.fig) return; this.g.scene.remove(this.fig.m.root); this.fig = null; }
  onLightning() { if (this.g.zone?.horror && Math.random() < 0.3) this.next = Math.min(this.next, 4); }
}
