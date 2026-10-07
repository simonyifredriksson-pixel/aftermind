/* Enemies.js - the infected machines.

   Host-simulated; clients see snapshots and animate. Every machine has the
   same skeleton of a mind:
     idle/patrol -> investigate (heard or glimpsed something)
                 -> hunt (has seen a player) -> attack
                 -> search (lost them: go to the last place, look around)
                 -> back to its post
   and each type bends it:
     scout       never fights; watches, shrieks (calling everything near), flees
     crawler     swarms; a hit on one alerts its nest
     hunter      fast; lunges, and overshoots if you step aside
     stalker     only moves when no light is on it; watches first; grabs
     dog         nearly blind, hears everything (running is a bell)
     sentinel    patrols with a real searchlight; armoured in front; shoots
     medic       glides at you murmuring; its injections sedate
     construction  charges in straight lines
     heavy       three cannon rounds, then it must vent its core
     unknown     watches, and is gone before you reach it

   Weak points come from the model (EnemyArt). Hitting one triples damage
   once GUIDE has the machine in the Field Log - knowledge is a weapon. */
import * as THREE from '../../lib/three.module.js';
import { enemyModel } from '../art/Art.js';
import { MACHINES } from '../data/Machines.js';
import { damp, dampAngle, wrapAngle, clamp } from '../core/Util.js';

const T = {
  scout:        { hp: 30,  r: 0.3,  h: 0.5, walk: 2.5, run: 5.5, sight: 26, fov: 0.35, hear: 0.5, fly: 2.4, loot: [['sensor', 1], ['circuit', 1]] },
  crawler:      { hp: 32,  r: 0.35, h: 0.5, walk: 1.6, run: 4.2, sight: 11, fov: -0.2, hear: 1.0, dmg: 7, reach: 1.1, wind: 0.35, cool: 0.9, loot: [['cell', 1], ['wire', 1]] },
  hunter:       { hp: 150, r: 0.45, h: 1.9, walk: 1.8, run: 6.6, sight: 30, fov: 0.25, hear: 1.0, dmg: 22, reach: 1.7, wind: 0.45, cool: 1.3, lunge: true, loot: [['hydraulic', 1], ['servo', 1]] },
  stalker:      { hp: 170, r: 0.4,  h: 2.5, walk: 1.2, run: 5.0, sight: 22, fov: -1, hear: 0.6, dmg: 34, reach: 1.6, wind: 0.6, cool: 3, loot: [['core', 1], ['sensor', 1]] },
  dog:          { hp: 90,  r: 0.45, h: 0.9, walk: 2.2, run: 7.2, sight: 9, fov: 0.2, hear: 2.4, dmg: 17, reach: 1.4, wind: 0.3, cool: 1.1, loot: [['servo', 1], ['circuit', 1]] },
  sentinel:     { hp: 420, r: 0.7,  h: 2.6, walk: 1.4, run: 2.7, sight: 24, fov: 0.6, hear: 0.7, dmg: 26, reach: 2.2, wind: 0.8, cool: 2.0, armour: 0.25, ranged: { dmg: 13, speed: 22, every: 1.6 }, loot: [['plate', 2], ['cell', 1]] },
  medic:        { hp: 120, r: 0.5,  h: 1.8, walk: 1.5, run: 2.4, sight: 15, fov: 0.0, hear: 1.0, dmg: 9, reach: 1.6, wind: 0.6, cool: 1.8, sedate: true, loot: [['coolant', 1], ['circuit', 1]] },
  construction: { hp: 650, r: 1.3,  h: 3.4, walk: 1.6, run: 5.2, sight: 26, fov: 0.4, hear: 0.8, dmg: 40, reach: 2.8, wind: 0.8, cool: 2.4, armour: 0.5, loot: [['hydraulic', 1], ['plate', 1], ['cell', 1]] },
  heavy:        { hp: 800, r: 1.1,  h: 3.0, walk: 1.2, run: 2.0, sight: 32, fov: 0.4, hear: 0.6, dmg: 35, reach: 2.4, wind: 0.9, cool: 2.5, armour: 0.2, ranged: { dmg: 28, speed: 16, every: 1.1, burst: 3, vent: 4.5, splash: 3 }, loot: [['core', 1], ['plate', 1], ['hydraulic', 1]] },
  unknown:      { hp: 1e9, r: 0.8, h: 2.2, walk: 0, run: 0, sight: 40, fov: -1, hear: 0, fly: 0.4 },
  foreman:      { hp: 1500, r: 2.6, h: 6, walk: 1.2, run: 2.2, sight: 60, fov: -1, hear: 1, dmg: 30, reach: 4.5, wind: 1.0, cool: 2.2, armour: 0.1 },
};
let NEXT = 1;

