/* Game.js - the hub everything plugs into.

   World state that everyone shares lives in `flags` (doors, pickups taken,
   puzzle states, story progress, what GUIDE remembers) and `power` (which
   circuits are live). Only the host changes them; clients ask with act()
   and see the result in the next snapshot. Inventories are personal.

   Zones are the physical places (the apartment block, the avenue, the
   station...). Each has a scene group, bounds, its own fog/sound/space, and
   neighbours: only the current zone and its neighbours are drawn. */
import * as THREE from '../../lib/three.module.js';
import { Physics } from '../world/Physics.js';
import { Nav } from '../world/Nav.js';
import { Lights } from '../world/Lights.js';
import { Atmos } from '../world/Atmos.js';
import { Builder } from '../world/Builder.js';
import { Player } from './Player.js';
import { Interact } from './Interact.js';
import { Guide } from './Guide.js';
import { Enemies } from './Enemies.js';
import { Photo } from './Photo.js';
import { Story } from './Story.js';
import { Director } from './Director.js';
import { FX } from './FX.js';
import { Viewmodel } from './Viewmodel.js';
import { Remote, makeRemoteSpots } from './Remote.js';
import { item } from '../art/Art.js';
import { HUD } from '../ui/HUD.js';
import { UI } from '../ui/UI.js';
import { COMPONENTS, TOOLS, KEYS, START_INV, RECIPES } from '../data/Items.js';
import { MACHINES } from '../data/Machines.js';
import { saveWorld, saveProfile } from './State.js';
import * as Levels from '../world/levels/index.js';

export class Game {
  constructor({ renderer, scene, camera, input, audio, net, profile, post }) {
    Object.assign(this, { renderer, scene, camera, input, audio, net, profile, post });
    this.phase = 'title'; this.me = 'local'; this.time = 0; this.timeScale = 1;
    this.flags = {}; this.power = {}; this._flagL = new Map(); this._dirty = false;
    this.zones = new Map(); this.zone = null;
    this.phys = new Physics(); this.nav = new Nav(this.phys);
    this.lights = new Lights(this, 8);
    this.atmos = new Atmos(this);
    this.interact = new Interact(this);
    this.fx = new FX(this);
    this.player = new Player(this);
    this.inv = START_INV();
    this.photos = [];
    this.hud = new HUD(this); this.ui = new UI(this);
    this.triggers = [];
    this.updaters = [];
    this.remotes = new Map();
    this.fxHurt = 0;
    this.remoteSpots = makeRemoteSpots(scene); this.itemModel = item; this.anchors = {};
  }
  /** story items/tools anyone in the group has picked up (flags, so co-op clients count too) */
  partyHas(k) { return !!this.flags['has:' + k] || this.has(k); }
  partyTool(t) { return !!this.flags['tool:' + t] || !!this.inv.tools[t]; }
  get isHost() { return !this.net.isClient; }

  /* ---------------- zones ---------------- */
  addZone(id, o = {}) {
    const z = { id, group: new THREE.Group(), bounds: [], outdoor: false, fog: 0x0b1016, density: 0.03, hemi: 0.25, surface: 'concrete', space: 'room', beds: {}, music: 'none', neighbors: [], visible: true, updaters: [], tension: 0, env: 0.35, ...o };
    z.group.name = 'zone:' + id;
    this.scene.add(z.group); this.zones.set(id, z);
    return z;
  }
  builder(zone) { return new Builder(this, typeof zone === 'string' ? this.zones.get(zone) : zone); }
  zoneAt(p) {
    let best = null, bv = 1e18;
    for (const z of this.zones.values()) for (const b of z.bounds) {
      if (p.x >= b[0] && p.x <= b[3] && p.y >= b[1] - 0.5 && p.y <= b[4] && p.z >= b[2] && p.z <= b[5]) {
        const v = (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) / (b[6] || 1);
        if (v < bv) { bv = v; best = z; }
      }
    }
    return best;
  }
  _zoneVis() {
    const cur = this.zone;
    for (const z of this.zones.values()) {
      const vis = !cur || z === cur || cur.neighbors.includes(z.id) || z.always;
      if (vis !== z.visible) { z.visible = vis; z.group.visible = vis; }
    }
  }

