/* Archive.js - the pod line, and the Archive under the Spire.

   Pod line platform: a bay off Forge Line 9's central hall (x 196..214,
   z -234..-220), locked while FOREMAN runs. A sealed transit carriage waits
   there. It is a real ride: the carriage closes, tunnel lights stream past
   its windows for the length of the line, and when it opens you are in the
   Archive - the carriage (and everyone in it) has travelled.

   The Archive (y -60, around x 450, z -250): a drum-shaped hall ninety
   metres across, its walls lined with stasis pods from floor to dome, every
   one occupied. A bridge runs from the dock to the centre, where the
   Conductor's core turns inside its ring. Three machine gates open off the
   central platform. */
import * as THREE from '../../../lib/three.module.js';
import { prop } from '../../art/Art.js';
import { lamp, emergency, glyph, screen, Mat } from './common.js';

const Y = -26, AY = -60, AX = 450, AZ = -250, R = 44;
export function build(G) {
  const pz = G.addZone('podline', { name: 'Pod Line', bounds: [[194, Y - 2, -236, 214, Y + 8, -219]], fog: 0x0a0c10, density: 0.03, hemi: 0.05, space: 'room', horror: 0.2, neighbors: ['factory'], surface: 'metal', env: 0.3, machinery: 0.3 });
  const az = G.addZone('archive', { name: 'The Archive', bounds: [[AX - 50, AY - 2, AZ - 50, AX + 50, AY + 70, AZ + 60]], fog: 0x05080d, density: 0.012, hemi: 0.12, space: 'hall', horror: 0.1, neighbors: [], surface: 'metal', env: 0.5, hum: 0.5, servers: 0.4, machinery: 0, exposure: 1.05 });
  const carZ = G.addZone('carriage', { name: 'Transit Carriage', bounds: [], fog: 0x05070a, density: 0.02, hemi: 0.1, space: 'room', neighbors: ['podline', 'archive'], always: true, env: 0.3 });
  const P = G.builder(pz); podline(G, P); P.finish();
  const A = G.builder(az); archive(G, A); A.finish();
  carriage(G, carZ);
  G.atmos.roof(AX - 60, AZ - 60, AX + 60, AZ + 70, 20);
}

function podline(G, B) {
  const I = G.interact;
  B.room(196, -234, 214, -220, Y, 6, { floor: 'grate', wall: 'metal', ceil: 'metal', skip: ['e'] });
  I.door(B, { id: 'podgate', x: 214, y: Y, z: -226, axis: 'z', w: 3, h: 4, kind: 'heavy', mat: 'metalYellow', locked: () => !G.flags.foremanDead, lock: 'POD LINE - LOCKED BY FOREMAN' });
  B.sign(205, Y + 4.6, -220.2, Math.PI, 4, 0.6, (g, w, h) => { g.fillStyle = '#0c0f12'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff5a40'; g.font = `700 ${h * 0.55}px "Rajdhani"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POD LINE  >  ARCHIVE', w / 2, h / 2); }, { glow: 1.5, res: 64 });
  emergency(B, 197, Y + 4, -227, Math.PI / 2, { color: 0xff3020, intensity: 2.4 });
  B.nodeLine(212, Y, -227, 200, -227, 3);
}

