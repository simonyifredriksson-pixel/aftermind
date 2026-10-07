/* Interact.js - everything you can press E on.

   An interactable is a point in the world with a label and a use(pid).
   The one nearest the middle of the screen (within reach, in plain sight)
   gets the prompt. Some need E held (repairs, forcing a door). Use always
   runs on the host; a client sends the request and the result comes back
   through the shared flags.

   Built on top: doors (slide / swing / shutter / heavy blast doors, which
   can be locked by a reason), pickups and readable notes. */
import * as THREE from '../../lib/three.module.js';
import { item } from '../art/Art.js';
import { Mat } from '../core/Textures.js';

let NEXT = 1;
export class Interact {
  constructor(game) { this.g = game; this.list = []; this.byId = new Map(); this.focus = null; this.holdT = 0; this.doors = []; this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); }
  add(o) {
    o.id ||= 'i' + NEXT++; o.range ||= 2.3; o.r ||= 0.4; o.enabled ||= (() => true); o.zone ||= null;
    this.list.push(o); this.byId.set(o.id, o); return o;
  }
  remove(o) { const i = this.list.indexOf(o); if (i >= 0) this.list.splice(i, 1); this.byId.delete(o.id); if (this.focus === o) this.focus = null; }
  update(dt) {
    const g = this.g, p = g.player, cam = g.camera;
    const can = g.phase === 'play' && !g.ui.modal && !p.down && !p.frozen && !g.photo?.raised;
    let best = null, bs = -1;
    if (can) {
      const e = cam.position, f = p.forward(this._f);
      for (const o of this.list) {
        if (o.zone && !o.zone.visible) continue;
        const pos = typeof o.pos === 'function' ? o.pos() : o.pos;
        if (!pos) continue;
        const dx = pos.x - e.x, dy = pos.y - e.y, dz = pos.z - e.z, d = Math.hypot(dx, dy, dz);
        if (d > o.range + o.r) continue;
        if (!o.enabled()) continue;
        const lab = typeof o.label === 'function' ? o.label(g.me) : o.label;
        if (!lab) continue;
        // angle to the item's bounding sphere
        const along = dx * f.x + dy * f.y + dz * f.z; if (along < 0.05) continue;
        const perp = Math.sqrt(Math.max(0, d * d - along * along));
        const miss = Math.max(0, perp - o.r) / along;
        if (miss > 0.22) continue;
        const score = 1 / (0.02 + miss) / (0.5 + d * 0.3);
        if (score <= bs) continue;
        if (!g.phys.clear(e.x, e.y, e.z, pos.x - dx / d * (o.r + 0.05), pos.y - dy / d * (o.r + 0.05), pos.z - dz / d * (o.r + 0.05), b => !(o.ignoreBox && o.ignoreBox(b)))) continue;
        best = o; bs = score; best._lab = lab;
      }
    }
    if (best !== this.focus) { this.focus = best; this.holdT = 0; }
    const I = g.input;
    if (best) {
      if (best.hold) {
        if (I.held('KeyE')) { this.holdT += dt; if (best.holdTick) best.holdTick(dt, this.holdT); if (this.holdT >= best.hold) { this.holdT = 0; g.act('use', { id: best.id }); I.keys.delete('KeyE'); } }
        else this.holdT = Math.max(0, this.holdT - dt * 3);
      } else if (I.pressed('KeyE')) g.act('use', { id: best.id });
    }
    g.hud.prompt(best ? best._lab : null, best && best.hold ? this.holdT / best.hold : 0, best && best.hold);
    for (const d of this.doors) d.update(dt);
  }
  /** host side */
  use(id, pid) { const o = this.byId.get(id); if (o && o.enabled()) o.use(pid); }

  /* ---------------- doors ---------------- */
  door(B, o) { const d = new Door(this.g, B, o); this.doors.push(d); this.add(d.ia); return d; }
  /* ---------------- pickups ---------------- */
  pickup(B, o) {
    const g = this.g, key = 'got:' + o.id;
    if (g.flags[key]) return null;
    const m = o.model ? o.model() : item(o.icon || o.item || o.key);
    m.position.set(o.x, o.y, o.z); m.rotation.y = o.rot ?? Math.random() * 6;
    if (o.scale) m.scale.setScalar(o.scale);
    m.traverse(c => { if (c.isMesh) { c.castShadow = true; } });
    B.group.add(m);
    const ia = this.add({
      id: 'pk:' + o.id, pos: new THREE.Vector3(o.x, o.y + 0.08, o.z), r: 0.25, range: 2.1, zone: B.zone,
      label: o.label || (() => 'Take ' + g.itemName(o)),
      enabled: () => !g.flags[key] && (!o.when || o.when()),
      use: (pid) => { if (g.flags[key]) return; g.setFlag(key, true); g.give(pid, o); if (o.onTake) o.onTake(pid); },
    });
    g.onFlag(key, v => { if (v) { m.visible = false; this.remove(ia); } });
    return m;
  }
  /* ---------------- notes and recordings ---------------- */
  note(B, o) {
    const g = this.g;
    let m = o.model ? o.model() : null;
    if (m) { m.position.set(o.x, o.y, o.z); m.rotation.y = o.rot || 0; B.group.add(m); }
    return this.add({ id: 'note:' + o.id, pos: new THREE.Vector3(o.x, o.y + (o.dy ?? 0.05), o.z), r: o.r || 0.3, range: 2.2, zone: B.zone, label: o.label || ('Read: ' + o.title), use: () => g.readNote(o) , local: true });
  }
}

