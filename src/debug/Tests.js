/* Tests.js - screenshots and scripted checks.

   ?shot=at&x=&y=&z=&yaw=&pitch=&light=1&t=2      stand somewhere and look
   ?shot=<name>&skip=<step>                       (skip jumps the story first)
   ?script=all                                     run the checks, results in the top-left
   Headless Chrome renders slowly, so game time is advanced with update()
   calls in a loop before the picture is taken. */
import * as THREE from '../../lib/three.module.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
function out(lines) {
  const d = document.createElement('pre'); d.id = 'testout';
  d.style.cssText = 'position:fixed;left:0;top:0;z-index:100;background:rgba(0,0,0,.8);color:#9f9;font:13px monospace;padding:8px;max-width:60vw;max-height:95vh;overflow:auto;margin:0;white-space:pre-wrap';
  d.textContent = lines.join('\n'); document.body.appendChild(d);
}
function sim(g, secs, dt = 0.05) { for (let t = 0; t < secs; t += dt) { g.update(dt); g.input.endFrame(); } }

export async function shot(g, name, P) {
  g.noRender = false;
  const n = k => (P.has(k) ? +P.get(k) : null);
  g.player.light = P.get('light') === '1';
  sim(g, +(P.get('t') || 0.5));
  if (name === 'at' || P.has('x')) {
    const x = n('x'), y = n('y') ?? 0, z = n('z');
    g.player.place(x, y, z, n('yaw') || 0); g.player.pitch = n('pitch') || 0;
    if (P.has('gx')) g.guide.place(n('gx'), n('gy') ?? y, n('gz'), n('gyaw') || 0);
    if (P.has('repaired')) g.flags['guide:repaired'] = true, g._fire('guide:repaired', true);
  }
  if (P.has('enemy')) { const e = g.enemies.spawn(P.get('enemy'), n('ex'), n('ey') ?? 0, n('ez'), { yaw: n('eyaw') || 0 }); e.setState('idle'); }
  if (P.has('tool')) { g.inv.tools.camera = true; g.inv.tools.prod = true; g.view.select(P.get('tool')); }
  sim(g, +(P.get('t2') || 1));
  g.player.pitch = n('pitch') || 0; if (P.has('yaw')) g.player.yaw = n('yaw');
  sim(g, 0.05);
  if (P.has('ui')) g.ui.open(P.get('ui'), P.get('arg'));
  g.paused = true;
  window.__render?.();
  const info = [`zone ${g.zone?.id} pos ${g.player.pos.x.toFixed(1)},${g.player.pos.y.toFixed(1)},${g.player.pos.z.toFixed(1)} step ${g.story.step?.id} tris ${g.renderer.info.render.triangles} calls ${g.renderer.info.render.calls}`];
  if (window.__logs?.length) info.push(...window.__logs.slice(-6));
  if (!P.has('clean')) out(info);
  window.__shotReady = true;
}