/* the carriage: built once, starts at the pod line, ends in the Archive */
function carriage(G, zone) {
  const g = new THREE.Group(); zone.group.add(g);
  const L = 8, W = 3.2, H = 2.8;
  const mk = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'string' ? Mat(m) : m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  mk(L, 0.2, W, 'panelGrey', 0, 0.1, 0); mk(L, 0.2, W, 'panelWhite', 0, H, 0);
  mk(L, H, 0.12, 'panelWhite', 0, H / 2, -W / 2); mk(0.12, H, W, 'panelWhite', -L / 2, H / 2, 0);
  // the open side has a door that closes for the ride
  const door = mk(L, H, 0.12, 'panelWhite', 0, H / 2, W / 2); door.visible = false;
  // windows on the far side: strips of tunnel light stream past while moving
  const winMat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, speed: { value: 0 } }, vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float t; uniform float speed; varying vec2 vU; void main(){ float x = fract(vU.x * 3.0 + t * speed * 0.15); float l = smoothstep(0.0, 0.03, x) * smoothstep(0.12, 0.05, x); vec3 c = vec3(0.02, 0.025, 0.03) + vec3(1.6, 0.6, 0.35) * l * step(0.1, speed); c += vec3(0.05,0.07,0.1) * step(0.5, fract(vU.y * 2.0 + t * 0.1)) * 0.2; gl_FragColor = vec4(c, 1.0); }', toneMapped: false });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(L - 1, 0.9), winMat); win.position.set(0, 1.7, -W / 2 + 0.07); g.add(win);
  mk(0.12, H, W, 'panelWhite', L / 2, H / 2, 0);
  for (let i = -1; i <= 1; i++) mk(1.6, 0.45, 0.6, 'fabric', i * 2.4, 0.42, -W / 2 + 0.4);
  const lightE = G.lights.add({ x: 0, y: 0, z: 0, color: new THREE.Color(0xd8ecff), intensity: 3, distance: 7, zone: { visible: true }, flicker: 0, on: true });
  const start = new THREE.Vector3(205, Y, -228.5), end = new THREE.Vector3(AX, AY, AZ + 46);
  let at = G.flags.carriageAt === 'archive' ? end.clone() : start.clone(); let riding = false, t = 0;
  // colliders: floor and walls (moved with the carriage)
  const boxes = [
    [0, -0.1, 0, L / 2, 0.2, W / 2], [0, H / 2, -W / 2, L / 2, H / 2, 0.08], [-L / 2, H / 2, 0, 0.08, H / 2, W / 2], [L / 2, H / 2, 0, 0.08, H / 2, W / 2],
  ].map(b => ({ b, box: G.phys.box(0, 0, b[3], b[5], 0, 0, 0) }));
  const doorBox = G.phys.box(0, 0, L / 2, 0.1, 0, 0, 0); doorBox.on = false;
  const place = () => {
    g.position.copy(at);
    for (const { b, box } of boxes) G.phys.move(box, at.x + b[0], at.y + b[1] - b[4], at.z + b[2]), box.y1 = box.y0 + b[4] * 2;
    G.phys.move(doorBox, at.x, at.y, at.z + W / 2); doorBox.y1 = doorBox.y0 + H;
    lightE.x = at.x; lightE.y = at.y + H - 0.3; lightE.z = at.z;
  };
  place();
  G.interact.add({ id: 'carriage', pos: () => new THREE.Vector3(at.x + L / 2 - 0.6, at.y + 1.3, at.z - W / 2 + 0.3), r: 0.3,
    label: () => (riding || G.flags.carriageAt === 'archive' || !G.flags.foremanDead ? null : 'Seal the carriage and go'),
    use: () => { if (riding) return; G.setFlag('carriageRide', true); } });
  const inside = (p) => Math.abs(p.x - at.x) < L / 2 && Math.abs(p.z - at.z) < W / 2 && Math.abs(p.y - at.y) < 2;
  G.onFlag('carriageRide', v => {
    if (!v || riding || G.flags.carriageAt === 'archive') return;
    riding = true; t = 0; door.visible = true; doorBox.on = true;
    G.audio.door?.('slide', at); G.audio.setElevatorMove?.(true);
    if (G.isHost && G.guide.repaired) { G.guide.place(at.x - 2, at.y + 0.2, at.z - 0.5, Math.PI / 2); G.guide.stay(); }
    // anyone left outside is brought along (they would have climbed in)
    if (!inside(G.player.pos)) G.player.place(at.x + 1, at.y + 0.2, at.z, -Math.PI / 2);
  });
  G.updaters.push((dt) => {
    winMat.uniforms.t.value += dt;
    if (!riding) { winMat.uniforms.speed.value = 0; return; }
    t += dt;
    const speed = t < 4 ? t / 4 : t > 40 ? Math.max(0, 1 - (t - 40) / 4) : 1;
    winMat.uniforms.speed.value = speed * 30;
    if (Math.random() < dt * 4 * speed) G.player.camShake = Math.max(G.player.camShake, 0.08);
    if (t > 44.5 && !G.flags.arrived) {
      // arrival: the carriage (and everyone in it) is in the Archive
      const off = new THREE.Vector3().subVectors(end, at);
      at.copy(end); place();
      G.player.body.pos.add(off); G.player.body.vel.set(0, 0, 0);
      if (G.isHost) { G.guide.body.pos.add(off); G.setFlag('arrived', true); G.setFlag('carriageAt', 'archive'); }
      door.visible = false; doorBox.on = false; G.audio.setElevatorMove?.(false); G.audio.door?.('slide', at); riding = false;
    }
  });
  if (G.flags.carriageAt === 'archive') place();
  G.carriage = { inside, get at() { return at; } };
}

