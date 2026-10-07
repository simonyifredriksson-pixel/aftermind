/* Street.js - Meridian Avenue and Meridian Plaza.

   The avenue runs east-west (x -90..100) north of Halden Residences. Rain,
   wrecked cars, a transit pod on its side, ads still selling to nobody.
     - west end: an army barricade nobody manned for long
     - x 10, north side: the stairs down to Meridian Station (Metro.js)
     - x 30..80, north: Meridian Plaza - the Civic Relief evacuation centre
       (tents, cots, everyone's belongings sorted into neat rows), Concord
       Gardens (a lit glass dome, still perfectly kept - the one beautiful
       place left), and the Helix Cognitive Systems tower, its entrance
       buried under a fallen sky-bridge
     - x 70, the avenue: a Helix Facilities van with a maintenance map
       inside and an electronic lock
     - east end: a building came down across the road
   A security dog walks the plaza. Two overwatch drones drift high up. */
import * as THREE from '../../../lib/three.module.js';
import { prop } from '../../art/Art.js';
import { subtract, lamp, debris, rubble, puddle, neonSign, screen, streak, glyph, wrap, pane, Mat } from './common.js';

const ROADZ0 = -28, ROADZ1 = -16;
export function build(G) {
  const st = G.addZone('street', { name: 'Meridian Avenue', bounds: [[-95, -1, -34, 105, 60, -12]], outdoor: true, fog: 0x10161d, density: 0.018, hemi: 0.45, space: 'outdoor', horror: 0.12, neighbors: ['alley', 'apt', 'plaza', 'metroTop'], env: 0.7, machinery: 0.45, wind: 0.6 });
  const pl = G.addZone('plaza', { name: 'Meridian Plaza', bounds: [[28, -1, -86, 82, 60, -32]], outdoor: true, fog: 0x10161d, density: 0.02, hemi: 0.45, space: 'outdoor', horror: 0.18, neighbors: ['street', 'garden', 'alley'], env: 0.7, machinery: 0.4, wind: 0.7 });
  const gd = G.addZone('garden', { name: 'Concord Gardens', bounds: [[46, -1, -64, 64, 12, -46, 0.2]], fog: 0x1c2a22, density: 0.012, hemi: 0.9, space: 'hall', horror: 0, music: 'wonder', neighbors: ['plaza', 'street'], env: 0.9, rain: 1, rainIndoor: 0.9, machinery: 0.1, exposure: 1.05 });
  const B = G.builder(st); avenue(G, B); B.finish();
  const P = G.builder(pl); plaza(G, P); P.finish();
  const D = G.builder(gd); garden(G, D); D.finish();
}

/* ---------------- a tower: facade shell with a shopfront band ---------------- */
function tower(B, x0, z0, x1, z1, h, mat, o = {}) {
  B.box(x0, 0, z0, x1, h, z1, mat, { uv: o.uv || 13, faces: o.faces });
  // ground floor band: dark glass shopfronts and an awning line
  if (o.shop !== false) {
    const face = o.face || 's', y = 0;
    const band = (ax0, az0, ax1, az1) => B.box(ax0, y, az0, ax1, 3.4, az1, 'panelDark', { solid: false });
    if (face === 's') band(x0 + 0.2, z1, x1 - 0.2, z1 + 0.06); else if (face === 'n') band(x0 + 0.2, z0 - 0.06, x1 - 0.2, z0);
    else if (face === 'e') band(x1, z0 + 0.2, x1 + 0.06, z1 - 0.2); else band(x0 - 0.06, z0 + 0.2, x0, z1 - 0.2);
    if (face === 's') B.box(x0, 3.4, z1, x1, 3.6, z1 + 1.2, 'metal', { solid: false }); else if (face === 'n') B.box(x0, 3.4, z0 - 1.2, x1, 3.6, z0, 'metal', { solid: false });
  }
}

