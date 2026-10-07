/* Photo.js - the old camera from the garbage pile.

   Hold right mouse to raise it: the view narrows into a viewfinder, the
   wheel zooms (1x-3x), brackets lock onto whatever machine or strange thing
   is in frame - and once GUIDE knows a machine, its weak points are marked.
   Left click takes the picture: shutter, flash (which lights the scene for
   a moment, and with the Stun Flash upgrade overloads machine eyes).

   Each photo is a real 320x180 render of what you saw, kept in the album,
   with what was in it. Show the album to GUIDE (E on him) and he studies
   the new ones - that is how he remembers. */
import * as THREE from '../../lib/three.module.js';
import { MACHINES } from '../data/Machines.js';

export class Photo {
  constructor(game) {
    this.g = game; this.raised = false; this.raiseT = 0; this.zoom = 1; this.cool = 0; this.flashT = 0;
    this.rt = new THREE.WebGLRenderTarget(320, 180, { samples: 2 });
    this.px = new Uint8Array(320 * 180 * 4);
    this.canvas = document.createElement('canvas'); this.canvas.width = 320; this.canvas.height = 180;
    this.flash = new THREE.PointLight(0xf4f8ff, 0, 22, 1.6); game.camera.add(this.flash); this.flash.position.set(0, 0.1, -0.3);
    this.subject = null; this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
    this.baseFov = game.camera.fov;
  }
  get unseen() { return this.g.photos.filter(p => !p.shown && p.subjects.length).length; }
  update(dt) {
    const g = this.g, I = g.input, p = g.player;
    // right mouse with empty hands takes the camera out
    if (g.inv.tools.camera && p.tool === 'none' && I.click(2) && g.phase === 'play' && !g.ui.modal && !p.down) g.view.select('camera');
    const has = g.inv.tools.camera && p.tool === 'camera';
    const can = has && g.phase === 'play' && !g.ui.modal && !p.down;
    const want = can && I.btn(2);
    if (want && !this.raised) { this.raised = true; g.audio.cameraRaise?.(); }
    if (!want && this.raised) { this.raised = false; g.audio.cameraLower?.(); }
    this.raiseT = Math.max(0, Math.min(1, this.raiseT + (this.raised ? dt * 5 : -dt * 6)));
    if (this.raised) { const w = g.input.wheel(); if (w) this.zoom = Math.max(1, Math.min(3, this.zoom - w * 0.25)); }
    else this.zoom += (1 - this.zoom) * Math.min(1, dt * 8);
    const fov = (g.profile.fov || 72) / (this.raised ? this.zoom * 1.25 : 1);
    if (Math.abs(g.camera.fov - fov) > 0.05) { g.camera.fov += (fov - g.camera.fov) * Math.min(1, dt * 12); g.camera.updateProjectionMatrix(); }
    this.cool -= dt;
    if (this.raised) {
      this.subject = this.detect();
      if (I.click(0) && this.cool <= 0) this.snap();
    } else this.subject = null;
    g.hud.viewfinder(this.raiseT, this.subject, this.zoom, this.cool);
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.intensity = this.flashT > 0 ? 70 * (this.flashT / 0.18) : 0;
  }
  /** what is in frame: machines (EnemyArt), story subjects. Best = biggest near the centre. */
  detect() {
    const g = this.g, cam = g.camera, out = [];
    cam.updateMatrixWorld();
    const e = cam.position;
    const test = (c, r, info) => {
      const d = c.distanceTo(e); if (d > 70) return;
      this._v.copy(c).project(cam);
      if (this._v.z > 1 || Math.abs(this._v.x) > 0.8 || Math.abs(this._v.y) > 0.8) return;
      const size = r / d * this.zoom * 1.4;
      if (size < 0.025) return;
      if (!g.phys.clear(e.x, e.y, e.z, c.x, c.y, c.z, b => b.tag !== 'door' || b.on)) return;
      const score = size * 3 - Math.hypot(this._v.x, this._v.y) * 0.4;
      out.push({ ...info, sx: this._v.x, sy: this._v.y, size, d, score, ok: size > 0.03 });
    };
    for (const m of g.enemies.list) {
      if (m.hidden && m.type !== 'unknown') continue; if (m.hidden) continue;
      test(m.center(this._w), Math.max(m.p.h * 0.5, m.p.r), { kind: 'machine', type: m.type, e: m, dead: m.dead });
    }
    for (const s of g.story.photoSubjects || []) { if (s.enabled && !s.enabled()) continue; test(s.pos, s.r || 1, { kind: 'subject', id: s.id, label: s.label }); }
    out.sort((a, b) => b.score - a.score);
    const best = out[0] || null;
    if (best && best.kind === 'machine') {
      best.label = g.knows(best.type) ? MACHINES[best.type].name.toUpperCase() : 'UNKNOWN MACHINE';
      best.weak = [];
      if (g.knows(best.type)) for (const wp of best.e.m.weakPoints || []) { wp.node.getWorldPosition(this._w); this._v.copy(this._w).project(cam); if (this._v.z < 1) best.weak.push({ x: this._v.x, y: this._v.y }); }
    }
    if (best) best.all = out.filter(o => o.ok).length;
    return best;
  }
  snap() {
    const g = this.g;
    this.cool = 1.1; this.flashT = 0.18;
    g.audio.shutter?.(); setTimeout(() => g.audio.flashCharge?.(), 300);
    if (g.post) g.post.u.photo.value = 0.55;
    // everything usable in frame goes on the photo
    const cam = g.camera, subjects = [];
    cam.updateMatrixWorld();
    const all = []; const best = this.detect();
    if (best) {
      // collect every ok subject
      const e = cam.position;
      for (const m of g.enemies.list) { if (m.hidden) continue; const c = m.center(this._w); this._v.copy(c).project(cam); const d = c.distanceTo(e); if (this._v.z < 1 && Math.abs(this._v.x) < 0.8 && Math.abs(this._v.y) < 0.8 && Math.max(m.p.h * 0.5, m.p.r) / d * this.zoom * 1.4 > 0.03 && g.phys.clear(e.x, e.y, e.z, c.x, c.y, c.z)) all.push({ kind: 'machine', type: m.type, e: m }); }
      for (const s of g.story.photoSubjects || []) { if (s.enabled && !s.enabled()) continue; this._v.copy(s.pos).project(cam); const d = s.pos.distanceTo(e); if (this._v.z < 1 && Math.abs(this._v.x) < 0.8 && Math.abs(this._v.y) < 0.8 && (s.r || 1) / d * this.zoom * 1.4 > 0.04 && g.phys.clear(e.x, e.y, e.z, s.pos.x, s.pos.y, s.pos.z)) all.push({ kind: 'subject', id: s.id }); }
    }
    for (const s of all) { subjects.push(s.kind === 'machine' ? { kind: 'machine', type: s.type } : { kind: 'subject', id: s.id }); if (s.e && s.e.type === 'unknown') s.e.photographed = true; }
    const thumb = this.capture();
    const photo = { id: 'ph' + Date.now().toString(36), t: Date.now(), subjects, shown: false, thumb, zone: g.zone?.name || g.zone?.id || '', keep: false };
    g.photos.push(photo); if (g.photos.length > 30) g.photos.shift();
    // stun flash upgrade
    if (g.inv.upgrades.flash) {
      const f = g.player.forward();
      for (const m of g.enemies.list) { if (m.dead || m.hidden) continue; const c = m.center(this._w), d = c.distanceTo(cam.position); if (d > 12) continue; const dir = c.clone().sub(cam.position).normalize(); if (dir.dot(f) > 0.8) g.act('hit', { eid: m.id, dmg: 5, wp: m.type === 'stalker' ? 'sensors' : null, kind: 'stun' }); }
    }
    g.player.makeNoise(3);
    g.hud.photoTaken(photo);
    g.story.onPhoto?.(photo);
    if (subjects.length && !g.flags['tut:show']) g.guide.bark('new_photo', true);
  }
  capture() {
    const g = this.g, r = g.renderer;
    try {
      const prevT = r.getRenderTarget(), tm = r.toneMapping;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      const cam = g.camera.clone(); cam.aspect = 16 / 9; cam.updateProjectionMatrix();
      g.view?.hide(true);
      r.setRenderTarget(this.rt); r.render(g.scene, cam);
      r.readRenderTargetPixels(this.rt, 0, 0, 320, 180, this.px);
      r.setRenderTarget(prevT); r.toneMapping = tm;
      g.view?.hide(false);
      const ctx = this.canvas.getContext('2d'), img = ctx.createImageData(320, 180);
      // flip, and develop it: warm, a little faded, grain, a light leak
      for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
        const s = ((179 - y) * 320 + x) * 4, d = (y * 320 + x) * 4, n = (Math.random() - 0.5) * 14;
        const lin = c => Math.pow(c / 255, 1 / 2.2) * 255;
        const vx = (x / 320 - 0.5), vy = (y / 180 - 0.5), v = 1 - (vx * vx + vy * vy) * 1.1;
        img.data[d] = Math.min(255, lin(this.px[s]) * 1.05 * v + 10 + n);
        img.data[d + 1] = Math.min(255, lin(this.px[s + 1]) * v + 7 + n);
        img.data[d + 2] = Math.min(255, lin(this.px[s + 2]) * 0.92 * v + 4 + n);
        img.data[d + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      ctx.fillStyle = 'rgba(255,170,90,0.12)'; ctx.fillRect(0, 0, 20, 180);
      ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(255,190,120,0.8)';
      const d = new Date(); ctx.fillText('\'' + 71 + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), 250, 170);
      return this.canvas.toDataURL('image/jpeg', 0.72);
    } catch (e) { window.__log?.('photo capture: ' + e.message); return null; }
  }
  /** hand the unseen photos to GUIDE */
  showToGuide() {
    const g = this.g, list = g.photos.filter(p => !p.shown);
    const subjects = [];
    for (const p of list) { p.shown = true; for (const s of p.subjects) subjects.push(s); }
    // keep the best photo of each newly identified machine for the Field Log
    for (const p of list) for (const s of p.subjects) if (s.kind === 'machine' && !g.flags['m:' + s.type] && p.thumb) { p.keep = true; (g.logPhotos ||= {})[s.type] = p.thumb; }
    g.setFlag && (g.flags['tut:show'] = true);
    g.act('analyze', { subjects });
    return subjects.length;
  }
}