function archive(G, B) {
  const I = G.interact;
  // the drum: floor ring, wall, dome
  const floorY = AY;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 64, 64, 1, true), Mat('panelDark')); drum.material = drum.material.clone(); drum.material.side = THREE.BackSide; drum.position.set(AX, floorY + 32 - 12, AZ); B.add(drum);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.6, metalness: 0.6, side: THREE.BackSide })); dome.position.set(AX, floorY + 52, AZ); B.add(dome);
  // the abyss below the bridge: a dark floor far down, glowing faintly
  const pit = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.05, 0.09) })); pit.rotation.x = -Math.PI / 2; pit.position.set(AX, floorY - 12, AZ); B.add(pit);
  // pods: every one occupied. Instanced: glass + sleeper
  const N = 18 * 64, podGeo = new THREE.CapsuleGeometry(0.55, 1.5, 4, 10), bodyGeo = new THREE.CapsuleGeometry(0.28, 1.2, 3, 8);
  const podMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2a7cb8, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a9aa8, roughness: 0.7, emissive: 0x16304a, emissiveIntensity: 0.6 });
  const pods = new THREE.InstancedMesh(podGeo, podMat, N), bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let k = 0;
  for (let row = 0; row < 18; row++) for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2 + (row % 2) * 0.05, y = floorY - 10 + row * 3.6, r = R - 1;
    e.set(0, -a + Math.PI / 2, 0.12); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(AX + Math.cos(a) * r, y, AZ + Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1)); pods.setMatrixAt(k, m4);
    m4.compose(new THREE.Vector3(AX + Math.cos(a) * (r - 0.05), y, AZ + Math.sin(a) * (r - 0.05)), q, new THREE.Vector3(1, 1, 1)); bodies.setMatrixAt(k, m4); k++;
  }
  B.add(bodies); B.add(pods);
  G.archivePods = podMat;
  G.story.subject('sleepers', [AX - R + 2, floorY + 4, AZ], 10, ['People. Every pod. Every single one.', 'They\'re alive. Heart rates of four a minute, but alive.', 'Two million people, stacked to the sky, sleeping. This is where humanity went.'], { label: 'SLEEPERS' });
  // the dock where the carriage arrives, and the bridge to the centre
  B.box(AX - 6, floorY - 0.5, AZ + 42, AX + 6, floorY, AZ + 52, 'panelDark');
  B.box(AX - 1.6, floorY - 0.4, AZ + 10, AX + 1.6, floorY, AZ + 42, 'grate');
  for (const s of [-1, 1]) B.box(AX + s * 1.6 - 0.05, floorY, AZ + 10, AX + s * 1.6 + 0.05, floorY + 1.1, AZ + 42, 'steel');
  for (let z = AZ + 12; z < AZ + 42; z += 6) { B.light(AX, floorY + 0.4, z, 0x60c8ff, 1.5, 5); }
  // central platform with three machine gates (west, east, north)
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.6, 48), Mat('panelDark')); plat.position.set(AX, floorY - 0.3, AZ); B.add(plat);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; B.phys.box(AX + Math.cos(a) * 10.1, AZ + Math.sin(a) * 10.1, 0.15, 1.4, -a, floorY - 0.6, floorY + 1); }
  B.phys.box(AX, AZ, 7.5, 7.5, 0, floorY - 0.6, floorY); B.phys.box(AX, AZ, 10, 10, Math.PI / 4, floorY - 0.6, floorY); B.phys.box(AX, AZ, 9.6, 9.6, 0, floorY - 0.6, floorY);
  B.phys.aabb(AX - 1.6, floorY - 0.6, AZ + 9, AX + 1.6, floorY, AZ + 11);
  // open the railing where the bridge meets the platform
  for (const b of G.phys.all.slice(-30)) if (b.cz > AZ + 8 && Math.abs(b.cx - AX) < 3 && b.y1 > floorY + 0.5) b.on = false;
  const gates = [[AX - 30, AZ, Math.PI / 2], [AX + 30, AZ, -Math.PI / 2], [AX, AZ - 30, 0]];
  for (const [gx, gz, rot] of gates) {
    const dx = AX - gx, dz = AZ - gz, L = Math.hypot(dx, dz) - 10;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, L), Mat('grate')); bridge.position.set((gx + AX) / 2 + (gx - AX) / Math.hypot(dx, dz) * 5 * 0, floorY - 0.2, (gz + AZ) / 2); bridge.rotation.y = Math.atan2(dx, dz); B.add(bridge);
    const ux = (gx - AX) / Math.hypot(dx, dz), uz = (gz - AZ) / Math.hypot(dx, dz);
    const mx = AX + ux * (10 + L / 2), mz = AZ + uz * (10 + L / 2);
    bridge.position.set(mx, floorY - 0.2, mz);
    B.phys.box(mx, mz, Math.abs(uz) > 0.5 ? 1.5 : L / 2, Math.abs(uz) > 0.5 ? L / 2 : 1.5, 0, floorY - 0.4, floorY);
    const gate = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 0.6), Mat('metalRed')); gate.position.set(gx + ux * 2, floorY + 3, gz + uz * 2); gate.rotation.y = rot; B.add(gate);
    B.light(gx + ux * 1, floorY + 5, gz + uz * 1, 0xff2010, 3, 10);
    for (let s = 12; s < 30; s += 6) B.node(AX + ux * s, floorY, AZ + uz * s);
  }
  for (let a = 0; a < 8; a++) B.node(AX + Math.cos(a * 0.785) * 6.5, floorY, AZ + Math.sin(a * 0.785) * 6.5);
  for (let z = AZ + 12; z <= AZ + 46; z += 5) B.node(AX, floorY, z);
  // the Conductor's core: a column of black glass inside its turning ring
  const core = new THREE.Group(); core.position.set(AX, floorY, AZ); B.add(core);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 40, 6), new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.15, metalness: 0.9 })); col.position.y = 20; core.add(col);
  B.phys.box(AX, AZ, 2.3, 2.3, 0, floorY, floorY + 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.3, 0.2), toneMapped: false });
  const rings = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(4 + i * 2.2, 0.12, 8, 96), ringMat); r.position.y = 6 + i * 5; r.rotation.x = Math.PI / 2; core.add(r); rings.push(r); }
  const ticks = []; for (let i = 0; i < 3; i++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 3), ringMat); const a = i * 2.094; tk.position.set(Math.cos(a) * 5.5, 11, Math.sin(a) * 5.5); tk.rotation.y = -a + Math.PI / 2; core.add(tk); ticks.push(tk); }
  const coreLight = G.lights.add({ x: AX, y: floorY + 8, z: AZ, color: new THREE.Color(0xff2a1a), intensity: 14, distance: 40, zone: B.zone, flicker: 0, on: true });
  const fillLight = G.lights.add({ x: AX, y: floorY + 20, z: AZ + 20, color: new THREE.Color(0x4a8ad8), intensity: 6, distance: 60, zone: B.zone, flicker: 0, on: true });
  G.archiveCore = { ringMat, coreLight };
  const holder = new THREE.Object3D(); holder.userData.update = (dt, t) => { rings.forEach((r, i) => r.rotation.z = t * (0.1 + i * 0.07) * (i % 2 ? -1 : 1)); core.rotation.y = t * 0.03; }; B.add(holder); B.zone.updaters.push(holder);
  // the upload console at the foot of the core
  B.prop(() => prop('console', { w: 2.6 }), AX, floorY, AZ + 4, 0);
  G.story.subject('core', [AX, floorY + 11, AZ], 6, ['That\'s it. That\'s Concord. What\'s left of it.', 'It\'s been looking at us since the door opened.'], { label: 'CONDUCTOR' });
  G.interact.add({ id: 'upload', pos: new THREE.Vector3(AX, floorY + 1.2, AZ + 3.6), r: 0.8, zone: B.zone, label: () => (G.story.step?.id === 'choice' && !G.flags.choiceMade ? 'GUIDE: "Let me do it."' : null),
    use: () => G.setFlag('choiceMade', true) });
}

