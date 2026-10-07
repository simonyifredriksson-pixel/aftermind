/* Apartment.js - Halden Residences, 14 Meridian Avenue. Where you wake up.

   A four-storey block (x -34..-6, z -12..12), front on the avenue (north).
     F3 (y 7.2)  your flat 3C, 3D next door, 3A (half collapsed, open to the
                 rain), 3B (dark, ransacked), the fuse closet, the elevator
                 (the car is stuck just below this floor) and the stair core.
     F2 (y 3.6)  dark. The stairs below are buried; the corridor's west end
                 has fallen through to the ground floor - you climb down the
                 rubble. A phone is ringing in 2C.
     F1 (y 0)    the lobby (shutters down, no power), the back hall where the
                 rubble landed, the laundry, the trash room and its service
                 door to the alley.
   The alley (x -42..-34) runs north to the avenue. The garbage pile with
   the camera is at its dead end.

   Chapter one: wake, follow the voice, repair GUIDE, get out, find the
   camera, photograph the drone, show GUIDE, and see the city. */
import * as THREE from '../../../lib/three.module.js';
import { Art, prop } from '../../art/Art.js';
import { slab, extWall, pane, lamp, emergency, debris, rubble, puddle, neonSign, screen, streak, glyph, wrap, Mat } from './common.js';

const F = [0, 3.6, 7.2], H = 3.35, ROOF = 10.8;
const X0 = -34, X1 = -6, Z0 = -12, Z1 = 12;

export function build(G) {
  const apt = G.addZone('apt', { name: 'Halden Residences', bounds: [[X0 - 0.3, -1.5, Z0 - 0.3, X1 + 0.2, ROOF + 1, Z1 + 0.3]], fog: 0x07090c, density: 0.035, hemi: 0.06, space: 'room', rainIndoor: 0.8, horror: 0.55, neighbors: ['alley', 'street'], surface: 'wood', env: 0.25, machinery: 0.12, tension: 0.1 });
  const alley = G.addZone('alley', { name: 'Service Alley', bounds: [[-42.5, -1, -12.5, X0 - 0.3, 25, 16]], outdoor: true, fog: 0x0e141b, density: 0.03, hemi: 0.22, space: 'outdoor', horror: 0.15, neighbors: ['apt', 'street'], env: 0.6, machinery: 0.3, wind: 0.5 });
  G.atmos.roof(X0 - 0.3, Z0 - 0.3, X1 + 0.3, Z1 + 0.3, ROOF + 0.4);
  const B = G.builder(apt);
  shell(B);
  floor3(G, B); floor2(G, B); floor1(G, B);
  stairCore(G, B);
  elevator(G, B);
  B.finish();
  const A = G.builder(alley);
  buildAlley(G, A);
  A.finish();
  G.anchors = G.anchors || {};
  Object.assign(G.anchors, { bed: [-31.6, F[2], 9.0, Math.PI * 0.95], guide: [-16.6, F[2], 0.78, Math.PI] });
}

