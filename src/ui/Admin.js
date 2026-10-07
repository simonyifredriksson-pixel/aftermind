/* Admin.js - the testing panel. F9 (or the ` key) opens it.

   Cheats for you: god mode, noclip (fly through walls: WASD where you
   look, Space up, C down, Shift fast), invisible to machines, heal, full
   battery, every item. Shortcuts through the story: jump to any chapter
   step, finish the current step, teleport to any place, repair GUIDE or
   bring him to you, unlock the whole Field Log, power every circuit.
   Machines: spawn any type in front of you, kill everything nearby.
   Also game speed, a position/FPS readout, and toggles for post effects,
   rain and the HUD.

   World-changing actions only work for the host (or solo). */
import { MACHINES, MEMORIES, MACHINE_ORDER } from '../data/Machines.js';
import { COMPONENTS, KEYS } from '../data/Items.js';
import { esc } from '../core/Util.js';

const PLACES = [
  ['Your flat (3C)', -31.6, 7.2, 9, Math.PI], ['3rd floor corridor', -18, 7.2, 0, -Math.PI / 2], ['2nd floor (dark)', -20, 3.6, 0, Math.PI / 2], ['Lobby', -15, 0, -8, 0],
  ['Alley', -38, 0, 2, Math.PI], ['Meridian Avenue', -20, 0, -22, -Math.PI / 2], ['Helix van', 68, 0, -16, 0], ['Meridian Plaza', 55, 0.15, -40, 0], ['Concord Gardens', 55, 0.25, -50, 0],
  ['Station concourse', 10, -6, -42, Math.PI], ['Platform', 0, -9, -61, -Math.PI / 2], ['Maintenance store', -22, -9, -55, 0], ['Generator room', 62, -10.2, -78, 0],
  ['Tunnels', 69, -26, -95, 0], ['Cable tunnel', 49, -26, -125, 0], ['Sump / Helix door', 61, -26, -146, 0],
  ['Helix shelter', 61, -26, -165, 0], ['Security room', 35, -26, -176, -Math.PI / 2], ['Laboratory 4', 91, -26, -178, 0], ['Director\'s office', 91, -26, -162, Math.PI], ['Charging hall', 61, -26, -195, 0], ['Server room', 34, -26, -204, -Math.PI / 2], ['Freight bay', 93, -26, -205, -Math.PI / 2],
  ['Forge Line 9 dock', 205, -26, -205, -Math.PI / 2], ['Factory hall', 222, -26, -205, -Math.PI / 2], ['Furnace line (A)', 243, -26, -236, 0], ['Assembly line (B)', 280, -26, -205, -Math.PI / 2], ['Cold storage (C)', 243, -26, -172, Math.PI], ['Pod line', 205, -26, -226, Math.PI / 2],
  ['The Archive', 450, -60, -204, Math.PI],
];
const SPAWN = ['scout', 'crawler', 'hunter', 'stalker', 'dog', 'sentinel', 'medic', 'construction', 'heavy', 'unknown'];

