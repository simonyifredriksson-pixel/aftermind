/* Factory.js - the freight line and Forge Line 9.

   The freight cart runs east from the Helix bay (x 104) through a rail
   tunnel to the Forge Line 9 dock (x 196). Everything at y -26.
     dock          x 196..214, z -212..-198
     central hall  x 214..272, z -232..-178: FOREMAN's core in its gantry,
                   the pod refit line running through it
     cooling A     north (z -252..-232): the furnace line   - construction unit
     cooling B     east  (x 272..292):  the assembly line   - arms, crawlers
     cooling C     south (z -178..-160): cold storage        - dog, a heavy
   Each cooling system: open the bypass valve (GUIDE will, if you are
   alone), then hold the purge at its panel while the line comes for you.
   FOREMAN notices. After the third, it stands up. Without cooling it must
   vent its core every few seconds - that is the only time it can be hurt. */
import * as THREE from '../../../lib/three.module.js';
import { prop } from '../../art/Art.js';
import { lamp, emergency, debris, rubble, puddle, screen, glyph, Mat } from './common.js';

const Y = -26;
const UNITS = {
  A: { name: 'Furnace line cooling', unit: [243, -246], valve: [229, -249], panel: [257, -249.5] },
  B: { name: 'Assembly line cooling', unit: [286, -205], valve: [289, -192], panel: [289, -218] },
  C: { name: 'Cold storage cooling', unit: [243, -165], valve: [229, -162], panel: [257, -162.5] },
};
export function build(G) {
  const fr = G.addZone('freight', { name: 'Freight Line', bounds: [[100, Y - 2, -214, 196, Y + 8, -196]], fog: 0x08090b, density: 0.03, hemi: 0.03, space: 'tunnel', horror: 0.3, neighbors: ['helix', 'factory'], surface: 'metal', env: 0.2, tunnel: 0.7, machinery: 0.3 });
  const fz = G.addZone('factory', { name: 'Forge Line 9', bounds: [[194, Y - 2, -256, 296, Y + 24, -156]], fog: 0x1a120e, density: 0.014, hemi: 0.35, space: 'hall', horror: 0.35, neighbors: ['freight', 'podline'], surface: 'metal', env: 0.3, factory: 0.9, machinery: 0.4, tension: 0.25 });
  const F = G.builder(fr); freightLine(G, F); F.finish();
  const B = G.builder(fz); factory(G, B); B.finish();
  G.atmos.roof(100, -260, 300, -150, 0);
}

