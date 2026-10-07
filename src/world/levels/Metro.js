/* Metro.js - Meridian Station, and the secondary generator under it.

     street stairs (x 8.5..11.5) down to the concourse (y -6): ticket hall,
       turnstiles, the security office (a maintenance prod in a locker)
     stairs (x 4..8) down to the platform hall (y -9): a long tiled vault,
       a wrecked train on the tracks (y -10.2), the west tunnel caved in,
       the maintenance store at the west end (spare fuses - and a crawler nest)
     east along the track bed: a service door to the generator room
     generator room (y -10.2): the generator, its breaker panel, the primer
       lever, and the service elevator shaft down to the tunnels (y -26)

   The chain: find the generator -> its fuse is burnt -> fetch a spare from
   the store -> prime and start it (two people, or you and GUIDE) -> it can
   only feed two circuits at once -> to power the elevator you have to turn
   off the station lights -> ride down. The dark is where the stalker is. */
import * as THREE from '../../../lib/three.module.js';
import { prop } from '../../art/Art.js';
import { slab, lamp, emergency, debris, rubble, puddle, screen, glyph, Mat } from './common.js';

const YC = -6, YP = -9, YT = -10.2, YD = -26;
export const CIRCUITS = [
  { id: 'station', name: 'Station lighting' },
  { id: 'vent', name: 'Ventilation' },
  { id: 'doors', name: 'Security doors' },
  { id: 'lift', name: 'Service elevator' },
];

export function build(G) {
  const top = G.addZone('metroTop', { name: 'Meridian Station', bounds: [[-6, -10, -54, 26, 1, -29.5]], fog: 0x0a0d10, density: 0.03, hemi: 0.05, space: 'hall', horror: 0.45, neighbors: ['street', 'metro'], surface: 'tile', env: 0.25, drip: 0.4, machinery: 0.15, tension: 0.15 });
  const mt = G.addZone('metro', { name: 'Meridian Station - Platforms', bounds: [[-32, -12, -74, 82, -1, -52], [-28, -12, -60, -16, -5, -50]], fog: 0x090b0d, density: 0.035, hemi: 0.04, space: 'tunnel', horror: 0.75, neighbors: ['metroTop', 'genroom'], surface: 'tile', env: 0.2, drip: 0.7, tunnel: 0.4, machinery: 0.1, tension: 0.2 });
  const gr = G.addZone('genroom', { name: 'Generator Room', bounds: [[54, YD - 2, -90, 74, -4, -72]], fog: 0x0b0c0d, density: 0.03, hemi: 0.04, space: 'room', horror: 0.4, neighbors: ['metro', 'tunnels'], surface: 'metal', env: 0.2, generator: 'gen', hum: 0.3, drip: 0.3 });
  const A = G.builder(top); concourse(G, A); A.finish();
  const B = G.builder(mt); platforms(G, B); B.finish();
  const C = G.builder(gr); genroom(G, C); C.finish();
  // power: everything off until the generator runs
  G.power.gen = false;
}