class Enemy {
  constructor(sys, type, x, y, z, o = {}) {
    this.sys = sys; this.g = sys.g; this.type = type; this.p = T[type]; this.id = o.id || type + NEXT++;
    this.o = o; this.home = new THREE.Vector3(x, y, z); this.homeYaw = o.yaw || 0;
    this.m = enemyModel(type); this.root = this.m.root; this.g.scene.add(this.root);
    this.root.traverse(c => { if (c.isMesh) { c.castShadow = true; } });
    this.body = { pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), r: this.p.r, h: this.p.h, grounded: true, ignore: 'enemy' };
    this.yaw = o.yaw || 0; this.hp = o.hp || this.p.hp; this.maxHp = this.hp;
    this.state = o.dormant ? 'dormant' : 'idle'; this.st = 0; this.anim = 'idle'; this.animT = 0; this.alert = 0;
    this.target = null; this.last = null; this.path = null; this.pathT = 0; this.pi = 0;
    this.patrol = o.patrol || null; this.pIdx = 0; this.atkT = 0; this.cool = 0; this.stun = 0; this.hurtT = 9;
    this.dead = false; this.lit = 0; this.aimYaw = 0; this.aimPitch = 0; this.seenT = 0; this.shots = 0; this.vent = 0;
    this.zone = o.zone || null; this.brain = o.brain || null;
    this.idleSnd = 3 + Math.random() * 6; this.stepT = 0;
    if (this.p.fly) this.body.pos.y = y + this.p.fly;
    this.m.setEyes?.(0xffa040, 2);
    if (type === 'sentinel') this._searchlight();
    this.root.visible = !o.hidden;
    this.hidden = !!o.hidden;
  }
  get pos() { return this.body.pos; }
  _searchlight() {
    const s = new THREE.SpotLight(0xfff4e0, 0, 26, 0.32, 0.5, 1.4);
    const eye = this.m.eyes?.[0] || this.root;
    eye.add(s); s.position.set(0, 0, 0.1); const tg = new THREE.Object3D(); tg.position.set(0, -0.6, 4); eye.add(tg); s.target = tg;
    this.spot = s;
    // a volumetric beam
    this.beam = { visible: true }; // the model (EnemyArt) draws its own volumetric beam
  }
  center(v = new THREE.Vector3()) { return v.set(this.pos.x, this.pos.y + this.p.h * 0.55, this.pos.z); }
  forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  setState(s) { if (this.state === s) return; this.state = s; this.st = 0; }

  /* ---------------- perception ---------------- */
  canSee(pl) {
    if (pl.down) return false;
    const p = this.p, e = this.center(), dx = pl.pos.x - e.x, dz = pl.pos.z - e.z, dy = pl.pos.y + (pl.eye || 1.6) * 0.8 - e.y, d = Math.hypot(dx, dy, dz);
    let range = p.sight * (pl.light ? 1.35 : 1) * (pl.crouch ? 0.6 : 1);
    if (this.type === 'sentinel') range = p.sight;
    if (d > range) return false;
    if (p.fov > -1 && d > 2.2) { const f = this.forward(), cos = (dx * f.x + dz * f.z) / Math.max(0.01, Math.hypot(dx, dz)); if (cos < p.fov) return false; }
    if (this.type === 'sentinel' && d > 4) { // only what the searchlight touches
      const f = this.forward(), cos = (dx * f.x + dz * f.z) / Math.max(0.01, Math.hypot(dx, dz)); if (cos < 0.9) return false;
    }
    return this.g.phys.clear(e.x, e.y, e.z, pl.pos.x, pl.pos.y + 1.4, pl.pos.z, b => b.tag !== 'enemy' && !b.glass);
  }
  heard(pos, r, who) {
    if (this.dead || this.state === 'dormant' || !this.p.hear || this.hidden) return;
    const d = this.pos.distanceTo(pos);
    if (d > r * this.p.hear) return;
    if (this.state === 'hunt' && this.target) return;
    this.last = pos.clone(); this.lastWho = who;
    if (this.state === 'idle' || this.state === 'patrol' || this.state === 'search' || this.state === 'return') { this.setState('investigate'); this.g.audio.enemy?.(this.type, 'idle', this.pos); }
  }

  /* ---------------- thinking ---------------- */
  update(dt) {
    const g = this.g, p = this.p;
    this.animT += dt; this.hurtT += dt; this.st += dt;
    if (this.dead) { this.anim = 'dead'; this._anim(dt); return; }
    if (this.hidden) return;
    if (this.stun > 0) { this.stun -= dt; this.anim = 'stunned'; this.body.vel.set(0, this.body.vel.y, 0); this._move(dt); this._anim(dt); if (this.stun <= 0) this.m.setEyes?.(0xff2a2a, 2.5); return; }
    if (this.state === 'dormant') { this.anim = 'idle'; this._anim(dt); return; }
    if (this.brain) { this.brain(this, dt); this._anim(dt); return; }
    // perception (a few times a second)
    this.perT = (this.perT || 0) - dt;
    if (this.perT <= 0) {
      this.perT = 0.15 + Math.random() * 0.1;
      let seen = null, sd = 1e9;
      for (const pl of g.allPlayers()) { if (this.canSee(pl)) { const d = pl.pos.distanceTo(this.pos); if (d < sd) { sd = d; seen = pl; } } }
      this.seen = seen;
      if (seen) { this.seenT += 0.2; this.last = seen.pos.clone(); this.target = seen.id; }
      else this.seenT = Math.max(0, this.seenT - 0.1);
    }
    const tp = this.target ? g.allPlayers().find(q => q.id === this.target) : null;
    if (tp && tp.down) { this.target = null; this.setState('search'); }
    // lit by a flashlight? (stalkers care very much)
    this.lit = 0;
    for (const pl of g.allPlayers()) { if (!pl.light) continue; const l = pl.local ? g.player.litAmount(this.center()) : remoteLit(pl, this, g); this.lit = Math.max(this.lit, l); }
    const fn = this['_' + this.type] || this._generic;
    fn.call(this, dt, tp);
    this._move(dt);
    this._anim(dt);
    // presence sounds
    this.idleSnd -= dt; if (this.idleSnd <= 0) { this.idleSnd = 4 + Math.random() * 7; g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'idle', { x: this.pos.x, y: this.pos.y, z: this.pos.z }] }); }
  }
  _generic(dt, tp) {
    const p = this.p;
    if (this.seen && this.state !== 'hunt' && this.state !== 'attack') {
      // a moment of recognition before the hunt (more for slow thinkers)
      if (this.seenT > (this.state === 'investigate' ? 0.15 : 0.45) || this.seen.pos.distanceTo(this.pos) < 4) this._spot(this.seen);
    }
    switch (this.state) {
      case 'idle':
        this.want = null;
        if (this.patrol && this.st > 2) this.setState('patrol');
        else if (!this.patrol && this.st > 4) this.yawTarget = this.homeYaw + Math.sin(this.g.time * 0.3 + this.home.x) * 0.9;
        break;
      case 'patrol': {
        const pt = this.patrol[this.pIdx]; const goal = new THREE.Vector3(pt[0], pt[1] ?? this.home.y, pt[2] ?? pt[1]);
        if (pt.length === 2) goal.set(pt[0], this.home.y, pt[1]);
        this.want = goal; this.speed = p.walk;
        if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 0.8) { this.pIdx = (this.pIdx + 1) % this.patrol.length; this.setState('idle'); this.st = 0.5; }
        break;
      }
      case 'investigate':
        this.want = this.last; this.speed = p.walk * 1.3;
        if (!this.last || this.pos.distanceTo(this.last) < 1.2 || this.st > 14) this.setState('search');
        break;
      case 'hunt': {
        if (!tp) { this.setState('search'); break; }
        const d = tp.pos.distanceTo(this.pos);
        this.want = this.seen ? tp.pos : this.last; this.speed = p.run;
        if (!this.seen && this.st > 0.5 && (!this.last || this.pos.distanceTo(this.last) < 1.5)) { this.setState('search'); this.g.guide.hostBark('lost_them', 40); break; }
        if (!this.seen) this.lostT = (this.lostT || 0) + dt; else this.lostT = 0;
        if (this.lostT > 9) { this.setState('search'); break; }
        if (p.ranged && this.seen && d > 5 && d < p.sight) this._shoot(dt, tp);
        if (p.lunge && this.seen && d > 2.6 && d < 5.5 && this.cool <= 0) { this.setState('lunge'); this.lungeDir = { x: (tp.pos.x - this.pos.x) / d, z: (tp.pos.z - this.pos.z) / d }; this.g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'attack', this.pos] }); break; }
        if (p.reach && d < p.reach && Math.abs(tp.pos.y - this.pos.y) < 1.6 && this.cool <= 0) { this.setState('attack'); this.atkT = 0; this.g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'attack', this.pos] }); }
        break;
      }
      case 'attack': {
        this.want = null; this.anim = 'attack';
        if (tp) this.yawTarget = Math.atan2(tp.pos.x - this.pos.x, tp.pos.z - this.pos.z);
        if (this.st >= p.wind && !this.struck) {
          this.struck = true;
          if (tp && tp.pos.distanceTo(this.pos) < p.reach + 0.5) this.sys.damagePlayer(tp, p.dmg, this, p.sedate ? 'sedate' : 'hit');
        }
        if (this.st > p.wind + 0.35) { this.struck = false; this.cool = p.cool; this.setState('hunt'); }
        break;
      }
      case 'lunge': {
        const k = this.st < 0.25 ? 0 : 1;
        this.want = null; this.anim = 'attack';
        this.body.vel.x = this.lungeDir.x * 11 * k; this.body.vel.z = this.lungeDir.z * 11 * k;
        this.yawTarget = Math.atan2(this.lungeDir.x, this.lungeDir.z);
        if (k && !this.struck && tp && tp.pos.distanceTo(this.pos) < 1.5) { this.struck = true; this.sys.damagePlayer(tp, p.dmg, this); }
        if (this.st > 0.75) { this.struck = false; this.cool = p.cool + 0.6; this.setState('recover'); }
        break;
      }
      case 'recover': this.want = null; this.body.vel.x *= 0.85; this.body.vel.z *= 0.85; if (this.st > 0.7) this.setState('hunt'); break;
      case 'search':
        this.speed = p.walk;
        if (this.st < 1 && this.last) this.want = this.last;
        else { if (!this.want || this.pos.distanceTo(this.want) < 1 || this.st % 4 < dt) { const a = Math.random() * 6.28; this.want = new THREE.Vector3(this.pos.x + Math.cos(a) * 4, this.pos.y, this.pos.z + Math.sin(a) * 4); } }
        if (this.st > 9) { this.setState('return'); this.target = null; this.m.setEyes?.(0xffa040, 2); }
        break;
      case 'return':
        this.want = this.home; this.speed = p.walk;
        if (this.pos.distanceTo(this.home) < 1.2) { this.setState(this.patrol ? 'patrol' : 'idle'); this.yawTarget = this.homeYaw; }
        break;
    }
    this.cool -= dt;
  }
  _spot(pl) {
    if (this.state === 'hunt') return;
    this.target = pl.id; this.last = pl.pos.clone(); this.setState('hunt');
    this.m.setEyes?.(0xff2a2a, 3);
    this.g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'alert', this.pos] });
    this.sys.onSpotted(this, pl);
    if (this.type === 'crawler') for (const e of this.sys.list) if (e !== this && e.type === 'crawler' && !e.dead && e.pos.distanceTo(this.pos) < 12 && e.state !== 'hunt') { e.target = pl.id; e.last = pl.pos.clone(); e.setState('hunt'); e.m.setEyes?.(0xff2a2a, 3); }
  }
  _shoot(dt, tp) {
    const r = this.p.ranged;
    if (this.type === 'heavy' && this.vent > 0) return;
    this.shotT = (this.shotT || r.every) - dt;
    if (this.shotT > 0) return;
    this.shotT = r.every * (0.8 + Math.random() * 0.4);
    const from = this.center(); from.y += this.p.h * 0.15;
    const to = new THREE.Vector3(tp.pos.x, tp.pos.y + 1.2, tp.pos.z);
    // lead the target a little, miss a little
    to.x += (Math.random() - 0.5) * 1.2; to.z += (Math.random() - 0.5) * 1.2;
    const v = to.sub(from).normalize().multiplyScalar(r.speed);
    this.sys.projectile(from, v, r.dmg, this, r.splash || 0, this.type === 'heavy' ? 'shell' : 'bolt');
    this.g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'special', this.pos] });
    if (r.burst) { this.shots++; if (this.shots >= r.burst) { this.shots = 0; this.vent = r.vent; this.g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'hurt', this.pos] }); } }
  }

  /* ---------------- the types ---------------- */
  _scout(dt, tp) {
    const g = this.g;
    if (this.o.script) return this.o.script(this, dt);
    if (this.state === 'flee') {
      this.want = this.fleeTo; this.speed = this.p.run;
      this.body.pos.y += dt * 1.5;
      if (this.st > 6) { this.hidden = true; this.root.visible = false; }
      return;
    }
    if (this.seen) {
      this.yawTarget = Math.atan2(this.seen.pos.x - this.pos.x, this.seen.pos.z - this.pos.z);
      const d = this.seen.pos.distanceTo(this.pos);
      if (d < 9) { this.want = this.pos.clone().add(this.pos.clone().sub(this.seen.pos).setY(0).normalize().multiplyScalar(3)); this.speed = this.p.run; }
      else this.want = null;
      if (this.seenT > 1.6 && !this.shrieked) { this.shriek(this.seen); }
    } else if (this.patrol) this._generic(dt, tp);
  }
  shriek(pl) {
    const g = this.g; this.shrieked = true; this.m.setEyes?.(0xff2020, 4);
    g.emit({ k: 'sfx', n: 'enemy', a: ['scout', 'alert', this.pos] });
    for (const e of this.sys.list) if (e !== this && !e.dead && e.type !== 'scout' && e.pos.distanceTo(this.pos) < 38 && e.state !== 'dormant' && !e.hidden) { e.last = pl.pos.clone(); e.target = pl.id; e.setState('investigate'); }
    this.setState('flee');
    const away = this.pos.clone().sub(pl.pos).setY(0).normalize();
    this.fleeTo = this.pos.clone().add(away.multiplyScalar(30));
  }
  _stalker(dt, tp) {
    const g = this.g, p = this.p;
    // frozen while a light is on it - and it remembers who did that
    if (this.lit > 0.45) {
      this.frozen = true; this.litT = (this.litT || 0) + dt; this.body.vel.x = this.body.vel.z = 0; this.want = null; this.anim = 'idle';
      if (this.litT > 3.5 && this.state !== 'retreat') { this.setState('retreat'); this.retreatTo = this._darkSpotAway(); }
      return;
    }
    this.frozen = false; this.litT = Math.max(0, (this.litT || 0) - dt * 0.5);
    let near = null, nd = 1e9;
    for (const pl of g.allPlayers()) { if (pl.down) continue; const d = pl.pos.distanceTo(this.pos); if (d < nd) { nd = d; near = pl; } }
    if (!near) return;
    this.target = near.id;
    if (this.state === 'retreat') {
      this.want = this.retreatTo; this.speed = p.run * 1.2;
      if (!this.retreatTo || this.pos.distanceTo(this.retreatTo) < 1.5 || this.st > 8) this.setState('watch');
      return;
    }
    const watched = g.allPlayers().some(pl => !pl.down && looksAt(pl, this, g) && pl.pos.distanceTo(this.pos) < 30);
    if (this.state === 'idle' || this.state === 'patrol' || this.state === 'investigate') this.setState('watch');
    if (this.state === 'watch') {
      // stand in the dark and look. Close in only when nobody is looking.
      this.yawTarget = Math.atan2(near.pos.x - this.pos.x, near.pos.z - this.pos.z);
      this.want = null;
      if (this.st > 6 + Math.random() * 4 && !watched) { this.setState('creep'); }
      return;
    }
    if (this.state === 'creep') {
      this.want = near.pos; this.speed = watched ? 0.0 : (nd > 8 ? p.run : 2.2);
      if (watched) this.anim = 'idle';
      if (nd < p.reach && this.cool <= 0) { this.setState('attack'); this.g.emit({ k: 'sfx', n: 'enemy', a: ['stalker', 'attack', this.pos] }); }
      if (nd < 7 && !this.stung) { this.stung = true; g.emit({ k: 'sfx', n: 'stinger', a: ['jump'] }); }
      return;
    }
    if (this.state === 'attack') {
      this.want = null; this.anim = 'attack';
      if (this.st > p.wind && !this.struck) { this.struck = true; if (nd < p.reach + 0.6) this.sys.damagePlayer(near, p.dmg, this); }
      if (this.st > p.wind + 0.4) { this.struck = false; this.stung = false; this.cool = p.cool; this.setState('retreat'); this.retreatTo = this._darkSpotAway(); }
    }
    this.cool -= dt;
  }
  _darkSpotAway() {
    const g = this.g; let best = null, bs = -1;
    g.nav.nearby(this.pos.x, this.pos.z, n => {
      if (Math.abs(n.y - this.pos.y) > 2) return;
      let dmin = 1e9; for (const pl of g.allPlayers()) dmin = Math.min(dmin, Math.hypot(pl.pos.x - n.x, pl.pos.z - n.z));
      const s = Math.min(dmin, 18) + (n.dark ? 6 : 0) - Math.hypot(n.x - this.pos.x, n.z - this.pos.z) * 0.2;
      if (s > bs) { bs = s; best = n; }
    }, 3);
    return best ? new THREE.Vector3(best.x, best.y, best.z) : this.home.clone();
  }
  _heavy(dt, tp) { if (this.vent > 0) { this.vent -= dt; this.anim = 'special'; this.want = null; this.body.vel.x *= 0.8; this.body.vel.z *= 0.8; return; } this._generic(dt, tp); }
  _construction(dt, tp) {
    if (this.state === 'hunt' && tp && this.seen) {
      const d = tp.pos.distanceTo(this.pos);
      if (d > 6 && d < 18 && this.cool <= 0 && !this.charging) { this.charging = true; this.chargeDir = { x: (tp.pos.x - this.pos.x) / d, z: (tp.pos.z - this.pos.z) / d }; this.chargeT = 0; this.g.emit({ k: 'sfx', n: 'enemy', a: ['construction', 'special', this.pos] }); }
    }
    if (this.charging) {
      this.chargeT += dt; this.want = null; this.anim = 'run';
      const k = this.chargeT < 0.6 ? 0 : 1;
      this.body.vel.x = this.chargeDir.x * 9 * k; this.body.vel.z = this.chargeDir.z * 9 * k; this.yawTarget = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      for (const pl of this.g.allPlayers()) if (!pl.down && pl.pos.distanceTo(this.pos) < 2.4 && !this.hitThis) { this.hitThis = true; this.sys.damagePlayer(pl, this.p.dmg, this); }
      if (this.chargeT > 2.2 || (k && Math.hypot(this.body.vel.x, this.body.vel.z) > 0 && this.bumped)) { this.charging = false; this.hitThis = false; this.cool = 3; this.setState('recover'); }
      this.cool -= dt;
      return;
    }
    this._generic(dt, tp);
  }
  _unknown(dt) {
    // it watches; it leaves when you come close or photograph it
    const g = this.g; let nd = 1e9, near = null;
    for (const pl of g.allPlayers()) { const d = pl.pos.distanceTo(this.pos); if (d < nd) { nd = d; near = pl; } }
    if (near) this.yawTarget = Math.atan2(near.pos.x - this.pos.x, near.pos.z - this.pos.z);
    this.want = null; this.body.vel.set(0, 0, 0);
    if (nd < (this.o.vanishAt || 9) || this.photographed) { this.photographed = false; this.vanish(); }
  }
  vanish() { if (this.hidden) return; this.g.emit({ k: 'fx', n: 'vanish', p: this.center() }); this.g.emit({ k: 'sfx', n: 'enemy', a: ['unknown', 'special', this.pos] }); this.hidden = true; this.root.visible = false; this.o.onVanish?.(); }
  appear(x, y, z) { this.hidden = false; this.root.visible = true; this.body.pos.set(x, y, z); if (this.p.fly) this.body.pos.y += this.p.fly; this.setState('idle'); }

  /* ---------------- body ---------------- */
  _move(dt) {
    const g = this.g, B = this.body, p = this.p;
    if (this.want && this.state !== 'lunge') {
      const step = this._steer(this.want, dt);
      const sp = this.speed ?? p.walk;
      if (step) { B.vel.x = damp(B.vel.x, step.x * sp, 6, dt); B.vel.z = damp(B.vel.z, step.z * sp, 6, dt); this.yawTarget = Math.atan2(step.x, step.z); }
      else { B.vel.x = damp(B.vel.x, 0, 6, dt); B.vel.z = damp(B.vel.z, 0, 6, dt); }
    } else if (this.state !== 'lunge' && !this.charging) { B.vel.x = damp(B.vel.x, 0, 8, dt); B.vel.z = damp(B.vel.z, 0, 8, dt); }
    if (this.yawTarget !== undefined) this.yaw = dampAngle(this.yaw, this.yawTarget, this.type === 'sentinel' || this.type === 'construction' ? 2.5 : 7, dt);
    const before = B.pos.clone();
    if (p.fly) {
      B.pos.x += B.vel.x * dt; B.pos.z += B.vel.z * dt;
      const gy = g.phys.ground(B.pos.x, B.pos.z, B.pos.y, 0.2);
      const hy = (gy > -1e8 ? gy : this.home.y) + p.fly + Math.sin(g.time * 1.7 + this.home.x) * 0.15;
      if (this.state !== 'flee') B.pos.y = damp(B.pos.y, hy, 3, dt);
      g.phys.push(B.pos, p.r, 0.3);
    } else {
      g.phys.stepBody(B, dt);
      if (B.fell) { B.fell = false; this.dead = true; this.root.visible = false; }
    }
    this.bumped = Math.hypot(B.pos.x - before.x - B.vel.x * dt, B.pos.z - before.z - B.vel.z * dt) > 0.02;
    this.moveSpeed = Math.hypot(B.pos.x - before.x, B.pos.z - before.z) / Math.max(dt, 1e-4);
    if (!this.dead && this.moveSpeed > 0.4) { this.stepT -= dt * this.moveSpeed; if (this.stepT <= 0) { this.stepT = this.type === 'crawler' ? 0.6 : this.type === 'dog' ? 1.1 : 1.6; if (this.type !== 'stalker' && this.type !== 'scout' && this.type !== 'medic') g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'step', this.pos] }); } }
  }
  _steer(goal, dt) {
    const g = this.g, p = this.pos;
    if (!goal) return null;
    const flat = Math.abs(goal.y - p.y) < 1.4 || this.p.fly;
    if (flat && g.phys.clear(p.x, p.y + 0.5 + (this.p.fly ? -this.p.fly + 0.3 : 0), p.z, goal.x, goal.y + 0.5, goal.z, b => b.tag !== 'enemy')) { this.path = null; const dx = goal.x - p.x, dz = goal.z - p.z, l = Math.hypot(dx, dz); if (l < 0.2) return null; return { x: dx / l, z: dz / l }; }
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0) { this.path = g.nav.path(p.x, p.y - (this.p.fly || 0), p.z, goal.x, goal.y, goal.z, d => this.type === 'heavy' || this.type === 'construction' ? false : false); this.pathT = 0.8 + Math.random() * 0.5; this.pi = 0; }
    if (!this.path) return null;
    let n = this.path[this.pi];
    while (n && Math.hypot(n.x - p.x, n.z - p.z) < 0.8) { this.pi++; n = this.path[this.pi]; }
    if (!n) { this.path = null; return null; }
    const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l };
  }
  _anim(dt) {
    if (!this.dead && this.stun <= 0 && this.state !== 'attack' && this.state !== 'lunge' && !(this.type === 'heavy' && this.vent > 0) && !(this.type === 'stalker' && this.frozen)) {
      this.anim = this.moveSpeed > (this.p.run * 0.6) ? 'run' : this.moveSpeed > 0.3 ? 'walk' : (this.state === 'hunt' || this.state === 'investigate' ? 'alert' : 'idle');
    }
    if (this.anim !== this._lastAnim) { this._lastAnim = this.anim; this.animT = 0; }
    this.alert = damp(this.alert, this.state === 'hunt' || this.state === 'attack' ? 1 : this.state === 'investigate' || this.state === 'search' ? 0.5 : 0, 3, dt);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    if (this.spot) { this.spot.intensity = this.dead || this.stun > 0 ? 0 : 60; this.beam.visible = !this.dead && this.stun <= 0; }
    this.m.update(dt, { anim: this.anim, speed: this.moveSpeed || 0, t: this.animT, aimYaw: this.aimYaw, aimPitch: this.aimPitch, lit: this.lit, hurtT: this.hurtT, alert: this.alert });
  }
  /* ---------------- getting hurt ---------------- */
  hurt(n, wp, from, kind) {
    if (this.dead || this.p.hp > 1e8) return 0;
    const g = this.g, known = g.knows(this.type);
    let mult = 1;
    if (wp) mult = known ? 3 : 1.4;
    else if (this.p.armour && from) { // armoured from the front
      const f = this.forward(), dx = from.x - this.pos.x, dz = from.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
      if ((dx * f.x + dz * f.z) / l > -0.2) mult = this.p.armour;
    }
    if (this.type === 'heavy' && wp === 'core' && this.vent <= 0) mult = this.p.armour;
    if (this.type === 'foreman' && this.o.damageRule) mult = this.o.damageRule(this, wp, mult);
    const dmg = n * mult;
    this.hp -= dmg; this.hurtT = 0;
    g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'hurt', this.pos] });
    g.emit({ k: 'fx', n: 'sparks', p: this.center(), c: wp ? 0x60d0ff : 0xffb040, k2: wp ? 26 : 12 });
    if (wp && known && (this.type === 'hunter') && !this.limp) { this.limp = true; this.p = { ...this.p, run: this.p.run * 0.55, walk: this.p.walk * 0.7 }; }
    if (wp && this.type === 'medic' && known) this.sys.gas(this.pos);
    if (wp && this.type === 'stalker') { this.setState('retreat'); this.retreatTo = this._darkSpotAway(); }
    if (kind === 'stun') this.stun = Math.max(this.stun, this.type === 'heavy' || this.type === 'foreman' ? 0.8 : 2.2);
    if (this.hp <= 0) this.die();
    else if (this.state !== 'hunt' && this.type !== 'scout' && this.type !== 'stalker' && from) { this.last = new THREE.Vector3(from.x, from.y, from.z); this.setState('hunt'); this.m.setEyes?.(0xff2a2a, 3); }
    return dmg;
  }
  die() {
    const g = this.g; this.dead = true; this.hp = 0; this.anim = 'dead'; this.animT = 0;
    this.m.setEyes?.(0x000000, 0);
    g.emit({ k: 'sfx', n: 'enemy', a: [this.type, 'die', this.pos] });
    g.emit({ k: 'fx', n: 'burst', p: this.center() });
    if (!this.o.noLoot) for (const [it, n] of this.p.loot || []) this.sys.drop(it, n, this.pos);
    if (this.o.id) g.setFlag('dead:' + this.o.id, true);
    this.o.onDie?.(this);
    g.story.onKill?.(this);
  }
}