/* A door in a wall gap. axis 'x' = the wall runs along X (door slides along X), 'z' = along Z.
   kind: slide (glass/steel panels part), swing (hinged), shutter (rolls up), heavy (blast door, slow).
   lock: null | string (reason shown while locked) ; locked(): bool decides. */
class Door {
  constructor(game, B, o) {
    this.g = game; this.o = o; this.id = o.id; this.key = 'door:' + o.id;
    this.kind = o.kind || 'slide'; this.t = game.flags[this.key] ? 1 : 0; this.zone = B.zone;
    const w = o.w || 1.2, h = o.h || 2.2, th = o.th || 0.12, ax = o.axis || 'x';
    this.w = w; this.h = h; this.ax = ax;
    const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); if (ax === 'z') g.rotation.y = Math.PI / 2; B.group.add(g); this.group = g;
    const mat = o.mat ? (typeof o.mat === 'string' ? Mat(o.mat) : o.mat) : Mat(this.kind === 'heavy' ? 'metalYellow' : this.kind === 'swing' ? 'wood' : 'panelGrey');
    this.panels = [];
    const mk = (pw, ph, x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, th), mat); p.position.set(x, ph / 2, 0); p.castShadow = true; p.receiveShadow = true; g.add(p); return p; };
    if (this.kind === 'slide' || this.kind === 'heavy') { this.panels.push(mk(w / 2, h, -w / 4), mk(w / 2, h, w / 4)); }
    else if (this.kind === 'swing') { const pivot = new THREE.Group(); pivot.position.x = -w / 2; g.add(pivot); const p = mk(w - 0.02, h - 0.02, 0); p.position.x = w / 2; pivot.add(p); this.pivot = pivot; const kn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), Mat('steel')); kn.position.set(w - 0.12, 1.0, 0.08); pivot.add(kn); }
    else if (this.kind === 'shutter') { this.panels.push(mk(w, h, 0)); }
    if (this.kind === 'heavy') { // hazard stripes + a status light
      const st = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.25, th + 0.02), Mat('hazard')); st.position.y = 0.5; this.panels[0].add(st.clone()); st.position.x = 0; this.panels[1].add(st);
      this.panels[0].children[0].position.set(0, -h / 2 + 0.5, 0); this.panels[1].children[0].position.set(0, -h / 2 + 0.5, 0);
    }
    this.lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
    this.lamp.position.set(w / 2 + 0.2, h * 0.6, th / 2 + 0.03); g.add(this.lamp);
    if (this.kind === 'swing') this.lamp.visible = false;
    const lamp2 = this.lamp.clone(); lamp2.visible = this.lamp.visible; lamp2.position.z = -th / 2 - 0.03; g.add(lamp2); this.lamp2 = lamp2;
    // collision: one box filling the gap while closed
    const cx = o.x, cz = o.z;
    this.box = ax === 'x' ? game.phys.aabb(cx - w / 2, o.y, cz - 0.15, cx + w / 2, o.y + h, cz + 0.15, 'door') : game.phys.aabb(cx - 0.15, o.y, cz - w / 2, cx + 0.15, o.y + h, cz + w / 2, 'door');
    this.box.on = this.t < 0.5;
    this.open = !!game.flags[this.key];
    game.onFlag(this.key, v => { if (v !== this.open) { this.open = v; this.g.audio.door?.(this.kind === 'swing' ? 'wood' : this.kind, this.center()); } });
    const self = this;
    this.ia = {
      id: 'door:' + o.id, pos: new THREE.Vector3(cx, o.y + 1.2, cz), r: w * 0.4, range: 2.4, zone: B.zone, hold: o.hold || 0,
      ignoreBox: b => b === self.box,
      label: () => { if (o.noUse) return null; const l = self.lockReason(); if (l) return l; return self.open ? (o.closeable === false ? null : 'Close') : (o.label || 'Open'); },
      enabled: () => !o.noUse,
      use: (pid) => { const l = self.lockReason(); if (l) { game.audio.door?.('locked', self.center()); if (o.onLocked) o.onLocked(pid); return; } if (self.open && o.closeable === false) return; game.setFlag(self.key, !self.open); if (o.onOpen && !self.open) o.onOpen(pid); },
    };
  }
  center() { return { x: this.o.x, y: this.o.y + 1, z: this.o.z }; }
  lockReason() { const o = this.o; if (o.locked && o.locked()) return typeof o.lock === 'function' ? o.lock() : (o.lock || 'Locked'); return null; }
  update(dt) {
    const speed = this.kind === 'heavy' ? 0.35 : this.kind === 'shutter' ? 0.6 : this.kind === 'swing' ? 1.6 : 1.8;
    const target = this.open ? 1 : 0;
    if (this.t !== target) { this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * speed); }
    const t = this.t, e = t * t * (3 - 2 * t);
    if (this.kind === 'slide' || this.kind === 'heavy') { this.panels[0].position.x = -this.w / 4 - e * this.w / 2 * 0.95; this.panels[1].position.x = this.w / 4 + e * this.w / 2 * 0.95; }
    else if (this.kind === 'swing') this.pivot.rotation.y = -e * 1.6 * (this.o.swingDir || 1);
    else if (this.kind === 'shutter') { this.panels[0].scale.y = Math.max(0.05, 1 - e); this.panels[0].position.y = this.h - this.h * (1 - e) / 2; }
    this.box.on = t < 0.6;
    const locked = !!this.lockReason();
    const c = this.open ? 0x30ff60 : locked ? 0xff3020 : 0xffb030;
    this.lamp.material.color.setHex(c).multiplyScalar(2.5);
  }
}
