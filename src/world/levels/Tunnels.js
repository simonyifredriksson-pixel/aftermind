/* Tunnels.js - the maintenance tunnels between Meridian Station and Helix.

   Everything at y -26. From the elevator shaft (x 66.5..71.5, z -88):
     A  service corridor north (x 67..71) to a junction at z -110
     P  east of the junction: a flooded pump room - the crawler nest
     B  west then north: a long unlit cable tunnel (x 48..52, z -110..-140)
        where the stalker waits; alcoves, a dead lamp every ten metres
     S  the sump hall (x 46..76, z -152..-140): pumps, catwalk, a hunter
        resting against the wall - and in the north wall the Helix emergency
        access door, its actuator shot. */
import * as THREE from '../../../lib/three.module.js';
import { prop } from '../../art/Art.js';
import { lamp, emergency, debris, rubble, puddle, screen, glyph, Mat } from './common.js';

const Y = -26, H = 3.6;
export function build(G) {
  const tz = G.addZone('tunnels', { name: 'Maintenance Tunnels', bounds: [[44, Y - 2, -156, 86, Y + 6, -86]], fog: 0x07090a, density: 0.045, hemi: 0.03, space: 'tunnel', horror: 0.85, neighbors: ['genroom', 'helix'], surface: 'concrete', env: 0.15, drip: 0.9, tunnel: 0.8, machinery: 0.15, tension: 0.25 });
  const B = G.builder(tz);
  const T = (x0, z0, x1, z1, h = H, mat = 'tunnel', skip = []) => B.room(x0, z0, x1, z1, Y, h, { floor: 'concreteDark', wall: mat, ceil: 'concreteDark', skip });
  // A: service corridor
  B.box(67, Y - 0.3, -106, 71, Y, -88, 'concreteDark', { faces: ['py'] }); B.box(67, Y + H, -106, 71, Y + H + 0.3, -88, 'concreteDark');
  B.wall(67, -106, 67, -88, Y, H, 'tunnel', { t: 0.3 }); B.wall(71, -106, 71, -88, Y, H, 'tunnel', { t: 0.3 });
  for (let z = -92; z > -110; z -= 6) B.prop(() => prop('pipes', { len: 6, n: 3 }), 70.7, Y + 2.6, z, -Math.PI / 2, { solid: false });
  for (const z of [-92, -102]) emergency(B, 67.2, Y + 2.4, z, Math.PI / 2, { color: 0xff7020, intensity: 1.4, flicker: 0.25 });
  // junction
  B.box(46, Y - 0.3, -114, 84, Y, -106, 'concreteDark', { faces: ['py'] }); B.box(46, Y + H, -114, 84, Y + H + 0.3, -106, 'concreteDark');
  B.wall(46, -106, 67, -106, Y, H, 'tunnel', { t: 0.3 }); B.wall(71, -106, 74, -106, Y, H, 'tunnel', { t: 0.3 });
  B.wall(52, -114, 74, -114, Y, H, 'tunnel', { t: 0.3 });
  B.wall(46, -114, 46, -106, Y, H, 'tunnel', { t: 0.3 });
  // P: the pump room (east), flooded ankle-deep
  B.box(74, Y - 0.3, -120, 86, Y, -100, 'concreteDark', { faces: ['py'] }); B.box(74, Y + 4.5, -120, 86, Y + 4.8, -100, 'concreteDark');
  B.wall(74, -100, 86, -100, Y, 4.5, 'tunnel', { t: 0.3 }); B.wall(86, -120, 86, -100, Y, 4.5, 'tunnel', { t: 0.3 }); B.wall(74, -120, 86, -120, Y, 4.5, 'tunnel', { t: 0.3 });
  B.wall(74, -106, 74, -100, Y, 4.5, 'tunnel', { t: 0.3 }); B.wall(74, -120, 74, -114, Y, 4.5, 'tunnel', { t: 0.3 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(12, 20), Mat('water')); water.rotation.x = -Math.PI / 2; water.position.set(80, Y + 0.08, -110); B.add(water);
  B.prop(() => prop('generator'), 82, Y, -104, Math.PI); B.prop(() => prop('pipes', { len: 10, n: 5 }), 85.7, Y + 3.2, -110, -Math.PI / 2, { solid: false });
  B.prop(() => prop('barrel'), 76, Y, -118.5, 0); B.prop(() => prop('crateStack', { seed: 9 }), 84.5, Y, -118.4, 0);
  lamp(B, 80, Y + 4.5, -110, 0x9fe0ff, 2.5, 10, { flicker: 0.7, kind: 'tube' });
  G.interact.pickup(B, { id: 'servo_t', item: 'servo', x: 84.6, y: Y + 1.6, z: -118.4 });
  G.interact.pickup(B, { id: 'cell_t', item: 'cell', x: 76, y: Y + 0.95, z: -118.5 });
  G.interact.pickup(B, { id: 'bat_t', item: 'battery', x: 82, y: Y + 1.7, z: -102.8 });
  G.interact.note(B, { id: 'worker', x: 80.5, y: Y + 1.62, z: -103.5, title: 'Maintenance tablet', kind: 'terminal', text: 'WORK ORDER 77-1192 - PUMP 3 BEARING\nAssigned: T. Okonjo\nStatus: OPEN\n\nT. Okonjo, personal note:\nThe MS-8s are nesting in the pump housings. Reported it three times. Facilities says they\'re "performing scheduled maintenance". They\'re dismantling the pumps.\n\nIf the pumps go, the tunnels flood. If the tunnels flood, Helix floods.\n\nUnless that\'s the point.' });
  // B: the long cable tunnel, west then north. No lights. At all.
  B.box(46, Y - 0.3, -142, 52, Y, -114, 'concreteDark', { faces: ['py'] }); B.box(46, Y + H, -142, 52, Y + H + 0.3, -114, 'concreteDark');
  B.wall(46, -142, 46, -114, Y, H, 'tunnel', { t: 0.3 }); B.wall(52, -140, 52, -114, Y, H, 'tunnel', { t: 0.3 });
  for (let z = -118; z > -140; z -= 10) { lamp(B, 49, Y + H, z, 0xffffff, 0, 0, { dead: true, kind: 'tube' }); B.prop(() => prop('cableReel'), 47, Y, z - 4, 0.3); }
  for (let z = -116; z > -140; z -= 7) B.prop(() => prop('pipes', { len: 7, n: 4 }), 46.3, Y + 2.8, z - 3.5, Math.PI / 2, { solid: false });
  debris(B, 50, Y, -128, 1, 6, 51);
  puddle(B, 49, Y, -122, 1.2, 0.8); puddle(B, 50, Y, -134, 1.6, 0.7);
  G.interact.note(B, { id: 'chalk', x: 51.8, y: Y + 1.4, z: -126, title: 'Chalk on the wall', text: 'IT CAN\'T MOVE IF YOU LOOK\nIT CAN\'T MOVE IF YOU LOOK\nIT CAN\'T MOVE IF YOU LOOK\n\nKEEP YOUR LIGHT ON IT\n\n(lower, smaller)\nmy batteries are almost', r: 0.6 });
  // S: the sump hall
  B.box(46, Y - 0.3, -152, 76, Y, -140, 'concrete', { faces: ['py'] }); B.box(46, Y + 7, -152, 76, Y + 7.3, -140, 'concreteDark');
  B.wall(52, -140, 76, -140, Y, 7, 'tunnel', { t: 0.3 }); B.wall(46, -142, 46, -152, Y, 7, 'tunnel', { t: 0.3 }); B.wall(76, -140, 76, -152, Y, 7, 'tunnel', { t: 0.3 });
  B.wall(46, -152, 76, -152, Y, 7, 'concreteDark', { t: 0.4, openings: [{ u: 15, w: 3.2, y: 0, h: 3.6 }] });
  B.box(46, Y + 3.2, -146, 76, Y + 3.4, -144.6, 'grate', { solid: false }); // catwalk overhead
  for (let x = 50; x < 76; x += 6) B.box(x, Y, -145.4, x + 0.25, Y + 3.2, -145.15, 'rust', { solid: false });
  B.prop(() => prop('generator'), 70, Y, -142.4, Math.PI); B.prop(() => prop('barrel', { hazard: true }), 48, Y, -150.6, 0); B.prop(() => prop('barrel'), 49, Y, -150.8, 1); B.prop(() => prop('pallet'), 72, Y, -150, 0.2);
  B.prop(() => prop('crateStack', { seed: 14 }), 54, Y, -150.2, 0);
  for (let x = 50; x < 76; x += 8) lamp(B, x, Y + 7, -147, 0xffd0a0, 3.2, 12, { flicker: x > 60 ? 0.5 : 0.15, kind: 'pendant' });
  emergency(B, 61, Y + 4.4, -151.7, 0, { color: 0xff2a1a, intensity: 3 });
  // the Helix emergency access door
  const dx = 61, dz = -152;
  B.sign(dx, Y + 4.1, dz + 0.22, 0, 3.4, 0.5, (g, w, h) => { g.fillStyle = '#1c2228'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8eef8'; g.font = `700 ${h * 0.55}px "Rajdhani"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HELIX - EMERGENCY ACCESS 4', w / 2, h / 2); }, { glow: 1.1, res: 64 });
  G.interact.door(B, { id: 'helixdoor', x: dx, y: Y, z: dz, axis: 'x', w: 3.2, h: 3.6, kind: 'heavy', mat: 'metalWhite', noUse: true });
  const act = B.prop(() => prop('fuseBox'), dx + 2.4, Y + 1.4, dz + 0.25, 0, { solid: false });
  G.interact.add({ id: 'actuator', pos: new THREE.Vector3(dx + 2.4, Y + 1.5, dz + 0.4), r: 0.4, zone: B.zone, hold: 3,
    label: () => (G.flags.doorFixed ? null : (G.has('actuator') || G.partyHas('actuator')) ? 'Fit the actuator patch' : 'Door actuator (broken)'),
    holdTick: (dt) => { if (Math.random() < dt * 5) G.fx.sparks(new THREE.Vector3(dx + 2.4, Y + 1.5, dz + 0.5), 0xffc060, 5); },
    use: () => {
      if (G.flags.doorFixed) return;
      if (!(G.has('actuator') || G.partyHas('actuator'))) { G.guide.say(G.knows('hunter') ? 'We need an actuator patch: a hunter\'s knee piston, a servo, and wire. I can build it.' : 'The hydraulic actuator is cracked through. I don\'t know what we could replace it with... yet.', { mood: 'neutral' }); G.setFlag('sawActuator', true); return; }
      G.setFlag('doorFixed', true); G.emit({ k: 'sfx', n: 'cableConnect' }); G.emit({ k: 'sfx', n: 'valve' });
      setTimeout(() => { G.setFlag('door:helixdoor', true); G.emit({ k: 'cine', n: 'shake', a: 0.4 }); }, 1500);
    } });
  G.story.subject('helixdoor', [dx, Y + 2, dz + 0.2], 2, ['Emergency Access Four.', 'I know this door. I know the sound it makes when it opens - a long hiss, then a clunk.', 'I\'ve come through here before. More than once. Carrying something.']);
  // nav
  B.nodeLine(69, Y, -89, 69, -108, 4); B.nodeLine(48, Y, -110, 82, -110, 4); B.nodeLine(80, Y, -102, 80, -118, 4);
  for (let z = -116; z >= -140; z -= 4) B.node(49, Y, z, { dark: true });
  for (let x = 49; x <= 73; x += 4) { B.node(x, Y, -142.5); B.node(x, Y, -149); }
  B.node(61, Y, -151); B.node(61, Y, -154);
  G.atmos.roof(44, -160, 88, -86, 0);
}