const use = (g, id) => { const o = g.interact.byId.get(id); if (!o) throw new Error('no interactable ' + id); o.use(g.me); };
const waitFor = async (g, f, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) { g.update(dt); g.input.endFrame(); await null; if (f()) return true; } return f(); };
async function play(g, ok) {
  // -1. jumping into furniture never drops you through the floor
  { let lowest = 99, n = 0;
    for (const [x, z] of [[-28.5, 3.3], [-28.2, 3.6], [-28.8, 3.0], [-27.6, 4.2], [-30.5, 2.4], [-30.5, 3.8], [-26.9, 4.9], [-25.6, 3.6], [-31.4, 10.6], [-29.2, 7.6]]) {
      for (const a of [0, 1.6, 3.2, 4.7]) {
        g.player.place(x + Math.sin(a) * 1.3, 7.2, z + Math.cos(a) * 1.3, a); sim(g, 0.1);
        g.input.fake('KeyW', true); g.input.fake('Space', true); g.player.body.vel.y = 6.2; g.player.body.grounded = false;
        for (let t = 0; t < 1.2; t += 0.05) { g.update(0.05); lowest = Math.min(lowest, g.player.pos.y); }
        g.input.fake('KeyW', false); g.input.fake('Space', false); n++;
      }
    }
    ok(lowest > 7.0, 'jumping into furniture in 3C (' + n + ' tries) never drops you below the floor, lowest y=' + lowest.toFixed(2)); }
  // 0. your front door: locked until you take the key, then it opens
  const d3 = g.interact.doors.find(d => d.id === '3c');
  use(g, 'door:3c'); sim(g, 0.5);
  ok(!g.flags['door:3c'] && d3.box.on && /locked, take the key/.test(document.getElementById('toasts').textContent), 'front door locked, message shown');
  use(g, 'pk:key3c'); sim(g, 1.5);
  ok(g.flags['door:3c'] && !d3.box.on, 'taking the key opens the door');
  ok(g.interact.doors.find(d => d.id === 'core2').open && !g.interact.doors.find(d => d.id === 'core2').box.on, 'F2 stairwell door starts open');
  ok(g.interact.doors.find(d => d.id === 'lobby1').open, 'lobby door starts open');
  // 1. repairing GUIDE
  g.story.devSkip('help'); await waitFor(g, () => g.flags['guide:asked'], 60);
  ok(g.flags['guide:asked'], 'GUIDE asks for help');
  for (const k of ['powercell', 'forearm', 'harness']) use(g, 'pk:' + k);
  await waitFor(g, () => g.story.step.id === 'repair', 3);
  ok(g.story.step.id === 'repair', 'all parts found -> repair step');
  use(g, 'guide:repair'); sim(g, 0.5);
  ok(g.guide.repaired, 'GUIDE repaired');
  // 2. photograph the alley scout and show GUIDE
  g.story.devSkip('scout'); sim(g, 1);
  const sc = g.enemies.get('alleyScout');
  ok(sc && !sc.hidden, 'scout appears in the alley');
  g.inv.tools.camera = true; g.view.select('camera');
  g.player.place(-37.5, 0, 6, 0); sim(g, 0.2);
  const c = sc.center(); const dx = c.x - g.player.pos.x, dz = c.z - g.player.pos.z;
  g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = Math.atan2(c.y - 1.62, Math.hypot(dx, dz)); g.player.lookTarget = null;
  g.input.fakeBtn(2, true); sim(g, 0.5); g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = Math.atan2(c.y - 1.62, Math.hypot(dx, dz)); sim(g, 0.1);
  g.photo.zoom = 2.2; g.photo.snap(); g.input.fakeBtn(2, false); sim(g, 0.2);
  const ph = g.photos[g.photos.length - 1];
  ok(ph && ph.subjects.some(s => s.type === 'scout'), 'photo contains the scout: ' + JSON.stringify(ph?.subjects) + ' thumb ' + (ph?.thumb ? ph.thumb.length : 0));
  g.photo.showToGuide(); await waitFor(g, () => g.knows('scout'), 40);
  ok(g.knows('scout'), 'GUIDE identifies the scout (Field Log)');
  ok(g.known('sensor'), 'optical sensor identified');
  // 3. craft the lock bypass
  g.inv.items.sensor = 1; g.inv.items.circuit = 1; g.inv.items.wire = 2;
  const { RECIPES } = await import('../data/Items.js');
  g.guide.place(g.player.pos.x + 1, g.player.pos.y, g.player.pos.z);
  ok(g.craft(RECIPES.find(r => r.id === 'bypass')) && g.has('bypass'), 'craft lock bypass');
  // 4. the generator puzzle
  g.story.devSkip('fuse'); use(g, 'pk:fuse'); sim(g, 0.2);
  use(g, 'gen'); ok(g.flags.fuseIn, 'fuse fitted');
  use(g, 'primer'); sim(g, 0.2); use(g, 'gen'); sim(g, 0.5);
  ok(g.power.gen && g.power.station, 'generator running, station lights on');
  use(g, 'brk:lift'); sim(g, 0.2);
  ok(!g.power.gen, 'three circuits trip the generator');
  use(g, 'brk:lift'); use(g, 'brk:station'); use(g, 'brk:vent'); use(g, 'primer'); use(g, 'gen'); use(g, 'brk:doors'); use(g, 'brk:lift'); sim(g, 0.3);
  ok(g.power.lift && g.power.doors && !g.power.station, 'rerouted: lift + doors, station dark');
  // 5. ride the elevator down
  g.player.place(69, -10.2, -86, 0); sim(g, 0.3);
  use(g, 'liftgo'); await waitFor(g, () => g.flags.liftAt === 'bottom', 30);
  ok(g.flags.liftAt === 'bottom' && g.player.pos.y < -24, 'elevator carries you down, y=' + g.player.pos.y.toFixed(1));
  // 6. prod combat and weak points
  g.inv.tools.prod = true; g.player.prodCharge = 1; g.view.select('prod');
  g.player.place(69, -26, -95, 0); sim(g, 0.3);
  const cr = g.enemies.spawn('crawler', 69, -26, -96.6, {}); cr.setState('dormant'); sim(g, 0.1);
  { const cc = cr.center(); g.player.yaw = 0; g.player.pitch = Math.atan2(cc.y - (g.player.pos.y + g.player.eye), 1.6); sim(g, 0.05); } const hp0 = cr.hp;
  const o = g.player.eyePos(new THREE.Vector3()), d = g.player.forward(new THREE.Vector3()); const hit = g.enemies.pick(o, d, 3);
  if (hit) g.enemies.hit(cr.id, 24, hit.wp, g.me);
  ok(hit && cr.hp < hp0, 'prod ray hits the crawler (' + (hit ? (hit.wp || 'body') : 'miss') + ') hp ' + hp0 + '->' + cr.hp);
  g.flags['m:crawler'] = true; cr.hp = 100; const before = cr.hp; cr.hurt(10, 'core', null);
  ok(before - cr.hp >= 29, 'known weak point deals x3: ' + (before - cr.hp));
  // 7. FOREMAN: invulnerable until it vents
  g.story.devSkip('foreman'); sim(g, 0.5);
  const f = g.enemies.get('foreman'); g.player.place(230, -26, -205, -Math.PI / 2); sim(g, 1);
  const fh = f.hp; f.hurt(100, 'core', g.player.pos); ok(fh - f.hp < 10, 'FOREMAN shrugs off hits while cooled: -' + (fh - f.hp).toFixed(1));
  g.setFlag('foremanAwake', true); sim(g, 0.2); f.fs.ventT = 0; f.fs.vent = 0; sim(g, 0.3); const fh2 = f.hp; f.hurt(100, 'core', g.player.pos);
  ok(fh2 - f.hp >= 150, 'FOREMAN core hurts while venting: -' + (fh2 - f.hp).toFixed(0));
  // 8. the upload
  g.story.devSkip('defend'); for (const e of g.enemies.list) if (e.zone?.id === 'archive') e.dead = true;
  g.story.data.up = 99; sim(g, 3);
  ok(g.flags.finale, 'upload completes -> finale');
}