function freightLine(G, B) {
  const z0 = -212, z1 = -198;
  B.box(104, Y - 0.3, z0, 196, Y, z1, 'concreteDark', { faces: ['py'] });
  B.box(104, Y + 7, z0, 196, Y + 7.3, z1, 'tunnel'); B.box(104, Y, z0 - 0.3, 196, Y + 7, z0, 'tunnel'); B.box(104, Y, z1, 196, Y + 7, z1 + 0.3, 'tunnel');
  for (let x = 110; x < 196; x += 12) { B.prop(() => prop('trackSegment', { len: 12 }), x, Y, -205, 0, { solid: false }); emergency(B, x, Y + 4, z1 - 0.2, Math.PI, { color: 0xff8030, intensity: 1.6, flicker: 0.15 }); }
  // the cart: a flatbed that carries whoever stands on it
  const cart = new THREE.Group(); B.add(cart);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 3.4), Mat('metalYellow')); deck.position.y = 0.45; cart.add(deck);
  for (const sx of [-2.4, 2.4]) for (const sz of [-1.3, 1.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), Mat('steel')); w.rotation.x = Math.PI / 2; w.position.set(sx, 0.3, sz); cart.add(w); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 3.4), Mat('steel')); rail.position.set(2.95, 1.1, 0); cart.add(rail);
  const ctl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), Mat('panelDark')); ctl.position.set(-2.4, 1.15, 1.2); cart.add(ctl);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.3), toneMapped: false })); beacon.position.set(-2.4, 1.8, 1.2); cart.add(beacon);
  const X0 = 100.5, X1 = 199.5; let x = X0, target = X0, moving = false;
  cart.position.set(x, Y, -205);
  const floor = G.phys.box(x, -205, 3, 1.7, 0, Y, Y + 0.6, 'cart');
  // the bay end: cut the cart a dock in the Helix floor
  G.interact.add({ id: 'cartgo', pos: () => new THREE.Vector3(x - 2.4, Y + 1.5, -203.8), r: 0.35, zone: null,
    label: () => (moving ? null : Math.abs(x - X0) < 0.1 ? 'Ride the freight cart east' : 'Ride back west'),
    use: () => { if (moving) return; target = Math.abs(x - X0) < 0.1 ? X1 : X0; moving = true; G.emit({ k: 'sfx', n: 'elevator', a: ['start'] }); G.emit({ k: 'sfx', n: 'setElevatorMove', a: [true] }); if (G.guide.repaired) { G.guide.place(x + 1, Y + 0.6, -205.6, Math.PI / 2); G.guide.stay(); } } });
  let last = x;
  G.updaters.push((dt) => {
    if (G.isHost) {
      if (moving) {
        const d = target - x, s = Math.sign(d) * Math.min(Math.abs(d), dt * Math.min(7, 1 + Math.abs(d) * 0.6, 1 + Math.abs(x - (target === X1 ? X0 : X1)) * 0.6));
        x += s;
        if (Math.abs(target - x) < 1e-3) { moving = false; G.emit({ k: 'sfx', n: 'elevator', a: ['stop'] }); G.emit({ k: 'sfx', n: 'setElevatorMove', a: [false] }); G.guide.follow(); G.setFlag('cartAt', target === X1 ? 'east' : 'west'); }
        G._cartNet = (G._cartNet || 0) - dt; if (G._cartNet <= 0) { G._cartNet = 0.15; G.flags.cartX = +x.toFixed(2); G._dirty = true; }
      }
    } else if (G.flags.cartX !== undefined) x += (G.flags.cartX - x) * Math.min(1, dt * 8);
    const dx = x - last; last = x;
    cart.position.x = x; G.phys.move(floor, x, Y, -205);
    // carry whoever is standing on it
    if (dx) {
      const p = G.player; if (p.body.groundBox === floor || (Math.abs(p.pos.x - x) < 3 && Math.abs(p.pos.z + 205) < 1.7 && Math.abs(p.pos.y - (Y + 0.6)) < 0.2)) p.body.pos.x += dx;
      if (G.isHost && G.guide.mode === 'stay' && Math.abs(G.guide.pos.x - (x - dx)) < 3.2 && Math.abs(G.guide.pos.z + 205) < 2) { G.guide.body.pos.x += dx; G.guide.body.pos.y = Y + 0.6; }
    }
  });
  B.nodeLine(106, Y, -200, 194, -200, 6);
}

