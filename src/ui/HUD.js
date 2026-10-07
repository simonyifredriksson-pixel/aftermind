/* HUD.js - the little that stays on screen.

   Bottom left: health and stamina (stamina only while it is not full).
   Bottom right: flashlight battery, spare batteries, the tool in hand.
   Centre: a pin-prick crosshair and the interaction prompt (with a hold
   ring). Top left: the current objective - it shows when it changes and
   fades; hold Tab to see it again. Subtitles at the bottom. The camera's
   viewfinder takes over the whole screen while it is raised. */
import { esc } from '../core/Util.js';
import { TOOLS } from '../data/Items.js';
import { MACHINES } from '../data/Machines.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.g = game;
    const h = $('hud');
    h.innerHTML = `
      <div id="cross"></div>
      <div id="prompt"><svg viewBox="0 0 40 40" class="ring"><circle cx="20" cy="20" r="16"/><circle id="ringfill" cx="20" cy="20" r="16"/></svg><span class="key">E</span><span id="ptext"></span></div>
      <div id="vitals"><div class="bar hp"><i id="hpb"></i></div><div class="bar st" id="stw"><i id="stb"></i></div></div>
      <div id="gear"><div id="tool"></div><div id="batt"><div class="cells" id="cells"></div><span id="spare"></span></div></div>
      <div id="obj"><div class="ot" id="ot"></div><div class="os" id="os"></div></div>
      <div id="subs"></div>
      <div id="toasts"></div>
      <div id="hits"></div>
      <div id="vf"><div class="vfc tl"></div><div class="vfc tr"></div><div class="vfc bl"></div><div class="vfc br"></div><div id="vfbox"><span id="vflab"></span></div><div id="vfweak"></div><div class="vfinfo"><span id="vfzoom">1.0x</span><span id="vfready">FLASH READY</span><span class="rec">&#9679; ANALOG 35</span></div><div class="vfgrid"></div></div>
      <div id="polaroid"><img id="polimg"><div id="polcap"></div></div>
      <div id="save">SAVING</div>
      <div id="hitmark"></div>
      <div id="chatlog"></div>`;
    this.subQ = []; this.objT = 0; this.toastN = 0; this.vfOn = false;
  }
  show(v) { $('hud').classList.toggle('hidden', !v); }
  prompt(text, frac, hold) {
    const p = $('prompt');
    if (!text) { p.classList.remove('on'); this._pt = null; return; }
    if (text !== this._pt) { this._pt = text; $('ptext').textContent = text; }
    p.classList.add('on'); p.classList.toggle('hold', !!hold);
    $('ringfill').style.strokeDashoffset = String(100.5 * (1 - (frac || 0)));
  }
  toast(t) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('toasts').appendChild(d);
    setTimeout(() => d.classList.add('out'), 3200); setTimeout(() => d.remove(), 4000);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  pickup(name, icon) { this.toast('+ ' + name); }
  hitFrom(a) {
    const d = document.createElement('div'); d.className = 'hitdir'; d.style.transform = `translate(-50%,-50%) rotate(${-a}rad)`;
    $('hits').appendChild(d); setTimeout(() => d.remove(), 900);
  }
  hitmark(weak) { const h = $('hitmark'); h.className = weak ? 'on weak' : 'on'; clearTimeout(this._hm); this._hm = setTimeout(() => h.className = '', 180); }
  subtitle(who, text, dur, kind) {
    if (this.g.profile.subs === false && kind !== 'conductor') return;
    const s = $('subs');
    const d = document.createElement('div'); d.className = 'sub ' + kind;
    d.innerHTML = `<b>${esc(who)}</b>${esc(text)}`;
    s.appendChild(d);
    while (s.children.length > 2) s.firstChild.remove();
    setTimeout(() => d.classList.add('out'), dur * 1000); setTimeout(() => d.remove(), dur * 1000 + 600);
  }
  objective(t, sub) {
    if (t === this._ot && sub === this._os) return;
    const changed = t !== this._ot;
    this._ot = t; this._os = sub;
    $('ot').textContent = t || ''; $('os').innerHTML = sub ? esc(sub).replace(/\n/g, '<br>') : '';
    if (changed && t) { this.objT = 8; $('obj').classList.add('new'); setTimeout(() => $('obj').classList.remove('new'), 1200); this.g.audio.objective?.(); }
    else if (t) this.objT = Math.max(this.objT, 4);
  }
  checkpoint() { const s = $('save'); s.classList.add('on'); setTimeout(() => s.classList.remove('on'), 1800); }
  chat(name, t) { const d = document.createElement('div'); d.innerHTML = `<b>${esc(name)}</b> ${esc(t)}`; $('chatlog').appendChild(d); setTimeout(() => d.remove(), 12000); }
  tool(t) { this._tool = null; }
  photoTaken(p) {
    const P = $('polaroid');
    if (p.thumb) $('polimg').src = p.thumb;
    const ms = p.subjects.filter(s => s.kind === 'machine').map(s => this.g.knows(s.type) ? MACHINES[s.type].name : 'unknown machine');
    $('polcap').textContent = ms.length ? ms.join(', ') : p.subjects.length ? 'something strange' : '';
    P.classList.remove('on'); void P.offsetWidth; P.classList.add('on');
    clearTimeout(this._pol); this._pol = setTimeout(() => P.classList.remove('on'), 2600);
  }
  viewfinder(t, subj, zoom, cool) {
    const vf = $('vf');
    const on = t > 0.6;
    if (on !== this.vfOn) { this.vfOn = on; vf.classList.toggle('on', on); $('cross').classList.toggle('off', on); }
    if (!on) return;
    $('vfzoom').textContent = zoom.toFixed(1) + 'x';
    $('vfready').textContent = cool > 0 ? 'CHARGING' : 'FLASH READY';
    const box = $('vfbox'), wk = $('vfweak');
    if (subj) {
      const W = innerWidth, H = innerHeight, x = (subj.sx * 0.5 + 0.5) * W, y = (-subj.sy * 0.5 + 0.5) * H, s = Math.max(60, subj.size * H * 1.4);
      box.style.cssText = `display:block;left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px`;
      box.className = subj.ok ? 'lock' : '';
      $('vflab').textContent = (subj.ok ? '' : 'TOO FAR - ') + (subj.label || (subj.kind === 'subject' ? 'POINT OF INTEREST' : '')) + (subj.dead ? ' (INACTIVE)' : '');
      let html = '';
      for (const w of subj.weak || []) html += `<i style="left:${(w.x * 0.5 + 0.5) * W}px;top:${(-w.y * 0.5 + 0.5) * H}px"></i>`;
      if (html !== this._wk) { wk.innerHTML = html; this._wk = html; }
    } else { box.style.display = 'none'; if (this._wk) { wk.innerHTML = ''; this._wk = ''; } }
  }
  update(dt) {
    const g = this.g, p = g.player, inv = g.inv;
    $('hpb').style.width = p.hp + '%';
    $('hpb').parentElement.classList.toggle('low', p.hp < 30);
    $('stb').style.width = p.stamina + '%';
    $('stw').classList.toggle('show', p.stamina < 99.5);
    $('stw').classList.toggle('ex', p.exhausted);
    // battery: 5 cells
    const b = p.battery, n = Math.ceil(b * 5 - 0.001);
    const key = n + '|' + (p.light ? 1 : 0) + '|' + (b < 0.15 ? 1 : 0);
    if (key !== this._bk) { this._bk = key; let h = ''; for (let i = 0; i < 5; i++) h += `<i class="${i < n ? 'f' : ''}"></i>`; $('cells').innerHTML = h; $('batt').classList.toggle('on', p.light); $('batt').classList.toggle('low', b < 0.15); }
    const sp = (inv.items.battery || 0); const st = sp ? '+' + sp : '';
    if (st !== this._sp) { this._sp = st; $('spare').textContent = st; }
    // tool
    const t = p.tool; let tl = '';
    if (t !== 'none') { const T = TOOLS[t]; tl = `<b>${T.name}</b>`; if (t === 'prod') tl += `<span class="chg"><i style="width:${Math.round((p.prodCharge || 0) * 100)}%"></i></span>`; else if (t !== 'camera') tl += `<span>x${inv.items[t] || 0}</span>`; else { const u = g.photo.unseen; if (u) tl += `<span class="new">${u} new</span>`; } }
    if (tl !== this._tool) { this._tool = tl; $('tool').innerHTML = tl; }
    // objective visibility
    this.objT -= dt;
    const showObj = this.objT > 0 || (g.input.held('Tab') && !g.ui.modal);
    $('obj').classList.toggle('on', showObj && !!this._ot);
  }
}
