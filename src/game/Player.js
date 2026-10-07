/* Player.js - you: a first-person body in a world of boxes.

   WASD walk, Shift sprint (stamina), Space jump, C crouch (quiet), F the
   flashlight (about five minutes a battery; it flickers and fails as it
   runs out; R swaps in a fresh one), E interact, 1-5 / wheel tools,
   left click use, right click secondary (raise the camera, charge the prod).

   Every footstep is a sound event: machines that hunt by ear hear sprinting
   from far away and crouching from almost nowhere. */
import * as THREE from '../../lib/three.module.js';
import { clamp, damp, lerp } from '../core/Util.js';
import { STEP } from '../world/Physics.js';

const SURF = { asphalt: 'concrete', concrete: 'concrete', concreteDark: 'concrete', pavers: 'concrete', plaster: 'concrete', wood: 'wood', carpet: 'carpet', carpetRed: 'carpet', tiles: 'tile', tilesSmall: 'tile', tilesSubway: 'tile', tilesGreen: 'tile', grate: 'grate', metal: 'metal', metalYellow: 'metal', metalRed: 'metal', metalBlue: 'metal', metalWhite: 'metal', steel: 'metal', rust: 'metal', panelWhite: 'tile', panelGrey: 'metal', panelDark: 'metal', hazard: 'metal', tunnel: 'concrete', water: 'water' };
export const EYE = 1.62, CROUCH_EYE = 1.05;

