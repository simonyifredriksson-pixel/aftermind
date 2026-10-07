/* FX.js - sparks, smoke, debris, EMP rings, sedative gas, thrown devices,
   and the dust that hangs in the flashlight beam.

   Particles are one big Points buffer (additive) plus one for smoke (normal
   blending); each burst just writes into free slots. */
import * as THREE from '../../lib/three.module.js';
import { item } from '../art/Art.js';

const N = 1600, SN = 300;

export class FX {
  constructor(game) {
    this.g = game; this.empFlash = 0;
    // additive sparks
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.col = new Float32Array(N * 3); this.life = new Float32Array(N); this.size = new Float32Array(N); this.grav = new Float32Array(N); this.i = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC * smoothstep(0.5, 0.0, d), 1.0); }' });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.geo = g; game.scene.add(this.points);
    // smoke / gas
    this.sp = new Float32Array(SN * 3); this.sv = new Float32Array(SN * 3); this.sl = new Float32Array(SN); this.ss = new Float32Array(SN); this.sc = new Float32Array(SN * 3); this.si = 0;
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.sp, 3)); sg.setAttribute('size', new THREE.BufferAttribute(this.ss, 1)); sg.setAttribute('life', new THREE.BufferAttribute(this.sl, 1)); sg.setAttribute('color', new THREE.BufferAttribute(this.sc, 3));
    const smat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: 'attribute float size; attribute float life; varying float vL; varying vec3 vC; void main(){ vL = life; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vL; varying vec3 vC; void main(){ if (vL <= 0.0) discard; float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * min(vL, 1.0) * 0.35; gl_FragColor = vec4(vC, a); }' });
    this.smoke = new THREE.Points(sg, smat); this.smoke.frustumCulled = false; this.sgeo = sg; game.scene.add(this.smoke);
    // dust motes that only show in the flashlight beam
    const DN = 500, dp = new Float32Array(DN * 3); for (let i = 0; i < DN * 3; i++) dp[i] = (Math.random() - 0.5) * 12;
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dustU = { cam: { value: new THREE.Vector3() }, dir: { value: new THREE.Vector3() }, on: { value: 0 }, time: { value: 0 } };
    const dm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.dustU,
      vertexShader: 'uniform vec3 cam; uniform vec3 dir; uniform float time; varying float vA; void main(){ vec3 p = position; p += vec3(sin(time*0.3+p.y), sin(time*0.2+p.x)*0.5, cos(time*0.25+p.z)) * 0.3; p = mod(p - cam + 6.0, 12.0) - 6.0; vec3 w = cam + p; vec3 d = normalize(p); float c = dot(d, dir); float L = length(p); vA = smoothstep(0.9, 0.97, c) * smoothstep(9.0, 1.0, L) * smoothstep(0.3, 1.0, L); vec4 mv = viewMatrix * vec4(w,1.0); gl_PointSize = clamp(5.0 / -mv.z, 1.0, 5.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float on; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * on * 0.22 * smoothstep(0.5, 0.0, d), 1.0); }' });
    this.dust = new THREE.Points(dg, dm); this.dust.frustumCulled = false; game.scene.add(this.dust);
    this.rings = []; this.thrown = [];
  }
  emit(p, v, c, life, size, grav = 9) {
    const i = this.i; this.i = (this.i + 1) % N;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.size[i] = size; this.grav[i] = grav;
  }
  puff(p, v, size, life, color = [0.2, 0.2, 0.22]) {
    const i = this.si; this.si = (this.si + 1) % SN;
    this.sp[i * 3] = p.x; this.sp[i * 3 + 1] = p.y; this.sp[i * 3 + 2] = p.z; this.sv[i * 3] = v.x; this.sv[i * 3 + 1] = v.y; this.sv[i * 3 + 2] = v.z;
    this.sl[i] = life; this.ss[i] = size; this.sc[i * 3] = color[0]; this.sc[i * 3 + 1] = color[1]; this.sc[i * 3 + 2] = color[2];
  }
  sparks(p, color = 0xffb040, n = 14) {
    const c = new THREE.Color(color).multiplyScalar(3);
    for (let k = 0; k < n; k++) this.emit(p, { x: (Math.random() - 0.5) * 6, y: Math.random() * 4 + 1, z: (Math.random() - 0.5) * 6 }, c, 0.3 + Math.random() * 0.5, 0.015 + Math.random() * 0.015);
  }
  burst(p) { this.sparks(p, 0xffa040, 40); for (let k = 0; k < 8; k++) this.puff(p, { x: (Math.random() - 0.5) * 1.5, y: Math.random() * 1.2, z: (Math.random() - 0.5) * 1.5 }, 0.6 + Math.random() * 0.6, 2 + Math.random()); }
  explosion(p) {
    const c = new THREE.Color(5, 2.2, 0.6);
    for (let k = 0; k < 70; k++) this.emit(p, { x: (Math.random() - 0.5) * 14, y: Math.random() * 8, z: (Math.random() - 0.5) * 14 }, c, 0.4 + Math.random() * 0.6, 0.03 + Math.random() * 0.04);
    for (let k = 0; k < 18; k++) this.puff(p, { x: (Math.random() - 0.5) * 3, y: Math.random() * 2.5, z: (Math.random() - 0.5) * 3 }, 1.2 + Math.random(), 2.5 + Math.random() * 1.5, [0.12, 0.11, 0.1]);
    this.g.player.camShake = Math.min(1, this.g.player.camShake + Math.max(0, 1 - p.distanceTo?.(this.g.player.pos) / 14 || 0));
    this.flashLight(p, 0xffa050, 40, 0.4);
  }
  flashLight(p, color, intensity, dur) {
    const e = this.g.lights.add({ x: p.x, y: p.y + 0.5, z: p.z, color: new THREE.Color(color), intensity, distance: 12, zone: { visible: true }, flicker: 0, on: true });
    const t0 = this.g.time; const f = () => { const k = 1 - (this.g.time - t0) / dur; e.mult = Math.max(0, k); if (k <= 0) { e.on = false; const i = this.g.lights.list.indexOf(e); if (i >= 0) this.g.lights.list.splice(i, 1); this.g.updaters.splice(this.g.updaters.indexOf(f), 1); } };
    this.g.updaters.push(f);
  }
  ring(p, color, r1, dur) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.copy(p); m.rotation.x = Math.PI / 2; this.g.scene.add(m);
    const sph = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    sph.position.copy(p); this.g.scene.add(sph);
    this.rings.push({ m, sph, t: 0, dur, r1 });
  }
  /** host -> everyone visual events */
  event(e) {
    const p = e.p ? new THREE.Vector3(e.p.x, e.p.y, e.p.z) : null;
    switch (e.n) {
      case 'sparks': this.sparks(p, e.c, e.k2 || 14); break;
      case 'burst': this.burst(p); break;
      case 'explosion': this.explosion(p); break;
      case 'emp': this.ring(p, 0x60b0ff, 7, 0.7); this.sparks(p, 0x80c0ff, 50); if (p.distanceTo(this.g.player.pos) < 9) this.empFlash = 0.8; this.flashLight(p, 0x80b0ff, 30, 0.5); break;
      case 'gas': for (let k = 0; k < 40; k++) this.puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)), { x: (Math.random() - 0.5), y: 0.2, z: (Math.random() - 0.5) }, 1.5 + Math.random(), 4 + Math.random() * 2, [0.25, 0.55, 0.3]); break;
      case 'vanish': this.ring(p, 0xe0e8ff, 3, 0.6); for (let k = 0; k < 40; k++) this.emit(p, { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 3 }, new THREE.Color(2, 2.2, 2.6), 0.8 + Math.random(), 0.02, 0); break;
      case 'throw': this._throwVisual(e); break;
      case 'repair': for (let k = 0; k < 6; k++) setTimeout(() => this.sparks(p, 0x9fe8ff, 18), k * 220); break;
      case 'dustfall': for (let k = 0; k < 30; k++) this.puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)), { x: 0, y: -0.6, z: 0 }, 0.5 + Math.random() * 0.5, 2.5, [0.3, 0.28, 0.25]); break;
    }
  }
  /** host: a thrown device. Everyone sees it fly (fx event); only the host applies its effect. */
  throwable(kind, p, v, pid) { this.g.emit({ k: 'fx', n: 'throw', kind, p, v, host: true }); }
  _throwVisual(e) {
    const m = item(e.kind); m.scale.multiplyScalar(1.4); m.position.set(e.p.x, e.p.y, e.p.z); this.g.scene.add(m);
    this.thrown.push({ m, kind: e.kind, p: new THREE.Vector3(e.p.x, e.p.y, e.p.z), v: new THREE.Vector3(e.v.x, e.v.y, e.v.z), t: 0, landed: false, beep: 0 });
  }
  _thrown(dt) {
    const g = this.g, ph = g.phys;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const o = this.thrown[i]; o.t += dt;
      if (!o.landed) {
        o.v.y -= 18 * dt;
        const step = o.v.clone().multiplyScalar(dt), L = step.length();
        const hit = L > 1e-4 ? ph.ray(o.p.x, o.p.y, o.p.z, step.x / L, step.y / L, step.z / L, L + 0.08) : null;
        if (hit) {
          o.p.addScaledVector(step, Math.max(0, (hit.t - 0.08) / L));
          const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
          o.v.reflect(n).multiplyScalar(0.4); g.audio.hitMetal?.(o.p, false);
          if (hit.ny > 0.5 && o.v.length() < 2) { o.landed = true; o.v.set(0, 0, 0); if (o.kind === 'decoy' && g.isHost) { g.enemies.decoy(o.p, 12); } if (o.kind === 'decoy') g.audio.decoy?.(o.p, true); }
        } else o.p.add(step);
        o.m.position.copy(o.p); o.m.rotation.x += dt * 8; o.m.rotation.z += dt * 5;
      }
      if (o.kind === 'emp' && o.t > 1.3) {
        if (g.isHost) g.enemies.emp(o.p, 7.5);
        this.event({ n: 'emp', p: o.p }); g.audio.emp?.(o.p);
        g.scene.remove(o.m); this.thrown.splice(i, 1); continue;
      }
      if (o.kind === 'decoy') {
        o.beep -= dt; if (o.beep <= 0 && o.landed) { o.beep = 0.6; this.sparks(o.p.clone().setY(o.p.y + 0.1), 0x40ff80, 3); }
        if (o.t > 13) { g.audio.decoy?.(o.p, false); this.burst(o.p); g.scene.remove(o.m); this.thrown.splice(i, 1); }
      }
    }
  }
  update(dt) {
    const g = this.g;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { if (this.size[i]) { this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] < 0.2) { this.col[i * 3] *= 0.9; this.col[i * 3 + 1] *= 0.9; this.col[i * 3 + 2] *= 0.9; }
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
    for (let i = 0; i < SN; i++) { if (this.sl[i] <= 0) continue; this.sl[i] -= dt * 0.5; this.sp[i * 3] += this.sv[i * 3] * dt; this.sp[i * 3 + 1] += this.sv[i * 3 + 1] * dt; this.sp[i * 3 + 2] += this.sv[i * 3 + 2] * dt; this.ss[i] += dt * 0.3; }
    this.sgeo.attributes.position.needsUpdate = true; this.sgeo.attributes.life.needsUpdate = true; this.sgeo.attributes.size.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; const k = r.t / r.dur; const s = 0.5 + k * r.r1; r.m.scale.setScalar(s); r.sph.scale.setScalar(s); r.m.material.opacity = 1 - k; r.sph.material.opacity = 0.3 * (1 - k); if (k >= 1) { g.scene.remove(r.m); g.scene.remove(r.sph); this.rings.splice(i, 1); } }
    this._thrown(dt);
    this.empFlash = Math.max(0, this.empFlash - dt * 1.5);
    // dust in the beam (indoors)
    const u = this.dustU; u.cam.value.copy(g.camera.position); g.player.forward(u.dir.value); u.time.value = g.time;
    u.on.value += ((g.player.lightOn && !(g.zone?.outdoor) ? 1 : 0) - u.on.value) * Math.min(1, dt * 4);
  }
}
