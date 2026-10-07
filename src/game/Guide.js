/* Guide.js - GUIDE, the one machine you can still trust.

   Host-simulated like everything shared. Modes:
     slumped  - as found: broken against a wall, visor flickering
     follow   - keeps a step behind and to the side of the nearest player,
                walks the nav graph when you are far, catches up out of sight
                when you are very far (drops, ladders, elevators)
     goto     - walks to a scripted spot (then faces something)
     hold     - holds a lever / valve for a two-person puzzle when you are alone
     stay     - waits where he is

   He speaks through a host-side queue so every player hears the same line
   at the same time; barks about your own battery are local only.
   The machines ignore him. He does not know why. (Neither do you, yet.) */
import * as THREE from '../../lib/three.module.js';
import { guideModel } from '../art/Art.js';
import { MACHINES, MEMORIES } from '../data/Machines.js';
import { RECIPES } from '../data/Items.js';
import { damp, dampAngle, wrapAngle } from '../core/Util.js';

const BARKS = {
  battery_low: ['Your light is getting weak. Do you have a spare battery?', 'That flicker is the battery, not a ghost. Probably.', 'Battery\'s low. Let\'s not be here when it dies.'],
  battery_dead: ['Your light is out. Press R if you have a spare. Please have a spare.', 'It\'s dark. I can see a little. You can\'t. Battery, please.'],
  enemy_close: ['Something is moving close by.', 'Quiet. Listen.', 'I can hear servos. Not mine.'],
  chase: ['Run!', 'It\'s seen you - go, go!', 'Don\'t look back, just run!'],
  lost_them: ['I think we lost it.', 'It\'s gone. For now.'],
  hurt: ['You\'re hurt. Let me look - no, I can\'t fix people. Find some med foam.', 'Your heart rate is very high. That is not a compliment.'],
  new_photo: ['Show me that photo when you get a chance.', 'Got a picture? Let me see it - I might remember something.'],
  idle: ['It is very quiet.', 'Do you hear the rain? I like the rain. I think I always did.', 'Every screen in this city is still on. Who are they talking to?', 'I wish I could remember the last thing I said to you before all this.'],
  built: ['There. Careful with it.', 'Done! My hands remember more than my head does.', 'Built. I think I used to do this a lot.'],
  unknown_item: ['That part - I don\'t recognise it yet. If we see the machine it came from, I might.'],
};