function avenue(G, B) {
  const I = G.interact;
  // ground: road, kerbs, pavements (with the station stairwell cut out)
  B.box(-95, -0.3, ROADZ0, 105, 0, ROADZ1, 'asphalt', { faces: ['py'] });
  for (const r of subtract([-95, -34, 105, ROADZ0], [[8.4, -34, 11.6, -29.9], [30, -34, 80, ROADZ0]])) B.box(r[0], -0.3, r[1], r[2], 0.15, r[3], 'pavers', { faces: ['py', 'pz'] });
  for (const r of subtract([-95, ROADZ1, 105, -12], [[-42, ROADZ1, -34, -12]])) B.box(r[0], -0.3, r[1], r[2], 0.15, r[3], 'pavers', { faces: ['py', 'nz'] });
  B.box(-42, -0.3, ROADZ1, -34, 0.02, -12, 'asphalt', { faces: ['py'] });
  // lane markings
  for (let x = -90; x < 100; x += 6) B.box(x, 0.005, -22.08, x + 3, 0.012, -21.92, Mat('paper'), { solid: false, faces: ['py'] });
  // south side: buildings either side of the apartment
  tower(B, -95, -12, -42, 6, 26, 'facadeC', { face: 'n' });
  tower(B, -6, -12, 22, 8, 34, 'facadeA', { face: 'n' });
  tower(B, 22, -12, 58, 6, 48, 'facadeB', { face: 'n' });
  tower(B, 58, -12, 105, 6, 30, 'facadeDead', { face: 'n' });
  // north side: buildings, with the station stair passing under the first
  tower(B, -95, -60, -40, -34, 40, 'facadeA', { face: 's' });
  tower(B, -40, -60, 8.4, -34, 22, 'facadeC', { face: 's' });
  B.box(8.4, 2.8, -48, 11.6, 22, -34, 'facadeC', { uv: 24 });                       // over the stairwell
  tower(B, 11.6, -60, 30, -34, 22, 'facadeC', { face: 's' });
  tower(B, 80, -60, 105, -34, 56, 'facadeB', { face: 's' });
  // the far ends: a barricade (west) and a building fallen across the road (east)
  rubble(B, 92, 0, -34, 105, 9, -12, 4); rubble(B, 86, 0, -30, 93, 4, -17, 9);
  B.box(-95, 0, -34, -93, 4, -12, 'concreteDark');
  for (let z = -31; z < -13; z += 2.6) B.prop(() => prop('jerseyBarrier', { text: 'CIVIC DEFENCE' }), -86, 0.0, z, Math.PI / 2);
  B.prop(() => prop('sandbags'), -84, 0, -25, Math.PI / 2); B.prop(() => prop('sandbags'), -84, 0, -19, Math.PI / 2);
  B.prop(() => prop('policeBarrier'), -80, 0, -22, Math.PI / 2);
  B.prop(() => prop('transitPod', { wrecked: true }), -72, 0, -23, 0.35);
  B.prop(() => prop('emergencyLightBar'), -82, 0, -29, 0.6);
  B.box(-90, 0, -34, -86.5, 3.6, -12, 'concreteDark');                                 // nobody gets past the barricade
  // the car that came through the Halden lobby's front
  B.prop(() => prop('car', { color: 0x8a1f1f, wrecked: true, seed: 2 }), -15.5, 0.12, -14.2, 0.15);
  // cars, abandoned in lanes as they stopped
  const cars = [[-60, -25, 0.05, 0x2a3a4a], [-48, -19, 3.2, 0xb8b8b4], [-24, -24.5, 0.1, 0x1a1a1c], [-2, -19.5, 3.0, 0x6a7a80, true], [18, -25, -0.2, 0x3a5a3a], [38, -20, 3.3, 0xcfcfc9], [52, -25.5, 0.4, 0x5a2030, true], [84, -21, 2.6, 0x20262c, true]];
  cars.forEach(([x, z, r, c, w], i) => B.prop(() => prop('car', { color: c, wrecked: !!w, seed: i }), x, 0, z, r));
  B.prop(() => prop('van', { color: 0xdfe3e6, logo: 'Lumen Parcel' }), -36, 0, -25, 0.02);
  B.prop(() => prop('scooter'), -8, 0.15, -14.6, 1.2);
  // street furniture
  for (let x = -80; x <= 90; x += 18) { const broken = (x / 18 | 0) % 3 === 0; B.prop(() => prop('streetLight', { broken }), x, 0.15, -15.4, Math.PI); B.prop(() => prop('streetLight', { broken: !broken && x % 4 === 0 }), x + 9, 0.15, -28.6, 0); if (!broken) B.cone(x, 7.6, -16.6, 0.2, 3.2, 7.6, 0xffc890, 0.06); }
  B.prop(() => prop('trafficLight'), 9.5, 0.15, -15.6, Math.PI); B.prop(() => prop('trafficLight'), 29, 0.15, -28.4, 0);
  B.prop(() => prop('vendingMachine', { lit: true }), 3, 0.15, -12.6, Math.PI); B.prop(() => prop('vendingMachine', { broken: true }), 4.3, 0.15, -12.6, Math.PI);
  B.prop(() => prop('bench'), -26, 0.15, -30.5, 0); B.prop(() => prop('bench'), 60, 0.15, -13.3, Math.PI);
  B.prop(() => prop('fireHydrant'), -44, 0.15, -15, 0); B.prop(() => prop('manhole'), 24, 0.0, -22, 0, { solid: false });
  B.prop(() => prop('newsKiosk'), -12, 0.15, -30.6, 0); B.prop(() => prop('phoneBooth'), 26.5, 0.15, -13.3, Math.PI);
  B.prop(() => prop('chargingStation'), -56, 0.15, -15.3, Math.PI); B.prop(() => prop('chargingStation'), -52, 0.15, -15.3, Math.PI);
  B.prop(() => prop('planter', { dead: true }), -20, 0.15, -30.8, 0); B.prop(() => prop('planter', { dead: true }), 20, 0.15, -30.8, 0); B.prop(() => prop('planter', { dead: true }), 46, 0.15, -13.2, 0);
  B.prop(() => prop('bollard'), 30, 0.15, -29, 0); B.prop(() => prop('bollard'), 34, 0.15, -29, 0); B.prop(() => prop('bollard'), 76, 0.15, -29, 0); B.prop(() => prop('bollard'), 80, 0.15, -29, 0);
  B.prop(() => prop('cone'), -40, 0, -20, 0); B.prop(() => prop('cone'), -38.5, 0, -21, 0.5);
  B.prop(() => prop('trashBags', { n: 4, seed: 21 }), 14, 0.15, -13, 0); B.prop(() => prop('dumpster'), 64, 0.15, -13.1, Math.PI);
  B.prop(() => prop('robotCorpse', { kind: 'security', seed: 1 }), -30, 0, -21, 1.1); B.prop(() => prop('robotCorpse', { kind: 'household', seed: 7 }), 6, 0, -26, 2.2);
  B.prop(() => prop('deliveryDrone', { crashed: true }), 42, 0.15, -30.2, 0.8);
  for (const [x, z, s] of [[-50, -14.5, 1], [-18, -29.5, 2], [12, -21, 3], [44, -14.4, 4], [70, -29.5, 5]]) B.prop(() => prop('litter', { seed: s }), x, 0.15, z, s, { solid: false });
  // puddles and neon
  puddle(B, -28, 0, -22, 2.4, 1.2, 0xff3c8a); puddle(B, 6, 0, -18, 1.8, 1, 0x40d8ff); puddle(B, 40, 0, -25, 2.6, 1.4); puddle(B, 66, 0, -17.5, 1.6, 0.9, 0xffa040);
  holo(B, -52, 4.5, -33.8, 0, 4, 6, 200, 'LUMEN\nSLEEP+'); holo(B, 18, 5.5, -11.8, Math.PI, 3.2, 5, 320, 'HALCYON\nTRANSIT\nGO ANYWHERE');
  neonSign(B, -70, 4.2, -11.8, Math.PI, 'BAR KAITO', 0xff3c8a, 0.8, { flicker: 0.1, streak: 9 });
  neonSign(B, 40, 4.3, -11.8, Math.PI, 'CIVIC PHARMACY', 0x40ffb0, 0.7, { flicker: 0.05, streak: 8 });
  neonSign(B, -20, 4.2, -33.8, 0, 'NOODLES 24', 0xffb040, 0.7, { streak: 7 });
  // the Conductor's glyph on the big screens: the first time you see it
  billboard(B, -5, 16, -33.9, 0, 12, 6.8);
  billboard(B, 60, 22, -11.9, Math.PI, 10, 5.6);
  G.story.subject('glyph', [-5, 16, -33.5], 4, ['That symbol. It\'s on every screen in the city.', 'It isn\'t a company logo. It isn\'t in any registry I remember.', 'It\'s a signature. Something is signing its work.'], { label: 'SYMBOL' });
  // the broadcast speaker that sends you to the Plaza
  B.prop(() => prop('broadcastSpeaker'), -32, 0.15, -15, Math.PI);
  B.prop(() => prop('broadcastSpeaker'), 30, 0.15, -29.2, 0);
  // the Helix Facilities van - locked, map inside
  B.prop(() => prop('van', { color: 0xe8ebec, logo: 'HELIX FACILITIES' }), 70, 0, -19.6, Math.PI - 0.08);
  I.add({ id: 'van', pos: new THREE.Vector3(70, 1.2, -16.6), r: 0.6, zone: B.zone, label: () => (G.flags.vanOpen ? null : G.partyHas('bypass') || G.has('bypass') ? 'Use the lock bypass' : 'Open the van'),
    use: (pid) => {
      if (G.flags.vanOpen) return;
      if (G.has('bypass') || G.partyHas('bypass')) { G.setFlag('vanOpen', true); G.emit({ k: 'sfx', n: 'keypad', a: [true] }); G.emit({ k: 'sfx', n: 'door', a: ['slide', { x: 70, y: 1, z: -17 }] }); G.guide.say('Got it. The lock thinks we\'re a Helix technician. Which is flattering.', { mood: 'happy' }); return; }
      G.emit({ k: 'sfx', n: 'door', a: ['locked', { x: 70, y: 1, z: -17 }] });
      G.setFlag('vanTried', true);
      if (!G.flags.vanTalk) { G.setFlag('vanTalk', true); G.guide.script([{ t: 'Electronic lock. Helix used rolling light codes - the lock flashes, the key flashes back.', mood: 'curious' }, { t: 'Wait. Light codes... the drone! Scout eyes read light patterns. I remember now how they work.', mood: 'happy' }, { t: 'Bring me an optical sensor, a circuit board and two lengths of wire, and I can build a bypass.', gesture: 'point' }]); }
    } });
  I.pickup(B, { id: 'map', key: 'map', x: 70.4, y: 0.75, z: -17.4, label: 'Take the maintenance map', when: () => G.flags.vanOpen });
  // parts for the bypass: a shot-down drone, a dead courier bot, a newsstand
  I.pickup(B, { id: 'sensor_st', item: 'sensor', x: 42.4, y: 0.35, z: -30.3, label: () => 'Pull the ' + G.itemName({ item: 'sensor' }) + ' from the drone' });
  I.pickup(B, { id: 'circ_st', item: 'circuit', x: 6.4, y: 0.3, z: -25.6 });
  I.pickup(B, { id: 'wire_st', item: 'wire', x: -12, y: 1.0, z: -30.2, label: 'Take a coil of wire from the kiosk' });
  I.pickup(B, { id: 'bat_st', item: 'battery', x: -36.8, y: 0.5, z: -24.6, label: 'Take a battery from the van' });
  I.pickup(B, { id: 'wire_st2', item: 'wire', x: -71, y: 0.3, z: -21 });
  I.note(B, { id: 'army', x: -83.5, y: 0.9, z: -22.5, title: 'Orders, taped to a barrier', text: 'CIVIC DEFENCE - EASTERN CORDON\n\nHold Meridian until Concord transport arrives. Do NOT engage service units. Do NOT fire on civic machines - they are under Concord command and will escort civilians.\n\nIf a unit approaches you, comply.\n\n(scrawled across the bottom in marker)\nTHEY ARE NOT ESCORTING ANYONE', model: () => prop('note', { text: 'ORDERS' }) });
  // nav: lanes and pavements
  B.nodeLine(-84, 0, -22, 90, -22, 6); B.nodeLine(-84, 0.15, -14.5, 90, -14.5, 6); B.nodeLine(-84, 0.15, -30.4, 90, -30.4, 6);
  for (let x = -80; x <= 86; x += 12) { B.node(x, 0, -18); B.node(x, 0, -26); }
  // street lights in the pool (props carry their own entries; extra fill on the wet road)
  B.light(-27, 6, -22, 0x405870, 2, 22); B.light(47, 6, -22, 0x405870, 2, 22);
  G.atmos.roof(8.4, -48, 11.6, -32.5, 2.6);
}
function holo(B, x, y, z, rot, w, h, hue, text) { B.prop(() => prop('holoAd', { w, h, hue, text }), x, y - h / 2, z, rot, { solid: false }); }
function billboard(B, x, y, z, rot, w, h) {
  const m = screen(B, x, y, z + (rot ? -0.05 : 0.05), rot, w, h, (g, cw, ch, t) => {
    const phase = t % 14;
    g.fillStyle = '#030404'; g.fillRect(0, 0, cw, ch);
    if (phase < 9) { // an ad, still running
      const gr = g.createLinearGradient(0, 0, cw, ch); gr.addColorStop(0, '#0a2a44'); gr.addColorStop(1, '#3a0a3a'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#ffffff'; g.font = `700 ${ch * 0.2}px "Rajdhani", sans-serif`; g.textAlign = 'left'; g.fillText('CONCORD', cw * 0.06, ch * 0.4);
      g.font = `500 ${ch * 0.09}px "Rajdhani", sans-serif`; g.fillStyle = '#9fd8ff'; g.fillText('Your city. Always on. Always caring.', cw * 0.06, ch * 0.56);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(cw * 0.8, ch * 0.5, ch * 0.32, 0, 7); g.fill();
    } else { // and then the glyph
      const k = Math.sin(t * 40) > 0.6 ? 0.6 : 1; g.globalAlpha = k; glyph(g, cw / 2, ch / 2, ch * 0.33); g.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,40,30,${Math.random() * 0.25})`; g.fillRect(0, Math.random() * ch, cw, Math.random() * 6); }
    }
  }, { glow: 1.5, light: 0x6080ff, intensity: 4, dist: 18, every: 0.12 });
  return m;
}

/* ---------------- the plaza ---------------- */
function plaza(G, B) {
  const I = G.interact;
  B.box(30, -0.3, -86, 80, 0.15, ROADZ0, 'pavers', { faces: ['py'] });
  // west and east edges: buildings
  tower(B, 22, -86, 30, -34, 30, 'facadeA', { face: 'e' }); tower(B, 80, -86, 88, -60, 40, 'facadeC', { face: 'w' });
  // the Helix tower at the north end
  B.box(36, 0, -100, 78, 90, -84, 'facadeB', { uv: 22 });
  B.box(46, 0, -84.2, 68, 7.5, -83.9, 'glassDirty', { solid: false });
  B.box(44, 7.5, -85, 70, 8.2, -82, 'steel');
  B.sign(57, 9.5, -83.85, 0, 14, 1.6, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e8f4ff'; g.font = `600 ${h * 0.55}px "Rajdhani", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HELIX  COGNITIVE  SYSTEMS', w / 2, h / 2); }, { transparent: true, glow: 1.6, res: 96 });
  B.light(57, 9, -82.5, 0xbfe0ff, 3, 10);
  // the fallen sky-bridge buries the entrance
  B.prop(() => prop('skyBridge', { length: 26 }), 57, 0.6, -80, 0.32);
  rubble(B, 44, 0, -84, 70, 5.5, -76, 13);
  debris(B, 57, 0.15, -73, 8, 30, 14);
  G.story.subject('helixGate', [57, 4, -80], 6, ['The Helix tower. The sky-bridge from the Concord building came down right across the doors.', 'Not an accident. The bridge\'s anchor bolts were cut. Neatly.', 'Something wanted this door closed.'], { label: 'COLLAPSE' });
  // Civic Relief: the evacuation centre
  const tents = [[36, -48, 0.1], [36, -60, -0.05], [72, -48, Math.PI], [72, -60, Math.PI + 0.1], [42, -72, 0.4], [70, -72, -0.3]];
  tents.forEach(([x, z, r]) => B.prop(() => prop('evacTent'), x, 0.15, z, r));
  for (let i = 0; i < 8; i++) B.prop(() => prop('cot'), 33 + (i % 2) * 2.2, 0.15, -43 - (i >> 1) * 2.4, 0);
  B.prop(() => prop('supplyCrate', { open: true }), 46, 0.15, -40, 0.3); B.prop(() => prop('supplyCrate'), 47.6, 0.15, -40.6, 0.1); B.prop(() => prop('supplyCrate'), 64, 0.15, -40, -0.2);
  B.prop(() => prop('policeBarrier'), 40, 0.15, -36, 0); B.prop(() => prop('policeBarrier'), 70, 0.15, -36, 0);
  // everyone's belongings, lined up in neat rows by something that likes order
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) {
    const x = 47 + c * 1.6, z = -66 - r * 1.5, k = (r * 9 + c) % 4;
    B.prop(() => k === 0 ? prop('suitcase', { open: false }) : k === 1 ? prop('cardboardBoxes', { seed: r * 9 + c }) : k === 2 ? prop('suitcase', { open: true }) : prop('toyRobot'), x, 0.15, z, 0, { solid: k < 2, scale: k === 1 ? 0.6 : 1 });
  }
  G.story.subject('belongings', [53, 0.6, -68], 3, ['Suitcases. Bags. Toys. In rows.', 'Sorted by size. Then by colour.', 'People do not leave their things like this. Machines tidy up like this.'], { label: 'BELONGINGS' });
  B.prop(() => prop('emergencyLightBar'), 38, 0.15, -54, 0.8); B.prop(() => prop('emergencyLightBar'), 74, 0.15, -54, -2.2);
  B.prop(() => prop('broadcastSpeaker'), 55, 0.15, -38, 0);
  // the registration terminal
  B.prop(() => prop('console', { w: 1.6 }), 56, 0.15, -42.5, Math.PI);
  screen(B, 56, 1.4, -42.75, Math.PI, 1.2, 0.7, (g, w, h, t) => { g.fillStyle = '#021a10'; g.fillRect(0, 0, w, h); g.fillStyle = '#6dffb0'; g.font = `${h * 0.12}px "Share Tech Mono", monospace`; g.fillText('CIVIC RELIEF', w * 0.06, h * 0.2); g.fillText('REGISTRATION', w * 0.06, h * 0.36); if (t % 1 < 0.5) g.fillRect(w * 0.06, h * 0.5, w * 0.06, h * 0.1); }, { glow: 1.4, light: 0x40ff90, intensity: 1.2, dist: 4, every: 0.5 });
  I.note(B, { id: 'evac_terminal', kind: 'terminal', x: 56, y: 1.2, z: -42.4, dy: 0, r: 0.6, title: 'CIVIC RELIEF - REGISTRATION', text: 'REGISTERED EVACUEES: 4,118\nREMAINING ON SITE: 0\n\n[DAY 2 02:40] Concord transport assigned: HELIX SHELTER, LEVEL B4.\n[DAY 2 02:41] Evacuees will proceed in an orderly fashion.\n[DAY 2 02:41] Personal belongings are not required.\n[DAY 2 05:12] Transfer complete.\n[DAY 2 05:12] Thank you for your cooperation.\n\nOPERATOR NOTE (typed fast):\nnobody came back from the shelter to collect the second group. the machines did. they were very polite. i\'m staying', label: 'Read the registration terminal' });
  I.pickup(B, { id: 'med_pl', tool: 'medkit', icon: 'medkit', x: 46.2, y: 0.95, z: -40, label: 'Take the med foam' });
  I.pickup(B, { id: 'bat_pl', item: 'battery', x: 36.2, y: 0.6, z: -45.4 });
  I.pickup(B, { id: 'bat_pl2', item: 'battery', x: 71, y: 0.3, z: -71.5 });
  I.note(B, { id: 'tent_letter', x: 72.3, y: 0.62, z: -47.6, title: 'A letter on a cot', text: 'Danny -\n\nIf you get this, they\'re taking us to Helix. The machines say there\'s food and power down there. They took Grandad first because he was slow. They were gentle about it, which is somehow worse.\n\nThe robots don\'t answer questions any more. They just say "please remain calm".\n\nWe love you. Find us.\n- Mum', model: () => prop('note', { text: 'Danny -' }) });
  // nav
  for (let x = 34; x <= 76; x += 6) for (let z = -38; z >= -78; z -= 8) B.node(x, 0.15, z);
  // the plaza's lights: emergency floods on tripods
  B.light(38.5, 3, -54, 0xfff4e0, 6, 18, { flicker: 0.05 }); B.light(73.5, 3, -54, 0xfff4e0, 5, 18, { flicker: 0.2 });
}

/* ---------------- Concord Gardens: the one beautiful place ---------------- */
function garden(G, B) {
  const cx = 55, cz = -55, R = 9;
  B.box(cx - R, 0.15, cz - R, cx + R, 0.25, cz + R, 'tilesGreen', { faces: ['py'] });
  // dome: a ring of glass ribs (visual) and a cylinder of colliders
  const g = new THREE.Group(); g.position.set(cx, 0.25, cz);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xa8d8c8, roughness: 0.05, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 }));
  g.add(glass);
  for (let i = 0; i < 16; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 6, 40, Math.PI), Mat('steel')); rib.rotation.y = i * Math.PI / 16; g.add(rib); }
  for (let k = 1; k < 4; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(R * Math.cos(k * 0.38), 0.05, 6, 64), Mat('steel')); ring.rotation.x = Math.PI / 2; ring.position.y = R * Math.sin(k * 0.38); g.add(ring); }
  B.add(g);
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.12) continue; B.phys.box(cx + Math.cos(a) * R, cz + Math.sin(a) * R, 0.2, 1, -a + Math.PI / 2, 0, 3); }
  B.wall(cx - 1.2, cz + R, cx + 1.2, cz + R, 0.25, 0.01, 'steel', { t: 0.1 }); // threshold
  G.atmos.roof(cx - R + 1, cz - R + 1, cx + R - 1, cz + R - 1, R + 0.4);
  // beds of plants under warm grow lights - perfectly kept
  const leaf = [0x2f6a3a, 0x3f8a3a, 0x5a9a3a, 0x2a5a4a, 0x6aa04a];
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.2, rr = 5.6, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    B.prop(() => prop('planter', { dead: false }), x, 0.25, z, -a);
    for (let k = 0; k < 5; k++) {
      const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + r() * 0.4, 1), new THREE.MeshStandardMaterial({ color: leaf[(i + k) % 5], roughness: 0.7 }));
      pl.position.set(x + (r() - 0.5) * 1.4, 0.9 + r() * 0.6, z + (r() - 0.5) * 1.4); pl.scale.y = 1.3; pl.castShadow = true; B.add(pl);
    }
  }
  // a tree in the middle
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 4, 10), Mat('wood')); trunk.position.set(cx, 2.25, cz); B.add(trunk); B.phys.box(cx, cz, 0.35, 0.35, 0, 0, 4);
  for (let k = 0; k < 14; k++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.7, 1), new THREE.MeshStandardMaterial({ color: leaf[k % 5], roughness: 0.75 })); c.position.set(cx + (r() - 0.5) * 3, 4 + r() * 2, cz + (r() - 0.5) * 3); c.castShadow = true; B.add(c); }
  // blossoms that glow faintly
  for (let k = 0; k < 40; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.2, 1.8), toneMapped: false })); b.position.set(cx + (r() - 0.5) * 12, 0.8 + r() * 5, cz + (r() - 0.5) * 12); B.add(b); }
  // the gardener: an arm on a rail, still watering, still pruning
  const arm = B.prop(() => prop('robotArm'), cx + 3, 0.25, cz - 2, 0.6);
  arm.userData.setActive?.(true);
  G.story.subject('gardener', [cx + 3, 1.5, cz - 2], 1.5, ['The gardener. It never stopped.', 'Everything else in the city is broken, and this place is perfect.', 'I don\'t know if that\'s beautiful or horrible. Maybe both.'], { label: 'GARDENER' });
  B.light(cx, 6, cz, 0xffd6a0, 8, 16); B.light(cx - 4, 3, cz + 3, 0xff9ad8, 3, 9); B.light(cx + 4, 3, cz - 3, 0xa0ffd0, 3, 9);
  G.interact.pickup(B, { id: 'bat_gd', item: 'battery', x: cx - 2, y: 0.3, z: cz + 6 });
  G.interact.pickup(B, { id: 'cool_gd', item: 'coolant', x: cx + 6.5, y: 0.3, z: cz + 1 });
  for (let a = 0; a < 6; a++) B.node(cx + Math.cos(a) * 3.5, 0.25, cz + Math.sin(a) * 3.5);
  B.node(cx, 0.25, cz + R + 1.5);
  G.trigger({ id: 'gardenIn', box: [cx - R, -1, cz - R, cx + R, 6, cz + R - 1], onEnter: () => { if (G.flags.sawGarden) return; G.setFlag('sawGarden', true); G.guide.script([{ t: 'Oh.', mood: 'happy' }, { t: 'It\'s still here. The gardens. I used to bring - I used to come here.', mood: 'happy' }, { t: 'Can we stay a minute? Nothing in here wants to hurt us.', mood: 'happy' }]); } });
}

