/* Remote.js - another player, as you see them: a survivor model that walks
   where their snapshots say, with a working flashlight (one of three spot
   lights made at boot, so a friend joining never recompiles shaders) and a
   name tag. */
import * as THREE from '../../lib/three.module.js';
import { survivorModel } from '../art/Art.js';
import { damp, dampAngle } from '../core/Util.js';

export function makeRemoteSpots(scene) {
  const out = [];
  for (let i = 0; i < 3; i++) { const s = new THREE.SpotLight(0xfff1dc, 0, 28, 0.5, 0.45, 1.6); s.userData.free = true; scene.add(s); scene.add(s.target); out.push(s); }
  return out;
}

export class Remote {
  constructor(game, id, prof) {
    this.g = game; this.id = id; this.name = prof.name || 'Survivor'; this.look = prof.look | 0;
    this.m = survivorModel(this.look); this.root = this.m.root; game.scene.add(this.root);
    this.root.traverse(c => { if (c.isMesh) c.castShadow = true; });
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.light = false; this.down = false; this.crouch = false; this.noise = 0; this.s = null;
    this.spot = (game.remoteSpots || []).find(s => s.userData.free) || null; if (this.spot) this.spot.userData.free = false;
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    x.font = '600 30px "Rajdhani", sans-serif'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillText(this.name, 129, 42); x.fillStyle = '#d8e6ee'; x.fillText(this.name, 128, 40);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
    this.tag.scale.set(0.9, 0.22, 1); this.tag.renderOrder = 10; game.scene.add(this.tag);
  }
  apply(s) { if (!this.s) this.pos.set(s.x, s.y, s.z); this.s = s; this.light = !!s.l; this.down = !!s.d; this.crouch = !!s.c; this.noise = s.s ? 14 : 4; }
  update(dt) {
    const s = this.s; if (!s) return;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x = damp(this.pos.x, s.x, 12, dt); this.pos.y = damp(this.pos.y, s.y, 12, dt); this.pos.z = damp(this.pos.z, s.z, 12, dt);
    this.yaw = dampAngle(this.yaw, s.yaw, 12, dt); this.pitch = damp(this.pitch, s.pitch, 12, dt);
    const sp = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-4);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw + Math.PI;
    this.m.update(dt, { speed: sp, sprint: !!s.s, crouch: this.crouch, pitch: this.pitch, flashlight: this.light, tool: s.t || 'none', dead: this.down, hurtT: 9 });
    this.tag.position.set(this.pos.x, this.pos.y + 2.1, this.pos.z);
    const d = this.pos.distanceTo(this.g.player.pos); this.tag.visible = d < 25 && this.g.phys.clear(this.g.camera.position.x, this.g.camera.position.y, this.g.camera.position.z, this.pos.x, this.pos.y + 1.6, this.pos.z);
    if (this.spot) {
      const a = this.m.flashlightAnchor; const w = new THREE.Vector3();
      if (a) a.getWorldPosition(w); else w.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
      this.spot.position.copy(w);
      const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      this.spot.target.position.copy(w).addScaledVector(f, 6);
      this.spot.intensity = this.light ? 22 : 0;
    }
    this.noise = Math.max(0, this.noise - dt * 10);
  }
  dispose() { this.g.scene.remove(this.root); this.g.scene.remove(this.tag); if (this.spot) { this.spot.intensity = 0; this.spot.userData.free = true; } }
}