  buildWorld() {
    this.story = new Story(this);
    this.director = new Director(this);
    Levels.buildAll(this);
    this.nav.link();
    this.guide = new Guide(this);
    this.enemies = new Enemies(this);
    this.photo = new Photo(this);
    this.view = new Viewmodel(this);
    Levels.populate(this);
    // material env intensity default
    this.renderer.compile?.(this.scene, this.camera);
  }

  /* ---------------- shared state ---------------- */
  setFlag(k, v = true) {
    if (!this.isHost) return;
    if (this.flags[k] === v) return;
    this.flags[k] = v; this._dirty = true;
    this._fire(k, v);
  }
  _fire(k, v) { const L = this._flagL.get(k); if (L) for (const f of L) try { f(v); } catch (e) { window.__log?.('ERR flag ' + k + ': ' + e.message); } const A = this._flagL.get('*'); if (A) for (const f of A) f(k, v); }
  onFlag(k, f) { let L = this._flagL.get(k); if (!L) this._flagL.set(k, (L = [])); L.push(f); if (k !== '*' && this.flags[k] !== undefined) f(this.flags[k]); }
  setPower(c, on) { if (!this.isHost) return; this.power[c] = on; this.setFlag('pw:' + c, on); }
  knows(type) { return !!this.flags['m:' + type]; }
  known(item) { const c = COMPONENTS[item]; if (!c || !c.knownFrom || this.knows(c.knownFrom)) return true; for (const [t, M] of Object.entries(MACHINES)) if (M.parts.includes(item) && this.knows(t)) return true; return false; }
  recipeKnown(r) { return !r.needs || this.knows(r.needs); }

  /** do something that changes the shared world. Runs on the host; clients forward it. */
  act(kind, data = {}) {
    if (this.isHost) this.doAct(kind, data, this.me);
    else this.net.sendAction({ k: kind, ...data });
    // personal side effects that should feel instant
    if (kind === 'use') { const o = this.interact.byId.get(data.id); if (o && o.local) o.use(this.me); }
  }
  doAct(kind, d, pid) {
    switch (kind) {
      case 'use': { const o = this.interact.byId.get(d.id); if (o && !o.local) this.interact.use(d.id, pid); break; }
      case 'hit': this.enemies.hit(d.eid, d.dmg, d.wp, pid, d.kind); break;
      case 'analyze': this.guide.analyze(d.subjects || [], pid); break;
      case 'throw': this.fx.throwable(d.kind, d.p, d.v, pid); break;
      case 'guideTalk': this.guide.talk(pid); break;
      case 'read': this.setFlag('read:' + d.id, true); this.story.onRead?.({ id: d.id }); break;
      case 'revive': this.reviveRemote(d.target, pid); break;
      case 'skip': if (pid === this.me) this.story.devSkip?.(d.to); break;
    }
  }
  /** a one-off event for everyone (host side), also run locally */
  emit(e) { this.onEvent(e, this.me); if (this.net.isHost) this.net.sendEvent(e); }
  onEvent(e, from) {
    switch (e.k) {
      case 'say': this.guide.showLine(e); break;
      case 'give': if (e.to === this.me || (e.to === 'local' && this.net.role === 'offline')) this._receive(e.o); break;
      case 'dmg': if (e.to === this.me) this.player.damage(e.n, e.from, e.kind); break;
      case 'sfx': this.audio[e.n]?.(...(e.a || [])); break;
      case 'fx': this.fx.event(e); break;
      case 'toast': this.hud.toast(e.t, e.secs); break;
      case 'obj': this.hud.objective(e.t, e.sub); break;
      case 'cine': this.story.cine?.(e.n, e); break;
      case 'chat': this.hud.chat(e.name, e.t); break;
      case 'revived': if (e.to === this.me) this.revived(); break;
      case 'memory': this.ui.memoryCard(e.id); break;
      case 'entry': this.ui.entryCard(e.id); break;
      case 'tele': if (e.to === this.me || e.all) { this.player.place(e.x, e.y, e.z, e.yaw ?? this.player.yaw); } break;
    }
  }

