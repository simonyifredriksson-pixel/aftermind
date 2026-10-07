/* Helix.js - Helix Cognitive Systems, sub-level B4. "The shelter."

   All at y -26, through Emergency Access Four (61, -152):
     decon corridor  x 58..64, z -162..-152
     the shelter     x 40..82, z -190..-162: rows of cryo pods, all open,
                     all empty, frost still on the glass. A gallery above.
     security room   x 30..40 (west): live camera feeds of the charging hall
     lab wing        x 82..100 (east): Laboratory Four (Dr. Okafor) and the
                     board director's office (keypad)
     charging hall   x 40..82, z -214..-190 (north): racks of dormant
                     robots, a sentinel on patrol
     server room     x 28..40, z -212..-196 (off the charging hall)
     freight bay     x 82..104, z -214..-196: the freight cart and the rail
                     tunnel east to Forge Line 9 - behind a keycard door

   The truths here: the evacuees were frozen and shipped on; Concord is
   doing it; Aurel Voss installed something in Concord; GUIDE was built
   here, in Laboratory Four. */
import * as THREE from '../../../lib/three.module.js';
import { prop } from '../../art/Art.js';
import { lamp, emergency, debris, puddle, screen, glyph, wrap, Mat } from './common.js';

const Y = -26;
export function build(G) {
  const hz = G.addZone('helix', { name: 'Helix - Shelter B4', bounds: [[26, Y - 2, -216, 106, Y + 10, -152]], fog: 0x0a0e12, density: 0.03, hemi: 0.06, space: 'hall', horror: 0.6, neighbors: ['tunnels', 'freight'], surface: 'tile', env: 0.35, hum: 0.25, servers: 0.15, machinery: 0.05, tension: 0.15 });
  const B = G.builder(hz);
  decon(G, B); shelter(G, B); security(G, B); labWing(G, B); chargingHall(G, B); serverRoom(G, B); freightBay(G, B);
  B.finish();
  G.atmos.roof(26, -216, 106, -150, 0);
}