export const steps = [
  { id: 'tunnels', cp: true, spawn: [69, Y, -91, Math.PI], obj: 'Follow the tunnels to Helix', sub: 'North',
    enter(G) { G.guide.script([{ t: 'The maintenance tunnels. The map shows them running north, under the plaza, to the Helix sub-levels.', gesture: 'point' }, { t: 'Keep your light handy. And your prod handier.', mood: 'scared' }]); },
    restore(G) { G.setPower('gen', true); for (const c of ['doors', 'lift']) G.setPower(c, true); G.flags.liftAt = 'bottom'; G.guide.follow(); },
    hint: 'North. The tunnels split at a junction - the way to Helix is west, then north through the cable tunnel.',
    done(G) { return G.allPlayers().some(p => p.pos.z < -141 && p.pos.y < -20); } },
  { id: 'helixdoor', obj: 'Open the Helix emergency door',
    sub(G) { if (!G.flags.sawActuator) return 'The big door in the north wall'; if (!G.knows('hunter')) return 'The actuator is broken. Find out what could replace it.'; return 'Build an Actuator Patch with GUIDE\n' + `${G.count('hydraulic') >= 1 ? '[x]' : '[ ]'} Hydraulic actuator (hunters)\n${G.count('servo') >= 1 ? '[x]' : '[ ]'} Servo motor\n${G.count('wire') >= 1 ? '[x]' : '[ ]'} Wire`; },
    enter(G) { G.guide.script([{ t: 'That door.', mood: 'curious', face: 'scan' }, { t: 'Emergency Access Four. I know this door.', mood: 'curious' }, { t: 'I\'ve been through it. I don\'t know when.', mood: 'scared' }]); },
    hint(G) { if (!G.knows('hunter')) return 'Its actuator is shot. Those hunters run on hydraulics just like it - if we had a photo of one, I might remember how they\'re built.'; if (!G.has('actuator')) return 'A hunter\'s knee piston, a servo, some wire - then I can build the patch. Hunters carry the pistons.'; return 'Fit the patch to the actuator box beside the door.'; },
    onAnalyzed(G, subs) { if (subs.some(s => s.type === 'hunter')) G.guide.say('Hunters! Their knee pistons are the same family as that door\'s actuator. With a servo and some wire, I can build a patch.', { mood: 'happy' }); },
    done(G) { return G.flags.doorFixed; },
    exit(G) { G.guide.script([2, { t: 'Long hiss...', mood: 'curious' }, { t: '...then a clunk.', mood: 'sad' }, { t: 'I really have been here before.', mood: 'sad' }]); } },
];

export function populate(G) {
  const tz = G.zones.get('tunnels');
  for (let i = 0; i < 5; i++) G.enemies.spawn('crawler', 78 + (i % 3) * 2, Y, -112 + (i >> 1) * 3, { id: 'pump' + i, zone: tz, patrol: [[76, -104], [84, -116], [78, -112]] });
  G.enemies.spawn('crawler', 69, Y, -98, { id: 'corrCrawl', zone: tz });
  G.enemies.spawn('stalker', 49, Y, -138, { id: 'tunnelStalker', zone: tz });
  G.enemies.spawn('hunter', 50, Y, -128, { id: 'cableHunter', zone: tz, patrol: [[49, -116], [49, -138], [60, -110]] });
  G.enemies.spawn('hunter', 72, Y, -149.5, { id: 'sumpHunter', zone: tz, dormant: true, yaw: Math.PI });
  G.trigger({ id: 'sumpWake', box: [60, Y - 1, -152, 76, Y + 4, -140], onEnter: () => { const h = G.enemies.get('sumpHunter'); if (h && !h.dead && h.state === 'dormant') { G.emit({ k: 'sfx', n: 'stinger', a: ['jump'] }); h.setState('investigate'); h.last = G.player.pos.clone(); } } });
}