  /* ---------------- items ---------------- */
  itemName(o) {
    if (o.key) return KEYS[o.key]?.name || o.key;
    if (o.tool) return TOOLS[o.tool]?.name || o.tool;
    const c = COMPONENTS[o.item]; if (!c) return o.item;
    return this.known(o.item) ? c.name : 'unknown component';
  }
  give(pid, o) {
    if (o.key) this.setFlag('has:' + o.key, true); if (o.tool) this.setFlag('tool:' + o.tool, true);
    if (pid === this.me || (!this.net.isOnline)) this._receive(o);
    else this.net.sendEvent({ k: 'give', to: pid, o });
  }
  _receive(o) {
    const inv = this.inv, n = o.n || 1;
    if (o.key) { inv.keys[o.key] = true; this.hud.pickup(this.itemName(o), o.key); }
    else if (o.tool) { if (o.tool === 'prod') { inv.tools.prod = true; this.player.prodCharge = Math.max(this.player.prodCharge || 0, 1); } else inv.items[o.tool] = (inv.items[o.tool] || 0) + n; this.hud.pickup(this.itemName(o) + (n > 1 ? ' x' + n : ''), o.tool); if (o.tool === 'camera') inv.tools.camera = true; }
    else { inv.items[o.item] = (inv.items[o.item] || 0) + n; this.hud.pickup(this.itemName(o) + (n > 1 ? ' x' + n : ''), o.item); }
    this.audio.pickup?.(o.item === 'battery' ? 'battery' : o.key ? 'item' : 'component');
    if (o.onGot) o.onGot();
    this.story.onItem?.(o);
    this._saveSoon();
  }
  has(k) { return !!this.inv.keys[k]; }
  count(item) { return this.inv.items[item] || 0; }
  craft(r) {
    const inv = this.inv;
    if (!this.recipeKnown(r)) return false;
    for (const [k, n] of Object.entries(r.cost)) if ((inv.items[k] || 0) < n || !this.known(k)) { this.audio.deny?.(); return false; }
    if (r.once && inv.upgrades[r.out.split(':')[1]]) return false;
    for (const [k, n] of Object.entries(r.cost)) inv.items[k] -= n;
    if (r.out.startsWith('upgrade:')) inv.upgrades[r.out.split(':')[1]] = true;
    else if (r.out === 'prodcharge') this.player.prodCharge = 1;
    else if (r.key) inv.keys[r.out] = true;
    else inv.items[r.out] = (inv.items[r.out] || 0) + (r.n || 1);
    this.audio.craft?.();
    this.story.onCraft?.(r);
    this._saveSoon();
    return true;
  }

  /* ---------------- triggers ---------------- */
  trigger(o) { o.fired = false; this.triggers.push(o); return o; }
  _triggers() {
    if (!this.isHost) return;
    const ps = this.allPlayers();
    for (const t of this.triggers) {
      if (t.fired && t.once !== false) continue;
      if (t.when && !t.when()) continue;
      const b = t.box;
      const who = ps.find(p => !p.down && p.pos.x >= b[0] && p.pos.x <= b[3] && p.pos.y >= b[1] && p.pos.y <= b[4] && p.pos.z >= b[2] && p.pos.z <= b[5]);
      if (who) { if (!t.inside) { t.fired = true; t.inside = true; t.onEnter(who.id); } }
      else t.inside = false;
    }
  }
  /** every player as {id, pos, down, light, yaw} (local first) */
  allPlayers() {
    const out = [{ id: this.me, pos: this.player.pos, down: this.player.down, light: this.player.lightOn, yaw: this.player.yaw, local: true, noise: this.player.noise, crouch: this.player.crouching, eye: this.player.eye }];
    for (const r of this.remotes.values()) out.push({ id: r.id, pos: r.pos, down: r.down, light: r.light, yaw: r.yaw, remote: r, noise: r.noise || 0, crouch: r.crouch, eye: r.crouch ? 1.05 : 1.62 });
    return out;
  }

  /* ---------------- lifecycle ---------------- */
  begin(save) {
    this.phase = 'play';
    if (save) {
      this.flags = save.flags || {}; this.power = save.power || {};
      for (const [k, v] of Object.entries(this.flags)) this._fire(k, v);
      if (save.inv) this.inv = { ...START_INV(), ...save.inv };
      this.player.battery = save.battery ?? 1; this.player.prodCharge = save.prod ?? 0;
      this.photos = save.photos || [];
    }
    this.story.begin(save);
    this.hud.show(true);
    this._lastSave = 0;
  }
  saveNow() {
    if (!this.isHost || this.phase !== 'play') return;
    saveWorld({ v: 1, flags: this.flags, power: this.power, inv: this.inv, battery: this.player.battery, prod: this.player.prodCharge, story: this.story.save(), photos: this.photos.slice(-12).map(p => ({ ...p, thumb: p.keep ? p.thumb : null })), t: Date.now() });
  }
  _saveSoon() { this._saveT = 1.5; }
  checkpoint(id) { this.story.cp = id; this.saveNow(); this.hud.checkpoint(); }