function concourse(G, B) {
  const I = G.interact;
  // the street stairs: 30 steps down under the building
  B.stairs(10, YC, -39, 's', 3.1, 30, 'tilesSubway', 0.2, 0.3, { solidUnder: true });
  B.box(8.2, YC, -39.2, 8.45, 2.6, -29.9, 'tilesSubway'); B.box(11.55, YC, -39.2, 11.8, 2.6, -29.9, 'tilesSubway');
  for (let k = 0; k < 9; k++) { const z = -30 - k, fy = -(k + 1) * 6 / 9; B.box(8.4, fy + 3.1, z - 1, 11.6, fy + 3.35, z, 'panelWhite', { solid: false }); }
  // concourse box
  slab(B, -4, -52, 24, -39, YC, 'tilesSubway', 'concrete');
  B.box(-4, YC + 4.5, -52, 24, YC + 4.8, -39, 'panelWhite');
  B.wall(-4, -39, 8.4, -39, YC, 4.5, 'tilesSubway', { t: 0.3 }); B.wall(11.6, -39, 24, -39, YC, 4.5, 'tilesSubway', { t: 0.3 });
  B.wall(-4, -52, 24, -52, YC, 4.5, 'tilesSubway', { t: 0.3, openings: [{ u: 10, w: 4, y: 0, h: 3.2 }] });
  B.wall(-4, -52, -4, -39, YC, 4.5, 'tilesSubway', { t: 0.3 }); B.wall(24, -52, 24, -39, YC, 4.5, 'tilesSubway', { t: 0.3 });
  // turnstile line
  for (let x = -2; x <= 16; x += 1.5) if (x < 4.5 || x > 7.5) B.prop(() => prop('turnstile'), x, YC, -45.5, 0);
  B.box(-4, YC, -45.8, -2.6, YC + 1.1, -45.2, 'steel'); B.box(16.6, YC, -45.8, 18, YC + 1.1, -45.2, 'steel');
  B.prop(() => prop('ticketMachine'), -3.5, YC, -42, Math.PI / 2); B.prop(() => prop('ticketMachine'), -3.5, YC, -43.6, Math.PI / 2);
  B.prop(() => prop('vendingMachine', { broken: true }), 23.4, YC, -41, -Math.PI / 2);
  B.prop(() => prop('subwayBench'), 2, YC, -49.5, 0); B.prop(() => prop('suitcase', { open: true }), 3, YC, -48.4, 0.5);
  // the station map / departures board, still scrolling
  screen(B, 14, YC + 3, -51.82, 0, 5, 1.2, (g, w, h, t) => {
    g.fillStyle = '#060708'; g.fillRect(0, 0, w, h); g.font = `700 ${h * 0.28}px "Share Tech Mono", monospace`; g.fillStyle = '#ffb000';
    g.fillText('MERIDIAN', w * 0.03, h * 0.38); const lines = ['L2 HARBOUR     SUSPENDED', 'L4 HELIX/SPIRE  -- --', 'ALL SERVICES   CONCORD CONTROL']; g.font = `${h * 0.2}px "Share Tech Mono", monospace`;
    g.fillText(lines[Math.floor(t / 3) % 3], w * 0.03, h * 0.78);
  }, { glow: 1.3, every: 0.5 });
  // security office
  B.wall(18, -52, 18, -46.3, YC, 4.5, 'panelWhite', { t: 0.15, openings: [{ u: 3.2, w: 1.1, y: 0, h: 2.2 }] });
  B.wall(18, -46.3, 24, -46.3, YC, 4.5, 'panelWhite', { t: 0.15, openings: [{ u: 2.5, w: 2, y: 1, h: 1.2 }] });
  I.door(B, { id: 'secoff', x: 18, y: YC, z: -48.8, axis: 'z', w: 1.1, kind: 'swing', mat: 'metalWhite' });
  B.prop(() => prop('desk', { monitor: true }), 21.5, YC, -47.4, Math.PI); B.prop(() => prop('chair', { fallen: true }), 20.6, YC, -48.6, 1);
  B.prop(() => prop('lockers', { n: 4, openIdx: 2 }), 21, YC, -51.6, 0);
  I.pickup(B, { id: 'prod', tool: 'prod', icon: 'prod', x: 21.2, y: YC + 1.1, z: -51.35, rot: 1.5, label: 'Take the maintenance arc prod',
    onTake: () => { G.guide.script([{ t: 'A maintenance arc prod. For unjamming escalators, officially.', mood: 'curious' }, { t: 'Left click to strike. Hold right to charge a heavy hit. It runs on its own cell - I can recharge it if we find energy cells.', gesture: 'point' }]); } });
  I.note(B, { id: 'guard_log', x: 21.5, y: YC + 0.78, z: -47.2, title: 'Security log (paper, the screen is dead)', text: 'Night 1 - Trains stopped 23:40. Concord says "network maintenance". Fifty people stuck down here. Let them sleep on the platform.\n\nNight 2 - The maintenance spiders came out of the vents at 3. Thought they were fixing something. They took the wiring out of the platform lights. All of it.\n\nNight 2, later - A train came in. No driver. Doors opened. Everyone got on because a calm voice said "please board". I didn\'t. The train went towards Helix.\n\nNight 3 - It\'s dark on the platform now. Something tall stands at the end of it. It only moves when I\'m not looking.', model: () => prop('note', { text: 'Night 1' }) });
  emergency(B, 0, YC + 3.6, -39.3, Math.PI, { flicker: 0.3, intensity: 2.5 }); emergency(B, 23.7, YC + 3.6, -44, -Math.PI / 2, { intensity: 2 });
  for (const x of [2, 12]) lamp(B, x, YC + 4.5, -45, 0xe0f0ff, 7, 12, { power: 'station', kind: 'tube' });
  lamp(B, 10, 2.5, -33, 0xe0f0ff, 3, 8, { kind: 'tube', flicker: 0.6 });
  for (let x = -2; x <= 22; x += 4) { B.node(x, YC, -42); B.node(x, YC, -49); } B.node(6, YC, -45.5); B.node(21, YC, -49.5); B.node(19, YC, -48.8); B.node(16.5, YC, -48.8);
  B.node(10, 0.15, -29); B.node(6, YC, -51.6);
  G.atmos.roof(-6, -54, 26, -32.5, 3);
  G.trigger({ id: 'cc', box: [-4, YC - 1, -52, 24, YC + 3, -39], onEnter: () => G.setFlag('inStation', true) });
}