export class Guide {
  constructor(game) {
    this.g = game;
    this.m = guideModel({ damaged: true });
    this.root = this.m.root; game.scene.add(this.root);
    this.root.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    this.body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.28, h: 1.05, grounded: true };
    this.yaw = 0; this.mode = 'slumped'; this.face = 'glitch'; this.gesture = 'slumped'; this.gestureT = 0;
    this.path = null; this.pathT = 0; this.speed = 0; this.talking = 0; this.scanning = 0;
    this.queue = []; this.lineT = 0; this.cool = {}; this.idleT = 30; this.lookYaw = 0; this.lookPitch = 0;
    this.repaired = false; this.hidden = false;
    this.glow = game.lights.add({ x: 0, y: 0, z: 0, color: new THREE.Color(0x50e0ff), intensity: 0, distance: 3.2, zone: { visible: true }, flicker: 0, on: true });
    game.onFlag('guide:repaired', v => this.setRepaired(!!v));
    // the scanning fan from his visor
    const fan = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.9, 1.2), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    fan.rotation.x = -Math.PI / 2; fan.position.set(0, 0, 1.25); fan.visible = false;
    this.fanPivot = new THREE.Group(); this.fanPivot.add(fan); this.fan = fan; game.scene.add(this.fanPivot);
    this._v = new THREE.Vector3();
  }
  get pos() { return this.body.pos; }
  place(x, y, z, yaw = 0) { this.body.pos.set(x, y, z); this.yaw = yaw; this.path = null; }
  setRepaired(v) {
    if (v === this.repaired) return;
    this.repaired = v; this.m.setDamaged(!v);
    if (v) { this.glow.intensity = 0.45; if (this.mode === 'slumped') { this.mode = 'stay'; this.gesture = null; } }
    else { this.glow.intensity = 0; }
  }

  /* ---------------- speech ---------------- */
  /** queue a line on the host; returns a promise resolved when it has been spoken */
  say(text, o = {}) {
    return new Promise(res => {
      const line = { text, mood: o.mood || 'neutral', face: o.face, gesture: o.gesture, dur: o.dur || lineDur(text), res, who: o.who || 'GUIDE' };
      if (o.now) { this.queue = []; this.lineT = 0; }
      this.queue.push(line);
    });
  }
  pause(secs) { return new Promise(res => this.queue.push({ pause: true, dur: secs, res })); }
  async script(lines) { for (const l of lines) { if (typeof l === 'string') await this.say(l); else if (typeof l === 'number') await this.pause(l); else await this.say(l.t, l); } }
  /** everyone: put a line on screen, play the voice, animate */
  showLine(e) {
    const g = this.g;
    if (e.who && e.who !== 'GUIDE') { g.hud.subtitle(e.who, e.text, e.dur, e.who === 'CONDUCTOR' ? 'conductor' : 'other'); if (e.who === 'CONDUCTOR') g.audio.conductor?.(e.text); else if (e.who === 'BROADCAST') g.audio.radioStatic?.(null, 0.5); return; }
    g.hud.subtitle('GUIDE', e.text, e.dur, 'guide');
    const near = this.pos.distanceTo(g.player.pos) < 30 || !this.repaired;
    if (near) g.audio.guideVoice?.(e.text, e.mood);
    this.talking = e.dur; this.lineFace = e.face || moodFace(e.mood);
    if (e.gesture) { this.gesture = e.gesture; this.gestureT = 0; }
  }
  /** a local-only remark (about your own battery, your own health) */
  bark(key, force = false) {
    const t = this.g.time;
    if (!force && (this.cool[key] || -99) > t - 45) return;
    if (!this.repaired) return;
    this.cool[key] = t;
    const list = BARKS[key]; if (!list) return;
    const text = list[Math.floor(Math.random() * list.length)];
    this.showLine({ text, mood: key.includes('chase') ? 'scared' : 'neutral', dur: lineDur(text) });
  }
  hostBark(key, cool = 30) { const t = this.g.time; if ((this.cool['h' + key] || -99) > t - cool) return; this.cool['h' + key] = t; const list = BARKS[key]; if (list) this.say(list[Math.floor(Math.random() * list.length)], { mood: key === 'chase' ? 'scared' : 'neutral' }); }

  /* ---------------- analysis (host) ---------------- */
  analyze(subjects, pid) {
    const g = this.g;
    const seen = new Set(); const lines = [];
    let anyNew = false;
    for (const s of subjects) {
      const key = s.kind + ':' + (s.type || s.id); if (seen.has(key)) continue; seen.add(key);
      if (s.kind === 'machine') {
        const M = MACHINES[s.type]; if (!M) continue;
        if (g.knows(s.type)) { lines.push({ t: pick(['We\'ve seen this one. ' + M.name + '.', 'That\'s a ' + M.name + '. Already in the log.', 'Another ' + M.name + '. Careful with those.']) }); continue; }
        anyNew = true;
        M.recognise.forEach((t, i) => lines.push({ t, face: i === 0 ? 'scan' : 'thinking', mood: i === M.recognise.length - 1 ? 'serious' : 'curious', then: i === M.recognise.length - 1 ? () => this._unlock(s.type) : null }));
      } else if (s.kind === 'subject') {
        const sub = g.story.subjects?.[s.id];
        if (!sub) continue;
        if (g.flags['ps:' + s.id]) { lines.push({ t: 'I\'ve looked at that one. It still bothers me.' }); continue; }
        anyNew = true;
        sub.lines.forEach((t, i) => lines.push({ t, face: i === 0 ? 'scan' : 'thinking', mood: 'curious', then: i === sub.lines.length - 1 ? () => { g.setFlag('ps:' + s.id, true); sub.done?.(); } : null }));
      }
    }
    if (!lines.length) { this.say(subjects.length ? 'Nothing in these I can use. Try to get closer, and get the whole machine in frame.' : 'No new photos. Point the camera at anything strange - machines especially.', { face: 'neutral' }); return; }
    this.scanning = 2.2; g.emit({ k: 'sfx', n: 'guideScan', a: [2] });
    if (anyNew) this.say('Let me see...', { face: 'scan', mood: 'curious' });
    (async () => { for (const l of lines) { await this.say(l.t, { face: l.face, mood: l.mood }); if (l.then) l.then(); } g.story.onAnalyzed?.(subjects); })();
  }
  _unlock(type) {
    const g = this.g, M = MACHINES[type];
    g.setFlag('m:' + type, true);
    g.emit({ k: 'entry', id: type }); g.emit({ k: 'sfx', n: 'discovery' });
    if (M.memory && !g.flags['mem:' + M.memory]) this.remember(M.memory);
  }
  remember(id) {
    const g = this.g; if (g.flags['mem:' + id]) return;
    g.setFlag('mem:' + id, true);
    setTimeout(() => { g.emit({ k: 'memory', id }); g.emit({ k: 'sfx', n: 'memory' }); }, 600);
  }
  talk(pid) {
    const g = this.g;
    const h = g.story.hint?.();
    if (h) this.say(h, { face: 'neutral', gesture: 'point' });
    else this.say(pick(BARKS.idle), { face: 'happy' });
  }

  /* ---------------- movement (host) ---------------- */
  leader() {
    let best = null, bd = 1e9;
    for (const p of this.g.allPlayers()) { if (p.down) continue; const d = p.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  goto(x, y, z, faceYaw = null) { this.mode = 'goto'; this.target = new THREE.Vector3(x, y, z); this.faceYaw = faceYaw; this.path = null; return new Promise(r => { this._arrive = r; }); }
  follow() { this.mode = 'follow'; this.path = null; this.gesture = null; }
  stay() { this.mode = 'stay'; }
  hold(x, y, z, yaw) { this.mode = 'hold'; this.target = new THREE.Vector3(x, y, z); this.faceYaw = yaw; this.path = null; }
  update(dt) {
    const g = this.g;
    if (g.isHost) this._host(dt);
    else this._client(dt);
    // speech queue (host)
    if (g.isHost) {
      this.lineT -= dt;
      if (this.lineT <= 0) {
        if (this.cur) { const c = this.cur; this.cur = null; c.res(); }
        if (this.queue.length) {
          const l = this.queue.shift(); this.cur = l;
          if (!l.pause) g.emit({ k: 'say', text: l.text, mood: l.mood, face: l.face, gesture: l.gesture, dur: l.dur, who: l.who });
          this.lineT = l.dur + (l.pause ? 0 : 0.25);
        }
      }
      if (this.repaired && this.mode === 'follow' && !this.queue.length && this.lineT < -1) { this.idleT -= dt; if (this.idleT <= 0) { this.idleT = 70 + Math.random() * 60; if (!g.enemies.danger && g.story.idleOk?.()) this.say(pick(BARKS.idle), { mood: 'neutral' }); } }
    }
    // animation (everyone)
    this.talking = Math.max(0, this.talking - dt); this.scanning = Math.max(0, this.scanning - dt); this.gestureT += dt;
    let face = this.repaired ? (this.scanning > 0 ? 'scan' : this.talking > 0 ? (this.lineFace || 'happy') : g.enemies.danger > 0.5 ? 'scared' : this.idleFace()) : (this.face === 'off' ? 'off' : 'glitch');
    if (face !== this._face) { this._face = face; this.m.setFace(face); }
    // look at the nearest player when talking or idle
    const L = this.leader();
    if (L) {
      const dx = L.pos.x - this.pos.x, dz = L.pos.z - this.pos.z, dy = (L.pos.y + 1.5) - (this.pos.y + 0.9);
      const want = wrapAngle(Math.atan2(dx, dz) - this.yaw);
      this.lookYaw = damp(this.lookYaw, Math.max(-1.2, Math.min(1.2, want)), 5, dt); this.lookPitch = damp(this.lookPitch, Math.max(-0.5, Math.min(0.5, Math.atan2(dy, Math.hypot(dx, dz)))), 5, dt);
    }
    if (this.gesture && this.gesture !== 'slumped' && this.gesture !== 'hold' && this.gestureT > 2.6) this.gesture = null;
    this.m.update(dt, { speed: this.speed, talking: this.talking > 0, scanning: this.scanning > 0, lookYaw: this.lookYaw, lookPitch: this.lookPitch, gesture: this.gesture, gestureT: this.gestureT, mood: 'neutral' });
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.root.visible = !this.hidden;
    this.glow.x = this.pos.x; this.glow.y = this.pos.y + 0.8; this.glow.z = this.pos.z;
    // scan fan
    this.fan.visible = this.scanning > 0 && this.repaired;
    if (this.fan.visible) { const h = this.m.head; if (h) { h.getWorldPosition(this._v); this.fanPivot.position.copy(this._v); } this.fanPivot.rotation.set(Math.sin(g.time * 3) * 0.3 + this.lookPitch * 0.5, this.yaw + this.lookYaw + Math.sin(g.time * 2.1) * 0.5, 0); }
  }
  idleFace() { return this._idleFace || 'happy'; }
  _host(dt) {
    const g = this.g, B = this.body;
    let want = null, run = false;
    if (this.mode === 'follow') {
      const L = this.leader();
      if (L) {
        const d = L.pos.distanceTo(this.pos);
        if (d > 32 || Math.abs(L.pos.y - this.pos.y) > 6 && d > 9) { this._catchUp(L); }
        else if (d > 3.2) { want = L.pos; run = d > 7; }
        else if (d < 1.1) { // personal space: step aside
          const ax = this.pos.x - L.pos.x, az = this.pos.z - L.pos.z, l = Math.hypot(ax, az) || 1;
          want = new THREE.Vector3(this.pos.x + ax / l * 1.2, this.pos.y, this.pos.z + az / l * 1.2);
        }
      }
    } else if (this.mode === 'goto' || this.mode === 'hold') {
      const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if (d > 0.35 || Math.abs(this.target.y - this.pos.y) > 1) { want = this.target; run = d > 6; }
      else {
        if (this.faceYaw !== null && this.faceYaw !== undefined) this.yaw = dampAngle(this.yaw, this.faceYaw, 6, dt);
        if (this.mode === 'hold') { this.gesture = 'hold'; this.gestureT = Math.min(this.gestureT, 1); }
        if (this._arrive) { const r = this._arrive; this._arrive = null; r(); }
      }
      if (this.mode === 'goto' && this.pos.distanceTo(this.target) > 40) { this.place(this.target.x, this.target.y, this.target.z); }
    }
    if (this.mode === 'slumped') { this.gesture = 'slumped'; this.speed = 0; return; }
    let vx = 0, vz = 0;
    if (want) {
      const step = this._steer(want, dt);
      if (step) { const sp = run ? 4.6 : 2.4; vx = step.x * sp; vz = step.z * sp; this.yaw = dampAngle(this.yaw, Math.atan2(step.x, step.z), 8, dt); }
    }
    B.vel.x = damp(B.vel.x, vx, 8, dt); B.vel.z = damp(B.vel.z, vz, 8, dt);
    const before = this.pos.clone();
    g.phys.stepBody(B, dt);
    if (B.fell) { B.fell = false; const L = this.leader(); if (L) this._catchUp(L); }
    this.speed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    // stuck? try a fresh path, then give up and catch up
    if (want && this.speed < 0.2) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 1.2) this.path = null; if (this.stuckT > 4 && this.mode === 'follow') { const L = this.leader(); if (L) this._catchUp(L); this.stuckT = 0; } }
    else this.stuckT = 0;
    if (this.speed > 0.3) { this.servoT = (this.servoT || 0) - dt; if (this.servoT <= 0) { this.servoT = 0.7; g.audio.guideServo?.(this.pos); } }
  }
  _steer(goal, dt) {
    const g = this.g, p = this.pos;
    // straight line if clear
    if (Math.abs(goal.y - p.y) < 1.2 && g.phys.clear(p.x, p.y + 0.5, p.z, goal.x, goal.y + 0.5, goal.z)) { this.path = null; const dx = goal.x - p.x, dz = goal.z - p.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; }
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0) { this.path = g.nav.path(p.x, p.y, p.z, goal.x, goal.y, goal.z); this.pathT = 1.2; this.pi = 0; }
    if (!this.path || !this.path.length) return null;
    let n = this.path[this.pi];
    while (n && Math.hypot(n.x - p.x, n.z - p.z) < 0.7 && Math.abs(n.y - p.y) < 1.2) { this.pi++; n = this.path[this.pi]; }
    if (!n) { this.path = null; return null; }
    const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l };
  }
  _catchUp(L) {
    // appear just behind the player, out of their view
    const back = new THREE.Vector3(Math.sin(L.yaw), 0, Math.cos(L.yaw));
    for (const k of [1.6, 2.4, 1.0]) {
      const x = L.pos.x + back.x * k, z = L.pos.z + back.z * k;
      const gy = this.g.phys.ground(x, z, L.pos.y + 0.5, 1);
      if (Math.abs(gy - L.pos.y) < 0.6) { const q = { x, y: gy, z }; if (!this.g.phys.push({ ...q }, 0.28, 1)) { this.place(x, gy, z, L.yaw); return; } }
    }
    this.place(L.pos.x, L.pos.y, L.pos.z, L.yaw);
  }
  _client(dt) {
    const s = this.net; if (!s) return;
    this.body.pos.x = damp(this.body.pos.x, s.x, 10, dt); this.body.pos.y = damp(this.body.pos.y, s.y, 10, dt); this.body.pos.z = damp(this.body.pos.z, s.z, 10, dt);
    if (Math.abs(this.body.pos.x - s.x) > 6 || Math.abs(this.body.pos.z - s.z) > 6) this.body.pos.set(s.x, s.y, s.z);
    this.yaw = dampAngle(this.yaw, s.yaw, 10, dt); this.speed = s.sp; this.mode = s.m;
    if (s.ge !== undefined) this.gesture = s.ge;
  }
  snapshot() { return { x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(2), sp: +this.speed.toFixed(1), m: this.mode, ge: this.gesture, h: this.hidden ? 1 : 0 }; }
  applySnapshot(s) { if (s) { this.net = s; this.hidden = !!s.h; } }
}
function lineDur(t) { return Math.min(9, 1.3 + t.split(/\s+/).length * 0.3); }
function moodFace(m) { return { happy: 'happy', sad: 'sad', scared: 'scared', curious: 'curious', serious: 'neutral', neutral: 'happy' }[m] || 'happy'; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
export { RECIPES, MEMORIES };