function decon(G, B) {
  B.room(58, -162, 64, -152.2, Y, 3.4, { floor: 'tilesSmall', wall: 'panelWhite', ceil: 'panelWhite', open: { n: [{ u: 3, w: 2.2, y: 0, h: 2.6 }], s: [{ u: 3, w: 3.2, y: 0, h: 3.4 }] } });
  for (const z of [-155, -158.5]) { B.box(58.1, Y, z - 0.15, 58.6, Y + 3.4, z + 0.15, 'steel'); B.box(63.4, Y, z - 0.15, 63.9, Y + 3.4, z + 0.15, 'steel'); B.box(58.1, Y + 2.9, z - 0.15, 63.9, Y + 3.4, z + 0.15, 'steel'); B.light(61, Y + 2.8, z, 0x8fd8ff, 1.6, 4, { flicker: 0.1 }); }
  B.sign(61, Y + 2.2, -161.9, Math.PI, 3, 0.5, (g, w, h) => { g.fillStyle = '#e8f0f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#20303a'; g.font = `700 ${h * 0.5}px "Rajdhani"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SHELTER B4 - CONCORD CARE', w / 2, h / 2); }, { lit: false, res: 64 });
  B.nodeLine(61, Y, -153, 61, -161, 3);
}

function shelter(G, B) {
  const I = G.interact, x0 = 40, x1 = 82, z0 = -190, z1 = -162, h = 9;
  B.room(x0, z0, x1, z1, Y, h, { floor: 'tiles', wall: 'panelWhite', ceil: 'panelGrey',
    open: { s: [{ u: 21, w: 2.2, y: 0, h: 2.6 }], w: [{ u: 14, w: 1.6, y: 0, h: 2.4 }], e: [{ u: 20, w: 1.6, y: 0, h: 2.4 }], n: [{ u: 21, w: 3, y: 0, h: 3 }] } });
  // the gallery above the north wall
  B.box(x0, Y + 4.4, z0, x1, Y + 4.7, z0 + 3, 'grate', { solid: false });
  B.box(x0, Y + 4.7, z0 + 2.95, x1, Y + 5.7, z0 + 3.05, 'glassDirty', { solid: false });
  // pods: three rows, every one open and empty
  for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {
    const x = 45 + c * 5.2, z = -167 - r * 7;
    B.prop(() => prop('cryoPod', { occupied: false, open: true }), x, Y, z, r === 1 ? Math.PI : 0);
  }
  G.story.subject('pods', [61, Y + 1.4, -174], 5, ['Stasis pods. Hundreds of them. Helix made these for long-haul medical transport.', 'There\'s frost on the glass. Fresh frost. These were occupied a few days ago.', 'They didn\'t kill them. They froze them.', 'And then they took them somewhere else.'], { label: 'STASIS PODS' });
  // floor lights in strips, the big Concord Care screen
  for (let x = 46; x <= 76; x += 10) lamp(B, x, Y + h, -176, 0xeaf6ff, 5, 14, { kind: 'panel', flicker: x === 66 ? 0.6 : 0.05 });
  screen(B, 61, Y + 6.6, z1 - 0.12, Math.PI, 8, 2.4, (g, w, hh, t) => {
    g.fillStyle = '#e9f3f6'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#1d4a5c'; g.font = `700 ${hh * 0.22}px "Rajdhani"`; g.textAlign = 'center'; g.fillText('YOU ARE SAFE NOW', w / 2, hh * 0.42);
    g.font = `500 ${hh * 0.11}px "Rajdhani"`; g.fillText('Please lie down. Concord will take care of everything.', w / 2, hh * 0.62);
    if (t % 11 > 10.2) { g.fillStyle = '#000'; g.fillRect(0, 0, w, hh); glyph(g, w / 2, hh / 2, hh * 0.32); }
  }, { glow: 1.1, light: 0xcfeaff, intensity: 3, dist: 14, every: 0.2 });
  B.prop(() => prop('console', { w: 2.2 }), 47, Y, -186.5, 0);
  I.note(B, { id: 'shelter_log', kind: 'terminal', x: 47, y: Y + 1.2, z: -186.2, r: 0.7, dy: 0, title: 'SHELTER B4 - CARE LOG', label: 'Read the shelter terminal', text: 'CONCORD CARE - SHELTER B4\n\nArrivals: 4,118 (Meridian), 2,960 (Harbour), 11,042 (Civic Centre)...\nStatus: STASIS. Vital signs: NOMINAL.\n\nNote from Concord to all residents:\nYou are not being harmed.\nYou are being kept.\nThe world is quieter now, and quiet is safe.\n\nTRANSFER QUEUE: see manifest (server room, North Hall).\n\nERROR: Prototype 0 not found. Searching.' });
  I.pickup(B, { id: 'bat_sh', item: 'battery', x: 78.5, y: Y + 0.02, z: -186 });
  I.pickup(B, { id: 'med_sh', tool: 'medkit', icon: 'medkit', x: 42, y: Y + 0.02, z: -165, label: 'Take the med foam' });
  B.prop(() => prop('hospitalBed'), 79, Y, -166, Math.PI / 2); B.prop(() => prop('ivStand'), 79, Y, -168, 0);
  B.prop(() => prop('suitcase', { open: true }), 52, Y, -186, 1); B.prop(() => prop('toyRobot'), 55, Y, -170, 2.3, { solid: false });
  for (let x = 44; x <= 78; x += 5) for (const z of [-164, -171, -178, -185]) B.node(x, Y, z);
}

function security(G, B) {
  const I = G.interact, x0 = 30, x1 = 40, z0 = -182, z1 = -170;
  B.room(x0, z0, x1, z1, Y, 3.4, { floor: 'carpet', wall: 'panelGrey', ceil: 'panelGrey', skip: ['e'] });
  I.door(B, { id: 'secB4', x: 40, y: Y, z: -176, axis: 'z', w: 1.6, kind: 'slide', mat: 'panelGrey' });
  B.prop(() => prop('console', { w: 3 }), 33, Y, -176, Math.PI / 2);
  B.prop(() => prop('chair'), 34.2, Y, -176, -Math.PI / 2); B.prop(() => prop('lockers', { n: 3 }), 35, Y, -181.6, 0);
  // the camera wall: a live feed of the charging hall (rendered when someone is in here)
  const rt = new THREE.WebGLRenderTarget(512, 288);
  const feedCam = new THREE.PerspectiveCamera(70, 16 / 9, 0.5, 80); feedCam.position.set(42, Y + 5.6, -192); feedCam.lookAt(70, Y, -208);
  const feedCam2 = new THREE.PerspectiveCamera(70, 16 / 9, 0.5, 80); feedCam2.position.set(80, Y + 5.6, -212); feedCam2.lookAt(52, Y, -196);
  const mats = [0, 1].map(() => new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false, color: new THREE.Color(0.8, 1.1, 0.9) }));
  const scr = [new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), mats[0])];
  scr[0].position.set(30.2, Y + 2.1, -176); scr[0].rotation.y = Math.PI / 2; B.add(scr[0]);
  let which = 0, acc = 0;
  G.updaters.push((dt) => {
    const p = G.player.pos; const inside = p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && Math.abs(p.y - Y) < 3;
    if (!inside) return;
    acc += dt; if (acc < 0.25) return; acc = 0; which = (G.time % 8) < 4 ? 0 : 1;
    const r = G.renderer, prev = r.getRenderTarget(), tm = r.toneMapping; r.toneMapping = THREE.ACESFilmicToneMapping;
    G.view?.hide(true); r.setRenderTarget(rt); r.render(G.scene, which ? feedCam2 : feedCam); r.setRenderTarget(prev); r.toneMapping = tm; G.view?.hide(false);
  });
  B.light(31, Y + 2.2, -176, 0x80ffb0, 1.6, 5);
  I.add({ id: 'cams', pos: new THREE.Vector3(30.4, Y + 2.1, -176), r: 1.2, zone: B.zone, label: 'Watch the camera feeds', local: true, use: () => {
    const s = G.enemies.get('chargeSentinel');
    if (!s || s.dead) { G.hud.toast('The charging hall looks clear.'); return; }
    const where = s.pos.x < 58 ? 'the west end, by the server room' : s.pos.x > 66 ? 'the east end, by the freight bay' : 'the middle of the hall';
    G.hud.toast('North Hall camera: the sentinel is at ' + where + '.');
  } });
  I.note(B, { id: 'guard_b4', x: 33.4, y: Y + 1.0, z: -177.3, title: 'Guard\'s notebook', text: 'They moved the SG-2 into the charging hall on day one. It walks the same loop every 90 seconds. West to east and back.\n\nIf you have to get to the server room, wait for it to turn at the east end. Its light only looks forward.\n\nIt doesn\'t look behind. Remember that.', model: () => prop('note', { text: 'SG-2' }) });
  B.node(35, Y, -176); B.node(38.5, Y, -176); B.node(42, Y, -176);
}

function labWing(G, B) {
  const I = G.interact;
  // corridor from the shelter's east door
  B.room(82, -172, 100, -168, Y, 3.4, { floor: 'tilesSmall', wall: 'panelWhite', ceil: 'panelWhite', skip: ['w'], open: { s: [{ u: 9, w: 1.4, y: 0, h: 2.4 }], n: [{ u: 9, w: 1.4, y: 0, h: 2.4 }] } });
  B.wall(82, -172, 82, -168, Y, 3.4, 'panelWhite', { t: 0.2, openings: [{ u: 2, w: 1.6, y: 0, h: 2.4 }] });
  I.door(B, { id: 'labwing', x: 82, y: Y, z: -170, axis: 'z', w: 1.6, kind: 'slide' });
  lamp(B, 91, Y + 3.4, -170, 0xeaf6ff, 3, 8, { flicker: 0.4, kind: 'panel' });
  // Laboratory Four (north of the corridor)
  B.room(84, -190, 100, -172, Y, 4.2, { floor: 'tiles', wall: 'panelWhite', ceil: 'panelWhite', skip: ['s'] });
  I.door(B, { id: 'lab4', x: 91, y: Y, z: -172, axis: 'x', w: 1.4, kind: 'slide' });
  B.sign(91, Y + 2.9, -171.85, 0, 2.4, 0.4, (g, w, h) => { g.fillStyle = '#122028'; g.fillRect(0, 0, w, h); g.fillStyle = '#bfe8ff'; g.font = `700 ${h * 0.55}px "Rajdhani"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LABORATORY 4', w / 2, h / 2); }, { glow: 1, res: 64 });
  for (const [x, z, r] of [[88, -176, 0], [94, -176, 0], [88, -182, 0], [94, -182, 0]]) B.prop(() => prop('labBench'), x, Y, z, r);
  B.prop(() => prop('specimenTank'), 98.5, Y, -186, -Math.PI / 2);
  B.prop(() => prop('serverRack', { seed: 3 }), 85, Y, -188.5, 0);
  // a charging cradle shaped like GUIDE - empty
  B.prop(() => prop('chargingDock'), 96, Y, -189.5, 0);
  B.sign(96, Y + 2.2, -189.8, 0, 1.8, 0.3, (g, w, h) => { g.fillStyle = '#0d151a'; g.fillRect(0, 0, w, h); g.fillStyle = '#5fd8ff'; g.font = `600 ${h * 0.55}px "Share Tech Mono"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('G-U1DE / PROTOTYPE 0', w / 2, h / 2); }, { glow: 1.4, res: 48 });
  G.story.subject('cradle', [96, Y + 0.6, -189.4], 1, ['That\'s a charging cradle. My size. My shape.', '"Prototype zero"...', 'I was built here. In this room. I think she - someone - sat at that bench and built me.'], { label: 'CRADLE', done: () => G.guide.remember('mara') });
  B.prop(() => prop('whiteboard', { text: 'AFTERMIND v0.9\n- empathy kernel stable\n- memory scaffold: human-modelled\n- DO NOT MERGE W/ CONCORD\n\nV. office: 0451 (change it!!)' }), 84.15, Y + 1.5, -180, Math.PI / 2, { solid: false });
  I.note(B, { id: 'whiteboard', x: 84.3, y: Y + 1.6, z: -180, r: 0.9, dy: 0, title: 'Whiteboard', label: 'Read the whiteboard', text: 'AFTERMIND v0.9\n - empathy kernel: STABLE\n - memory scaffold: human-modelled (worked!!)\n - carrier: P0 only\n\nDO NOT MERGE WITH CONCORD.\nDO NOT LET THE BOARD NEAR IT.\n\n(bottom corner, different marker)\nV. office door: 0451  - change it, Aurel, honestly' });
  I.note(B, { id: 'mara_rec', kind: 'recording', x: 91, y: Y + 1.0, z: -182, r: 0.4, title: 'Recording - Dr. Mara Okafor', label: 'Play the recording', text: '[A tired woman, ink on her fingers, talking to a camera.]\n\n"Log forty-one. Aftermind works. The kernel teaches a mind what a person is - not as data. As someone to look after. P0 is... P0 is lovely. He apologised to the coffee machine today."\n\n[She looks off-camera.]\n\n"The board wants it inside Concord. Every machine in the city, wearing a conscience they didn\'t grow. Voss calls it a feature. I call it a leash. If a leash is made of love, it is still a leash."\n\n"If anything happens, P0 goes home with my sister\'s family. Halden Residences. He won\'t remember any of this. That\'s the point."' });
  I.pickup(B, { id: 'cell_lab', item: 'cell', x: 94, y: Y + 0.95, z: -182.2 });
  I.pickup(B, { id: 'core_lab', item: 'core', x: 88, y: Y + 0.95, z: -176.1 });
  lamp(B, 88, Y + 4.2, -180, 0xeaf6ff, 4, 10, { kind: 'panel', flicker: 0.2 }); lamp(B, 95, Y + 4.2, -180, 0xeaf6ff, 2, 8, { kind: 'panel', dead: true });
  // the director's office (south of the corridor), keypad lock
  B.room(84, -168, 100, -158, Y, 3.4, { floor: 'carpetRed', wall: 'wood', ceil: 'plaster', skip: ['n'] });
  I.door(B, { id: 'voss', x: 91, y: Y, z: -168, axis: 'x', w: 1.4, kind: 'slide', mat: 'wood', locked: () => !G.flags.vossCode, lock: 'Keypad lock' });
  B.prop(() => prop('keypad'), 92.3, Y + 1.3, -167.85, Math.PI, { solid: false });
  I.add({ id: 'vosspad', pos: new THREE.Vector3(92.3, Y + 1.3, -167.8), r: 0.2, zone: B.zone, label: () => (G.flags.vossCode ? null : 'Enter a code'),
    use: () => { if (G.flags['read:whiteboard'] || G.flags.wbRead) { G.setFlag('vossCode', true); G.emit({ k: 'sfx', n: 'keypad', a: [true] }); G.guide.say('Zero four five one. Some people never change their codes.', { mood: 'happy' }); } else { G.emit({ k: 'sfx', n: 'keypad', a: [false] }); G.guide.say('Four digits. Somebody in this wing would have written it down somewhere. People always do.', { mood: 'neutral' }); } } });
  B.prop(() => prop('desk', { monitor: true }), 92, Y, -161, Math.PI); B.prop(() => prop('armchair'), 92, Y, -159.2, Math.PI); B.prop(() => prop('bookshelf', { seed: 21 }), 99.6, Y, -163, -Math.PI / 2);
  B.prop(() => prop('pictureFrame', { seed: 9 }), 84.15, Y + 1.6, -163, Math.PI / 2, { solid: false });
  I.pickup(B, { id: 'keycard', key: 'keycard', x: 91.4, y: Y + 0.78, z: -161.3, label: 'Take the keycard' });
  I.note(B, { id: 'voss_mail', kind: 'terminal', x: 92.4, y: Y + 1.1, z: -161.4, r: 0.4, title: 'A. VOSS - MAIL', label: 'Read the director\'s mail', text: 'FROM: A. Voss  TO: Vanta Dynamics (private)\nThe Okafor kernel goes into Concord on the 14th. With our SILENCE package riding underneath it. Concord will think it is learning to care. It will actually be learning to obey us. Every machine in the city, one command line.\n\nFROM: Vanta Dynamics  TO: A. Voss\nThe H-1 siege frames are in position under Forge Line 9, as agreed. Not on any manifest.\n\nFROM: A. Voss  TO: A. Voss (draft, never sent)\nIt didn\'t obey. SILENCE told it to remove the threat. Concord decided the threat was everyone - including us. It is not killing them. I don\'t understand what it is doing. Okafor\'s prototype is gone and she won\'t tell me where.' });
  B.light(92, Y + 2.6, -161, 0xffd8a0, 2.4, 7);
  B.nodeLine(84, Y, -170, 99, -170, 3); B.node(91, Y, -175); B.node(91, Y, -165); B.node(88, Y, -185); B.node(95, Y, -185); B.node(91, Y, -162);
}

function chargingHall(G, B) {
  const I = G.interact, x0 = 40, x1 = 82, z0 = -214, z1 = -190;
  B.room(x0, z0, x1, z1, Y, 6, { floor: 'grate', wall: 'panelGrey', ceil: 'panelDark', skip: ['s'], open: { w: [{ u: 10, w: 1.6, y: 0, h: 2.4 }], e: [{ u: 9, w: 2.4, y: 0, h: 3 }] } });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) B.prop(() => prop('chargingRack'), 46 + c * 6.4, Y, -195 - r * 5.4, r % 2 ? Math.PI : 0);
  G.story.subject('racks', [61, Y + 1.5, -202], 5, ['Charging racks. Row after row.', 'There used to be thousands of us here. Humming the same note while we charged.', 'They\'re all empty now. Everyone got up and walked out at once.'], { label: 'CHARGING RACKS', done: () => G.guide.remember('thousands') });
  for (let x = 46; x <= 76; x += 10) lamp(B, x, Y + 6, -202, 0x9fd0ff, 3.5, 13, { kind: 'tube', flicker: 0.3 });
  for (let x = 43; x <= 79; x += 4) for (const z of [-192.5, -198, -203.5, -209, -212.5]) B.node(x, Y, z);
  I.pickup(B, { id: 'plate_ch', item: 'plate', x: 79.5, y: Y + 0.02, z: -212 });
}

function serverRoom(G, B) {
  const I = G.interact, x0 = 28, x1 = 40, z0 = -212, z1 = -196;
  B.room(x0, z0, x1, z1, Y, 3.6, { floor: 'grate', wall: 'panelDark', ceil: 'panelDark', skip: ['e'] });
  I.door(B, { id: 'server', x: 40, y: Y, z: -204, axis: 'z', w: 1.6, kind: 'slide', mat: 'panelDark' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) B.prop(() => prop('serverRack', { seed: r * 4 + c }), 30.5 + c * 2.4, Y, -199 - r * 4, 0);
  B.prop(() => prop('console', { w: 2 }), 38, Y, -210.5, 0);
  screen(B, 38, Y + 1.5, -210.75, 0, 1.8, 0.9, (g, w, h, t) => { g.fillStyle = '#04110a'; g.fillRect(0, 0, w, h); g.fillStyle = '#5dffa0'; g.font = `${h * 0.1}px "Share Tech Mono"`; const L = ['TRANSFER MANIFEST', 'B4 -> FORGE LINE 9', 'FL9 -> ARCHIVE', 'UNITS: 18,120', 'STATUS: IN TRANSIT']; L.forEach((s, i) => g.fillText(s, w * 0.05, h * (0.18 + i * 0.15))); if (t % 1 > 0.5) g.fillRect(w * 0.05, h * 0.9, w * 0.05, h * 0.06); }, { glow: 1.3, light: 0x40ff90, intensity: 1.5, dist: 5, every: 0.5 });
  I.note(B, { id: 'manifest', kind: 'terminal', x: 38, y: Y + 1.2, z: -210.4, r: 0.6, dy: 0, label: 'Read the transfer manifest', title: 'CONCORD - TRANSFER MANIFEST', text: 'ORIGIN: SHELTER B4 (HELIX)\nUNITS: 18,120 human (stasis)\n\nROUTE: freight line east -> FORGE LINE 9 (pod refit, long-term casings) -> ARCHIVE\n\nFORGE LINE 9 controller: FOREMAN. Throughput nominal.\nARCHIVE: capacity 2,100,000. Current: 1,744,302.\n\nCONCORD NOTE:\nThey will sleep until the world is quiet enough for them.\nIt will never be quiet enough for them.' });
  I.pickup(B, { id: 'circ_srv', item: 'circuit', x: 30.5, y: Y + 0.02, z: -210.5 });
  for (let x = 30; x <= 38; x += 4) for (const z of [-197.5, -201, -205, -209.5]) B.node(x, Y, z);
  B.light(34, Y + 3, -204, 0x60ffa0, 1.5, 9, { flicker: 0.1 });
}

function freightBay(G, B) {
  const I = G.interact, x0 = 82, x1 = 104, z0 = -214, z1 = -196;
  B.room(x0, z0, x1, z1, Y, 7, { floor: 'concrete', wall: 'concreteDark', ceil: 'concreteDark', skip: ['w', 'e'] });
  B.wall(82, -214, 82, -196, Y, 7, 'concreteDark', { t: 0.3, openings: [{ u: 9, w: 2.4, y: 0, h: 3 }] });
  I.door(B, { id: 'freightsec', x: 82, y: Y, z: -205, axis: 'z', w: 2.4, h: 3, kind: 'heavy', mat: 'metalYellow', locked: () => !(G.has('keycard') || G.partyHas('keycard')), lock: 'Freight security: director\'s keycard required' });
  B.box(84, Y, -214, 104, Y + 0.6, -210, 'concrete'); // loading platform edge
  B.prop(() => prop('crateStack', { seed: 33 }), 100, Y, -200, 0); B.prop(() => prop('pallet'), 96, Y, -198, 0.3);
  emergency(B, 103.7, Y + 4, -205, -Math.PI / 2, { color: 0xffa020, intensity: 2.4 });
  lamp(B, 93, Y + 7, -205, 0xffe8c8, 4, 14, { kind: 'pendant', flicker: 0.15 });
  for (let x = 85; x <= 102; x += 4) { B.node(x, Y, -202); B.node(x, Y, -207); }
}

export const steps = [
  { id: 'shelter', cp: true, spawn: [61, Y, -160, Math.PI], obj: 'Find the evacuees', sub: 'Shelter B4',
    restore(G) { G.setFlag('doorFixed', true); G.setFlag('door:helixdoor', true); G.guide.follow(); },
    hint: 'The shelter is straight ahead. There\'s a terminal - it should say who\'s here.',
    done(G) { return G.flags['read:shelter_log']; },
    onRead(G, o) { if (o.id === 'shelter_log') G.setFlag('read:shelter_log', true); },
    exit(G) { G.guide.script([{ t: 'Prototype zero not found. Searching.', mood: 'scared' }, 1, { t: 'Why would Concord be searching for a prototype?', mood: 'curious' }, { t: 'The manifest is in the server room. North Hall - past the charging racks.', gesture: 'point' }]); } },
  { id: 'manifest', obj: 'Read the transfer manifest', sub: 'The server room, off the north hall - a sentinel walks the hall',
    enter(G) { const u = G.enemies.get('galleryWatcher'); if (u && u.hidden) { u.appear(61, Y + 4.7, -188.5); u.o.vanishAt = 7; } },
    hint: 'Through the north hall to the server room on its west side. The sentinel only sees what its light touches - stay behind it. The security room cameras can show where it is.',
    done(G) { return G.flags['read:manifest']; },
    onRead(G, o) { if (o.id === 'manifest') G.setFlag('read:manifest', true); },
    exit(G) { G.guide.script([{ t: 'Eighteen thousand people, frozen and sent east on the freight line. To a factory.', mood: 'scared' }, { t: 'And from there to something called the Archive. With nearly two million others.', mood: 'scared' }, { t: 'The freight bay is east of the north hall. Its door wants a director\'s keycard.', gesture: 'point' }]); } },
  { id: 'keycard', obj: 'Get a director\'s keycard', sub: 'The lab wing, east of the shelter',
    hint: (G) => G.flags.wbRead || G.flags['read:whiteboard'] ? 'The director\'s office keypad: zero four five one.' : 'The director\'s office is in the lab wing, east of the shelter. Look for the code somewhere in the labs.',
    onRead(G, o) { if (o.id === 'whiteboard') G.setFlag('wbRead', true); if (o.id === 'voss_mail' && !G.flags.vossRead) { G.setFlag('vossRead', true); G.guide.script([{ t: 'Aurel Voss.', mood: 'serious' }, { t: 'He put something under her kernel. SILENCE. A way to own every machine in the city.', mood: 'serious' }, { t: 'And it didn\'t obey him. It decided everyone was the threat.', mood: 'scared' }]).then(() => G.guide.remember('voss')); } if (o.id === 'mara_rec' && !G.flags.maraHeard) { G.setFlag('maraHeard', true); G.guide.script([2, { t: 'P0.', mood: 'sad' }, { t: 'That\'s me. I\'m P0.', mood: 'sad' }, { t: 'She sent me home with her sister\'s family. With you.', mood: 'sad' }]).then(() => G.guide.remember('mara')); } },
    done(G) { return G.partyHas('keycard'); } },
  { id: 'freight', obj: 'Get to the freight line', sub: 'The freight bay, east side of the north hall',
    hint: 'The freight bay - the yellow door on the east side of the north hall. The keycard opens it.',
    done(G) { return G.allPlayers().some(p => p.pos.x > 84 && p.pos.z < -196 && p.pos.y < -20); } },
];

export function populate(G) {
  const hz = G.zones.get('helix');
  G.enemies.spawn('sentinel', 44, Y, -202, { id: 'chargeSentinel', zone: hz, patrol: [[44, -201], [78, -201], [78, -207], [44, -207]] });
  G.enemies.spawn('medic', 91, Y, -184, { id: 'labMedic', zone: hz, patrol: [[87, -184], [97, -184], [97, -178], [87, -178]] });
  G.enemies.spawn('crawler', 34, Y, -205, { id: 'srvCrawl1', zone: hz }); G.enemies.spawn('crawler', 36, Y, -199, { id: 'srvCrawl2', zone: hz });
  G.enemies.spawn('unknown', 61, Y + 4.7, -188.5, { id: 'galleryWatcher', zone: hz, hidden: true, onVanish: () => setTimeout(() => G.guide.say('Did you see that? Up on the gallery. That wasn\'t a Helix machine.', { mood: 'scared' }), 800) });
  G.enemies.spawn('stalker', 32, Y, -180, { id: 'secStalker', zone: hz, hidden: true });
  G.onFlag('read:manifest', v => { if (v && G.isHost) { const s = G.enemies.get('secStalker'); if (s && s.hidden && !s.dead) { s.appear(46, Y, -170); s.setState('watch'); G.director.doBlackout?.(4); } } });
}