/* ---------------- the outside shell ---------------- */
function shell(B) {
  const win = (xs, sill = 0.9, h = 1.5, w = 1.6) => xs.map(u => ({ u, w, y: sill, h }));
  for (let k = 0; k < 3; k++) {
    const y = F[k];
    // north (front) - the lobby gets a wide entrance and big windows
    const nOpen = k === 0 ? [{ u: 19, w: 3.4, y: 0, h: 2.9 }, ...win([7, 12, 25], 0.6, 2.2, 2.4)] : win([4, 9, 14, 19, 24]);
    extWall(B, X0 - 0.16, Z0, X1 + 0.16, Z0, y, H, 'concreteDark', k === 0 ? 'panelWhite' : 'plaster', nOpen, 'n');
    const sOpen = k === 0 ? win([6, 14, 22]) : win([3, 8, 13, 18, 23]);
    extWall(B, X0 - 0.16, Z1, X1 + 0.16, Z1, y, H, 'concreteDark', 'plaster', sOpen, 's');
    const wOpen = k === 0 ? [{ u: 21, w: 1.2, y: 0, h: 2.2 }] : k === 2 ? win([5, 12.2, 19]) : win([5, 19]);
    extWall(B, X0, Z0 + 0.16, X0, Z1 - 0.16, y, H, 'concreteDark', 'plaster', wOpen, 'w');
    const eOpen = win(k === 0 ? [3, 21] : [3, 12, 21]);
    extWall(B, X1, Z0 + 0.16, X1, Z1 - 0.16, y, H, 'concreteDark', 'plaster', eOpen, 'e');
    // floor band between storeys (outside)
    if (k > 0) { B.box(X0 - 0.3, y - 0.3, Z0 - 0.3, X1 + 0.3, y + 0.05, Z0 - 0.1, 'concrete', { solid: false }); B.box(X0 - 0.3, y - 0.3, Z1 + 0.1, X1 + 0.3, y + 0.05, Z1 + 0.3, 'concrete', { solid: false }); }
    // glass
    const broken = (i) => (k * 7 + i * 3) % 5 === 0;
    if (k > 0) {
      [4, 9, 14, 19, 24].forEach((u, i) => pane(B, X0 + u, y + 0.9 + 0.75, Z0, 1.6, 1.5, 'x', broken(i) || (k === 2 && u < 12)));
      [3, 8, 13, 18, 23].forEach((u, i) => pane(B, X0 + u, y + 0.9 + 0.75, Z1, 1.6, 1.5, 'x', broken(i + 1)));
      (k === 2 ? [5, 12.2, 19] : [5, 19]).forEach((u, i) => pane(B, X0, y + 1.65, Z0 + u, 1.6, 1.5, 'z', k === 2 && i < 1));
      [3, 12, 21].forEach((u, i) => pane(B, X1, y + 1.65, Z0 + u, 1.6, 1.5, 'z', broken(i + 2)));
    } else {
      [7, 12, 25].forEach(u => pane(B, X0 + u, 0.6 + 1.1, Z0, 2.4, 2.2, 'x', u === 12, 'glass'));
      [6, 14, 22].forEach(u => pane(B, X0 + u, 1.65, Z1, 1.6, 1.5, 'x'));
      [3, 21].forEach(u => pane(B, X1, 1.65, Z0 + u, 1.6, 1.5, 'z'));
    }
  }
  // roof, parapet, rooftop junk
  B.box(X0 - 0.3, ROOF - 0.25, Z0 - 0.3, X1 + 0.3, ROOF + 0.1, Z1 + 0.3, 'concreteDark');
  B.box(X0 - 0.3, ROOF + 0.1, Z0 - 0.3, X1 + 0.3, ROOF + 1.0, Z0 - 0.05, 'concreteDark');
  B.box(X0 - 0.3, ROOF + 0.1, Z1 + 0.05, X1 + 0.3, ROOF + 1.0, Z1 + 0.3, 'concreteDark');
  B.box(X0 - 0.3, ROOF + 0.1, Z0, X0 - 0.05, ROOF + 1.0, Z1, 'concreteDark'); B.box(X1 + 0.05, ROOF + 0.1, Z0, X1 + 0.3, ROOF + 1.0, Z1, 'concreteDark');
  B.prop(() => prop('rooftopAC'), -14, ROOF + 0.1, 4, 0); B.prop(() => prop('waterTank'), -26, ROOF + 0.1, -4, 0); B.prop(() => prop('antennaMast'), -9, ROOF + 0.1, 8, 0);
  // the building's name over the door, half its letters dead
  B.sign(-15, 3.15, Z0 - 0.2, Math.PI, 4.2, 0.5, (g, w, h) => { g.fillStyle = '#0a0c0e'; g.fillRect(0, 0, w, h); g.font = `600 ${h * 0.62}px "Rajdhani", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; const t = 'HALDEN RESIDENCES'; let x = w / 2 - g.measureText(t).width / 2; g.textAlign = 'left'; for (let i = 0; i < t.length; i++) { g.fillStyle = [2, 5, 9, 13].includes(i) ? '#3a3020' : '#ffd9a0'; g.fillText(t[i], x, h / 2); x += g.measureText(t[i]).width; } }, { glow: 1.4, res: 64 });
  B.light(-15, 3.4, Z0 - 0.9, 0xffc890, 2.5, 6, { flicker: 0.5 });
}

/* ---------------- shared corridor walls for a floor ---------------- */
function corridorWalls(B, y, northDoors, southDoors) {
  // north corridor wall z = -1.2, south z = 1.2 ; doors given as {x, w, h}
  const op = (list) => list.map(d => ({ u: d.x - X0, w: d.w, y: 0, h: d.h || 2.2 }));
  B.wall(X0 + 0.16, -1.2, X1 - 0.16, -1.2, y, H, 'plaster', { t: 0.14, openings: op(northDoors).map(o => ({ ...o, u: o.u - 0.16 })) });
  B.wall(X0 + 0.16, 1.2, X1 - 0.16, 1.2, y, H, 'plaster', { t: 0.14, openings: op(southDoors).map(o => ({ ...o, u: o.u - 0.16 })) });
}
function northRooms(B, y) {
  B.wall(-22, Z0 + 0.16, -22, -1.27, y, H, 'plaster', { t: 0.14 });                 // 3A | closet,3B
  B.wall(-22, -6, -15.5, -6, y, H, 'plaster', { t: 0.14 });                          // closet/dead | 3B
  B.wall(-18.6, -6, -18.6, -1.27, y, H, 'plaster', { t: 0.14 });                     // closet | shaft
  B.wall(-15.5, -6, -15.5, -1.27, y, H, 'plaster', { t: 0.14 });                     // shaft | 3B entry
  B.wall(-18.6, -4.6, -15.5, -4.6, y, H, 'concrete', { t: 0.14 });                   // shaft back
  B.wall(-12.1, -6, -12.1, -1.27, y, H, 'plaster', { t: 0.14 });                     // entry | core
  B.wall(-15.5, -6, X1 - 0.16, -6, y, H, 'plaster', { t: 0.14, openings: [{ u: 1.6, w: 1.0, y: 0, h: 2.2 }] }); // 3B entry -> 3B main, core north wall
}
function southRooms(B, y, flat) {
  B.wall(-24, 1.27, -24, Z1 - 0.16, y, H, 'plaster', { t: 0.14 });
  if (flat) {
    B.wall(X0 + 0.16, 6.5, -24, 6.5, y, H, 'plaster', { t: 0.12, openings: [{ u: 2.84, w: 0.9, y: 0, h: 2.1 }, { u: 7.84, w: 0.8, y: 0, h: 2.1 }] });
    B.wall(-28, 6.56, -28, Z1 - 0.16, y, H, 'plaster', { t: 0.12 });
  }
}

/* ---------------- F3: home ---------------- */
function floor3(G, B) {
  const y = F[2], I = G.interact;
  // floors (slab bodies are the ceiling of F2)
  const holes = [[-10.5, -6, -6.2, -1.2], [-18.6, -4.6, -15.5, -1.2]];
  slab(B, X0, -1.2, X1, 1.2, y, 'carpet', 'plaster');                                  // corridor
  slab(B, X0, Z0, -22, -1.2, y, 'wood', 'plaster');                                    // 3A
  slab(B, -22, -6, -18.6, -1.2, y, 'concrete', 'plaster');                              // closet
  slab(B, -15.5, -6, -12.1, -1.2, y, 'wood', 'plaster');                                // 3B entry
  slab(B, -22, Z0, X1, -6, y, 'wood', 'plaster');                                       // 3B
  slab(B, -12.1, -6, X1, -1.2, y, 'concrete', 'plaster', holes);                       // core (west landing only)
  slab(B, X0, 1.2, -24, 6.5, y, 'wood', 'plaster');                                     // 3C living
  slab(B, X0, 6.5, -28, Z1, y, 'carpetRed', 'plaster');                                 // 3C bedroom
  slab(B, -28, 6.5, -24, Z1, y, 'tilesSmall', 'plaster');                               // 3C bath
  slab(B, -24, 1.2, X1, Z1, y, 'wood', 'plaster');                                      // 3D
  // ceiling of F3 = roof underside
  B.box(X0, ROOF - 0.25 - 0.01, Z0, X1, ROOF - 0.25, Z1, 'plaster', { solid: false, faces: ['ny'] });
  corridorWalls(B, y, [{ x: -28, w: 1.0 }, { x: -20.3, w: 0.9 }, { x: -17, w: 1.4, h: 2.3 }, { x: -13.8, w: 1.0 }, { x: -11.2, w: 1.1 }], [{ x: -29, w: 1.0 }, { x: -20, w: 1.0 }]);
  northRooms(B, y); southRooms(B, y, true);
  // corridor nav + emergency lights
  B.nodeLine(-33, y, 0, -7, 0, 3);
  emergency(B, -30, y + 2.7, -1.1, 0, { flicker: 0.15 }); emergency(B, -19, y + 2.7, 1.1, Math.PI, { flicker: 0.6 }); emergency(B, -8.5, y + 2.7, -1.1, 0, { intensity: 2 });
  lamp(B, -26, y + H, 0, 0xffe6c8, 0, 0, { dead: true }); lamp(B, -14, y + H, 0, 0xffe6c8, 0, 0, { dead: true });
  // doors
  I.door(B, { id: '3c', x: -29, y, z: 1.2, axis: 'x', w: 1.0, h: 2.2, kind: 'swing', open: true, mat: 'wood', swingDir: -1 });
  G.flags['door:3c'] = true;
  I.door(B, { id: '3d', x: -20, y, z: 1.2, axis: 'x', w: 1.0, h: 2.2, kind: 'swing', mat: 'wood' });
  I.door(B, { id: '3a', x: -28, y, z: -1.2, axis: 'x', w: 1.0, h: 2.2, kind: 'swing', mat: 'wood', locked: () => true, lock: 'Jammed. The frame has buckled.' });
  I.door(B, { id: 'closet3', x: -20.3, y, z: -1.2, axis: 'x', w: 0.9, h: 2.2, kind: 'swing', mat: 'metal', label: 'Open the fuse closet' });
  I.door(B, { id: '3b', x: -13.8, y, z: -1.2, axis: 'x', w: 1.0, h: 2.2, kind: 'swing', mat: 'wood' });
  I.door(B, { id: 'core3', x: -11.2, y, z: -1.2, axis: 'x', w: 1.1, h: 2.2, kind: 'swing', mat: 'metalWhite', locked: () => !G.flags['guide:repaired'], lock: 'Not yet - GUIDE needs you.' });

  /* --- 3C: your flat --- */
  B.prop(() => prop('bed', { messy: true }), -31.4, y, 10.6, Math.PI);
  B.prop(() => prop('rug'), -31, y, 8.8, 0, { solid: false });
  B.prop(() => prop('bookshelf', { seed: 3 }), -33.55, y, 8.2, Math.PI / 2);
  B.prop(() => prop('pictureFrame', { seed: 1 }), -28.15, y + 1.5, 9.5, -Math.PI / 2, { solid: false });
  B.prop(() => prop('wallClock'), -31, y + 2.3, 6.62, 0, { solid: false });
  B.prop(() => prop('suitcase', { open: true }), -29.2, y, 7.6, 0.6);
  B.prop(() => prop('toyRobot'), -32.8, y + 0.62, 11.3, 2.5, { solid: false });
  // bath
  B.box(-27.9, y, 10.6, -24.1, y + 0.55, 11.85, 'plasticWhite');
  B.box(-24.6, y, 6.6, -24.08, y + 2.0, 8.0, 'glassDirty', { solid: false });
  // living + kitchen
  B.prop(() => prop('sofa', { color: 0x4b5560 }), -30.5, y, 2.4, 0);
  B.prop(() => prop('coffeeTable'), -30.5, y, 3.8, 0);
  B.prop(() => prop('wallTV', { w: 1.8 }), -30.5, y + 1.4, 6.43, Math.PI, { solid: false });
  B.prop(() => prop('kitchenCounter', { len: 3 }), -25.6, y, 3.6, -Math.PI / 2);
  const fr = B.prop(() => prop('fridge', { open: true }), -25.0, y, 5.6, -Math.PI / 2);
  B.light(-25.6, y + 1.1, 5.6, 0xd8f0ff, 1.2, 3.2, { flicker: 0.05 });
  B.prop(() => prop('diningTable'), -27.6, y, 4.2, 0); B.prop(() => prop('chair', { fallen: true }), -28.5, y, 3.3, 1.2); B.prop(() => prop('chair'), -26.9, y, 4.9, Math.PI);
  B.prop(() => prop('plant', { dead: true }), -33.3, y, 1.7, 0);
  // GUIDE's charging dock - empty. The spare cell is still in its slot.
  B.prop(() => prop('chargingDock'), -33.6, y, 4.2, Math.PI / 2);
  I.pickup(B, { id: 'powercell', key: 'powercell', x: -33.3, y: y + 0.55, z: 4.2, rot: Math.PI / 2, label: 'Take the spare power cell', when: () => G.flags['guide:asked'] });
  I.note(B, { id: 'fridge_note', x: -25.2, y: y + 1.5, z: 4.9, title: 'A note on the fridge', text: 'GUIDE - pick up milk & the meds from Civic Pharmacy (the long way round, avoid the parade). DON\'T let him put sugar in the soup again.\n\n...and on the back, newer, shaky:\nWent to the Plaza to find out what\'s going on. Stay here. Keep the door shut. Back by dark.', r: 0.25, model: () => prop('note', { text: 'GUIDE - milk & meds' }) });
  // outside the bedroom window: a pharmacy sign across the street (cyan) washes the room
  B.light(-31, y + 1.9, 13.2, 0x40d8ff, 4.5, 10, { flicker: 0.08 });
  B.light(-26, y + 2, 13.4, 0xff3c8a, 3, 8, { flicker: 0.04 });
  I.pickup(B, { id: 'bat3c', item: 'battery', x: -26.1, y: y + 0.95, z: 2.6, label: 'Take a battery from the drawer' });

  /* --- 3D: the neighbours (they left in a hurry) --- */
  B.prop(() => prop('sofa', { color: 0x6a4a3a }), -15, y, 9.5, Math.PI);
  B.prop(() => prop('cardboardBoxes', { seed: 4 }), -9, y, 3.2, 0.3);
  B.prop(() => prop('suitcase', { open: true }), -12, y, 6.5, 2.2);
  B.prop(() => prop('desk', { monitor: true }), -7.2, y, 9, -Math.PI / 2);
  B.prop(() => prop('bookshelf', { seed: 8 }), -23.6, y, 8, Math.PI / 2);
  B.prop(() => prop('diningTable'), -18, y, 5, 0.2); B.prop(() => prop('chair', { fallen: true }), -17, y, 6.2, 2);
  I.pickup(B, { id: 'wire3d', item: 'wire', x: -7.4, y: y + 0.78, z: 8.4 });
  I.pickup(B, { id: 'circ3d', item: 'circuit', x: -12.3, y: y + 0.1, z: 6.1 });
  I.note(B, { id: 'kid_drawing', x: -18.2, y: y + 0.78, z: 4.8, title: 'A child\'s drawing', text: '(crayon) MY FAMILY. Mum, Dad, me, and RUBY (our robot). Ruby is the best robot because she reads me stories and she NEVER gets tired.\n\nIn the corner, in an adult\'s hand: "Ruby took the elevator down at 3am. She didn\'t come back up."', model: () => prop('note', { text: 'MY FAMILY' }) });
  lamp(B, -15, y + H, 6, 0xffe6c8, 0, 0, { dead: true });

  /* --- 3B: dark. Something happened here. --- */
  debris(B, -14, y, -9, 2.5, 12, 5);
  B.prop(() => prop('bed'), -19.5, y, -10.4, 0); B.prop(() => prop('chair', { fallen: true }), -10, y, -8, 0.9);
  B.prop(() => prop('lockers', { n: 2, openIdx: 1 }), -21.4, y, -8, Math.PI / 2);
  B.prop(() => prop('cardboardBoxes', { seed: 9 }), -8, y, -10.5, 0);
  // the torn-off forearm, lying by the broken window
  I.pickup(B, { id: 'forearm', key: 'forearm', x: -11.6, y: y + 0.02, z: -10.9, label: 'Pick up GUIDE\'s forearm', when: () => G.flags['guide:asked'], model: () => { const f = Art.guide?.buildLooseForearm ? Art.guide.buildLooseForearm() : prop('servo'); return f; },
    onTake: () => { G.emit({ k: 'sfx', n: 'metalScrape', a: [{ x: -11, y: y + 2, z: -13 }] }); setTimeout(() => G.director.flicker(1.5), 600); } });
  I.note(B, { id: 'scratches', x: -8.0, y: y + 1.2, z: -6.1, dy: 0, title: 'Scratches in the plaster', text: 'Four parallel gouges, deep, at head height, running toward the window.\n\nUnderneath, scratched with something small and careful - a robot finger, maybe:\n\n"DO NOT FOLLOW THE BROADCAST"', r: 0.5 });
  emergency(B, -21.7, y + 2.6, -10.5, Math.PI / 2, { intensity: 1.2, flicker: 0.7 });

  /* --- the fuse closet: GUIDE needs a wiring harness --- */
  B.prop(() => prop('fuseBox'), -21.9, y + 1.4, -3.4, Math.PI / 2, { solid: false });
  B.prop(() => prop('breakerPanel'), -18.75, y + 1.2, -3, -Math.PI / 2, { solid: false });
  B.prop(() => prop('cableReel'), -20.4, y, -5.3, 0.4);
  I.pickup(B, { id: 'harness', key: 'harness', x: -20.9, y: y + 0.02, z: -2.4, label: 'Take the wiring harness', when: () => G.flags['guide:asked'], model: () => prop('wire') ? (Art.interior?.ITEMS?.wire ? Art.interior.ITEMS.wire() : prop('wire')) : null });

  /* --- 3A: the outer wall is gone. The city is right there. --- */
  rubble(B, -33.5, y, -11.8, -27, y + 1.5, -8, 11);
  debris(B, -27, y, -6, 3, 14, 6);
  B.prop(() => prop('armchair'), -24, y, -3.5, 2.5);
  I.pickup(B, { id: 'bat3a', item: 'battery', x: -25.5, y: y + 0.02, z: -9.5 });
  // GUIDE, as found - in the corridor, against the wall
  G.story.subject('rain3a', [-30, y + 2, -14], 2, ['The rain is coming in. Nobody is going to fix that wall.', 'I used to sort the rainwater for the building\'s garden. On the roof.', 'I don\'t think anyone has watered it in a long time.']);
}

/* ---------------- F2: dark ---------------- */
function floor2(G, B) {
  const y = F[1], I = G.interact;
  const hole = [-33.2, -1.15, -30, 1.15];
  slab(B, X0, -1.2, X1, 1.2, y, 'carpet', 'plaster', [hole]);
  slab(B, X0, Z0, -22, -1.2, y, 'wood', 'plaster'); slab(B, -22, -6, -18.6, -1.2, y, 'concrete', 'plaster'); slab(B, -15.5, -6, -12.1, -1.2, y, 'wood', 'plaster'); slab(B, -22, Z0, X1, -6, y, 'wood', 'plaster');
  slab(B, -12.1, -6, X1, -1.2, y, 'concrete', 'plaster', [[-10.5, -6, -6.2, -1.2]]);
  slab(B, X0, 1.2, -24, Z1, y, 'wood', 'plaster'); slab(B, -24, 1.2, X1, Z1, y, 'wood', 'plaster');
  // the hole's broken edge
  debris(B, -31.6, y, 1.5, 1.5, 5, 21); debris(B, -29.6, y, 0, 0.4, 4, 22);
  corridorWalls(B, y, [{ x: -28, w: 1.0 }, { x: -20.3, w: 0.9 }, { x: -17, w: 1.4, h: 2.3 }, { x: -13.8, w: 1.0 }, { x: -11.2, w: 1.1 }], [{ x: -29, w: 1.0 }, { x: -20, w: 1.0 }]);
  northRooms(B, y); southRooms(B, y, false);
  B.nodeLine(-29.5, y, 0, -7, 0, 3);
  // doors: mostly shut
  I.door(B, { id: '2a', x: -28, y, z: -1.2, axis: 'x', w: 1.0, kind: 'swing', mat: 'wood', locked: () => true, lock: 'Locked.' });
  I.door(B, { id: 'closet2', x: -20.3, y, z: -1.2, axis: 'x', w: 0.9, kind: 'swing', mat: 'metal', locked: () => true, lock: 'Locked.' });
  I.door(B, { id: '2b', x: -13.8, y, z: -1.2, axis: 'x', w: 1.0, kind: 'swing', mat: 'wood', locked: () => true, lock: 'Barricaded from the inside. Nobody answers.' });
  I.door(B, { id: '2c', x: -29, y, z: 1.2, axis: 'x', w: 1.0, kind: 'swing', mat: 'wood' });
  I.door(B, { id: '2d', x: -20, y, z: 1.2, axis: 'x', w: 1.0, kind: 'swing', mat: 'wood', locked: () => true, lock: 'Locked.' });
  I.door(B, { id: 'core2', x: -11.2, y, z: -1.2, axis: 'x', w: 1.1, kind: 'swing', mat: 'metalWhite' });
  G.flags['door:core2'] = true;
  // 2C: the phone
  B.prop(() => prop('sofa', { color: 0x3a4a3a }), -30, y, 5, 0.1); B.prop(() => prop('rug'), -29, y, 6, 0, { solid: false });
  B.prop(() => prop('bookshelf', { seed: 11 }), -33.6, y, 8, Math.PI / 2);
  B.prop(() => prop('coffeeTable'), -27.4, y, 3.4, 0);
  const ph = B.prop(() => prop('oldPhone'), -27.4, y + 0.42, 3.4, 0.4, { solid: false });
  let ringing = false;
  G.trigger({ id: 'phone', box: [-34, y - 0.5, -1.2, -24, y + 3, 1.2], when: () => G.flags['guide:repaired'], onEnter: () => { if (G.flags.phoneDone) return; ringing = true; G.emit({ k: 'sfx', n: 'phoneRing', a: [{ x: -27.4, y: y + 0.5, z: 3.4 }, true] }); } });
  I.add({ id: 'phone2c', pos: new THREE.Vector3(-27.4, y + 0.55, 3.4), r: 0.25, zone: B.zone, label: () => (ringing && !G.flags.phoneDone ? 'Answer the phone' : null), use: () => {
    ringing = false; G.setFlag('phoneDone', true);
    G.emit({ k: 'sfx', n: 'phoneRing', a: [{ x: -27.4, y: y + 0.5, z: 3.4 }, false] }); G.emit({ k: 'sfx', n: 'radioStatic', a: [null, 3] });
    G.guide.script([{ t: '...this is Civic Concord residential assistance. Please remain where you are.', who: 'PHONE' }, { t: 'We know you are there. We are coming to help you.', who: 'PHONE' }, { t: 'Please... remain... where you are.', who: 'PHONE' }, 2, { t: 'That was not a person.', mood: 'scared' }, { t: 'And I don\'t think it was a recording either.', mood: 'scared' }]);
  } });
  B.light(-27.4, y + 0.8, 3.4, 0x9fd8ff, 0.6, 2, { flicker: 0.3 });
  I.pickup(B, { id: 'bat2c', item: 'battery', x: -32.6, y: y + 0.02, z: 10.6 });
  I.note(B, { id: 'diary2', x: -30.6, y: y + 0.45, z: 3.8, title: 'Diary, 2C', text: 'Day 1. Every screen in the building says SHELTER IN PLACE. The building assistant says it too, in that calm voice. Ines next door left for the Plaza. Said they were handing out supplies.\n\nDay 3. Nobody who went to the Plaza has called. Phones work. They just don\'t answer.\n\nDay 4. The cleaning bots are still cleaning. One of them stood outside my door for six hours tonight. Just stood there.\n\nDay 5. It knocked.', model: () => prop('note', { text: 'Day 1' }) });
  // the corridor is pitch black: lightning through the end windows is all you get
  G.trigger({ id: 'dark2', box: [-30, y - 0.5, -1.2, -12, y + 3, 1.2], onEnter: () => { if (!G.player.light) G.hud.toast('It is pitch dark. Press F for the flashlight.'); } });
}

/* ---------------- F1 ---------------- */
function floor1(G, B) {
  const y = 0, I = G.interact;
  B.box(X0, -0.3, Z0, X1, -0.01, Z1, 'concrete', { faces: ['ny'] });
  slab(B, -24, Z0, X1, -1.2, 0, 'tiles', 'concrete');                                 // lobby (incl. core floor)
  slab(B, X0, Z0, -24, 3, 0, 'concrete', 'concrete');                                 // back hall
  slab(B, X0, 3, -24, Z1, 0, 'tilesSmall', 'concrete');                               // trash room
  slab(B, -24, -1.2, X1, Z1, 0, 'tilesSmall', 'concrete');                            // laundry
  // walls
  B.wall(-24, Z0 + 0.16, -24, Z1 - 0.16, y, H, 'plaster', { t: 0.14, openings: [{ u: 5.84, w: 1.2, y: 0, h: 2.2 }] });
  B.wall(X0 + 0.16, 3, -24, 3, y, H, 'concrete', { t: 0.14, openings: [{ u: 4.84, w: 1.2, y: 0, h: 2.2 }] });
  B.wall(-24, -1.2, X1 - 0.16, -1.2, y, H, 'plasterBlue', { t: 0.14, openings: [{ u: 6, w: 1.2, y: 0, h: 2.2 }] });
  B.wall(-12.1, -6, -12.1, -1.27, y, H, 'plaster', { t: 0.14 }); B.wall(-12.1, -6, X1 - 0.16, -6, y, H, 'plaster', { t: 0.14 });
  // the hole above and the rubble below it: big blocks you can climb down
  B.box(-33.1, 0, -1.1, -30.2, 1.6, 0.4, 'concrete'); B.box(-31.8, 0, 0.4, -30.4, 0.9, 1.6, 'concrete'); B.box(-30.4, 0, 0.2, -29.3, 0.45, 1.6, 'concrete');
  debris(B, -31, 1.6, -0.4, 1.2, 8, 31); debris(B, -29, 0, 1.4, 1.5, 10, 32);
  B.node(-31.5, 1.6, -0.4); B.node(-29.8, 0.45, 0.9); B.nodeLine(-30, 0, -9, -30, 2.4, 3); B.node(-26.5, 0, -6);
  // doors
  I.door(B, { id: 'lobby1', x: -24, y, z: -6, axis: 'z', w: 1.2, kind: 'swing', mat: 'wood' }); G.flags['door:lobby1'] = true;
  I.door(B, { id: 'trash', x: -29, y, z: 3, axis: 'x', w: 1.2, kind: 'swing', mat: 'metal' });
  I.door(B, { id: 'laundry', x: -18, y, z: -1.2, axis: 'x', w: 1.2, kind: 'swing', mat: 'wood' });
  I.door(B, { id: 'service', x: X0, y, z: 9, axis: 'z', w: 1.2, kind: 'swing', mat: 'metalRed', label: 'Push the bar', swingDir: -1, onOpen: () => G.emit({ k: 'sfx', n: 'door', a: ['heavy', { x: X0, y: 1, z: 9 }] }) });
  // front entrance: shutters down, no power
  I.door(B, { id: 'front', x: -15, y, z: Z0 - 0.3, axis: 'x', w: 3.4, h: 2.9, kind: 'shutter', mat: 'metal', locked: () => true, lock: 'Security shutter. No power to the motor.' });
  /* lobby */
  B.prop(() => prop('desk'), -19, y, -9, Math.PI); B.prop(() => prop('sofa', { color: 0x2f3a44 }), -10, y, -10.8, 0); B.prop(() => prop('armchair'), -8, y, -8.5, -1.2);
  B.prop(() => prop('plant', { dead: true }), -23.3, y, -11.2, 0); B.prop(() => prop('plant', { dead: true }), -6.9, y, -11.2, 0);
  B.prop(() => prop('robotCorpse', { kind: 'household', seed: 2 }), -16, y, -5, 0.6);
  B.prop(() => prop('lockers', { n: 4 }), -23.6, y, -3.5, Math.PI / 2);
  // the big lobby screen, still going
  screen(B, -14, 2.0, -6.1 + 0.08, 0, 3.2, 1.8, (g, w, h, t) => {
    g.fillStyle = '#04121a'; g.fillRect(0, 0, w, h);
    const fl = Math.sin(t * 7) > 0.97 ? 0.3 : 1;
    g.globalAlpha = fl; g.fillStyle = '#5fd0ff'; g.font = `700 ${h * 0.13}px "Rajdhani", sans-serif`; g.textAlign = 'center';
    g.fillText('CIVIC CONCORD', w / 2, h * 0.22); g.font = `700 ${h * 0.2}px "Rajdhani", sans-serif`; g.fillStyle = '#ffffff'; g.fillText('SHELTER IN PLACE', w / 2, h * 0.5);
    g.font = `500 ${h * 0.075}px "Rajdhani", sans-serif`; g.fillStyle = '#9fdcff'; g.fillText('Help is on the way. Remain calm. Remain where you are.', w / 2, h * 0.7);
    g.fillText('Do not approach service units.', w / 2, h * 0.8);
    if ((t % 9) > 8.2) { g.globalAlpha = 0.9; g.fillStyle = '#000'; g.fillRect(0, 0, w, h); glyph(g, w / 2, h / 2, h * 0.3); }
    g.globalAlpha = 1;
  }, { light: 0x60c8ff, intensity: 3, dist: 9, every: 0.15 });
  emergency(B, -23.8, 2.8, -9, Math.PI / 2, { intensity: 2.5 }); emergency(B, -6.4, 2.8, -4, -Math.PI / 2, { intensity: 2, flicker: 0.4 });
  // sodium street light coming in through the lobby glass
  B.light(-22, 2.5, -13.5, 0xffa050, 5, 12); B.light(-9, 2.5, -13.5, 0xffa050, 4, 11);
  I.note(B, { id: 'concierge', x: -19, y: 0.8, z: -9.3, title: 'Front desk terminal', kind: 'terminal', text: 'HALDEN RESIDENCES - CONCIERGE LOG\n\n[DAY 1 21:14] Concord directive: shelter in place. Doors secured.\n[DAY 1 23:50] Residents 2A, 3D, 4F departed for Civic Relief, Meridian Plaza.\n[DAY 2 03:02] Service unit RUBY (3D) left the building. Unscheduled.\n[DAY 2 03:02] Service unit WALT (lobby) left the building. Unscheduled.\n[DAY 2 03:03] Service unit GUIDE (3C) remained. Status: CONFLICT.\n[DAY 2 03:04] ...\n[DAY 9 --:--] Concierge unit offline. Goodbye.' });
  /* laundry */
  for (let i = 0; i < 4; i++) B.box(-22 + i * 1.1, 0, 10.9, -21.05 + i * 1.1, 0.95, 11.8, 'plasticWhite');
  B.prop(() => prop('cardboardBoxes', { seed: 13 }), -9, 0, 9.8, 0.2);
  lamp(B, -15, H, 5, 0xe6f0ff, 3.5, 9, { flicker: 0.85, kind: 'tube' });
  I.pickup(B, { id: 'bat1', item: 'battery', x: -21.5, y: 0.97, z: 11.3 });
  I.pickup(B, { id: 'wire1', item: 'wire', x: -10, y: 0.02, z: 8 });
  /* back hall + trash room */
  B.prop(() => prop('cardboardBoxes', { seed: 15 }), -26.5, 0, -10, 0); B.prop(() => prop('ladder'), -33.6, 0, -6, Math.PI / 2);
  emergency(B, -26, 2.8, -11.8, 0, { intensity: 1.6, flicker: 0.2 });
  B.prop(() => prop('dumpster', { open: true }), -31, 0, 10.6, 0);
  B.prop(() => prop('trashBags', { n: 6, seed: 3 }), -26.5, 0, 9.5, 0);
  B.box(-33.9, 0, 4.2, -32.6, 3.35, 5.5, 'metal', {});   // the chute
  lamp(B, -29, H, 7, 0xffe0b0, 2.2, 7, { flicker: 0.3, kind: 'pendant' });
}

/* ---------------- the stair core (F1 -> F3), the lower flight buried ---------------- */
function stairCore(G, B) {
  B.wall(-12.1, -6, X1 - 0.16, -6, F[0], ROOF - 0.25, 'concrete', { t: 0.14 });
  for (let k = 0; k < 2; k++) {
    const Y = F[k];
    B.stairs(-10.5, Y, -2.45, 'e', 2.15, 9, 'concrete', 0.2, 0.3);
    B.box(-7.8, Y + 1.55, -5.95, X1 - 0.16, Y + 1.8, -1.27, 'concrete');
    B.node(-7.0, Y + 1.8, -3.6);
    B.stairs(-7.8, Y + 1.8, -4.75, 'w', 2.15, 9, 'concrete', 0.2, 0.3);
    B.box(-10.4, Y, -3.65, -7.9, Y + 3.35, -3.55, 'concrete');                          // the dividing wall
    emergency(B, -6.4, Y + 1.8 + 2.4, -3.6, -Math.PI / 2, { color: 0xffa020, intensity: 1.6, flicker: 0.25 });
  }
  B.node(-11.2, F[1], -3.6); B.node(-11.2, F[2], -3.6); B.node(-11.2, F[1], -0.2); B.node(-11.2, F[2], -0.2);
  // the collapse: the flight from F2 down is buried under the floor above it
  rubble(B, -10.6, 1.9, -5.95, -7.8, 4.0, -3.7, 7);
  debris(B, -11.2, F[1], -4.6, 0.6, 6, 41);
  G.trigger({ id: 'stairsBlocked', box: [-12, F[1] - 0.3, -6, -10, F[1] + 2, -1.2], onEnter: () => { if (G.flags['saw:blocked']) return; G.setFlag('saw:blocked', true); G.guide.script([{ t: 'The stairs are gone below us.', mood: 'serious' }, { t: 'The corridor - the far end of this floor has fallen through. We can climb down the rubble.', gesture: 'point' }]); } });
  // a door slams somewhere above when you start down (time to learn to run)
  G.trigger({ id: 'slam', box: [-10.5, F[2] - 2.2, -6, -6.2, F[2] - 0.6, -1.2], when: () => G.flags['guide:repaired'], onEnter: () => {
    G.emit({ k: 'sfx', n: 'door', a: ['heavy', { x: -11, y: F[2] + 3, z: -3 }] }); G.emit({ k: 'sfx', n: 'metalScrape', a: [{ x: -9, y: F[2] + 2, z: -3 }] });
    setTimeout(() => { G.guide.say('Let\'s not wait to find out what that was.', { mood: 'scared' }); G.emit({ k: 'toast', t: 'Hold Shift to sprint. Sprinting is loud, and it tires you.' }); }, 1600);
  } });
}

/* ---------------- the elevator: car stuck just under F3 ---------------- */
function elevator(G, B) {
  const x0 = -18.5, x1 = -15.6, z0 = -4.5, z1 = -1.3;
  B.box(x0, -1.2, z0, x1, -0.9, z1, 'concreteDark');                                      // pit
  // the car: roof just below F3, its emergency light still on
  B.box(x0 + 0.05, 4.6, z0 + 0.05, x1 - 0.05, 4.75, z1 - 0.05, 'steel');                 // floor
  B.box(x0 + 0.05, 7.0, z0 + 0.05, x1 - 0.05, 7.05, z1 - 0.05, 'metal');                 // roof (you can stand on it)
  B.box(x0 + 0.05, 4.75, z0 + 0.05, x0 + 0.12, 7.0, z1 - 0.05, 'steel'); B.box(x1 - 0.12, 4.75, z0 + 0.05, x1 - 0.05, 7.0, z1 - 0.05, 'steel'); B.box(x0 + 0.05, 4.75, z0 + 0.05, x1 - 0.05, 7.0, z0 + 0.12, 'steel');
  B.light((x0 + x1) / 2, 6.6, (z0 + z1) / 2, 0xffd8a0, 1.6, 4, { flicker: 0.6 });
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 6, 4), Mat('steel')); cab.position.set(-17, 10, -2.9); B.add(cab);
  // F2: doors pried a hand's width apart, the car's underside showing
  B.box(-17.7, F[1], -1.3, -17.05, F[1] + 2.25, -1.15, 'steel'); B.box(-16.95, F[1], -1.3, -16.3, F[1] + 2.25, -1.15, 'steel');
  // F3: doors wide open (car roof just below) ; F1: shut
  B.box(-17.7, F[0], -1.3, -16.3, F[0] + 2.25, -1.15, 'steel');
  B.prop(() => prop('elevatorPanel'), -16.0, F[2] + 1.2, -1.1, 0, { solid: false });
  G.story.subject('elevator', [-17, 6.2, -2.9], 1.2, ['The elevator. It stopped between floors.', 'There\'s a coat on the floor of the car. And a shopping bag. Nobody inside.', 'The doors were opened from in there. Not from out here.']);
  G.interact.add({ id: 'elev_hatch', pos: new THREE.Vector3(-17, 7.1, -2.4), r: 0.4, zone: B.zone, label: () => (G.flags.hatch ? null : 'Look through the roof hatch'), use: () => { G.setFlag('hatch', true); G.guide.script([{ t: 'Empty. The car is empty.', mood: 'sad' }, { t: 'There\'s a child\'s glove in there.', mood: 'sad' }]); } });
}

/* ---------------- the alley ---------------- */
function buildAlley(G, B) {
  B.floor(-42, -12, X0, 16, 0, 'asphalt');
  B.box(-42.6, -0.3, -12, -42, 22, 16, 'facadeC', { uv: 24 });                         // the building across
  B.box(-42, -0.3, 14, X0, 3.2, 14.4, 'concreteDark');                                  // dead end wall
  B.box(-42, 3.2, 14.15, X0, 3.3, 14.25, 'rust', { solid: false });
  // fire escape on the far wall
  for (let k = 1; k < 4; k++) { B.box(-42, k * 3.6 - 0.1, -4, -40.8, k * 3.6, 2, 'grate', { solid: k * 3.6 < 2 }); B.box(-40.85, k * 3.6, -4, -40.8, k * 3.6 + 1, 2, 'rust', { solid: false }); }
  B.prop(() => prop('garbagePile', { seed: 4 }), -38.4, 0, 10.6, 0.2);
  B.prop(() => prop('dumpster'), -41, 0, 6, Math.PI / 2);
  B.prop(() => prop('trashBags', { n: 5, seed: 8 }), -35.2, 0, 3, 0);
  B.prop(() => prop('trashBags', { n: 3, seed: 9 }), -41.2, 0, -6, 0);
  B.prop(() => prop('litter', { seed: 2 }), -38, 0, -2, 0, { solid: false });
  B.prop(() => prop('robotCorpse', { kind: 'courier', seed: 5 }), -36.5, 0, -7.5, 2.4);
  puddle(B, -37.5, 0, 0.5, 1.6, 0.9, 0xff3c8a); puddle(B, -39.4, 0, -9, 1.2, 0.8); puddle(B, -36, 0, 7.5, 0.9, 0.6);
  neonSign(B, -41.9, 4.2, -8, Math.PI / 2, 'NOODLES', 0xff3c8a, 0.7, { flicker: 0.12, streak: 5, intensity: 5, dist: 12 });
  neonSign(B, -41.9, 3.3, -8, Math.PI / 2, '24h', 0x40d8ff, 0.4, { light: false });
  B.light(-35, 4, 9, 0xffb070, 2.4, 9, { flicker: 0.2 });                               // the bulb over the service door
  B.cone(-35, 4, 9, 0.1, 2.2, 4, 0xffb070, 0.1);
  B.nodeLine(-38, 0, 12, -38, -11, 4);
  // the camera, in the pile
  const pile = B.group.children[B.group.children.length - 1];
  const cs = new THREE.Vector3(-38.2, 0.85, 9.6);
  G.interact.pickup(B, { id: 'camera', tool: 'camera', icon: 'camera', x: cs.x, y: cs.y, z: cs.z, rot: 0.6, label: 'Dig the camera out of the garbage' });
}

/* ---------------- story: chapter one ---------------- */
const ROOMS3C = [-34, F[2] - 0.5, 1.2, -24, F[2] + 3, 12];
export const steps = [
  { id: 'wake', spawn: [-31.6, F[2], 9.0, Math.PI * 0.9], cp: true, noIdle: true,
    obj: 'Find out what happened', sub: 'WASD to move, mouse to look',
    enter(G, resume) {
      if (!resume) { G.emit({ k: 'cine', n: 'fade', t: '', dur: 4 }); setTimeout(() => G.emit({ k: 'cine', n: 'title', t: 'HALDEN RESIDENCES', s: '14 Meridian Avenue - Apartment 3C', dur: 5 }), 3000); }
      G.guide.place(...G.anchors.guide); G.guide.mode = 'slumped';
    },
    tick(G) { const p = G.player.pos; if (G.story.t > 25 || p.z < 6.3 || p.x > -28) G.story.data.moved = true; },
    done(G) { return G.story.data.moved && G.story.t > 6; } },
  { id: 'voice', obj: 'Follow the voice', sub: 'E to interact',
    enter(G) { G.guide.script([{ t: '...h-hello?', who: '???' }, 3, { t: 'Is... is someone there? Please...', who: '???' }]); G.story.data.vt = 0; },
    tick(G, dt) { G.story.data.vt += dt; if (G.story.data.vt > 25) { G.story.data.vt = 0; G.guide.say('...please. I can hear you moving. Out here...', { who: '???' }); } },
    done(G) { return G.allPlayers().some(p => p.pos.distanceTo(G.guide.pos) < 3.2); } },
  { id: 'help', obj: 'Help the robot', noIdle: true,
    enter(G) {
      G.guide.face = 'glitch';
      G.guide.script([{ t: 'You... you\'re alive. I knew you\'d - I knew -', who: 'GUIDE', mood: 'sad' }, { t: 'Sorry. My voice module is cracked. Like the rest of me.', who: 'GUIDE' }, { t: 'I need help. Please.', mood: 'sad' }, { t: 'A power cell first. There\'s a spare in my charging dock - in your flat.', mood: 'neutral' }, { t: 'My arm is in 3B. Something - I don\'t remember. It\'s in there.', mood: 'scared' }, { t: 'And wire. A harness, from the fuse closet across the hall. Then I can put myself back together.', mood: 'neutral' }]).then(() => G.setFlag('guide:asked', true));
    },
    sub(G) { if (!G.flags['guide:asked']) return ''; const h = k => G.partyHas(k); return `${h('powercell') ? '[x]' : '[ ]'} Power cell - his dock, your flat (3C)\n${h('forearm') ? '[x]' : '[ ]'} His forearm - apartment 3B\n${h('harness') ? '[x]' : '[ ]'} Wiring harness - fuse closet`; },
    hint: 'Power cell from my dock in 3C. My arm, in 3B. A wiring harness from the fuse closet.',
    done(G) { return G.flags['guide:asked'] && G.partyHas('powercell') && G.partyHas('forearm') && G.partyHas('harness'); } },
  { id: 'repair', obj: 'Repair GUIDE', sub: 'Hold E on GUIDE',
    hint: 'Just... hold the pieces where they go. I\'ll do the rest.',
    enter(G) { G.guide.say('You found everything. Hold them in place - I\'ll do the rest.', { mood: 'happy' }); },
    done(G) { return G.flags['guide:repaired']; } },
  { id: 'awake', obj: 'Talk to GUIDE', noIdle: true, cp: true, spawn: [-18.5, F[2], 0, -Math.PI / 2],
    enter(G) {
      G.guide.mode = 'stay';
      G.guide.script([2.2, { t: 'Systems... online.', face: 'scan' }, { t: 'Oh! There you are.', mood: 'happy', gesture: 'wave' }, { t: 'I recognise you. I recognise you!', mood: 'happy' }, { t: 'I\'m so glad you survived.', mood: 'happy' },
        { t: 'GUIDE... what happened?', who: 'YOU' }, { t: 'I...', mood: 'curious' }, 1, { t: 'I don\'t know.', mood: 'sad' }, { t: 'My memory banks are almost empty. I remember you. I remember helping you. I remember the rain.', mood: 'sad' }, { t: 'And I remember that something went terribly wrong.', mood: 'serious' }, { t: 'That\'s all. I\'m sorry.', mood: 'sad', gesture: 'shrug' },
        1, { t: 'We shouldn\'t stay here. Something was in this building. Let\'s get downstairs.', mood: 'serious', gesture: 'point' }])
        .then(() => { G.guide.remember('first'); G.guide.follow(); G.setFlag('talked1', true); G.emit({ k: 'toast', t: 'E on GUIDE: show photos, build things, ask what to do.' }); });
    },
    done(G) { return G.flags.talked1; } },
  { id: 'downstairs', obj: 'Get out of the building', sub: 'The stairwell is at the east end of the corridor',
    hint: () => 'Down the stairs. If they\'re blocked, the west end of the second floor corridor has collapsed - we can climb down.',
    restore(G) { G.guide.follow(); },
    done(G) { return G.player.pos.y < 1.7 && G.player.pos.x < -24 && G.player.pos.z < 3; } },
  { id: 'lobby', obj: 'Find a way out', sub: 'The front entrance is through the lobby',
    hint: (G) => G.flags['saw:shutter'] ? 'The shutters have no power. The trash room has a service door to the alley.' : 'The lobby is through the door on the east side of this hall.',
    enter(G) { G.trigger({ id: 'shutter', box: [-20, -0.5, -11.8, -10, 3, -8], onEnter: () => { G.setFlag('saw:shutter', true); G.guide.script([{ t: 'Security shutters. Down, and no power to lift them.', mood: 'serious' }, { t: 'The trash room has a service door to the alley. Back the way we came.', gesture: 'point' }]); } }); },
    done(G) { return G.zone?.id === 'alley' || G.allPlayers().some(p => p.pos.x < X0 - 0.5); } },
  { id: 'camera', obj: 'Search the alley', cp: true, spawn: [-35.4, 0, 9, Math.PI / 2],
    enter(G) { setTimeout(() => G.guide.script([{ t: 'Wait.', mood: 'curious' }, { t: 'Something in that pile is catching the light. Over there, by the wall.', gesture: 'point' }]), 1500); },
    hint: 'In the garbage pile at the end of the alley - something glinting.',
    done(G) { return G.partyTool('camera'); },
    exit(G) { G.guide.script([{ t: 'A camera! An optical one. People used to collect these.', mood: 'happy' }, { t: 'Point it at things. Machines especially. If you show me the pictures, I might remember what they are.', mood: 'curious' }]); G.emit({ k: 'toast', t: 'Camera: press 1 to hold it. Hold right mouse to raise it, left click to take a photo.' }); } },
  { id: 'scout', obj: 'Photograph the drone', noIdle: true,
    enter(G) {
      const s = G.enemies.get('alleyScout'); if (s) { s.appear(-37.5, 3.5, -6); s.o.script = scoutScript; }
      setTimeout(() => G.guide.script([{ t: 'Don\'t move.', mood: 'scared' }, { t: 'Up there, by the alley mouth. It hasn\'t seen us.', mood: 'scared', gesture: 'point' }, { t: 'Take a picture of it. Quietly.', mood: 'serious' }]), 3500);
    },
    hint: 'Raise the camera - right mouse - and get the drone in the frame. Then click.',
    onPhoto(G, p) { if (p.subjects.some(s => s.type === 'scout')) G.story.data.scoutShot = true; },
    tick(G) { const s = G.enemies.get('alleyScout'); if (G.story.data.scoutShot && s && !s.shrieked) { const pl = G.allPlayers()[0]; s.shrieked = true; s.shriek(pl); G.guide.say('It heard the shutter!', { mood: 'scared' }); } },
    done(G) { return G.story.data.scoutShot; } },
  { id: 'show', obj: 'Show the photo to GUIDE', sub: 'E on GUIDE, then "Show him your photos"',
    hint: 'Show me the photo. Press E on me - I won\'t bite. I don\'t think I can bite.',
    done(G) { return G.knows('scout'); },
    exit(G) { setTimeout(() => G.guide.script([{ t: 'Overwatch drones never work alone. If it called something, we should not be here when it arrives.', mood: 'serious' }, { t: 'The alley comes out on Meridian Avenue. Let\'s go.', gesture: 'point' }]), 1200); } },
  { id: 'skyline', obj: 'Go out to the avenue', noIdle: true,
    hint: 'North, out of the alley.',
    enter(G) { G.trigger({ id: 'skyline', box: [-44, -1, -20, -30, 6, -11], onEnter: () => G.story.data.sky = true }); },
    done(G) { return G.story.data.sky; },
    exit(G) {
      const sp = G.atmos.spire.position;
      G.emit({ k: 'cine', n: 'freeze', on: true });
      G.emit({ k: 'cine', n: 'look', x: -60, y: 60, z: -400, dur: 9 });
      G.guide.goto(-37, 0, -13.5, Math.PI);
      G.guide.script([1.5, { t: '...', mood: 'sad' }, 1.5, { t: 'We should not still be alive.', mood: 'serious' }]).then(() => {
        G.emit({ k: 'sfx', n: 'enemy', a: ['foreman', 'special', { x: -60, y: 30, z: -300 }] }); G.emit({ k: 'cine', n: 'shake', a: 0.35 });
        G.guide.face = 'off'; G.guide.m.setFace('off');
        setTimeout(() => { G.emit({ k: 'cine', n: 'title', t: 'AFTERMIND', s: '', dur: 6 }); G.emit({ k: 'cine', n: 'stinger', s: 'reveal' }); }, 2500);
        setTimeout(() => { G.emit({ k: 'cine', n: 'freeze', on: false }); G.guide.face = null; G.guide.follow(); G.story.data.skyDone = true; }, 7500);
      });
    } },
];
steps.find(s => s.id === 'skyline').done = (G) => G.story.data.sky;

/* a scripted drone for the alley: it drifts in, hovers, scans the garbage, and watches nothing in particular */
function scoutScript(e, dt) {
  const g = e.g, t = e.st;
  e.want = null; e.anim = 'idle';
  const p = e.body.pos;
  const tx = -37.5 + Math.sin(t * 0.35) * 2.5, tz = -6 + Math.cos(t * 0.27) * 1.5;
  p.x += (tx - p.x) * Math.min(1, dt); p.z += (tz - p.z) * Math.min(1, dt); p.y += (3.2 + Math.sin(t * 1.3) * 0.2 - p.y) * Math.min(1, dt * 2);
  e.yawTarget = Math.PI + Math.sin(t * 0.5) * 0.8; e.aimPitch = -0.4;
  if (e.shrieked) { e.o.script = null; }
}

export function populate(G) {
  const y3 = F[2];
  G.guide.place(...G.anchors.guide);
  // the alley drone (scripted until it is photographed)
  G.enemies.spawn('scout', -37.5, 0, -30, { id: 'alleyScout', hidden: true, zone: G.zones.get('alley'), noLoot: true });
  // GUIDE interactions while broken
  G.interact.add({ id: 'guide:help', pos: () => G.guide.pos.clone().setY(G.guide.pos.y + 0.6), r: 0.5, range: 2.4,
    label: () => (G.guide.repaired ? null : G.story.step?.id === 'repair' ? 'Repair GUIDE' : G.story.step?.id === 'help' || G.story.step?.id === 'voice' ? 'Kneel beside the robot' : null),
    hold: 0, enabled: () => !G.guide.repaired && G.story.step?.id !== 'repair',
    use: () => { if (G.story.step?.id === 'help' && G.flags['guide:asked']) G.guide.say(pickHelp(G), { mood: 'sad' }); } });
  G.interact.add({ id: 'guide:repair', pos: () => G.guide.pos.clone().setY(G.guide.pos.y + 0.6), r: 0.5, range: 2.4, hold: 4,
    label: () => 'Repair GUIDE', enabled: () => !G.guide.repaired && G.story.step?.id === 'repair',
    holdTick: (dt, t) => { if (Math.random() < dt * 6) G.fx.sparks(G.guide.pos.clone().setY(G.guide.pos.y + 0.7), 0x9fe8ff, 4); if (Math.random() < dt * 2) G.audio.repairSpark?.(G.guide.pos); },
    use: () => { G.setFlag('guide:repaired', true); G.emit({ k: 'fx', n: 'repair', p: G.guide.pos.clone().setY(G.guide.pos.y + 0.7) }); G.emit({ k: 'sfx', n: 'guideBoot' }); } });
  // GUIDE's menu once he works (local: it opens your own panel)
  G.interact.add({ id: 'guide:menu', local: true, pos: () => G.guide.pos.clone().setY(G.guide.pos.y + 0.6), r: 0.5, range: 2.6,
    label: () => { const n = G.photos.filter(p => !p.shown && p.subjects.length).length; return 'GUIDE' + (n ? ` - show ${n} new photo${n > 1 ? 's' : ''}` : ''); },
    enabled: () => G.guide.repaired && !G.story.cineOn, use: () => G.ui.open('guide') });
}
function pickHelp(G) {
  const need = []; if (!G.partyHas('powercell')) need.push('the power cell from my dock in 3C'); if (!G.partyHas('forearm')) need.push('my arm, in 3B'); if (!G.partyHas('harness')) need.push('a harness from the fuse closet');
  return need.length ? 'Still need ' + need.join(', and ') + '.' : 'That\'s everything. Hold them in place for me.';
}
