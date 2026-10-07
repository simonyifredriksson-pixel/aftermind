/* Story.js - runs the chain of steps the level files define.

   A step is { id, obj, sub, spawn, cp, enter(G), tick(G, dt), done(G), hint }.
   The host advances when done() is true; the objective line goes to every
   player; a step marked cp saves a checkpoint (and is where you come back
   after dying). Steps never teleport you - when a step needs you somewhere,
   GUIDE says why, and the world has a way there.

   Also here: photo subjects (strange things the camera can study besides
   machines), small cinematic beats (a forced glance, a title card), and
   the hint GUIDE gives when you ask him what to do. */
import * as THREE from '../../lib/three.module.js';
import { STEPS } from '../world/levels/index.js';

export class Story {
  constructor(game) {
    this.g = game; this.i = 0; this.steps = STEPS; this.cp = null; this.t = 0;
    this.photoSubjects = []; this.subjects = {}; this.cineOn = false; this.data = {};
  }
  get step() { return this.steps[this.i]; }
  find(id) { return this.steps.findIndex(s => s.id === id); }
  begin(save) {
    const g = this.g;
    if (save && save.story) { this.i = Math.max(0, this.find(save.story.step)); this.cp = save.story.cp; this.data = save.story.data || {}; }
    else this.i = 0;
    const params = new URLSearchParams(location.search);
    if (params.get('skip')) { const k = this.find(params.get('skip')); if (k >= 0) { this.devSkip(params.get('skip')); return; } }
    const sp = this.spawn(); g.player.place(sp.x, sp.y, sp.z, sp.yaw);
    this._enterStep(true);
  }
  /** where you start (or come back) for the current step */
  spawn() {
    for (let k = this.i; k >= 0; k--) { const s = this.steps[k]; if (s.spawn) { const a = typeof s.spawn === 'function' ? s.spawn(this.g) : s.spawn; return { x: a[0], y: a[1], z: a[2], yaw: a[3] || 0 }; } }
    return { x: 0, y: 1, z: 0, yaw: 0 };
  }
  _enterStep(resume = false) {
    const g = this.g, s = this.step; if (!s) return;
    this.t = 0;
    if (g.isHost) {
      // re-apply world facts of every earlier step (doors open, power on...) when resuming a save
      if (resume) for (let k = 0; k < this.i; k++) this.steps[k].restore?.(g);
      s.enter?.(g, resume);
      this._obj();
      if (s.cp && !resume) g.checkpoint(s.id);
    }
  }
  _obj() { const g = this.g, s = this.step; if (!s) return; const t = typeof s.obj === 'function' ? s.obj(g) : s.obj; const sub = typeof s.sub === 'function' ? s.sub(g) : s.sub; if (t !== this._lastObj || sub !== this._lastSub) { this._lastObj = t; this._lastSub = sub; g.emit({ k: 'obj', t, sub }); } }
  update(dt) {
    const g = this.g, s = this.step; if (!s) return;
    this.t += dt;
    s.tick?.(g, dt);
    this._objT = (this._objT || 0) - dt; if (this._objT <= 0) { this._objT = 0.5; this._obj(); }
    if (s.done && s.done(g)) this.advance();
  }
  advance() {
    const g = this.g, s = this.step;
    s.exit?.(g);
    this.i++;
    if (this.i >= this.steps.length) { this.i = this.steps.length - 1; return; }
    this._enterStep(false);
  }
  goto(id) { const k = this.find(id); if (k < 0) return; this.i = k; this._enterStep(false); }
  /** test/dev: jump straight to a step with the world as it would be */
  devSkip(id) {
    const g = this.g, k = this.find(id); if (k < 0) return;
    this.i = k;
    for (let j = 0; j < k; j++) this.steps[j].restore?.(g), this.steps[j].skip?.(g);
    const sp = this.spawn(); g.player.place(sp.x, sp.y, sp.z, sp.yaw);
    this._enterStep(false);
  }
  hint() { const s = this.step; if (!s) return null; return typeof s.hint === 'function' ? s.hint(this.g) : s.hint || null; }
  idleOk() { return !this.cineOn && !this.step?.noIdle; }
  save() { return { step: this.step?.id, cp: this.cp, data: this.data }; }
  snapshot() { return { i: this.i, o: this._lastObj, s: this._lastSub }; }
  applySnapshot(s) { if (!s) return; this.i = s.i; if (s.o !== this._lastObj || s.s !== this._lastSub) { this._lastObj = s.o; this._lastSub = s.s; this.g.hud.objective(s.o, s.s); } }

  /* ---------------- hooks from the systems ---------------- */
  onItem(o) { this.step?.onItem?.(this.g, o); }
  onCraft(r) { this.step?.onCraft?.(this.g, r); }
  onPhoto(p) { this.step?.onPhoto?.(this.g, p); }
  onAnalyzed(subs) { this.step?.onAnalyzed?.(this.g, subs); }
  onKill(e) { this.step?.onKill?.(this.g, e); }
  onSpotted(e, pl) { this.step?.onSpotted?.(this.g, e, pl); }
  onZone(z, prev) { this.step?.onZone?.(this.g, z, prev); }
  onRead(o) { this.step?.onRead?.(this.g, o); }

  /* ---------------- photo subjects ---------------- */
  subject(id, pos, r, lines, o = {}) { this.photoSubjects.push({ id, pos: new THREE.Vector3(pos[0], pos[1], pos[2]), r, label: o.label || 'POINT OF INTEREST', enabled: o.enabled }); this.subjects[id] = { lines, done: o.done }; }

  /* ---------------- cinematic beats (everyone, locally) ---------------- */
  cine(n, e) {
    const g = this.g, p = g.player;
    if (n === 'look') { p.lookTarget = new THREE.Vector3(e.x, e.y, e.z); setTimeout(() => { p.lookTarget = null; }, (e.dur || 2.5) * 1000); }
    else if (n === 'title') this.titleCard(e.t, e.s, e.dur || 6);
    else if (n === 'fade') { const f = document.getElementById('fade'); f.querySelector('.ft').textContent = e.t || ''; f.querySelector('.fs').textContent = e.s || ''; f.classList.add('on'); setTimeout(() => f.classList.remove('on'), (e.dur || 3) * 1000); }
    else if (n === 'shake') p.camShake = Math.min(1, p.camShake + (e.a || 0.6));
    else if (n === 'freeze') { p.frozen = !!e.on; this.cineOn = !!e.on; }
    else if (n === 'stinger') g.audio.stinger?.(e.s);
    else if (n === 'credits') g.ui.credits?.();
    else this.step?.cine?.(g, n, e);
  }
  titleCard(t, s, dur) {
    const d = document.createElement('div'); d.className = 'titlecard'; d.innerHTML = `<div class="t">${t}</div><div class="s">${s || ''}</div>`;
    document.body.appendChild(d); requestAnimationFrame(() => d.classList.add('on'));
    setTimeout(() => d.classList.remove('on'), dur * 1000); setTimeout(() => d.remove(), dur * 1000 + 2500);
  }
}