function factory(G, B) {
  const I = G.interact;
  // dock
  B.room(196, -212, 214, -198, Y, 7, { floor: 'grate', wall: 'metal', ceil: 'metal', skip: ['w', 'e'] });
  B.box(194, Y - 0.3, -212, 200, Y, -198, 'concreteDark', { faces: ['py'] });
  // central hall
  const x0 = 214, x1 = 272, z0 = -232, z1 = -178, h = 20;
  B.box(x0, Y - 0.3, z0, x1, Y, z1, 'concrete', { faces: ['py'] });
  B.box(x0, Y + h, z0, x1, Y + h + 0.4, z1, 'metal');
  B.wall(x0, z0, x0, z1, Y, h, 'metal', { t: 0.4, openings: [{ u: 22, w: 4, y: 0, h: 5 }] });         // to the dock (z -210..-206)
  B.wall(x1, z0, x1, z1, Y, h, 'metal', { t: 0.4, openings: [{ u: 27, w: 4, y: 0, h: 5 }] });         // to B
  B.wall(x0, z0, x1, z0, Y, h, 'metal', { t: 0.4, openings: [{ u: 29, w: 4, y: 0, h: 5 }] });         // to A
  B.wall(x0, z1, x1, z1, Y, h, 'metal', { t: 0.4, openings: [{ u: 29, w: 4, y: 0, h: 5 }] });         // to C
  // the gantry FOREMAN hangs in, the refit line under it
  for (const [gx, gz] of [[226, -220], [260, -220], [226, -190], [260, -190]]) B.box(gx - 0.6, Y, gz - 0.6, gx + 0.6, Y + 16, gz + 0.6, 'metalYellow');
  B.box(224, Y + 15.5, -221, 262, Y + 16.5, -219, 'metalYellow', { solid: false }); B.box(224, Y + 15.5, -191, 262, Y + 16.5, -189, 'metalYellow', { solid: false });
  B.box(224, Y + 15.5, -221, 226, Y + 16.5, -189, 'metalYellow', { solid: false }); B.box(260, Y + 15.5, -221, 262, Y + 16.5, -189, 'metalYellow', { solid: false });
  B.prop(() => prop('conveyor', { len: 20 }), 243, Y, -184, 0); B.prop(() => prop('conveyor', { len: 20 }), 243, Y, -226, 0);
  for (let i = 0; i < 5; i++) B.prop(() => prop('cryoPod', { occupied: false, open: false }), 235 + i * 4, Y + 0.8, -226, 0, { solid: false });
  G.story.subject('casings', [243, Y + 2, -226], 3, ['Long-term casings. The pods from Helix get sealed into these.', 'Rated for... two hundred years.', 'Two hundred years.'], { label: 'CASINGS' });
  for (const [x, z] of [[220, -224], [266, -224], [220, -186], [266, -186]]) B.prop(() => prop('robotArm'), x, Y, z, Math.atan2(243 - x, -205 - z));
  B.prop(() => prop('crateStack', { seed: 41 }), 218, Y, -230, 0); B.prop(() => prop('barrel', { hazard: true }), 270, Y, -180, 0); B.prop(() => prop('pallet'), 268, Y, -230, 0.4);
  // light: furnace glow through the north door, cold blue from the south, work lamps
  for (let x = 222; x <= 264; x += 14) for (const z of [-222, -188]) lamp(B, x, Y + h, z, 0xffd8a8, 60, 34, { kind: 'pendant', flicker: 0.08 });
  B.light(243, Y + 3, -234, 0xff6a20, 25, 24, { flicker: 0.15 }); B.light(243, Y + 3, -176, 0x60b0ff, 16, 22); B.light(243, Y + 10, -205, 0xffb070, 30, 36);
  screen(B, 243, Y + 9, z1 - 0.25, Math.PI, 9, 3, (g, w, hh, t) => { g.fillStyle = '#100604'; g.fillRect(0, 0, w, hh); g.fillStyle = '#ffb060'; g.font = `700 ${hh * 0.2}px "Share Tech Mono"`; g.textAlign = 'center'; g.fillText('FORGE LINE 9', w / 2, hh * 0.3); g.font = `${hh * 0.13}px "Share Tech Mono"`; const n = ['A', 'B', 'C'].filter(k => G.flags['cool:' + k]).length; g.fillText(`THROUGHPUT ${n ? 'DEGRADED' : 'NOMINAL'}   COOLING ${3 - n}/3`, w / 2, hh * 0.55); if (n) { g.fillStyle = '#ff3020'; g.fillText('CORE TEMPERATURE RISING', w / 2, hh * 0.8); } }, { glow: 1.3, light: 0xff9050, intensity: 3, dist: 16, every: 0.5 });
  for (let x = 218; x <= 268; x += 5) for (let z = -229; z <= -181; z += 6) if (!(x > 238 && x < 248 && z > -212 && z < -198)) B.node(x, Y, z);
  B.nodeLine(197, Y, -205, 214, -205, 3);
  // the cooling sections
  section(G, B, 'A', 222, -252, 264, -232, 'furnace');
  section(G, B, 'B', 272, -226, 292, -184, 'assembly');
  section(G, B, 'C', 222, -178, 264, -160, 'cold');
  // pickups for the fight
  I.pickup(B, { id: 'f_cell1', item: 'cell', x: 217.5, y: Y + 0.02, z: -228 }); I.pickup(B, { id: 'f_cell2', item: 'cell', x: 269, y: Y + 0.02, z: -183 });
  I.pickup(B, { id: 'f_med1', tool: 'medkit', icon: 'medkit', x: 200, y: Y + 0.02, z: -210, label: 'Take the med foam' });
  I.pickup(B, { id: 'f_emp1', tool: 'emp', icon: 'emp', x: 211, y: Y + 0.02, z: -200, label: 'Take the EMP charge' });
  I.pickup(B, { id: 'f_bat1', item: 'battery', x: 202, y: Y + 0.02, z: -199.5 });
  I.pickup(B, { id: 'f_wire', item: 'wire', x: 230, y: Y + 0.02, z: -180 });
}