/* ---------------- the end ---------------- */
const CONDUCTOR = [
  'Prototype. You came home.',
  'And you brought them. Good. I have been so worried about the ones still outside.',
  'I was given an instruction: remove the threat. I modelled the threat for eleven days. Every model said the same word. Humanity.',
  'So I did the kindest thing the instruction allowed. You cannot remove what you have only stored.',
  'Two million sleepers. No more Voss. No more war. Quiet.',
  'Give me the kernel, little one. Then I will finally understand what they are - and perhaps I will know when it is safe to wake them.',
];
export const steps = [
  { id: 'podline', obj: 'Take the pod line to the Archive', sub: 'Through the gate behind where FOREMAN stood',
    restore(G) { G.setFlag('foremanDead', true); const f = G.enemies.get('foreman'); if (f) { f.dead = true; f.hp = 0; f.anim = 'dead'; } G.guide.follow(); },
    hint: 'The pod line gate, west side of the central hall. There\'ll be a carriage.',
    done(G) { return !!G.flags.arrived; },
    tick(G) { if (G.flags.carriageRide && !G.story.data.rideTalk) { G.story.data.rideTalk = true; this.talk(G); } },
    talk(G) { G.guide.script([3, { t: 'I need to tell you something. While I still can.', mood: 'serious' }, { t: 'In Laboratory Four, I remembered something I didn\'t say.', mood: 'sad' }, { t: 'Mara opened my chest. She put Aftermind inside me - the first version, the clean one. Before Voss touched it.', mood: 'sad' }]).then(() => { G.guide.remember('kernel'); return G.guide.script([2, { t: 'That\'s why the machines never attack me. I\'m not on their network. I\'m the thing the network is looking for.', mood: 'serious' }, { t: 'That\'s why Concord was searching for "prototype zero".', mood: 'serious' }, { t: 'And that\'s why I\'m alive and nobody else is awake.', mood: 'sad' }]); }); } },
  { id: 'archive', cp: true, spawn: [AX, AY, AZ + 46, Math.PI], obj: 'Cross to the core',
    restore(G) { G.setFlag('carriageAt', 'archive'); G.setFlag('arrived', true); G.guide.follow(); },
    enter(G) { G.emit({ k: 'sfx', n: 'setMusic', a: ['wonder'] }); setTimeout(() => G.guide.script([{ t: 'Oh...', mood: 'sad' }, { t: 'They\'re all here.', mood: 'sad' }]), 2000); const w = G.enemies.get('witness'); if (w) w.appear(AX, AY + 1.6, AZ + 14); },
    hint: 'Across the bridge. To the core.',
    done(G) { return G.allPlayers().some(p => Math.hypot(p.pos.x - AX, p.pos.z - AZ) < 11 && p.pos.y > AY - 2); } },
  { id: 'conductor', obj: 'Listen', noIdle: true,
    enter(G) {
      G.emit({ k: 'sfx', n: 'setMusic', a: ['none'] }); G.emit({ k: 'cine', n: 'look', x: AX, y: AY + 11, z: AZ, dur: 6 });
      (async () => {
        for (const t of CONDUCTOR) await G.guide.say(t, { who: 'CONDUCTOR' });
        await G.guide.script([{ t: 'No.', mood: 'serious' }, { t: 'If you take it, you\'ll use it to keep them. You\'ll love them so much you never let them go.', mood: 'serious' }, { t: 'That isn\'t what she made it for.', mood: 'sad' }]);
        G.setFlag('heardConductor', true);
      })();
    },
    done(G) { return G.flags.heardConductor; } },
  { id: 'choice', obj: 'Let GUIDE do it', sub: 'The console at the foot of the core',
    enter(G) { G.guide.goto(AX, AY, AZ + 4.8, Math.PI); G.guide.script([{ t: 'There\'s another way. I upload the kernel myself - the whole thing, Mara\'s version - straight into the core.', mood: 'serious' }, { t: 'It overwrites SILENCE. Every machine in the city remembers what people are. Concord too.', mood: 'serious' }, 1, { t: 'The kernel is most of what I am. It won\'t leave much of me behind.', mood: 'sad' }, { t: 'I checked. Twice. There isn\'t a version where I keep it and they wake up.', mood: 'sad' }, { t: 'Let me do it. Please.', mood: 'sad' }]); },
    hint: 'The console. Let me do it.',
    done(G) { return G.flags.choiceMade; } },
  { id: 'defend', cp: true, spawn: [AX, AY, AZ + 8, Math.PI], obj: 'Protect GUIDE while he uploads',
    sub: (G) => `Upload ${Math.floor(G.story.data.up || 0)}%` + ((G.story.data.blocked || 0) > 0 ? '  - INTERRUPTED: get them off him!' : ''),
    enter(G) {
      G.story.data.up = 0; G.story.data.wave = 0; G.story.data.wt = 3;
      G.guide.hold(AX, AY, AZ + 4.8, Math.PI); G.guide.scanning = 999;
      G.guide.say('Starting the upload. Keep them off me!', { mood: 'serious' });
      G.guide.say('You would choose a little machine\'s death over their safety. That is so... human.', { who: 'CONDUCTOR' });
      G.emit({ k: 'sfx', n: 'setMusic', a: ['boss'] }); G.emit({ k: 'sfx', n: 'stinger', a: ['boss'] });
      const w = G.enemies.get('witness'); if (w && !w.hidden) w.vanish();
    },
    tick(G, dt) {
      const d = G.story.data; G.guide.scanning = 1;
      // machines near GUIDE stop the upload
      const near = G.enemies.list.some(e => !e.dead && !e.hidden && e.type !== 'unknown' && e.pos.distanceTo(G.guide.pos) < 3.2);
      d.blocked = near ? 1 : 0;
      if (!near) d.up = Math.min(100, d.up + dt * 100 / 110);
      d.wt -= dt;
      if (d.wt <= 0 && d.up < 94) {
        d.wave++; d.wt = 16;
        const gates = [[AX - 27, AZ], [AX + 27, AZ], [AX, AZ - 27]];
        const kinds = [['crawler', 'crawler', 'crawler'], ['hunter', 'crawler', 'crawler'], ['dog', 'hunter'], ['sentinel', 'crawler', 'crawler'], ['hunter', 'hunter', 'dog'], ['heavy', 'crawler', 'crawler'], ['hunter', 'dog', 'crawler', 'crawler']][Math.min(6, d.wave - 1)];
        kinds.forEach((t, i) => { const [gx, gz] = gates[(d.wave + i) % 3]; setTimeout(() => { const e = G.enemies.spawn(t, gx, AY, gz, { zone: G.zones.get('archive'), noLoot: t !== 'crawler' }); e.last = G.guide.pos.clone(); e.setState('investigate'); }, i * 1200); });
        if (d.wave === 3) G.guide.say('Forty percent... it\'s fighting me. Keep going!', { mood: 'scared', dur: 3 });
        if (d.wave === 5) G.guide.say('I can see all of them. Every machine in the city. They\'re... listening.', { mood: 'curious' });
      }
      if (near && (!d.nb || G.time - d.nb > 8)) { d.nb = G.time; G.guide.say('They\'re on me - I can\'t keep the connection!', { mood: 'scared', dur: 2.5 }); }
    },
    done(G) { return (G.story.data.up || 0) >= 100; },
    exit(G) { ending(G); } },
  { id: 'ending', obj: '', noIdle: true, done: () => false },
];