function platforms(G, B) {
  const I = G.interact;
  // stairs down from the concourse
  B.stairs(6, YP, -56.5, 's', 3.6, 15, 'tilesSubway', 0.2, 0.3, { solidUnder: true });
  B.box(3.8, YP, -58, 4.1, YC + 4.5, -52, 'tilesSubway'); B.box(7.9, YP, -58, 8.2, YC + 4.5, -52, 'tilesSubway');
  B.box(3.8, YC + 3.2, -58, 8.2, YC + 4.5, -52, 'panelWhite', { faces: ['ny'] });
  B.box(4.1, YP, -58, 7.9, YP + 0.01, -56.5, 'tilesSubway', { faces: ['py'] });
  // the hall
  B.box(-30, YP - 0.3, -64, 80, YP, -58, 'tilesSubway', { faces: ['py', 'nz'] });            // platform
  B.box(-30, YP, -64.25, 50, YP + 0.01, -63.6, 'hazard', { solid: false, faces: ['py'] });   // the yellow line
  B.box(-30, YT - 0.3, -72, 82, YT, -64, 'concreteDark', { faces: ['py'] });                 // track bed
  B.box(-30, YP, -58.3, 50, -2, -58, 'tilesSubway', {});                                     // back wall (lower)
  B.wall(-30, -58, 50, -58, YP, 7, 'tilesSubway', { t: 0.3, openings: [{ u: 36, w: 3.8, y: 0, h: 3 }, { u: 8, w: 1.4, y: 0, h: 2.3 }] });
  B.box(-30, YT, -72.6, 82, -2, -72, 'tunnel');                                              // track-side wall
  B.box(-30, -2, -72.6, 50, -1.6, -58, 'tunnel');                                            // vault ceiling
  for (let x = -28; x <= 48; x += 6) B.box(x, -2.6, -72, x + 0.5, -2, -58, 'concrete', { solid: false }); // ribs
  // west: the tunnel has caved in
  rubble(B, -32, YT, -72, -26, YP + 4, -58, 21); B.box(-31, YT, -72, -30, -2, -58, 'concreteDark');
  // tracks, the train, platform furniture
  for (let x = -26; x < 80; x += 12) B.prop(() => prop('trackSegment', { len: 12 }), x + 6, YT, -68, 0, { solid: false });
  B.prop(() => prop('subwayCar', { wrecked: true }), 10, YT, -68, 0);
  for (let x = -24; x <= 44; x += 12) { B.prop(() => prop('subwayBench'), x, YP, -59, 0); }
  B.prop(() => prop('platformEdge', { len: 76 }), 10, YP, -64, 0, { solid: false });
  B.prop(() => prop('cardboardBoxes', { seed: 31 }), -10, YP, -59.5, 0); B.prop(() => prop('suitcase', { open: true }), 22, YP, -60, 2.3); B.prop(() => prop('suitcase'), 23, YP, -59.6, 0.3);
  puddle(B, 30, YP, -61, 2, 1); puddle(B, -6, YP, -60.5, 1.4, 0.8);
  // platform lights (station circuit) and the battery emergency lights
  for (let x = -24; x <= 44; x += 10) lamp(B, x, -2.6, -61, 0xe8f2ff, 6, 12, { power: 'station', kind: 'tube' });
  for (const x of [-20, 6, 32]) emergency(B, x, YP + 3, -58.2, 0, { intensity: 1.4, flicker: 0.35 });
  screen(B, 20, YP + 3.4, -58.12, 0, 4.4, 1, (g, w, h, t) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); if (Math.floor(t * 2) % 2) { g.fillStyle = '#ff3020'; g.font = `700 ${h * 0.4}px "Share Tech Mono"`; g.fillText('PLEASE  BOARD', w * 0.1, h * 0.65); } }, { glow: 1.6, every: 0.5 });
  G.story.subject('train', [10, YT + 2, -68], 3, ['The train came in without a driver, the log said. People got on because the voice said "please board".', 'The cars are empty. The doors were held open from outside. Bent.', 'The route board says Helix - Spire. Both. Like it was making more than one stop.']);
  // the maintenance store (west end, behind the platform wall)
  B.room(-26, -57.8, -18, -51, YP, 3.2, { floor: 'concrete', wall: 'concrete', ceil: 'concrete', skip: ['s'] });
  B.wall(-26.1, -57.9, -17.9, -57.9, YP, 3.2, 'concrete', { t: 0.1, openings: [{ u: 4, w: 1.2, y: 0, h: 2.2 }] });
  I.door(B, { id: 'store', x: -22, y: YP, z: -58, axis: 'x', w: 1.2, kind: 'swing', mat: 'metal', label: 'Open the maintenance store' });
  B.prop(() => prop('crateStack', { seed: 3 }), -25, YP, -52.5, 0); B.prop(() => prop('toolbox'), -19, YP, -52, 0.4); B.prop(() => prop('cableReel'), -24.5, YP, -56, 0);
  B.prop(() => prop('ventGrate'), -22, YP + 3.15, -54, 0, { solid: false });
  B.box(-21.6, YP, -51.6, -18.4, YP + 0.9, -51.1, 'metal');
  I.pickup(B, { id: 'fuse', key: 'fuse', icon: 'circuit', x: -20, y: YP + 0.92, z: -51.35, label: 'Take the spare 400 A fuse', when: () => G.flags.genFound,
    onTake: () => { G.setFlag('nestAwake', true); setTimeout(() => G.guide.say('Wait - something\'s in the vents!', { mood: 'scared' }), 400); } });
  I.pickup(B, { id: 'cell_store', item: 'cell', x: -24.6, y: YP + 0.02, z: -55, label: () => 'Take the ' + G.itemName({ item: 'cell' }) });
  I.pickup(B, { id: 'wire_store', item: 'wire', x: -19.4, y: YP + 0.45, z: -52.2 });
  lamp(B, -22, YP + 3.2, -54.5, 0xffe0b0, 2, 6, { flicker: 0.8, kind: 'pendant' });
  // the train interior pickups
  I.pickup(B, { id: 'bat_train', item: 'battery', x: 12, y: YT + 1.1, z: -68.3 });
  I.pickup(B, { id: 'med_train', tool: 'medkit', icon: 'medkit', x: 4, y: YT + 1.1, z: -67.6, label: 'Take the med foam' });
  // nav: platform line, track bed, store, the east tunnel
  B.nodeLine(-24, YP, -61, 48, -61, 4); B.nodeLine(-24, YT, -66, 80, -66, 5); B.node(-22, YP, -57); B.node(-22, YP, -54.5);
  for (let x = -20; x <= 44; x += 8) B.node(x, YP, -59, { dark: true });
  // drop down to the track bed at the east end of the platform, and the tunnel beyond
  B.box(50, YT, -64, 51.5, YP - 0.6, -60, 'concrete'); // a step
  B.box(50, YT - 0.3, -72, 82, YT, -58, 'concreteDark', { faces: ['py'] });
  B.box(50, YT, -58.3, 82, -4, -58, 'tunnel'); B.box(50, -4.3, -72, 82, -4, -58, 'tunnel');
  for (let x = 54; x < 82; x += 7) emergency(B, x, YT + 2.6, -71.8, Math.PI, { color: 0xff7020, intensity: 1.2, flicker: 0.2 });
  B.box(50, YP, -64, 50.3, -2, -58, 'tunnel', { solid: false });
  B.nodeLine(52, YT, -63, 80, -63, 5);
  B.box(80, YT, -72, 82, -4, -58, 'concreteDark');      // tunnel blocked further on
  rubble(B, 76, YT, -72, 81, YT + 3, -64, 8);
  // the service door to the generator room (north wall of the tunnel)
  B.box(58, YT, -72.6, 66, -4, -72.5, 'tunnel', { solid: false });
  G.atmos.roof(-32, -74, 82, -50, -1);
}