  onPlayerDown() {
    const p = this.player;
    if (this.net.isOnline && this.allPlayers().some(q => !q.local && !q.down)) {
      p.down = true; p.downT = 0; this.hud.toast('You are down. A friend can revive you (hold E).'); this.audio.stinger?.('dread');
      return;
    }
    p.down = true; this.audio.death?.();
    this.ui.death();
  }
  revived() { const p = this.player; p.down = false; p.hp = 40; this.hud.toast('Back on your feet.'); }
  reviveRemote(target, pid) { this.emit({ k: 'revived', to: target }); }
  respawnLocal() {
    const s = this.story.spawn();
    this.player.place(s.x, s.y, s.z, s.yaw || 0);
    this.player.down = false; this.player.hp = Math.max(this.player.hp, 60);
  }
  /** after death (solo): back to the last checkpoint with the world as it was saved */
  retry() {
    this.player.down = false; this.player.hp = 100; this.player.stamina = 100;
    this.enemies.resetForRetry?.(); this.audio.reset?.();
    this.respawnLocal();
    this.ui.close();
  }
  onBatteryDead() { this.guide.bark('battery_dead'); }
  onBatteryLow() { this.guide.bark('battery_low'); }
  readNote(o) { this.ui.note(o); this.act('read', { id: o.id }); }

