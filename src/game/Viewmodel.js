/* Viewmodel.js - your hands, and what is in them.

   Drawn in its own little scene on top of the world (so a tool never sinks
   into a wall), lit to match how bright your surroundings are. The left
   hand always holds the flashlight; the right hand holds the current tool:

     1 camera   raise with right mouse (see Photo.js)
     2 arc prod left click strike, hold right mouse to charge a heavy strike
     3 EMP      left click throws it
     4 decoy    left click throws it
     5 med foam left click uses it

   Tool actions live here too: the prod swing ray, throwing, healing. */
import * as THREE from '../../lib/three.module.js';
import { item } from '../art/Art.js';
import { TOOLS } from '../data/Items.js';
import { damp } from '../core/Util.js';

const ORDER = ['camera', 'prod', 'emp', 'decoy', 'medkit'];

export class Viewmodel {
  constructor(game) {
    this.g = game;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    addEventListener('resize', () => { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); });
    this.amb = new THREE.HemisphereLight(0xbfd0e0, 0x302820, 0.6); this.scene.add(this.amb);
    this.key = new THREE.DirectionalLight(0xffffff, 0.8); this.key.position.set(-1, 2, 1); this.scene.add(this.key);
    this.beam = new THREE.PointLight(0xfff1dc, 0, 3, 2); this.beam.position.set(-0.1, 0, -0.6); this.scene.add(this.beam);
    this.scene.environment = game.scene.environment;
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.left = this._hand(true); this.right = this._hand(false);
    this.left.position.set(-0.26, -0.26, -0.48); this.right.position.set(0.27, -0.27, -0.5);
    this.root.add(this.left, this.right);
    this.torch = this._torch(); this.left.add(this.torch); this.torch.position.set(0.02, 0.06, -0.08);
    this.tools = {};
    this.swing = 0; this.throwT = 0; this.healT = 0; this.drawT = 0; this.charge = 0; this.sway = { x: 0, y: 0 };
    this.cur = 'none'; this._hidden = false;
  }
  hide(v) { this._hidden = v; this.root.visible = !v; }
  _hand(left) {
    const g = new THREE.Group();
    const glove = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.75 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x3a4436, roughness: 0.9 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.035, 0.1), glove); g.add(palm);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 3, 6), glove); f.rotation.x = Math.PI / 2 - 0.9; f.position.set(-0.03 + i * 0.02, 0.012, -0.06); g.add(f); }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.04, 3, 6), glove); th.rotation.z = left ? -0.9 : 0.9; th.position.set(left ? 0.05 : -0.05, 0.01, -0.02); g.add(th);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.34, 10), sleeve); arm.rotation.x = Math.PI / 2; arm.position.set(0, -0.01, 0.2); g.add(arm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6 })); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.05; g.add(cuff);
    return g;
  }
  _torch() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.35, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 14), m); body.rotation.x = Math.PI / 2; g.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.05, 16), m); head.rotation.x = Math.PI / 2; head.position.z = -0.1; g.add(head);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false })); this.lens.position.z = -0.126; this.lens.rotation.y = Math.PI; g.add(this.lens);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })); grip.rotation.x = Math.PI / 2; grip.position.z = 0.03; g.add(grip);
    return g;
  }
  _toolModel(t) {
    if (this.tools[t]) return this.tools[t];
    const m = item(t);
    m.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()).length();
    const s = (t === 'prod' ? 0.42 : 0.16) / Math.max(0.01, size); m.scale.setScalar(s);
    const holder = new THREE.Group(); holder.add(m);
    if (t === 'prod') { m.rotation.set(-Math.PI / 2 + 0.25, 0, 0); m.position.set(0, 0.02, -0.06); }
    else if (t === 'camera') { m.rotation.y = Math.PI; m.position.set(-0.02, 0.03, -0.05); }
    else { m.position.set(0, 0.02, -0.05); }
    holder.visible = false; this.right.add(holder); this.tools[t] = holder;
    return holder;
  }
  select(t) {
    const g = this.g, p = g.player;
    if (t !== 'none' && !this.owned(t)) return;
    if (p.tool === t) return;
    p.tool = t; this.drawT = 0; g.audio.uiClick?.();
    for (const k in this.tools) this.tools[k].visible = false;
    if (t !== 'none') this._toolModel(t).visible = true;
    g.hud.tool(t);
  }
  owned(t) { const inv = this.g.inv; if (t === 'camera') return !!inv.tools.camera; if (t === 'prod') return !!inv.tools.prod; return (inv.items[t] || 0) > 0; }
  update(dt) {
    const g = this.g, p = g.player, I = g.input;
    const can = g.phase === 'play' && !g.ui.modal && !p.down && !p.frozen;
    if (can) {
      ORDER.forEach((t, i) => { if (I.pressed('Digit' + (i + 1))) this.select(p.tool === t ? 'none' : t); });
      if (I.pressed('KeyQ')) this.select('none');
      if (!g.photo.raised) { const w = I.wheel(); if (w) { const own = ['none', ...ORDER.filter(t => this.owned(t))]; let i = own.indexOf(p.tool); i = (i + (w > 0 ? 1 : -1) + own.length) % own.length; this.select(own[i]); } }
    }
    if (p.tool !== 'none' && !this.owned(p.tool)) this.select('none');
    // actions
    this.swing = Math.max(0, this.swing - dt * 3.2); this.throwT = Math.max(0, this.throwT - dt * 2.5); this.healT = Math.max(0, this.healT - dt);
    if (can && p.tool === 'prod') this._prod(dt);
    if (can && (p.tool === 'emp' || p.tool === 'decoy') && I.click(0) && this.throwT <= 0) this._throw(p.tool);
    if (can && p.tool === 'medkit' && I.click(0) && this.healT <= 0) { if (p.hp >= 100) g.hud.toast('You are not hurt.'); else { g.inv.items.medkit--; this.healT = 1.2; setTimeout(() => { p.heal(55); g.audio.pickup?.('item'); g.hud.toast('Med foam: +55'); }, 700); } }
    // pose
    this.drawT = Math.min(1, this.drawT + dt * 4);
    const look = g.input.mouse; this.sway.x = damp(this.sway.x, -look.dx * 0.0004, 8, dt); this.sway.y = damp(this.sway.y, look.dy * 0.0004, 8, dt);
    const bob = p.bob, mv = Math.min(1, Math.hypot(p.body.vel.x, p.body.vel.z) / 4) * (p.body.grounded ? 1 : 0);
    const bx = Math.cos(bob) * 0.012 * mv, by = Math.abs(Math.sin(bob)) * 0.014 * mv;
    const raise = g.photo.raiseT;
    this.root.position.set(this.sway.x + bx, this.sway.y - by - raise * 0.35, 0);
    const sw = this.swing, e = sw > 0.6 ? (1 - sw) / 0.4 : sw / 0.6; // windup then strike
    this.right.position.set(0.27 - e * 0.18, -0.27 + (1 - this.drawT) * -0.3 + this.charge * 0.05, -0.5 - e * 0.15);
    this.right.rotation.set(-e * 0.9 + this.charge * 0.4, e * 0.5, -e * 0.6);
    const th = this.throwT; this.right.position.y += th > 0.5 ? (th - 0.5) * 0.4 : -th * 0.2; this.right.rotation.x += th > 0.5 ? (th - 0.5) * 2 : 0;
    const heal = this.healT > 0 ? Math.sin(this.healT / 1.2 * Math.PI) : 0; this.right.position.y += heal * 0.12; this.right.rotation.x += heal * 0.8;
    this.left.visible = true; this.right.visible = p.tool !== 'none' || true;
    this.left.position.set(-0.26, -0.26 - (p.light ? 0 : 0.03), -0.48);
    // lighting follows the world
    const bright = g.zone?.outdoor ? 0.55 : 0.32;
    this.amb.intensity = damp(this.amb.intensity, bright + (p.lightOn ? 0.25 : 0) + (g.atmos.flash || 0) * 2, 6, dt);
    this.key.intensity = this.amb.intensity * 1.2;
    this.beam.intensity = p.lightOn ? 0.6 : 0;
    this.lens.material.color.setRGB(p.lightOn ? 3 : 0.1, p.lightOn ? 2.8 : 0.1, p.lightOn ? 2.4 : 0.1);
    this.root.visible = !this._hidden && raise < 0.8 && !p.down && g.phase === 'play';
  }
  _prod(dt) {
    const g = this.g, p = g.player, I = g.input;
    if (I.btn(2)) { this.charge = Math.min(1, this.charge + dt * 1.2); if (this.charge > 0.98 && !this._full) { this._full = true; g.audio.flashCharge?.(); } }
    if (I.unclick(2) && this.charge > 0.95) { this._strike(true); }
    if (!I.btn(2)) { this.charge = 0; this._full = false; }
    if (I.click(0) && this.swing <= 0) this._strike(false);
  }
  _strike(heavy) {
    const g = this.g, p = g.player;
    const cost = heavy ? 0.12 : 0.04;
    if ((p.prodCharge || 0) < cost) { g.audio.deny?.(); g.hud.toast('The prod is out of charge. GUIDE can recharge it with an energy cell.'); this.swing = 0.6; return; }
    p.prodCharge -= cost; this.swing = 1; this.charge = 0;
    const plus = g.inv.upgrades.prodplus;
    setTimeout(() => {
      const o = p.eyePos(new THREE.Vector3()), d = p.forward(new THREE.Vector3());
      let hit = g.enemies.pick(o, d, plus ? 2.9 : 2.5);
      if (!hit && plus) { // a wider arc
        for (const a of [-0.25, 0.25]) { const d2 = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a); hit = g.enemies.pick(o, d2, 2.6); if (hit) break; }
      }
      g.audio.prodZap?.(hit ? hit.point : o);
      if (hit) {
        const dmg = (heavy ? 70 : 24) * (plus ? 2 : 1);
        g.act('hit', { eid: hit.e.id, dmg, wp: hit.wp, kind: heavy ? 'stun' : 'hit' });
        g.fx.sparks(hit.point, hit.wp ? 0x60d0ff : 0x8fd8ff, heavy ? 30 : 14);
        p.camShake = Math.max(p.camShake, heavy ? 0.5 : 0.2);
        if (hit.wp && g.knows(hit.e.type)) g.hud.hitmark(true); else g.hud.hitmark(false);
      } else {
        // sparks against a wall
        const r = g.phys.ray(o.x, o.y, o.z, d.x, d.y, d.z, 2.4);
        if (r) { const pt = o.clone().addScaledVector(d, r.t); g.fx.sparks(pt, 0x8fd8ff, 6); g.audio.hitMetal?.(pt, false); }
      }
      p.makeNoise(heavy ? 9 : 5);
    }, heavy ? 60 : 120);
  }
  _throw(kind) {
    const g = this.g, p = g.player;
    if ((g.inv.items[kind] || 0) <= 0) return;
    g.inv.items[kind]--; this.throwT = 1;
    const o = p.eyePos(new THREE.Vector3()), d = p.forward(new THREE.Vector3());
    const v = d.multiplyScalar(13).add(new THREE.Vector3(0, 3.2, 0)).add(p.body.vel.clone().multiplyScalar(0.5));
    setTimeout(() => g.act('throw', { kind, p: { x: o.x, y: o.y - 0.15, z: o.z }, v: { x: v.x, y: v.y, z: v.z } }), 150);
  }
}
export { TOOLS };