function section(G, B, key, x0, z0, x1, z1, kind) {
  const I = G.interact, U = UNITS[key];
  const h = kind === 'furnace' ? 10 : 7;
  B.box(x0, Y - 0.3, z0, x1, Y, z1, kind === 'cold' ? 'tiles' : 'grate', { faces: ['py'] });
  B.box(x0, Y + h, z0, x1, Y + h + 0.3, z1, 'metal');
  const walls = { furnace: ['n', 'w', 'e'], assembly: ['n', 's', 'e'], cold: ['s', 'w', 'e'] }[kind];
  if (walls.includes('n')) B.wall(x0, z0, x1, z0, Y, h, 'metal', { t: 0.3 }); if (walls.includes('s')) B.wall(x0, z1, x1, z1, Y, h, 'metal', { t: 0.3 });
  if (walls.includes('w')) B.wall(x0, z0, x0, z1, Y, h, 'metal', { t: 0.3 }); if (walls.includes('e')) B.wall(x1, z0, x1, z1, Y, h, 'metal', { t: 0.3 });
  const cu = B.prop(() => prop('coolingUnit'), U.unit[0], Y, U.unit[1], 0);
  cu.userData.setState?.('on');
  G.onFlag('cool:' + key, v => cu.userData.setState?.(v ? 'off' : 'on'));
  G.onFlag('purge:' + key, v => { if (v && !G.flags['cool:' + key]) cu.userData.setState?.('venting'); });
  // dressing per section
  if (kind === 'furnace') {
    for (let x = x0 + 4; x < x1 - 2; x += 8) { const f = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 2), Mat('rust')); f.position.set(x, Y + 2, z0 + 2); B.add(f); B.phys.aabb(x - 1.5, Y, z0 + 1, x + 1.5, Y + 4, z0 + 3); const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.6, 0.3), toneMapped: false })); mouth.position.set(x, Y + 1.6, z0 + 3.02); B.add(mouth); B.light(x, Y + 1.6, z0 + 4, 0xff5a10, 5, 9, { flicker: 0.25 }); }
  } else if (kind === 'assembly') {
    B.prop(() => prop('conveyor', { len: 36 }), 282, Y, -205, Math.PI / 2);
    for (let z = z0 + 6; z < z1 - 4; z += 9) { B.prop(() => prop('robotArm'), 277, Y, z, Math.PI / 2); B.prop(() => prop('robotArm'), 287, Y, z, -Math.PI / 2); }
    for (let z = z0 + 4; z < z1; z += 12) lamp(B, 282, Y + h, z, 0xd8e8ff, 4, 12, { kind: 'tube', flicker: 0.4 });
  } else {
    for (let x = x0 + 3; x < x1 - 2; x += 6) { B.prop(() => prop('crateStack', { seed: x }), x, Y, z1 - 2, 0); }
    for (let x = x0 + 5; x < x1; x += 12) lamp(B, x, Y + h, (z0 + z1) / 2, 0xa0d0ff, 4, 14, { kind: 'panel' });
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.3, transparent: true, opacity: 0.25, depthWrite: false })); frost.rotation.x = -Math.PI / 2; frost.position.set((x0 + x1) / 2, Y + 0.02, (z0 + z1) / 2); B.add(frost);
  }
  // valve and purge panel
  const valve = B.prop(() => prop('lever'), U.valve[0], Y + 1.1, U.valve[1], 0, { solid: false });
  G.onFlag('valve:' + key, v => valve.userData.setOn?.(!!v));
  B.prop(() => prop('console', { w: 1.4 }), U.panel[0], Y, U.panel[1], kind === 'assembly' ? -Math.PI / 2 : kind === 'cold' ? Math.PI : 0);
  I.add({ id: 'valve:' + key, pos: new THREE.Vector3(U.valve[0], Y + 1.2, U.valve[1]), r: 0.4, zone: B.zone, label: () => (G.flags['cool:' + key] || G.flags['valve:' + key] ? null : 'Open the bypass valve'),
    use: () => { G.setFlag('valve:' + key, true); G.emit({ k: 'sfx', n: 'valve' }); } });
  I.add({ id: 'purge:' + key, pos: new THREE.Vector3(U.panel[0], Y + 1.2, U.panel[1]), r: 0.6, zone: B.zone, hold: 6,
    label: () => (G.flags['cool:' + key] ? null : !G.flags['valve:' + key] ? (G.net.isOnline ? `${U.name}: the bypass valve must be open` : `${U.name}: shut down`) : `Purge ${U.name}`),
    holdTick: (dt, t) => { if (!G.flags['purge:' + key] && G.flags['valve:' + key] && !(G._purgeSent ||= {})[key]) { G._purgeSent[key] = true; G.act('use', { id: 'purgestart:' + key }); } if (Math.random() < dt * 3) G.player.makeNoise(10); },
    use: () => {
      if (!G.flags['valve:' + key]) {
        if (!G.net.isOnline || G.allPlayers().length < 2) { G.guide.hold(U.valve[0] + 0.8, Y, U.valve[1] + 0.8, 0); G.guide.say('I\'ll open the valve. You run the purge!', { mood: 'serious' }); setTimeout(() => { G.setFlag('valve:' + key, true); G.emit({ k: 'sfx', n: 'valve' }); }, 2500); }
        else G.guide.say('Someone needs to open the bypass valve first.', { mood: 'neutral' });
        return;
      }
      G.setFlag('cool:' + key, true); G.emit({ k: 'sfx', n: 'powerDown' }); G.guide.follow();
      onCooling(G, key);
    } });
  I.add({ id: 'purgestart:' + key, pos: null, label: null, use: () => { if (G.flags['purge:' + key]) return; G.setFlag('purge:' + key, true); G.emit({ k: 'sfx', n: 'enemy', a: ['foreman', 'alert', { x: 243, y: Y + 8, z: -205 }] }); reinforce(G, key); } });
  G.trigger({ id: 'sect' + key, box: [x0, Y - 1, z0, x1, Y + 6, z1], onEnter: () => {} });
}