function genroom(G, B) {
  const I = G.interact;
  const x0 = 56, x1 = 72, z0 = -88, z1 = -72.6, y = YT;
  B.room(x0, z0, x1, z1, y, 5, { floor: null, wall: 'concreteDark', ceil: 'concrete', open: { s: [{ u: 6, w: 1.4, y: 0, h: 2.3 }] } });
  slab(B, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, y, 'concrete', 'concrete', [[66.5, -87.8, 71.5, -84.2]]);
  I.door(B, { id: 'genroom', x: 62, y, z: z1, axis: 'x', w: 1.4, kind: 'heavy', mat: 'metalYellow', label: 'Open the service door' });
  B.sign(62, y + 2.7, z1 + 0.18, 0, 2.4, 0.4, (g, w, h) => { g.fillStyle = '#c9a020'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = `700 ${h * 0.6}px "Rajdhani"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GENERATOR  B - HELIX FACILITIES', w / 2, h / 2); }, { lit: false, res: 64 });
  // the generator
  const gen = B.prop(() => prop('generator'), 61, y, -82, 0);
  gen.userData.setRunning?.(false);
  G.onFlag('pw:gen', v => gen.userData.setRunning?.(!!v));
  // breaker panel with four circuits
  const panel = B.prop(() => prop('breakerPanel'), x0 + 0.12, y + 1.3, -78, Math.PI / 2, { solid: false });
  const prim = B.prop(() => prop('lever'), x1 - 0.12, y + 1.1, -76, -Math.PI / 2, { solid: false });
  G.onFlag('primer', v => prim.userData.setOn?.(!!v));
  B.prop(() => prop('pipes', { len: 14, n: 4 }), 64, y + 4, z0 + 0.3, 0, { solid: false });
  B.prop(() => prop('barrel', { hazard: true }), 70.5, y, -74, 0); B.prop(() => prop('barrel'), 69.6, y, -74.3, 0);
  B.prop(() => prop('toolbox'), 58, y, -86.8, 0.2);
  emergency(B, 64, y + 3.6, z1 - 0.1, Math.PI, { intensity: 2.2 });
  lamp(B, 61, y + 5, -80, 0xfff0d8, 7, 13, { power: 'gen', kind: 'tube' });
  lamp(B, 67, y + 5, -80, 0xfff0d8, 5, 11, { power: 'gen', kind: 'tube' });
  B.light(61, y + 2.5, -80.6, 0x40ff80, 1.2, 4, { power: 'gen' });
  // --- interactions ---
  const pw = (c) => !!G.power[c];
  const onCount = () => CIRCUITS.filter(c => G.flags['brk:' + c.id]).length;
  I.add({ id: 'gen', pos: new THREE.Vector3(61, y + 1.2, -81), r: 1.2, zone: B.zone, label: () => {
      if (!G.flags.genFound) return null;
      if (!G.flags.fuseIn) return G.partyHas('fuse') || G.has('fuse') ? 'Fit the new fuse' : 'Generator: main fuse burnt out';
      if (G.power.gen) return null;
      return G.flags.primer ? 'START' : 'Start (needs the primer pulled)';
    },
    use: () => {
      if (!G.flags.fuseIn) { if (G.has('fuse') || G.partyHas('fuse')) { G.setFlag('fuseIn', true); G.emit({ k: 'sfx', n: 'cableConnect' }); G.guide.say('Fuse in. Now: the primer lever on the far wall has to be held while someone hits start.', { mood: 'neutral', gesture: 'point' }); } else G.guide.say('The fuse is burnt black. There\'ll be spares in the station maintenance store - west end of the platform.', { mood: 'neutral' }); return; }
      if (G.power.gen) return;
      if (!G.flags.primer) { G.emit({ k: 'sfx', n: 'deny' }); G.guide.say(G.net.isOnline ? 'Someone has to hold the primer on the far wall at the same time.' : 'The primer first. I\'ll hold it - pull it and I\'ll take over.', { mood: 'neutral' }); return; }
      startGen(G);
    } });
  I.add({ id: 'primer', pos: new THREE.Vector3(x1 - 0.3, y + 1.1, -76), r: 0.4, zone: B.zone, label: () => (G.flags.fuseIn && !G.power.gen ? (G.flags.primer ? null : 'Pull the primer lever') : null),
    use: (pid) => {
      G.setFlag('primer', true); G.emit({ k: 'sfx', n: 'valve' });
      const solo = !G.net.isOnline || G.allPlayers().length < 2;
      if (solo) { G.guide.hold(x1 - 0.9, y, -76, -Math.PI / 2); G.guide.say('Got it - I\'m holding it. Go, hit start!', { mood: 'serious' }); }
      clearTimeout(G._primT); G._primT = setTimeout(() => { if (!G.power.gen) { G.setFlag('primer', false); G.guide.say('It sprang back. Again - faster.', { mood: 'neutral' }); } if (G.guide.mode === 'hold') G.guide.follow(); }, solo ? 9000 : 6000);
    } });
  CIRCUITS.forEach((c, i) => {
    I.add({ id: 'brk:' + c.id, pos: new THREE.Vector3(x0 + 0.25, y + 0.9 + i * 0.28, -78.4 + i * 0.25), r: 0.14, range: 2.0, zone: B.zone,
      label: () => (G.power.gen ? `${c.name}: ${G.flags['brk:' + c.id] ? 'ON' : 'OFF'}  (${onCount()}/2 load)` : null),
      use: () => {
        const on = !G.flags['brk:' + c.id];
        G.setFlag('brk:' + c.id, on); G.emit({ k: 'sfx', n: 'breaker', a: [on] }); panel.userData.setSwitch?.(i, on);
        if (onCount() > 2) { // overload: the generator trips
          G.emit({ k: 'sfx', n: 'powerDown' }); G.setPower('gen', false); G.setFlag('primer', false);
          for (const k of CIRCUITS) G.setPower(k.id, false);
          G.guide.say('Overload - it tripped! It can only carry two circuits. We\'ll have to start it again.', { mood: 'scared' });
          return;
        }
        applyCircuits(G);
      } });
  });
  G.onFlag('*', (k) => { if (k.startsWith('brk:')) { const i = CIRCUITS.findIndex(c => 'brk:' + c.id === k); panel.userData.setSwitch?.(i, !!G.flags[k]); } });
  // the service elevator: a cab in a shaft at the north-east corner, down to the tunnels
  elevatorShaft(G, B);
  B.nodeLine(58, y, -76, 70, -76, 4); B.nodeLine(58, y, -86, 66, -86, 4); B.node(62, y, -74.5); B.node(62, y, -71);
  G.trigger({ id: 'genFound', box: [x0, y - 1, z0, x1, y + 4, z1], onEnter: () => { if (G.flags.genFound) return; G.setFlag('genFound', true); } });
}

function applyCircuits(G) {
  for (const c of CIRCUITS) G.setPower(c.id, !!G.power.gen && !!G.flags['brk:' + c.id]);
}
function startGen(G) {
  G.setPower('gen', true); G.setFlag('primer', false);
  G.emit({ k: 'sfx', n: 'generatorStart' }); G.emit({ k: 'cine', n: 'shake', a: 0.3 });
  // it comes up on its default circuits: lights and ventilation
  if (!G.flags.genEverStarted) { G.setFlag('brk:station', true); G.setFlag('brk:vent', true); G.setFlag('genEverStarted', true); }
  applyCircuits(G);
  setTimeout(() => G.emit({ k: 'sfx', n: 'powerUp' }), 900);
  G.guide.follow();
}

function elevatorShaft(G, B) {
  const sx0 = 66.5, sx1 = 71.5, sz0 = -87.8, sz1 = -84.2, top = YT, bot = YD;
  // shaft walls from the tunnel floor up to the generator room
  B.box(sx0 - 0.2, bot, sz0, sx0, top + 5, sz1 + 0.2, 'concreteDark'); B.box(sx1, bot, sz0, sx1 + 0.2, top + 5, sz1 + 0.2, 'concreteDark'); B.box(sx0, bot + 2.6, sz0 - 0.2, sx1, top + 5, sz0, 'concreteDark'); B.box(sx0, bot, sz0 - 0.2, sx0 + 0.6, bot + 2.6, sz0, 'concreteDark'); B.box(sx1 - 0.6, bot, sz0 - 0.2, sx1, bot + 2.6, sz0, 'concreteDark');
  B.box(sx0, top, sz1, sx0 + 1.2, top + 5, sz1 + 0.2, 'concreteDark'); B.box(sx1 - 1.2, top, sz1, sx1, top + 5, sz1 + 0.2, 'concreteDark'); B.box(sx0 + 1.2, top + 2.4, sz1, sx1 - 1.2, top + 5, sz1 + 0.2, 'concreteDark');
  B.box(sx0, bot - 0.3, sz0, sx1, bot, sz1, 'concrete');
  B.box(sx0, bot, sz1, sx1, top, sz1 + 0.2, 'concreteDark');
  // the cab: a moving floor and a cage that rides with it
  const cab = new THREE.Group(); B.add(cab);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0 - 0.1, 0.2, sz1 - sz0 - 0.1), Mat('grate')); fl.position.set(0, -0.1, 0); cab.add(fl);
  for (const [dx, dz, w, d] of [[-(sx1 - sx0) / 2 + 0.05, 0, 0.08, sz1 - sz0], [(sx1 - sx0) / 2 - 0.05, 0, 0.08, sz1 - sz0], [0, -(sz1 - sz0) / 2 + 0.05, sx1 - sx0, 0.08]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, 2.3, d), Mat('metalYellow')); p.position.set(dx, 1.15, dz); cab.add(p); }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0, 0.1, sz1 - sz0), Mat('metal')); roof.position.y = 2.4; cab.add(roof);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6), toneMapped: false })); bulb.position.y = 2.3; cab.add(bulb);
  const cx = (sx0 + sx1) / 2, cz = (sz0 + sz1) / 2;
  cab.position.set(cx, top, cz);
  const floor = G.phys.aabb(sx0 + 0.05, top - 0.2, sz0 + 0.05, sx1 - 0.05, top, sz1 - 0.05, 'lift');
  const light = B.light(cx, top + 2.2, cz, 0xffe0b0, 2.2, 5, { power: 'lift' });
  const panelP = B.prop(() => prop('elevatorPanel'), sx1 - 0.1, top + 1.2, cz, -Math.PI / 2, { solid: false });
  cab.add(panelP); panelP.position.set((sx1 - sx0) / 2 - 0.1, 1.2, 0);
  // security gate at the top (doors circuit)
  const gate = G.interact.door(B, { id: 'liftgate', x: cx, y: top, z: sz1 + 0.1, axis: 'x', w: 2.6, h: 2.3, kind: 'shutter', mat: 'metal', locked: () => !G.power.doors, lock: 'Security gate: no power', label: 'Raise the gate' });
  let y = top, target = top, moving = false;
  G.lift = { get y() { return y; }, cab, floor };
  const nTop = B.node(cx, top, cz), nBot = G.nav.add(cx, bot, cz, 'tunnels');
  G.interact.add({ id: 'liftgo', pos: () => new THREE.Vector3(sx1 - 0.25, y + 1.2, cz), r: 0.25, zone: B.zone,
    label: () => (moving ? null : !G.power.lift ? 'Elevator: no power' : Math.abs(y - top) < 0.1 ? 'Descend to the tunnels' : 'Go up'),
    use: () => {
      if (moving || !G.power.lift) { if (!G.power.lift) G.emit({ k: 'sfx', n: 'deny' }); return; }
      target = Math.abs(y - top) < 0.1 ? bot : top; moving = true; G.setFlag('liftMoving', true); G.setFlag('door:liftgate', false);
      G.emit({ k: 'sfx', n: 'elevator', a: ['start'] }); G.emit({ k: 'sfx', n: 'setElevatorMove', a: [true] });
      // GUIDE rides along
      if (G.guide.repaired) { G.guide.place(cx - 1, y, cz + 0.4, 0); G.guide.stay(); }
    } });
  // the cab moves on the host; clients get its height from a flag
  G.updaters.push((dt) => {
    if (G.isHost) {
      if (moving) {
        const d = target - y, s = Math.sign(d) * Math.min(Math.abs(d), dt * 1.4);
        y += s;
        if (G.guide.mode === 'stay' && Math.abs(G.guide.pos.x - cx) < 2.5 && Math.abs(G.guide.pos.z - cz) < 2) G.guide.body.pos.y = y;
        if (Math.abs(target - y) < 1e-3) { moving = false; G.setFlag('liftMoving', false); G.emit({ k: 'sfx', n: 'elevator', a: ['stop'] }); G.emit({ k: 'sfx', n: 'setElevatorMove', a: [false] }); setTimeout(() => G.emit({ k: 'sfx', n: 'elevator', a: ['ding'] }), 400); G.guide.follow(); G.setFlag('liftAt', target === bot ? 'bottom' : 'top'); }
        G._liftNet = (G._liftNet || 0) - dt; if (G._liftNet <= 0) { G._liftNet = 0.2; G.flags.liftY = +y.toFixed(2); G._dirty = true; }
      }
    } else if (G.flags.liftY !== undefined) y += (G.flags.liftY - y) * Math.min(1, dt * 8);
    cab.position.y = y; G.phys.move(floor, floor.cx, y - 0.2, floor.cz); light.y = y + 2.2;
  });
}

/* ---------------- story: chapter three ---------------- */
export const steps = [
  { id: 'concourse', cp: true, spawn: [10, YC, -41, Math.PI], obj: 'Find the secondary generator', sub: 'Somewhere below the station',
    enter(G) { G.guide.script([{ t: 'It\'s so quiet. Stations were never quiet.', mood: 'sad' }, { t: 'The map says the generator is past the platforms - east, along the tracks.', gesture: 'point' }]); },
    restore(G) { G.guide.follow(); },
    hint: 'Down to the platforms, then east along the track bed. There should be a service door.',
    done(G) { return G.flags.genFound; },
    exit(G) { G.guide.script([{ t: 'There it is. Generator B.', mood: 'happy' }, { t: 'Oh. The main fuse is burnt out - see the scorch marks?', mood: 'sad' }, { t: 'The station maintenance store will have spares. West end of the platform.', gesture: 'point' }]); } },
  { id: 'fuse', obj: 'Find a replacement fuse', sub: 'The maintenance store, west end of the platform',
    hint: 'A 400 amp fuse. The maintenance store at the west end of the platform.',
    done(G) { return G.flags.fuseIn; },
    enter(G) { if (!G.inv.tools.prod && !G.flags['tool:prod']) G.trigger({ id: 'prodhint', box: [-30, YP - 1, -60, -10, YP + 3, -50], onEnter: () => { if (!G.partyTool('prod')) G.guide.say('We have nothing to defend ourselves with. The security office upstairs might.', { mood: 'scared' }); } }); } },
  { id: 'start', cp: true, spawn: [62, YT, -76, Math.PI], obj: 'Start the generator', sub: 'Pull the primer lever, then press START - within a few seconds',
    hint: (G) => G.net.isOnline ? 'One of you holds the primer on the east wall, the other hits start on the generator.' : 'Pull the primer - I\'ll hold it - then run and hit start.',
    done(G) { return !!G.power.gen; },
    exit(G) { G.guide.script([2, { t: 'It\'s running!', mood: 'happy' }, { t: 'But... the elevator panel is still dead. The generator is feeding the station lights and the ventilation.', mood: 'curious' }, { t: 'That breaker panel - it can only carry two circuits. We need the elevator and the security gate.', gesture: 'point' }, { t: 'Which means turning off the lights in the station.', mood: 'scared' }]); } },
  { id: 'reroute', obj: 'Reroute power to the service elevator', sub: (G) => CIRCUITS.map(c => `${G.flags['brk:' + c.id] ? '[ON] ' : '[off]'} ${c.name}`).join('\n'),
    hint: 'Switch the station lighting and ventilation off at the breaker panel, then the security doors and the elevator on. Two at a time.',
    tick(G) { if (!G.power.gen && G.flags.genEverStarted && !G.story.data.restartHint) { G.story.data.restartHint = true; } },
    done(G) { return !!G.power.lift && !!G.power.doors; },
    exit(G) { G.setFlag('lightsOut', !G.power.station); G.guide.script([{ t: 'There. The gate and the elevator have power.', mood: 'neutral' }, { t: 'And every light in that station just went out.', mood: 'scared' }, 1, { t: 'I\'m sure that\'s fine.', mood: 'scared' }]); } },
  { id: 'descend', obj: 'Take the service elevator down', sub: 'In the generator room, behind the security gate',
    hint: 'Into the elevator cage and press the panel. Down to the maintenance tunnels.',
    done(G) { return G.flags.liftAt === 'bottom'; } },
];

export function populate(G) {
  const mt = G.zones.get('metro'), tz = G.zones.get('metroTop');
  // the crawler nest in the store's ceiling: wakes when you take the fuse
  const nest = [];
  for (let i = 0; i < 4; i++) nest.push(G.enemies.spawn('crawler', -22 + (i % 2) * 1.6 - 0.8, YP, -54.5 + (i >> 1) * 1.4, { id: 'nest' + i, zone: mt, dormant: true }));
  G.onFlag('nestAwake', v => { if (!v || !G.isHost) return; nest.forEach((e, i) => setTimeout(() => { if (e.dead) return; e.state = 'investigate'; e.last = G.player.pos.clone(); G.emit({ k: 'fx', n: 'dustfall', p: e.pos.clone().setY(YP + 3) }); }, 300 + i * 450)); });
  G.enemies.spawn('crawler', 30, YP, -60, { id: 'platCrawl', zone: mt, patrol: [[30, -60], [40, -61], [24, -59]] });
  // a hunter in the track tunnel - it comes when the generator starts making noise
  const h = G.enemies.spawn('hunter', 74, YT, -66, { id: 'tunnelHunter', zone: mt, dormant: true, yaw: -Math.PI / 2 });
  G.onFlag('pw:gen', v => { if (v && G.isHost && !h.dead && h.state === 'dormant') { h.setState('investigate'); h.last = new THREE.Vector3(62, YT, -73); G.emit({ k: 'sfx', n: 'enemy', a: ['hunter', 'alert', h.pos] }); } });
  // the stalker: on the platform, only once the lights are gone
  const s = G.enemies.spawn('stalker', -14, YP, -59.5, { id: 'platStalker', zone: mt, hidden: true });
  G.onFlag('pw:station', v => { if (!G.isHost) return; if (!v && G.flags.genEverStarted && s.hidden && !s.dead) { s.appear(-8, YP, -59.5); s.setState('watch'); } });
}