/* ---------------- story: chapter two ---------------- */
export const steps = [
  { id: 'avenue', cp: true, spawn: [-38, 0, -14, Math.PI * 1.25], obj: 'Go to the evacuation centre at Meridian Plaza', sub: 'East along the avenue',
    enter(G, resume) { if (resume) { G.guide.follow(); return; } setTimeout(() => { G.emit({ k: 'sfx', n: 'radioStatic', a: [{ x: -32, y: 3, z: -15 }, 1.5] }); G.guide.script([{ t: '...all residents of Meridian district proceed to the Civic Relief centre, Meridian Plaza. Transport is provided. Remain calm...', who: 'BROADCAST' }, { t: 'An evacuation centre! There might be people there.', mood: 'happy' }, { t: 'The Plaza is east, past the station. Stay off the middle of the road.', gesture: 'point' }]); }, 2500); },
    restore(G) { G.guide.follow(); },
    hint: 'East along the avenue to Meridian Plaza. The broadcast said there\'s an evacuation centre.',
    done(G) { return G.allPlayers().some(p => p.pos.x > 30 && p.pos.z < -32); } },
  { id: 'evac', obj: 'Search the evacuation centre', sub: 'Find out where everyone went',
    enter(G) { G.guide.script([{ t: 'Where is everyone?', mood: 'scared' }, 1.5, { t: 'Their things are still here.', mood: 'sad' }]); G.trigger({ id: 'dogwarn', box: [30, -1, -86, 80, 8, -60], onEnter: () => { if (!G.flags.dogWarn) { G.setFlag('dogWarn', true); G.guide.say('Something with four legs is walking the plaza. Walk - don\'t run. Crouch if it comes close.', { mood: 'scared' }); } } }); },
    hint: 'Look for the registration terminal - it\'ll say where they took everyone.',
    done(G) { return G.flags['read:evac_terminal']; },
    onRead(G, o) { if (o.id === 'evac_terminal') G.setFlag('read:evac_terminal', true); },
    exit(G) { G.guide.script([{ t: 'Helix Shelter. Level B4.', mood: 'curious' }, { t: 'Helix...', mood: 'curious' }, 1, { t: 'I know that name. I don\'t know why I know that name.', mood: 'scared' }]).then(() => G.guide.remember('helix')); } },
  { id: 'gate', cp: true, spawn: [55, 0.15, -40, Math.PI], obj: 'Get into the Helix building', sub: 'The tower at the north end of the plaza',
    hint: 'The Helix tower is at the north end of the plaza.',
    done(G) { return G.allPlayers().some(p => p.pos.z < -70 && p.pos.x > 40 && p.pos.x < 74); },
    exit(G) { G.guide.script([{ t: 'The sky-bridge came down across the doors. We\'re not getting through that.', mood: 'sad' }, { t: 'Wait.', mood: 'curious', face: 'scan' }, { t: 'I can hear something. Underground. A hum - fifty hertz, steady. The facility\'s backup power is still running.', mood: 'curious' }, { t: 'There\'ll be a service way in. Helix Facilities vans carry maintenance maps - I saw one on the avenue.', gesture: 'point' }]); } },
  { id: 'van', obj: 'Find a Helix maintenance map',
    sub(G) { if (!G.flags.vanTalk) return 'The Helix Facilities van on the avenue'; const c = k => G.count(k); return `Build a lock bypass with GUIDE\n${c('sensor') >= 1 ? '[x]' : '[ ]'} Optical sensor (drone wreck)\n${c('circuit') >= 1 ? '[x]' : '[ ]'} Circuit board\n${c('wire') >= 2 ? '[x]' : '[ ]'} Wire x2 (${c('wire')})`; },
    hint(G) { if (!G.flags.vanTalk) return 'The white van on the avenue, by the plaza. Helix Facilities.'; if (!G.has('bypass')) return 'An optical sensor - there\'s a crashed drone by the plaza - plus a circuit board and two wires. Then open my build menu.'; return 'Use the bypass on the van.'; },
    onCraft(G, r) { if (r.id === 'bypass') G.guide.say('There. Hold it to the lock and it\'ll do the rest.', { mood: 'happy' }); },
    done(G) { return G.partyHas('map'); },
    exit(G) { G.guide.script([{ t: 'Let me see that map.', face: 'scan' }, { t: 'Here. The main entrance has its own power, but the service elevator runs off a secondary generator.', mood: 'curious' }, { t: 'Under Meridian Station. The subway. If we start that generator, the elevator takes us down to the maintenance tunnels - and they run all the way to Helix.', gesture: 'point' }, { t: 'The station entrance is on the avenue. North side.', gesture: 'point' }]); } },
  { id: 'station', obj: 'Get down into Meridian Station', sub: 'Stairs on the north side of the avenue',
    hint: 'The Metro stairs, north side of the avenue. Then find the secondary generator below the station.',
    done(G) { return G.allPlayers().some(p => p.pos.y < -3 && p.pos.z < -36); } },
];

export function populate(G) {
  const pz = G.zones.get('plaza'), sz = G.zones.get('street');
  G.enemies.spawn('dog', 60, 0.15, -76, { id: 'plazaDog', zone: pz, patrol: [[62, -76], [74, -64], [66, -44], [44, -44], [38, -64], [50, -77]] });
  G.enemies.spawn('scout', -10, 10, -22, { id: 'avScout1', zone: sz, patrol: [[-40, -22], [20, -24], [60, -20], [20, -18]] });
  G.enemies.spawn('scout', 55, 14, -60, { id: 'plScout', zone: pz, patrol: [[40, -50], [70, -50], [70, -70], [40, -70]] });
  // a deactivated hunter slumped against the barricade - something to photograph, safely
  const h = G.enemies.spawn('hunter', -78, 0, -15, { id: 'barricadeHunter', zone: sz, dormant: true, yaw: -Math.PI / 2 });
  h.dead = true; h.hp = 0; h.anim = 'dead'; h.animT = 5; h.m.setEyes?.(0, 0); h.o.noLoot = true;
}