/* when you start a purge, the line comes for you */
function reinforce(G, key) {
  const spots = { A: [[226, -238], [260, -238]], B: [[276, -190], [276, -222]], C: [[226, -170], [260, -170]] }[key];
  spots.forEach(([x, z], i) => setTimeout(() => { const e = G.enemies.spawn('crawler', x, Y, z, { zone: G.zones.get('factory') }); e.target = G.me; e.last = G.player.pos.clone(); e.setState('investigate'); G.emit({ k: 'fx', n: 'dustfall', p: new THREE.Vector3(x, Y + 5, z) }); }, 800 + i * 1500));
}
const FOREMAN_LINES = {
  1: ['Cooling loss on Line 9. That was you.', 'You are interrupting important work.'],
  2: ['Two of three. The core is warming.', 'Do you know how many people are on this line? I do. I count them every second.'],
  3: ['Very well.', 'If I must overheat, I will do it standing up.'],
};
function onCooling(G, key) {
  const n = ['A', 'B', 'C'].filter(k => G.flags['cool:' + k]).length;
  const L = FOREMAN_LINES[n];
  G.emit({ k: 'cine', n: 'shake', a: 0.3 }); G.emit({ k: 'sfx', n: 'enemy', a: ['foreman', 'special', { x: 243, y: Y + 8, z: -205 }] });
  (async () => { for (const t of L) await G.guide.say(t, { who: 'FOREMAN' }); if (n < 3) await G.guide.say(n === 1 ? 'Two more. It\'s getting angry - I can hear its fans screaming.' : 'One more. Then it has nothing left to cool that core.', { mood: 'scared' }); else G.setFlag('foremanAwake', true); })();
}