export class Player {
  constructor(game) {
    this.g = game; this.cam = game.camera;
    this.body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.32, h: 1.75, grounded: false };
    this.yaw = 0; this.pitch = 0; this.eye = EYE;
    this.hp = 100; this.stamina = 100; this.exhausted = false; this.staminaT = 0;
    this.battery = 1; this.light = false; this.flick = 1;
    this.tool = 'none'; this.useT = 0; this.charge = 0;
    this.bob = 0; this.stepD = 0; this.hurtT = 9; this.down = false; this.dead = false; this.slow = 0; this.sedate = 0;
    this.noise = 0; this.frozen = false; this.lockLook = false;
    this.camShake = 0; this.lookTarget = null;
    // flashlight: a shadow-casting spot on the camera, plus a faint fill so the beam's spill reads
    const s = new THREE.SpotLight(0xfff1dc, 0, 34, 0.52, 0.42, 1.6);
    s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.camera.near = 0.2; s.shadow.camera.far = 34; s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02;
    s.position.set(0.18, -0.18, 0.05); this.cam.add(s);
    s.target.position.set(0.05, -0.1, -6); this.cam.add(s.target);
    this.spot = s;
    this.fill = new THREE.PointLight(0xfff1dc, 0, 4.5, 2); this.fill.position.set(0, 0, -1.2); this.cam.add(this.fill);
    this._v = new THREE.Vector3();
  }
  get pos() { return this.body.pos; }
  place(x, y, z, yaw = 0) { this.body.pos.set(x, y, z); this.body.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; this.body.grounded = true; }
  inv() { return this.g.inv; }

  damage(n, from = null, kind = 'hit') {
    if (this.down || this.g.god) return;
    if (this.inv().upgrades.armor) n *= 0.7;
    this.hp -= n; this.hurtT = 0; this.camShake = Math.min(1, this.camShake + n / 30);
    this.g.audio.hurt?.(Math.min(1, n / 40));
    this.g.fxHurt = Math.min(1, (this.g.fxHurt || 0) + n / 40);
    if (from) { const dx = from.x - this.pos.x, dz = from.z - this.pos.z; this.g.hud.hitFrom(Math.atan2(dx, dz) - this.yaw); }
    if (kind === 'sedate') { this.sedate = Math.min(1, this.sedate + 0.4); this.stamina = Math.max(0, this.stamina - 35); }
    if (this.hp <= 0) { this.hp = 0; this.g.onPlayerDown(); }
  }
  heal(n) { this.hp = Math.min(100, this.hp + n); }

  update(dt) {
    const I = this.g.input, B = this.body, g = this.g;
    const can = !this.down && !this.frozen && g.phase === 'play' && !g.ui.modal;
    // look
    if (can && !this.lockLook) {
      const l = I.look(); const zoom = g.photo?.zoom || 1;
      this.yaw -= l.x / zoom; this.pitch = clamp(this.pitch - l.y / zoom, -1.45, 1.45);
    }
    if (this.lookTarget) { // a scripted glance (cinematic beats)
      const t = this.lookTarget, dx = t.x - this.pos.x, dz = t.z - this.pos.z, dy = t.y - (this.pos.y + this.eye);
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
      let d = ty - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-dt * 3)); this.pitch += (tp - this.pitch) * (1 - Math.exp(-dt * 3));
    }
    // move
    let fx = 0, fz = 0;
    if (can) { fz = I.axis('KeyS', 'KeyW'); fx = I.axis('KeyA', 'KeyD'); }
    const crouch = can && (I.held('KeyC') || I.held('ControlLeft'));
    const moving = fx || fz;
    let sprint = can && I.held('ShiftLeft') && moving && fz > 0 && !this.exhausted && !crouch;
    if (this.sedate > 0) { this.sedate = Math.max(0, this.sedate - dt * 0.08); }
    let speed = crouch ? 1.7 : sprint ? 6.2 : 3.3;
    speed *= 1 - this.sedate * 0.45;
    if (g.photo?.raised) speed *= 0.55;
    // stamina
    if (sprint) { this.stamina -= dt * 17; this.staminaT = 0.9; if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; } }
    else { this.staminaT -= dt; if (this.staminaT <= 0) this.stamina = Math.min(100, this.stamina + dt * (this.exhausted ? 14 : 24)); if (this.exhausted && this.stamina > 35) this.exhausted = false; }
    const len = Math.hypot(fx, fz) || 1, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = (fx * c - fz * s) / len * speed, wz = (-fx * s - fz * c) / len * speed;
    const acc = B.grounded ? 14 : 3;
    B.vel.x = damp(B.vel.x, moving ? wx : 0, acc, dt); B.vel.z = damp(B.vel.z, moving ? wz : 0, acc, dt);
    if (can && I.pressed('Space') && B.grounded && this.stamina > 8) { B.vel.y = 6.2; B.grounded = false; this.stamina -= 8; g.audio.jump?.(); this.makeNoise(7); }
    const wasGround = B.grounded;
    B.h = crouch ? 1.15 : 1.75;
    if (!crouch && this.eye < EYE - 0.05) { // standing up under something?
      const ceil = g.phys.ceiling(B.pos.x, B.pos.z, B.pos.y, 1.15); if (ceil < B.pos.y + 1.8) B.h = 1.15;
    }
    if (g.noclip) {
      const fl = (I.held('ShiftLeft') ? 22 : 8) * (can ? 1 : 0), up = (I.held('Space') ? 1 : 0) - (I.held('KeyC') ? 1 : 0);
      const cp = Math.cos(this.pitch), dirx = -Math.sin(this.yaw) * cp, diry = Math.sin(this.pitch), dirz = -Math.cos(this.yaw) * cp;
      const f = can ? I.axis('KeyS', 'KeyW') : 0, sx = can ? I.axis('KeyA', 'KeyD') : 0;
      B.pos.x += (dirx * f + Math.cos(this.yaw) * sx) * fl * dt; B.pos.z += (dirz * f - Math.sin(this.yaw) * sx) * fl * dt; B.pos.y += (diry * f + up) * fl * dt;
      B.vel.set(0, 0, 0); B.grounded = false; B.landV = 0;
    } else g.phys.stepBody(B, dt);
    if (!wasGround && B.grounded && B.landV > 4) { g.audio.land?.(Math.min(1, B.landV / 12)); this.makeNoise(B.landV); if (B.landV > 11) this.damage((B.landV - 11) * 8); this.camShake = Math.min(1, this.camShake + B.landV / 30); }
    if (B.fell) { B.fell = false; g.respawnLocal(); }
    this.eye = damp(this.eye, B.h < 1.5 ? CROUCH_EYE : EYE, 12, dt);
    // footsteps
    const hv = Math.hypot(B.vel.x, B.vel.z);
    if (B.grounded && hv > 0.5) {
      this.stepD += hv * dt;
      const stride = sprint ? 1.9 : crouch ? 0.9 : 1.45;
      this.bob += hv * dt * (Math.PI / stride);
      if (this.stepD > stride) {
        this.stepD = 0;
        const gb = B.groundBox; const surf = (gb && SURF[gb.mat]) || g.zone?.surface || 'concrete';
        const wet = g.zone?.outdoor && g.atmos.roofAt(this.pos.x, this.pos.z) < -90 && surf === 'concrete';
        g.audio.step?.(wet ? 'water' : surf, hv);
        this.makeNoise(sprint ? 14 : crouch ? 1.2 : 4.5);
      }
    }
    this.sprinting = sprint && hv > 4;
    this.crouching = crouch;
    // flashlight
    this._flashlight(dt, can);
    // camera transform
    const shake = this.camShake; this.camShake = Math.max(0, this.camShake - dt * 2);
    const bobA = B.grounded ? Math.min(1, hv / 4) : 0;
    const by = Math.abs(Math.sin(this.bob)) * 0.045 * bobA * (sprint ? 1.6 : 1), bx = Math.cos(this.bob) * 0.03 * bobA;
    this.cam.position.set(B.pos.x + bx * c, B.pos.y + this.eye + by, B.pos.z - bx * s);
    this.cam.rotation.set(0, 0, 0); this.cam.rotation.order = 'YXZ';
    this.cam.rotation.y = this.yaw + (Math.random() - 0.5) * shake * 0.03;
    this.cam.rotation.x = this.pitch + (Math.random() - 0.5) * shake * 0.03;
    this.cam.rotation.z = -B.vel.x * c * 0.002 + B.vel.z * s * 0.002 + (this.down ? 0.4 : 0);
    if (this.down) this.cam.position.y = B.pos.y + 0.4;
    this.hurtT += dt;
    this.noise = Math.max(0, this.noise - dt * 10);
    // breathing/heart
    g.audio.breath?.(this.stamina / 100);
  }
  _flashlight(dt, can) {
    const g = this.g, I = g.input;
    if (can && I.pressed('KeyF')) { this.light = !this.light; g.audio.flashlight?.(this.light); if (this.light && this.battery <= 0) { g.hud.toast('The flashlight is dead. Swap the battery (R).'); } }
    if (can && I.pressed('KeyR')) this.swapBattery();
    const drain = 1 / (this.inv().upgrades.bigbatt ? 480 : 300);
    if (this.light && this.battery > 0) { this.battery = Math.max(0, this.battery - dt * drain); if (this.battery <= 0) g.onBatteryDead(); }
    // reliability: below 15% it flickers, below 5% it stutters and cuts out
    const b = this.battery; let f = 1;
    const t = performance.now() / 1000;
    if (b < 0.15) { const k = 1 - b / 0.15; f = 1 - k * 0.35 * (0.5 + 0.5 * Math.sin(t * 23) * Math.sin(t * 5.3)); if (Math.sin(t * 1.7 + Math.sin(t * 0.37) * 4) > 1 - k * 0.25) f *= 0.08; if (Math.random() < dt * k * 0.6) { this.flick = 0; g.audio.flicker?.(); } }
    if (b < 0.05 && Math.random() < dt * 0.8) { this.flick = 0; g.audio.flicker?.(); }
    this.flick = Math.min(1, this.flick + dt * 6);
    if (g.director?.lightFail > 0) f *= 0.1;
    const on = this.light && b > 0 && !this.down;
    const target = on ? 26 * f * (this.flick > 0.6 ? 1 : 0.05) * (0.75 + 0.25 * Math.min(1, b * 4)) : 0;
    this.spot.intensity = damp(this.spot.intensity, target, 30, dt);
    this.fill.intensity = this.spot.intensity * 0.022;
    if (b < 0.15 && this.light) { this._lowT = (this._lowT || 0) - dt; if (this._lowT <= 0) { this._lowT = 20; g.audio.flashlightLow?.(); g.onBatteryLow?.(); } }
    this.lightOn = on && this.spot.intensity > 5;
  }
  swapBattery() {
    const inv = this.inv();
    if ((inv.items.battery || 0) <= 0) { this.g.audio.deny?.(); this.g.hud.toast('No spare batteries.'); return false; }
    if (this.battery > 0.9) { this.g.hud.toast('This battery is still nearly full.'); return false; }
    inv.items.battery--; this.battery = 1; this.flick = 0;
    this.g.audio.pickup?.('battery'); this.g.hud.toast('Fresh battery.');
    return true;
  }
  makeNoise(r) { this.noise = Math.max(this.noise, r); this.g.enemies?.hear(this.pos, r, this); }
  /** forward vector and eye position */
  eyePos(v = new THREE.Vector3()) { return v.copy(this.cam.position); }
  forward(v = new THREE.Vector3()) { return v.set(0, 0, -1).applyQuaternion(this.cam.quaternion); }
  /** how strongly the flashlight lights a world point (0..1) */
  litAmount(p) {
    if (!this.lightOn) return 0;
    const e = this.cam.position, f = this.forward(this._v);
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, d = Math.hypot(dx, dy, dz);
    if (d > 30) return 0;
    const cos = (dx * f.x + dy * f.y + dz * f.z) / d;
    if (cos < 0.84) return 0;
    if (!this.g.phys.clear(e.x, e.y, e.z, p.x, p.y, p.z)) return 0;
    return Math.min(1, (cos - 0.84) / 0.1) * Math.min(1, 1.4 - d / 30);
  }
  netState() { return { x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), l: this.lightOn ? 1 : 0, t: this.tool, c: this.crouching ? 1 : 0, s: this.sprinting ? 1 : 0, d: this.down ? 1 : 0, hp: Math.round(this.hp) }; }
}
export { lerp, STEP };