export class Admin {
  constructor(game) {
    this.g = game; this.readout = false; this._fps = 60; this._acc = 0; this._n = 0;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;right:10px;top:10px;z-index:25;font:12px "Share Tech Mono",monospace;color:#9ff0c0;background:rgba(0,0,0,.6);padding:6px 9px;white-space:pre;pointer-events:none;display:none';
    document.body.appendChild(this.el);
  }
  html() {
    const g = this.g, host = g.isHost;
    const on = (k, label) => `<button data-adm="${k}" class="${g[k] ? 'on' : ''}">${label}: ${g[k] ? 'ON' : 'off'}</button>`;
    const steps = g.story.steps.map((s, i) => `<button data-adm="step" data-arg="${s.id}" class="${i === g.story.i ? 'on' : ''}" title="${esc(typeof s.obj === 'string' ? s.obj : '')}">${i + 1}. ${s.id}</button>`).join('');
    const places = PLACES.map((p, i) => `<button data-adm="tp" data-arg="${i}">${esc(p[0])}</button>`).join('');
    const spawns = SPAWN.map(t => `<button data-adm="spawn" data-arg="${t}">${t}</button>`).join('');
    const p = g.player.pos;
    return `<div class="box admin">
      <div class="title">ADMIN <span>${host ? 'host / solo' : 'client - world actions are the host\'s'} · F9 or Esc to close</span></div>
      <div class="acols">
        <div>
          <div class="h">YOU</div>
          <div class="abtns">${on('god', 'God mode')}${on('noclip', 'Noclip / fly')}${on('invisible', 'Invisible to machines')}
            <button data-adm="heal">Heal + stamina</button><button data-adm="battery">Full battery + prod</button><button data-adm="give">Give everything</button><button data-adm="readout" class="${this.readout ? 'on' : ''}">Position / FPS: ${this.readout ? 'ON' : 'off'}</button></div>
          <div class="h">GUIDE & STORY</div>
          <div class="abtns"><button data-adm="repair">${g.guide.repaired ? 'Break GUIDE' : 'Repair GUIDE'}</button><button data-adm="bring">Bring GUIDE here</button><button data-adm="knowall">Unlock whole Field Log + memories</button><button data-adm="power">Power every circuit</button><button data-adm="next">Finish current step</button></div>
          <div class="h">MACHINES</div>
          <div class="abtns">${spawns}<button data-adm="kill">Kill everything within 40 m</button><button data-adm="killall">Kill all machines</button></div>
          <div class="h">GAME</div>
          <div class="abtns"><label>Speed <input type="range" min="0.1" max="4" step="0.05" value="${g.timeScale ?? 1}" data-admspeed> <b id="admspd">${(g.timeScale ?? 1).toFixed(2)}x</b></label>
            <button data-adm="post">Post effects: ${g.post?.enabled ? 'ON' : 'off'}</button><button data-adm="rain">Rain: ${g.atmos.rainTarget > 0 ? 'ON' : 'off'}</button><button data-adm="hud">HUD: ${document.getElementById('hud').classList.contains('hidden') ? 'off' : 'ON'}</button><button data-adm="lightning">Lightning</button><button data-adm="scare">Horror event</button></div>
          <div class="dim small">pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · zone ${g.zone?.id || '-'} · step ${g.story.step?.id}</div>
        </div>
        <div><div class="h">JUMP TO CHAPTER STEP</div><div class="abtns steps">${steps}</div></div>
        <div><div class="h">TELEPORT</div><div class="abtns steps">${places}</div></div>
      </div></div>`;
  }
  act(k, arg) {
    const g = this.g, p = g.player, inv = g.inv;
    g.audio.uiClick?.();
    switch (k) {
      case 'god': case 'noclip': case 'invisible': g[k] = !g[k]; if (k === 'god') { p.hp = 100; } g.hud.toast(k + ': ' + (g[k] ? 'ON' : 'off')); break;
      case 'heal': p.hp = 100; p.stamina = 100; p.sedate = 0; p.down = false; break;
      case 'battery': p.battery = 1; p.prodCharge = 1; break;
      case 'give': {
        inv.tools.camera = true; inv.tools.prod = true; p.prodCharge = 1;
        for (const c of Object.keys(COMPONENTS)) inv.items[c] = Math.max(inv.items[c] || 0, 6);
        for (const t of ['emp', 'decoy', 'medkit']) inv.items[t] = Math.max(inv.items[t] || 0, 5);
        for (const kk of Object.keys(KEYS)) { inv.keys[kk] = true; if (g.isHost) g.setFlag('has:' + kk, true); }
        if (g.isHost) { g.setFlag('tool:camera', true); g.setFlag('tool:prod', true); }
        g.hud.toast('Everything is in your pack.'); break;
      }
      case 'readout': this.readout = !this.readout; this.el.style.display = this.readout ? 'block' : 'none'; break;
      case 'repair': if (!g.isHost) break; if (g.guide.repaired) { g.setFlag('guide:repaired', false); g.guide.mode = 'slumped'; } else { g.setFlag('guide:repaired', true); g.guide.follow(); } break;
      case 'bring': if (!g.isHost) break; g.guide.place(p.pos.x + Math.sin(p.yaw) * 1.5, p.pos.y, p.pos.z + Math.cos(p.yaw) * 1.5, p.yaw); if (g.guide.repaired) g.guide.follow(); break;
      case 'knowall': if (!g.isHost) break; for (const t of MACHINE_ORDER) g.setFlag('m:' + t, true); for (const m of Object.keys(MEMORIES)) g.setFlag('mem:' + m, true); g.hud.toast('GUIDE remembers everything now.'); break;
      case 'power': if (!g.isHost) break; for (const c of ['gen', 'station', 'vent', 'doors', 'lift']) g.setPower(c, true); for (const c of ['station', 'vent', 'doors', 'lift']) g.setFlag('brk:' + c, true); g.setFlag('fuseIn', true); break;
      case 'next': if (g.isHost) g.story.advance(); break;
      case 'step': if (g.isHost) { g.story.devSkip(arg); g.hud.toast('Jumped to: ' + arg); } break;
      case 'tp': { const pl = PLACES[+arg]; p.place(pl[1], pl[2] + 0.05, pl[3], pl[4]); if (g.isHost && g.guide.repaired && g.guide.mode !== 'slumped') { g.guide.place(pl[1] + 1, pl[2] + 0.05, pl[3] + 1, pl[4]); g.guide.follow(); } g.hud.toast('Teleported: ' + pl[0]); break; }
      case 'spawn': {
        if (!g.isHost) break;
        const d = 5, x = p.pos.x - Math.sin(p.yaw) * d, z = p.pos.z - Math.cos(p.yaw) * d;
        const gy = g.phys.ground(x, z, p.pos.y + 1, 3);
        const e = g.enemies.spawn(arg, x, gy > -1e8 ? gy : p.pos.y, z, { zone: g.zone, yaw: p.yaw + Math.PI });
        e.setState('idle'); g.hud.toast('Spawned ' + arg); break;
      }
      case 'kill': case 'killall': if (!g.isHost) break; { let n = 0; for (const e of g.enemies.list) if (!e.dead && !e.hidden && e.p.hp < 1e8 && (k === 'killall' || e.pos.distanceTo(p.pos) < 40)) { e.die(); n++; } g.hud.toast(n + ' machines destroyed.'); } break;
      case 'post': if (g.post) g.post.enabled = !g.post.enabled; break;
      case 'rain': g.atmos.rainTarget = g.atmos.rainTarget > 0 ? 0 : 1; break;
      case 'hud': document.getElementById('hud').classList.toggle('hidden'); break;
      case 'lightning': g.atmos.strike(); break;
      case 'scare': { const kinds = ['scrape', 'footsteps', 'whisper', 'flicker', 'blackout', 'silhouette', 'radio']; g.director.fire(kinds[Math.floor(Math.random() * kinds.length)]); break; }
    }
  }
  update(dt) {
    if (!this.readout) return;
    this._acc += dt; this._n++;
    if (this._acc < 0.25) return;
    this._fps = this._n / this._acc; this._acc = 0; this._n = 0;
    const g = this.g, p = g.player.pos, ri = g.renderer.info.render;
    this.el.textContent = `FPS ${this._fps.toFixed(0)}  x${(g.timeScale ?? 1).toFixed(2)}\npos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  yaw ${g.player.yaw.toFixed(2)}\nzone ${g.zone?.id}  step ${g.story.step?.id}\nmachines awake ${g.enemies.list.filter(e => !e.dead && !e.hidden && e.state !== 'dormant').length}  danger ${g.enemies.danger.toFixed(2)}\n${g.god ? 'GOD ' : ''}${g.noclip ? 'NOCLIP ' : ''}${g.invisible ? 'INVISIBLE' : ''}`;
  }
}