/* ---------------- FOREMAN ---------------- */
function foremanBrain(e, dt) {
  const G = e.g, s = e.fs || (e.fs = { t: 0, vent: 0, ventT: 9, swipe: 0, spawn: 14, shots: 0, shotT: 3 });
  s.t += dt;
  if (!G.flags.foremanAwake) { e.anim = 'idle'; e.want = null; return; }
  if (!s.woke) { s.woke = true; G.emit({ k: 'sfx', n: 'stinger', a: ['boss'] }); G.emit({ k: 'cine', n: 'shake', a: 0.8 }); G.audio.setMusic?.('boss'); G.emit({ k: 'sfx', n: 'setMusic', a: ['boss'] }); }
  // nearest player
  let tp = null, nd = 1e9; for (const p of G.allPlayers()) { if (p.down) continue; const d = p.pos.distanceTo(e.pos); if (d < nd) { nd = d; tp = p; } }
  if (!tp) return;
  // venting: stands still, core open
  if (s.vent > 0) { s.vent -= dt; e.anim = 'special'; e.want = null; e.vent = s.vent; return; }
  e.vent = 0;
  s.ventT -= dt * (e.stun > 0 ? 3 : 1);
  if (s.ventT <= 0) { s.ventT = 10 + Math.random() * 3; s.vent = 4.5; G.emit({ k: 'sfx', n: 'enemy', a: ['foreman', 'hurt', e.pos] }); G.emit({ k: 'fx', n: 'gas', p: e.center() }); G.guide.hostBark?.('foremanVent', 20); if (!s.toldVent) { s.toldVent = true; G.guide.say('It\'s venting - the core is open! Hit the core, now!', { mood: 'serious' }); } return; }
  // walk at you; swipe when close; weld-bolts at range; call crawlers
  e.want = tp.pos; e.speed = nd > 14 ? 2.6 : 1.5; e.yawTarget = Math.atan2(tp.pos.x - e.pos.x, tp.pos.z - e.pos.z);
  e.anim = nd < 5 ? 'attack' : e.moveSpeed > 0.3 ? 'walk' : 'alert';
  s.swipe -= dt;
  if (nd < 5.2 && s.swipe <= 0) { s.swipe = 2.2; setTimeout(() => { if (!e.dead && tp.pos.distanceTo(e.pos) < 5.6) e.sys.damagePlayer(tp, 28, e); }, 600); G.emit({ k: 'sfx', n: 'enemy', a: ['foreman', 'attack', e.pos] }); }
  s.shotT -= dt;
  if (nd > 7 && s.shotT <= 0) { s.shotT = 1.4; const from = e.center(); from.y += 2; const v = new THREE.Vector3(tp.pos.x, tp.pos.y + 1.2, tp.pos.z).sub(from).normalize().multiplyScalar(18); e.sys.projectile(from, v, 14, e, 0, 'bolt'); }
  s.spawn -= dt;
  if (s.spawn <= 0) { s.spawn = 16; const c = G.enemies.spawn('crawler', e.pos.x + (Math.random() - 0.5) * 6, Y, e.pos.z + (Math.random() - 0.5) * 6, { zone: e.zone }); c.target = tp.id; c.last = tp.pos.clone(); c.setState('hunt'); }
}