export async function run(g, name) {
  g.noRender = true;
  const res = [], ok = (c, m) => res.push((c ? 'PASS ' : 'FAIL ') + m);
  try {
    if (name === 'story' || name === 'all') {
      // every checkpointed step: jump there, check the spawn is on solid ground in a real zone
      for (const s of g.story.steps) {
        if (!s.spawn) continue;
        const errs = (window.__logs || []).length;
        g.story.devSkip(s.id); sim(g, 1.2);
        const sp = g.story.spawn(), p = g.player.pos;
        ok(Math.abs(p.y - sp.y) < 0.6 && g.zone, `step ${s.id}: spawn y=${sp.y.toFixed(1)} -> ${p.y.toFixed(2)} zone ${g.zone?.id}`);
        ok((window.__logs || []).length === errs, `step ${s.id}: no errors ` + (window.__logs || []).slice(errs).join(' | ').slice(0, 300));
      }
      ok(g.nav.nodes.length > 200, 'nav nodes ' + g.nav.nodes.length);
      if (name === 'story') throw { done: true };
    }
    if (name === 'admin') {
      const A = g.admin, click = (k, a) => { A.act(k, a); g.ui.render(); };
      g.ui.open('admin');
      ok(!!document.querySelector('.admin [data-adm="god"]'), 'F9 panel opens with buttons');
      click('god'); g.player.damage(500); ok(g.player.hp === 100, 'god mode: no damage');
      click('tp', 7); sim(g, 0.3); ok(g.zone?.id === 'plaza', 'teleport to the plaza -> zone ' + g.zone?.id);
      const y0 = g.player.pos.y; click('noclip'); g.ui.close(); g.input.fake('Space', true); sim(g, 1); g.input.fake('Space', false);
      ok(g.player.pos.y > y0 + 5, 'noclip flies up: ' + y0.toFixed(1) + ' -> ' + g.player.pos.y.toFixed(1));
      click('noclip'); click('tp', 7); sim(g, 0.5);
      const n0 = g.enemies.list.length; click('spawn', 'hunter'); const h = g.enemies.list[g.enemies.list.length - 1];
      ok(g.enemies.list.length === n0 + 1 && h.type === 'hunter', 'spawn a hunter in front of you');
      click('invisible'); sim(g, 2); ok(h.state !== 'hunt', 'invisible: the hunter does not hunt you (' + h.state + ')');
      click('kill'); ok(h.dead, 'kill nearby');
      click('give'); ok(g.inv.tools.camera && g.inv.tools.prod && g.inv.items.emp >= 5 && g.inv.keys.keycard, 'give everything');
      click('knowall'); ok(g.knows('foreman') && g.flags['mem:kernel'], 'unlock whole Field Log + memories');
      click('step', 'shelter'); sim(g, 0.5); ok(g.story.step.id === 'shelter' && g.zone?.id === 'helix', 'jump to a chapter step -> ' + g.story.step.id + ' in ' + g.zone?.id);
      click('readout'); sim(g, 0.5); ok(/FPS/.test(A.el.textContent), 'position / FPS readout');
      g.ui.open('admin'); window.__render?.();
      throw { done: true };
    }
    if (name === 'camera') {
      // the real path: walk up to the pile, press E on the camera, press 1, hold right mouse
      g.story.devSkip('camera'); sim(g, 1);
      const ia = g.interact.byId.get('pk:camera');
      ok(!!ia, 'camera pickup exists at ' + (ia && ia.pos.toArray().map(v => v.toFixed(1)).join(',')));
      g.player.place(-37.0, 0, 8.4, 2.6); sim(g, 0.2);
      const c = ia.pos; const dx = c.x - g.player.pos.x, dz = c.z - g.player.pos.z;
      g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = Math.atan2(c.y - 1.62, Math.hypot(dx, dz)); sim(g, 0.1);
      g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = Math.atan2(c.y - 1.62, Math.hypot(dx, dz));
      sim(g, 0.05);
      ok(g.interact.focus === ia, 'looking at the camera focuses it: ' + (g.interact.focus?.id || 'nothing') + ' prompt "' + document.getElementById('ptext').textContent + '"');
      g.input.fake('KeyE', true); sim(g, 0.05); g.input.fake('KeyE', false); sim(g, 0.3);
      ok(g.inv.tools.camera, 'E picks up the camera; tools=' + JSON.stringify(g.inv.tools) + ' items=' + JSON.stringify(g.inv.items));
      g.input.fake('Digit1', true); sim(g, 0.05); g.input.fake('Digit1', false); sim(g, 0.3);
      ok(g.player.tool === 'camera', 'pressing 1 equips it: tool=' + g.player.tool + ' HUD "' + document.getElementById('tool').textContent + '"');
      g.input.fakeBtn(2, true); sim(g, 0.5);
      ok(g.photo.raised, 'right mouse raises it');
      g.input.fakeBtn(2, false); sim(g, 0.2);
      g.view.select('none'); sim(g, 0.1);
      g.input.fake('Numpad1', true); sim(g, 0.05); g.input.fake('Numpad1', false); sim(g, 0.2);
      ok(g.player.tool === 'camera', 'numpad 1 also equips it');
      g.view.select('none'); sim(g, 0.1);
      g.input.fakeBtn(2, true); sim(g, 0.6);
      ok(g.player.tool === 'camera' && g.photo.raised, 'right mouse with empty hands takes out and raises the camera');
      g.input.fakeBtn(2, false); sim(g, 0.2);
      throw { done: true };
    }
    if (name === 'play' || name === 'all') await play(g, ok);
    if (name === 'play') throw { done: true };
    // physics: stand on the 3C floor, walk into a wall
    g.player.place(-31, 7.2, 9, 0); sim(g, 0.5);
    ok(Math.abs(g.player.pos.y - 7.2) < 0.05, 'stands on F3 floor y=' + g.player.pos.y.toFixed(2));
    ok(g.zone?.id === 'apt', 'zone apt: ' + g.zone?.id);
    g.player.place(-31, 7.2, 9, Math.PI); g.input.fake('KeyW', true); sim(g, 2); g.input.fake('KeyW', false);
    ok(g.player.pos.z < 11.85, 'wall stops you z=' + g.player.pos.z.toFixed(2));
    // stairs: walk up F2 -> F3 south flight
    g.player.place(-11, 3.6, -2.45, -Math.PI / 2); g.input.fake('KeyW', true); sim(g, 2); g.input.fake('KeyW', false);
    ok(g.player.pos.y > 4.8, 'climbs stairs y=' + g.player.pos.y.toFixed(2));
    // nav
    const p = g.nav.path(-31, 7.2, 3, -14, 7.2, 0);
    ok(!!p && p.length > 1, 'nav path in F3: ' + (p ? p.length : 'none') + ' nodes; total nodes ' + g.nav.nodes.length);
    ok(g.story.steps.length > 5, 'story steps ' + g.story.steps.length);
  } catch (e) { if (!e.done) res.push('ERROR ' + e.message + ' ' + e.stack); }
  const f = res.filter(r => r.startsWith('FAIL') || r.startsWith('ERROR')).length;
  out([`${res.length - f} passed, ${f} failed`, ...res, ...(window.__logs || []).slice(-8)]);
  g.noRender = false; window.__render?.();
  window.__shotReady = true;
}