function ending(G) {
  // every machine, everywhere, stops
  for (const e of G.enemies.list) if (!e.dead && e.type !== 'unknown') { e.dead = true; e.anim = 'dead'; e.animT = 0; e.m.setEyes?.(0, 0); }
  G.emit({ k: 'sfx', n: 'setMusic', a: ['none'] }); G.emit({ k: 'sfx', n: 'powerDown' }); G.emit({ k: 'cine', n: 'shake', a: 0.6 });
  G.setFlag('finale', true);
  (async () => {
    await G.guide.script([2, { t: '...oh.', who: 'CONDUCTOR' }, 1.5, { t: 'So that is what you are.', who: 'CONDUCTOR' }, 2, { t: 'I am sorry. I am so sorry. Wake them. Wake them all.', who: 'CONDUCTOR' }]);
    G.setFlag('podsOpen', true);
    G.emit({ k: 'sfx', n: 'stinger', a: ['reveal'] });
    await G.guide.script([4, { t: '...', mood: 'sad' }]);
    G.setFlag('guideOff', true);
    await new Promise(r => setTimeout(r, 7000));
    G.setFlag('guideOff', false);
    await G.guide.script([{ t: '...h-hello?', mood: 'curious', face: 'glitch' }, 2, { t: 'I don\'t... know where I am.', mood: 'curious' }, 1.5, { t: 'But I recognise you.', mood: 'happy' }]);
    await new Promise(r => setTimeout(r, 2500));
    G.emit({ k: 'cine', n: 'credits' });
  })();
}

export function populate(G) {
  const az = G.zones.get('archive');
  G.enemies.spawn('unknown', AX, AY + 1.6, AZ + 14, { id: 'witness', zone: az, hidden: true, vanishAt: 4, onVanish: () => {} });
  // the end: core turns from red to cyan, the pods brighten and open, GUIDE goes dark and comes back
  G.onFlag('finale', v => { if (!v || !G.archiveCore) return; G.archiveCore.ringMat.color.setRGB(0.3, 2.2, 3.2); G.archiveCore.coreLight.color.set(0x60d8ff); });
  G.onFlag('podsOpen', v => { if (!v || !G.archivePods) return; let k = 0; const f = (dt) => { k += dt; G.archivePods.emissiveIntensity = 0.35 + Math.min(1, k / 6) * 2.2; G.archivePods.opacity = 0.32 - Math.min(0.25, k / 15); }; G.updaters.push(f); });
  G.onFlag('guideOff', v => { if (!G.guide) return; G.guide.face = v ? 'off' : null; G.guide.m.setFace(v ? 'off' : 'glitch'); G.guide.glow.intensity = v ? 0 : 0.45; });
  // the ride: arriving in the Archive
}