function remoteLit(pl, e, g) {
  const c = e.center(), dx = c.x - pl.pos.x, dz = c.z - pl.pos.z, d = Math.hypot(dx, dz); if (d > 26) return 0;
  const f = { x: -Math.sin(pl.yaw), z: -Math.cos(pl.yaw) }, cos = (dx * f.x + dz * f.z) / d;
  return cos > 0.9 && g.phys.clear(pl.pos.x, pl.pos.y + 1.5, pl.pos.z, c.x, c.y, c.z) ? 1 : 0;
}
function looksAt(pl, e, g) {
  const c = e.center(), dx = c.x - pl.pos.x, dz = c.z - pl.pos.z, d = Math.hypot(dx, dz);
  const f = { x: -Math.sin(pl.yaw), z: -Math.cos(pl.yaw) }, cos = (dx * f.x + dz * f.z) / Math.max(d, 0.01);
  return cos > 0.6 && g.phys.clear(pl.pos.x, pl.pos.y + 1.5, pl.pos.z, c.x, c.y + 0.5, c.z);
}

export class Enemies {
  constructor(game) {
    this.g = game; this.list = []; this.byId = new Map(); this.shots = []; this.loot = new Map(); this.lootN = 1; this.danger = 0; this.chasing = false; this.closeness = 0;
    this._v = new THREE.Vector3();
    this.boltGeo = new THREE.SphereGeometry(0.09, 8, 6);
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.4), toneMapped: false });
    this.shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2, 0.6), toneMapped: false });
  }
  spawn(type, x, y, z, o = {}) { const e = new Enemy(this, type, x, y, z, o); if (o.id && this.g.flags['dead:' + o.id]) { e.dead = true; e.hp = 0; e.anim = 'dead'; e.animT = 99; e.m.setEyes?.(0, 0); } this.list.push(e); this.byId.set(e.id, e); return e; }
  get(id) { return this.byId.get(id); }
  hear(pos, r, who) { if (!this.g.isHost) return; for (const e of this.list) e.heard(pos, r, who); }
  onSpotted(e, pl) { if (pl.local) { if (e.type !== 'scout' && e.type !== 'unknown') this.g.guide.hostBark('chase', 25); } this.g.story.onSpotted?.(e, pl); }
  active(e) {
    if (e.hidden && e.type !== 'unknown') return false;
    for (const pl of this.g.allPlayers()) if (pl.pos.distanceTo(e.pos) < 70) return true;
    return false;
  }
  update(dt) {
    const g = this.g;
    if (g.isHost) {
      for (const e of this.list) if (this.active(e)) e.update(dt);
      this._shots(dt);
    } else {
      for (const e of this.list) this._clientAnim(e, dt);
      this._shotsClient(dt);
    }
    // danger / chase for music, and visibility by zone
    let danger = 0, chasing = false, close = 0;
    const me = g.player.pos;
    for (const e of this.list) {
      if (e.dead || e.hidden) continue;
      const d = e.pos.distanceTo(me);
      if (e.state === 'hunt' || e.state === 'attack' || e.state === 'lunge' || e.state === 'creep') { danger = Math.max(danger, Math.max(0, 1 - d / 30)); if (d < 26 && (e.target === g.me || !e.target)) chasing = true; }
      else if (e.state === 'investigate' || e.state === 'search') danger = Math.max(danger, Math.max(0, 0.5 - d / 60));
      close = Math.max(close, Math.max(0, 1 - d / 8) * (e.type === 'unknown' ? 0 : 1));
      if (e.zone) e.root.visible = !e.hidden && (e.zone.visible || d < 40);
    }
    this.danger = danger; this.chasing = chasing; this.closeness = close;
    for (const e of this.list) { if (e.dead || e.hidden || e.p.fly || e.type === 'unknown') continue; const dx = me.x - e.pos.x, dz = me.z - e.pos.z, d = Math.hypot(dx, dz), m = e.p.r + 0.32; if (d < m && d > 1e-4 && Math.abs(me.y - e.pos.y) < e.p.h) { me.x = e.pos.x + dx / d * m; me.z = e.pos.z + dz / d * m; } }
    for (const l of this.loot.values()) if (l.mesh) { l.mesh.rotation.y += dt; l.glint.material.opacity = 0.4 + 0.3 * Math.sin(g.time * 4 + l.n); }
  }
  /* ---------------- player-side combat ---------------- */
  /** a melee ray from the camera; returns {e, wp, point} or null */
  pick(origin, dir, range) {
    let best = null, bt = range;
    const c = new THREE.Vector3(), w = new THREE.Vector3();
    for (const e of this.list) {
      if (e.dead || e.hidden || e.p.hp > 1e8) continue;
      if (e.pos.distanceTo(origin) > range + e.p.h + 2) continue;
      // weak points first (small spheres), then the body
      for (const wp of e.m.weakPoints || []) {
        wp.node.getWorldPosition(w);
        const t = raySphere(origin, dir, w, (wp.r || 0.2) * 1.25);
        if (t !== null && t < bt) { bt = t; best = { e, wp: wp.id, point: origin.clone().addScaledVector(dir, t) }; }
      }
      e.center(c);
      const t = raySphere(origin, dir, c, Math.max(e.p.r * 1.4, e.p.h * 0.5) + 0.15);
      if (t !== null && t < bt - 0.05) { bt = t; best = { e, wp: null, point: origin.clone().addScaledVector(dir, t) }; }
    }
    return best;
  }
  /** host: apply a hit from a player */
  hit(eid, dmg, wp, pid, kind) {
    const e = this.byId.get(eid); if (!e) return;
    const pl = this.g.allPlayers().find(q => q.id === pid);
    e.hurt(dmg, wp, pl ? pl.pos : null, kind);
  }
  damagePlayer(pl, n, src, kind = 'hit') {
    if (pl.local) this.g.player.damage(n, src.pos, kind);
    else this.g.net.sendEvent({ k: 'dmg', to: pl.id, n, from: { x: src.pos.x, z: src.pos.z }, kind });
  }
  /** EMP blast (host) */
  emp(pos, r = 7) {
    for (const e of this.list) {
      if (e.dead || e.hidden) continue;
      const d = e.pos.distanceTo(pos); if (d > r) continue;
      if (e.type === 'scout' || e.type === 'crawler') e.hurt(999, null, pos);
      else { if (e.fs) e.fs.ventT = 0; e.stun = e.type === 'heavy' || e.type === 'foreman' || e.type === 'construction' ? 2 : 5; e.m.setEyes?.(0x40a0ff, 3); e.hurt(30, null, pos); }
    }
  }
  gas(pos) {
    this.g.emit({ k: 'fx', n: 'gas', p: pos });
    for (const e of this.list) if (!e.dead && e.pos.distanceTo(pos) < 5) { e.stun = 4; e.hurt(40, null, pos); }
  }
  decoy(pos, t = 12) { this.decoyAt = { pos: pos.clone(), t }; for (const e of this.list) { if (e.dead || e.hidden || e.type === 'stalker' || e.type === 'scout') continue; const r = e.type === 'dog' ? 40 : 24; if (e.pos.distanceTo(pos) < r) { e.target = null; e.last = pos.clone(); e.setState('investigate'); } } }
  /* ---------------- projectiles ---------------- */
  projectile(from, vel, dmg, src, splash = 0, kind = 'bolt') {
    const m = new THREE.Mesh(this.boltGeo, kind === 'shell' ? this.shellMat : this.boltMat); m.position.copy(from); if (kind === 'shell') m.scale.setScalar(2.2);
    this.g.scene.add(m);
    this.shots.push({ m, p: from.clone(), v: vel.clone(), dmg, src, splash, life: 3, kind, id: this.lootN++ });
  }
  _shots(dt) {
    const g = this.g;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.life -= dt;
      const step = s.v.clone().multiplyScalar(dt), L = step.length();
      const hit = g.phys.ray(s.p.x, s.p.y, s.p.z, step.x / L, step.y / L, step.z / L, L, b => b.tag !== 'enemy');
      let hitPl = null;
      for (const pl of g.allPlayers()) { if (pl.down) continue; const c = this._v.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z); if (distSeg(c, s.p, step) < 0.55) hitPl = pl; }
      if (hitPl || hit || s.life <= 0) {
        if (hitPl) this.damagePlayer(hitPl, s.dmg, s.src);
        const at = hit ? s.p.clone().addScaledVector(step, hit.t / L) : s.p.clone();
        if (s.splash) { for (const pl of g.allPlayers()) if (pl !== hitPl && !pl.down && pl.pos.distanceTo(at) < s.splash) this.damagePlayer(pl, s.dmg * 0.5, s.src); g.emit({ k: 'fx', n: 'explosion', p: at }); g.emit({ k: 'sfx', n: 'explosion', a: [at] }); }
        else g.emit({ k: 'fx', n: 'sparks', p: at, c: 0xff8040, k2: 10 });
        g.scene.remove(s.m); this.shots.splice(i, 1); continue;
      }
      s.p.add(step); s.m.position.copy(s.p);
    }
  }
  _shotsClient(dt) { for (const s of this.shots) { s.p.addScaledVector(s.v, dt); s.m.position.copy(s.p); } }
  /* ---------------- loot ---------------- */
  drop(item, n, pos) {
    const id = 'L' + (this.lootN++);
    const p = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 1.2, pos.y, pos.z + (Math.random() - 0.5) * 1.2);
    p.y = this.g.phys.ground(p.x, p.z, pos.y + 1, 2) + 0.02;
    this._lootAdd(id, item, n, p);
  }
  _lootAdd(id, item, n, p) {
    if (this.loot.has(id)) return;
    const g = this.g;
    const mesh = (g.itemModel || (() => null))(item) || new THREE.Group();
    mesh.position.copy(p); g.scene.add(mesh);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.8), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glint.position.y = 0.1; mesh.add(glint);
    const l = { id, item, n, p, mesh, glint };
    l.ia = g.interact.add({ id: 'loot:' + id, pos: p.clone().setY(p.y + 0.1), r: 0.3, range: 2.2, label: () => 'Take ' + g.itemName({ item }) + (n > 1 ? ' x' + n : ''), use: (pid) => this.take(id, pid) });
    this.loot.set(id, l);
  }
  take(id, pid) {
    const l = this.loot.get(id); if (!l) return;
    this.g.give(pid, { item: l.item, n: l.n });
    if (!this.g.known(l.item)) this.g.guide.hostBark('unknown_item', 120);
    this._lootRemove(id);
  }
  _lootRemove(id) { const l = this.loot.get(id); if (!l) return; this.g.scene.remove(l.mesh); this.g.interact.remove(l.ia); this.loot.delete(id); }
  /* ---------------- sync ---------------- */
  snapshot() {
    const e = [];
    for (const x of this.list) if (this.active(x) || x._sentDead !== x.dead) { x._sentDead = x.dead; e.push([x.id, +x.pos.x.toFixed(2), +x.pos.y.toFixed(2), +x.pos.z.toFixed(2), +x.yaw.toFixed(2), x.anim, +(x.moveSpeed || 0).toFixed(1), x.dead ? 1 : 0, x.hidden ? 1 : 0, +x.lit.toFixed(1), Math.round(x.hp)]); }
    const L = []; for (const l of this.loot.values()) L.push([l.id, l.item, l.n, +l.p.x.toFixed(2), +l.p.y.toFixed(2), +l.p.z.toFixed(2)]);
    const S = this.shots.map(s => [s.id, +s.p.x.toFixed(2), +s.p.y.toFixed(2), +s.p.z.toFixed(2), +s.v.x.toFixed(1), +s.v.y.toFixed(1), +s.v.z.toFixed(1), s.kind]);
    return { e, L, S };
  }
  applySnapshot(w) {
    if (!w) return;
    for (const a of w.e) { const e = this.byId.get(a[0]); if (!e) continue; e.net = { x: a[1], y: a[2], z: a[3], yaw: a[4], anim: a[5], sp: a[6] }; if (a[7] && !e.dead) { e.dead = true; e.animT = 0; e.m.setEyes?.(0, 0); } e.hidden = !!a[8]; e.lit = a[9]; e.hp = a[10]; }
    const keep = new Set(w.L.map(l => l[0]));
    for (const id of [...this.loot.keys()]) if (!keep.has(id)) this._lootRemove(id);
    for (const l of w.L) if (!this.loot.has(l[0])) this._lootAdd(l[0], l[1], l[2], new THREE.Vector3(l[3], l[4], l[5]));
    // projectiles: rebuild from the host list
    const ids = new Set(w.S.map(s => s[0]));
    for (let i = this.shots.length - 1; i >= 0; i--) if (!ids.has(this.shots[i].id)) { this.g.scene.remove(this.shots[i].m); this.shots.splice(i, 1); }
    for (const s of w.S) { let x = this.shots.find(q => q.id === s[0]); if (!x) { this.projectile(new THREE.Vector3(s[1], s[2], s[3]), new THREE.Vector3(s[4], s[5], s[6]), 0, null, 0, s[7]); x = this.shots[this.shots.length - 1]; x.id = s[0]; } else { x.p.set(s[1], s[2], s[3]); } }
  }
  _clientAnim(e, dt) {
    const n = e.net; if (!n) { e._anim(dt); return; }
    e.body.pos.x = damp(e.body.pos.x, n.x, 12, dt); e.body.pos.y = damp(e.body.pos.y, n.y, 12, dt); e.body.pos.z = damp(e.body.pos.z, n.z, 12, dt);
    e.yaw = dampAngle(e.yaw, n.yaw, 12, dt);
    if (n.anim !== e.anim) { e.anim = n.anim; e.animT = 0; }
    e.animT += dt; e.moveSpeed = n.sp; e.hurtT += dt;
    e.root.visible = !e.hidden; e.root.position.copy(e.pos); e.root.rotation.y = e.yaw;
    if (e.spot) { e.spot.intensity = e.dead ? 0 : 60; e.beam.visible = !e.dead; }
    e.m.update(dt, { anim: e.anim, speed: e.moveSpeed, t: e.animT, lit: e.lit, hurtT: e.hurtT, alert: e.anim === 'run' ? 1 : 0 });
  }
  resetForRetry() {
    for (const e of this.list) {
      if (e.dead) continue;
      e.body.pos.copy(e.home); if (e.p.fly) e.body.pos.y += e.p.fly;
      e.target = null; e.last = null; e.setState(e.o.dormant && !e.woke ? 'dormant' : e.patrol ? 'patrol' : 'idle'); e.m.setEyes?.(0xffa040, 2); e.hp = Math.max(e.hp, e.maxHp * 0.6);
    }
    for (const s of this.shots) this.g.scene.remove(s.m); this.shots = [];
  }
}
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return null; const t = -b - Math.sqrt(h); return t >= 0 ? t : (cc < 0 ? 0 : null);
}
function distSeg(c, a, ab) {
  const L2 = ab.lengthSq(); if (L2 < 1e-6) return c.distanceTo(a);
  let t = ((c.x - a.x) * ab.x + (c.y - a.y) * ab.y + (c.z - a.z) * ab.z) / L2; t = clamp(t, 0, 1);
  return Math.hypot(a.x + ab.x * t - c.x, a.y + ab.y * t - c.y, a.z + ab.z * t - c.z);
}
export { T as ENEMY_STATS, MACHINES };