  /* ---------------- the frame ---------------- */
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (this.phase !== 'play') {
      const t = this.time, c = this.camera;
      c.position.set(-20 + t * 0.6, 3.2 + Math.sin(t * 0.2) * 0.3, -21.5); c.rotation.order = 'YXZ'; c.rotation.set(0.12 + Math.sin(t * 0.13) * 0.03, 1.32 + Math.sin(t * 0.07) * 0.08, 0);
      const z = this.zones.get('street'); if (z && this.zone !== z) this._enter(z); this._zoneVis();
      for (const zz of this.zones.values()) if (zz.visible) for (const o of zz.updaters) o.userData.update(dt, this.time);
      this.atmos.update(dt, this.camera, this.zone); this.lights.update(dt, this.camera); return;
    }
    this.player.update(dt);
    // zone
    const z = this.zoneAt(this.player.pos);
    if (z && z !== this.zone) this._enter(z);
    this._zoneVis();
    this.interact.update(dt);
    if (this.isHost) { this._triggers(); this.story.update(dt); }
    else this.story.clientUpdate?.(dt);
    this.guide.update(dt);
    this.enemies.update(dt);
    this.photo.update(dt);
    this.director.update(dt);
    this.fx.update(dt);
    for (const zz of this.zones.values()) if (zz.visible) for (const o of zz.updaters) o.userData.update(dt, this.time);
    for (const u of this.updaters) u(dt);
    for (const r of this.remotes.values()) r.update(dt);
    this.view.update(dt);
    this.lights.update(dt, this.camera);
    this.atmos.update(dt, this.camera, this.zone);
    this._audio(dt);
    this.hud.update(dt);
    this.ui.update(dt);
    // post fx
    this.fxHurt = Math.max(0, this.fxHurt - dt * 0.8);
    if (this.post) {
      const u = this.post.u;
      u.hurt.value = Math.max(this.fxHurt, this.player.hp < 30 ? (30 - this.player.hp) / 60 * (0.6 + 0.4 * Math.sin(this.time * 4)) : 0);
      u.staticAmt.value = Math.max(this.director.staticAmt || 0, this.fx.empFlash || 0);
      u.photo.value = Math.max(0, (u.photo.value || 0) - dt * 3);
      u.exposure.value = this.zone?.exposure ?? 1;
      u.sat.value = 0.92 - this.player.sedate * 0.5;
    }
    // network
    if (this.net.isOnline) this._net(dt);
    if (this._saveT > 0) { this._saveT -= dt; if (this._saveT <= 0) this.saveNow(); }
    this._lastSave += dt; if (this._lastSave > 30) { this._lastSave = 0; this.saveNow(); }
  }
  _enter(z) {
    const prev = this.zone; this.zone = z;
    this.atmos.setFog(z.fog, z.density); this.atmos.rainTarget = z.rain ?? (z.outdoor || z.rainIndoor ? 1 : 0);
    this.audio.setSpace?.(z.space);
    this.audio.setMusic?.(z.music || 'none');
    const env = z.env;
    for (const m of envMats(this.scene)) m.envMapIntensity = env;
    this.story.onZone?.(z, prev);
    this.director.onZone?.(z);
  }
  _audio(dt) {
    const a = this.audio, z = this.zone, p = this.player;
    a.listener.x = this.camera.position.x; a.listener.y = this.camera.position.y; a.listener.z = this.camera.position.z; a.listener.yaw = p.yaw;
    if (z) {
      const outside = z.outdoor && this.atmos.roofAt(p.pos.x, p.pos.z) < -90;
      const beds = { rain: outside ? this.atmos.rainAmt : 0, rainIndoor: !outside && z.rainIndoor ? z.rainIndoor * this.atmos.rainAmt : 0, wind: z.wind ?? (outside ? 0.5 : 0), hum: z.hum ?? 0, drip: z.drip ?? 0, machinery: z.machinery ?? 0.2, generator: (z.generator && this.power[z.generator]) ? 1 : 0, servers: z.servers ?? 0, factory: z.factory ?? 0, tunnel: z.tunnel ?? 0, alarm: this.flags.alarm ? 1 : 0 };
      if (z.bedFn) Object.assign(beds, z.bedFn(this));
      a.setBeds?.(beds);
    }
    const danger = this.enemies.danger || 0;
    a.setTension?.(Math.min(1, Math.max(z?.tension || 0, danger, this.director.tension || 0)));
    a.setChase?.(this.enemies.chasing);
    a.heartbeat?.(Math.max(0, (40 - p.hp) / 40, this.enemies.closeness || 0));
    a.update?.(dt);
  }

  /* ---------------- networking ---------------- */
  _net(dt) {
    this.net.sendPlayer(this.player.netState(), dt);
    if (this.isHost) {
      this.net.sendWorld(() => ({ e: this.enemies.snapshot(), g: this.guide.snapshot(), f: this._dirty ? this.flags : null, pw: this.power, st: this.story.snapshot() }), dt);
      this._dirty = false;
    }
  }
  wireNet() {
    const n = this.net;
    n.on.player = (id, s) => { let r = this.remotes.get(id); if (!r) { r = new Remote(this, id, n.profiles.get(id) || {}); this.remotes.set(id, r); } r.apply(s); };
    n.on.world = (w) => {
      if (w.f) for (const [k, v] of Object.entries(w.f)) if (this.flags[k] !== v) { this.flags[k] = v; this._fire(k, v); }
      if (w.pw) this.power = w.pw;
      this.enemies.applySnapshot(w.e); this.guide.applySnapshot(w.g); this.story.applySnapshot?.(w.st);
    };
    n.on.action = (id, a) => this.doAct(a.k, a, id);
    n.on.event = (id, e) => this.onEvent(e, id);
    n.on.join = (id, p) => { this.hud.toast((p?.name || 'Someone') + ' joined.'); this._dirty = true; if (this.isHost) setTimeout(() => { this._dirty = true; }, 500); };
    n.on.leave = (id, p) => { const r = this.remotes.get(id); if (r) { r.dispose(); this.remotes.delete(id); } this.hud.toast((p?.name || 'Someone') + ' left.'); };
    n.on.getSave = () => ({ flags: this.flags, power: this.power, story: this.story.save() });
    n.on.lost = () => { this.hud.toast('Lost connection to the host.'); this.ui.open('pause'); };
  }
}

let _envCache = null;
function envMats(scene) {
  if (_envCache && _envCache.n === scene.children.length) return _envCache.list;
  const set = new Set();
  scene.traverse(o => { if (o.isMesh) { const m = o.material; if (Array.isArray(m)) m.forEach(x => x.isMeshStandardMaterial && set.add(x)); else if (m && m.isMeshStandardMaterial) set.add(m); } });
  _envCache = { n: scene.children.length, list: [...set] };
  return _envCache.list;
}
export { MACHINES, RECIPES };