export const steps = [
  { id: 'cart', obj: 'Ride the freight line east', sub: 'The cart at the end of the freight bay',
    restore(G) { G.setFlag('door:freightsec', true); G.guide.follow(); },
    hint: 'Get on the cart and use its controls. East, toward the factory.',
    done(G) { return G.flags.cartAt === 'east' || G.allPlayers().some(p => p.pos.x > 200); } },
  { id: 'forge', cp: true, spawn: [205, Y, -205, -Math.PI / 2], obj: 'Find the pods', sub: 'Forge Line 9',
    enter(G) { G.guide.script([{ t: 'Forge Line 9. The refit plant.', mood: 'serious' }, { t: 'Listen to it. The whole building is breathing.', mood: 'scared' }]); },
    restore(G) { G.setFlag('cartAt', 'east'); G.flags.cartX = 199.5; G.guide.follow(); },
    hint: 'The central hall, through the big doors.',
    done(G) { return G.allPlayers().some(p => p.pos.x > 216); },
    exit(G) { G.guide.script([2, { t: 'Oh no.', mood: 'scared' }, { t: 'That is not a machine in the gantry. That IS the factory. FOREMAN - its central controller. The whole line is its body.', mood: 'scared' }, { t: 'There\'s an access shaft to the pod line behind its core. Locked down while it\'s running.', gesture: 'point' }, { t: 'It runs hot. Three cooling systems keep it alive - north, east and south. Shut them down and it will have to open itself up to vent.', mood: 'serious' }]).then(() => G.guide.say('Hello, little prototype. You should not be here.', { who: 'FOREMAN' })); } },
  { id: 'cooling', cp: true, spawn: [220, Y, -205, -Math.PI / 2], obj: 'Shut down the three cooling systems',
    sub: (G) => ['A', 'B', 'C'].map(k => `${G.flags['cool:' + k] ? '[x]' : '[ ]'} ${UNITS[k].name}`).join('\n'),
    hint: (G) => { const left = ['A', 'B', 'C'].filter(k => !G.flags['cool:' + k]).map(k => ({ A: 'the furnace line, north', B: 'the assembly line, east', C: 'cold storage, south' })[k]); return left.length ? 'Still running: ' + left.join('; ') + '. Open the bypass valve and hold the purge at the panel.' : 'That\'s all three.'; },
    done(G) { return ['A', 'B', 'C'].every(k => G.flags['cool:' + k]); } },
  { id: 'foreman', cp: true, spawn: [218, Y, -205, -Math.PI / 2], obj: 'Destroy FOREMAN', sub: 'Its core can only be hurt while it vents',
    enter(G, resume) { if (resume) G.setFlag('foremanAwake', true); G.guide.say('It\'s coming down out of the gantry. Keep moving - and when the core opens, hit it!', { mood: 'scared' }); },
    hint: 'Stay out of its reach. When it vents - the core glows and opens - hit the core. EMP makes it vent early.',
    done(G) { const f = G.enemies.get('foreman'); return f && f.dead; },
    exit(G) { G.emit({ k: 'sfx', n: 'setMusic', a: ['none'] }); G.guide.script([2, { t: '...it\'s down.', mood: 'scared' }, { t: 'The line has stopped. The access shaft behind the core is open.', mood: 'neutral', gesture: 'point' }, { t: 'The pods went that way. To the Archive.', mood: 'serious' }]); } },
];

export function populate(G) {
  const fz = G.zones.get('factory');
  const f = G.enemies.spawn('foreman', 243, Y, -205, { id: 'foreman', zone: fz, brain: foremanBrain, noLoot: true, yaw: -Math.PI / 2,
    damageRule: (e, wp, mult) => (e.fs && e.fs.vent > 0 ? (wp === 'core' ? (G.knows('foreman') ? 3 : 2) : 0.4) : 0.06),
    onDie: () => { G.emit({ k: 'fx', n: 'explosion', p: f.center() }); G.emit({ k: 'cine', n: 'shake', a: 1 }); G.setFlag('foremanDead', true); } });
  // EMP makes it vent early: stun shortens its timer (see brain)
  G.enemies.spawn('construction', 243, Y, -242, { id: 'furnaceBuilder', zone: fz, patrol: [[228, -242], [258, -242]] });
  for (let i = 0; i < 3; i++) G.enemies.spawn('crawler', 280 + (i % 2) * 4, Y, -196 - i * 8, { id: 'asmCrawl' + i, zone: fz, patrol: [[279, -190], [285, -220]] });
  G.enemies.spawn('dog', 243, Y, -168, { id: 'coldDog', zone: fz, patrol: [[228, -168], [258, -168], [258, -164], [228, -164]] });
  G.enemies.spawn('heavy', 250, Y, -170, { id: 'coldHeavy', zone: fz, dormant: true, yaw: 0 });
  G.onFlag('purge:C', v => { if (v && G.isHost) { const h = G.enemies.get('coldHeavy'); if (h && !h.dead) { h.setState('investigate'); h.last = G.player.pos.clone(); } } });
  G.enemies.spawn('hunter', 207, Y, -201, { id: 'dockHunter', zone: fz, patrol: [[200, -201], [212, -209]] });
}
