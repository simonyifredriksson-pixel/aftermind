/* UI.js - the panels: pause/settings, the pack (inventory + crafting),
   the Field Log (machines GUIDE remembers, with your own photo of each),
   the photo album, recovered memories, GUIDE's menu, notes you read, the
   death screen, and the cards that slide in when GUIDE identifies a machine
   or recovers a memory.

   I = pack, J = Field Log, Esc = pause. While a panel is open the game keeps
   running (it is a horror game - nothing pauses for you) except for the
   pause menu itself in single player. */
import { esc } from '../core/Util.js';
import { COMPONENTS, TOOLS, KEYS, RECIPES, UPGRADES } from '../data/Items.js';
import { MACHINES, MACHINE_ORDER, MEMORIES } from '../data/Machines.js';
import { saveProfile } from '../game/State.js';

const $ = id => document.getElementById(id);
const ICON = {
  battery: '<rect x="8" y="5" width="8" height="15" rx="1.5"/><rect x="10" y="3" width="4" height="2"/>',
  wire: '<path d="M4 16c4-8 12 8 16 0M4 12c4-8 12 8 16 0"/>',
  circuit: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM11 9h5M8 15h4"/>',
  sensor: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
  cell: '<rect x="7" y="4" width="10" height="16" rx="3"/><path d="M12 8l-2 4h4l-2 4"/>',
  servo: '<rect x="5" y="7" width="14" height="10" rx="2"/><circle cx="15" cy="12" r="2.5"/>',
  hydraulic: '<rect x="4" y="9" width="10" height="6" rx="1"/><path d="M14 12h7M19 10v4"/>',
  plate: '<path d="M5 6l7-2 7 2v7c0 4-3 6-7 7-4-1-7-3-7-7z"/>',
  coolant: '<rect x="7" y="6" width="10" height="14" rx="3"/><path d="M10 6V3h4v3M12 10v6M9 13h6"/>',
  core: '<path d="M12 3l7 4v10l-7 4-7-4V7z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-2h5L16 7"/>',
  prod: '<path d="M4 20l9-9M13 11l2-6 4 4-6 2M17 3l1 2M21 7l-2-1"/>',
  emp: '<circle cx="12" cy="13" r="6"/><path d="M12 7V3M9 3h6M9 13l2-3v6l2-3"/>',
  decoy: '<rect x="8" y="5" width="8" height="14" rx="2"/><path d="M4 9c-1 2-1 4 0 6M20 9c1 2 1 4 0 6"/>',
  medkit: '<rect x="4" y="7" width="16" height="12" rx="2"/><path d="M12 10v6M9 13h6M9 7V5h6v2"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
  unknown: '<circle cx="12" cy="12" r="8"/><path d="M10 9.5a2 2 0 1 1 3 1.7c-.8.5-1 1-1 1.8M12 16v.5"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" class="ic">${ICON[k] || ICON.key}</svg>`;

export class UI {
  constructor(game) {
    this.g = game; this.panel = null; this.modal = false; this.tab = 'pack';
    document.addEventListener('keydown', e => this._key(e));
    $('panel').addEventListener('click', e => this._click(e));
    $('panel').addEventListener('input', e => this._input(e));
  }
  get cardT() { return this._card; }
  _key(e) {
    const g = this.g;
    if (g.phase !== 'play' || g.chatOpen) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyI') { this.panel === 'pack' ? this.close() : this.open('pack'); }
    else if (e.code === 'KeyJ') { this.panel === 'log' ? this.close() : this.open('log'); }
    else if (e.code === 'F9' || e.code === 'Backquote') { e.preventDefault(); this.panel === 'admin' ? this.close() : this.open('admin'); }
    else if (e.code === 'Escape' && this.panel && this.panel !== 'death') { this.close(); }
    else if (this.panel === 'guide' && /^Digit[1-5]$/.test(e.code)) { const b = $('panel').querySelectorAll('[data-gm]')[+e.code.slice(5) - 1]; if (b) b.click(); }
    else if (this.panel === 'note' && (e.code === 'KeyE' || e.code === 'Space')) this.close();
  }
  open(name, arg) {
    const g = this.g;
    this.panel = name; this.arg = arg; this.modal = true;
    g.input.unlock(); g.input.blocked = true;
    if (name === 'pause' && !g.net.isOnline) g.paused = true;
    $('panel').className = 'on p-' + name;
    this.render();
    g.audio.uiOpen?.();
  }
  close() {
    const g = this.g; if (!this.panel) return;
    if (this.panel === 'death') return;
    this.panel = null; this.modal = false; g.paused = false;
    $('panel').className = ''; $('panel').innerHTML = '';
    g.input.blocked = false; g.input.lock();
    g.audio.uiClose?.();
  }
  update(dt) { if (this.panel === 'pack' || this.panel === 'guide') { this._rt = (this._rt || 0) - dt; if (this._rt <= 0) { this._rt = 0.5; if (this.panel === 'pack' && this.tab === 'craft') this.render(true); } } }
  render(soft) {
    const g = this.g, P = $('panel');
    const f = this['_' + this.panel]; if (!f) return;
    const html = f.call(this);
    if (soft && html === this._last) return;
    this._last = html; P.innerHTML = html;
  }
  /* ---------------- pause ---------------- */
  _pause() {
    const g = this.g, p = g.profile, n = g.net;
    const co = n.isOnline ? `<div class="co"><div class="h">CO-OP</div>${n.room ? `<div>Room code <b class="code">${esc(n.room)}</b></div>` : ''}<div class="pl">${n.lobbyList.map(x => `<span>${esc(x.name)}${x.host ? ' (host)' : ''}${x.you ? ' (you)' : ''}</span>`).join('')}</div></div>`
      : `<div class="co"><div class="h">CO-OP</div><p>Play this story with up to three friends. They join with a code from the title screen.</p><button data-a="host">OPEN THIS GAME TO FRIENDS</button><div id="hostmsg"></div></div>`;
    return `<div class="box pause"><div class="title">PAUSED</div>
      <div class="btns"><button data-a="resume" class="big">RESUME</button><button data-a="log">FIELD LOG (J)</button><button data-a="pack">PACK (I)</button><button data-a="retry">LOAD LAST CHECKPOINT</button><button data-a="quit">QUIT TO TITLE</button></div>
      <div class="set"><div class="h">SETTINGS</div>
      <label>Mouse sensitivity <input type="range" min="0.2" max="3" step="0.05" value="${p.sens}" data-s="sens"></label>
      <label>Field of view <input type="range" min="60" max="95" step="1" value="${p.fov}" data-s="fov"></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" value="${p.vol}" data-s="vol"></label>
      <label>Music <input type="range" min="0" max="1" step="0.05" value="${p.music}" data-s="music"></label>
      <label>Quality <select data-s="quality"><option ${p.quality === 'high' ? 'selected' : ''} value="high">High</option><option ${p.quality === 'medium' ? 'selected' : ''} value="medium">Medium</option><option ${p.quality === 'low' ? 'selected' : ''} value="low">Low</option></select></label>
      <label class="ck"><input type="checkbox" data-s="invert" ${p.invert ? 'checked' : ''}> Invert mouse Y</label>
      <label class="ck"><input type="checkbox" data-s="subs" ${p.subs !== false ? 'checked' : ''}> Subtitles</label></div>${co}
      <div class="keys">WASD move · Shift sprint · Space jump · C crouch · F flashlight · R swap battery · E interact · 1-5 tools · Q put away · RMB camera/charge · LMB use · Tab objective · I pack · J log · Enter chat</div></div>`;
  }
  /* ---------------- pack: inventory + crafting ---------------- */
  _pack() {
    const g = this.g, inv = g.inv;
    const tabs = `<div class="tabs"><button data-tab="pack" class="${this.tab === 'pack' ? 'on' : ''}">PACK</button><button data-tab="craft" class="${this.tab === 'craft' ? 'on' : ''}">BUILD WITH GUIDE</button><button data-tab="photos" class="${this.tab === 'photos' ? 'on' : ''}">PHOTOS</button><button data-tab="mem" class="${this.tab === 'mem' ? 'on' : ''}">MEMORIES</button></div>`;
    let body = '';
    if (this.tab === 'pack') {
      const comps = Object.entries(inv.items).filter(([k, n]) => n > 0 && COMPONENTS[k]);
      const tools = ['camera', 'prod', 'emp', 'decoy', 'medkit'].filter(t => t === 'camera' ? inv.tools.camera : t === 'prod' ? inv.tools.prod : (inv.items[t] || 0) > 0);
      body = `<div class="cols"><div><div class="h">TOOLS</div><div class="grid">${tools.map(t => `<div class="slot" title="${esc(TOOLS[t].desc)}">${svg(t)}<b>${TOOLS[t].name}</b><span>${t === 'prod' ? Math.round((g.player.prodCharge || 0) * 100) + '%' : t === 'camera' ? (g.photos.length + ' photos') : 'x' + inv.items[t]}</span><em>${TOOLS[t].key}</em></div>`).join('') || '<p class="dim">Nothing yet.</p>'}</div>
        <div class="h">COMPONENTS</div><div class="grid">${comps.map(([k, n]) => { const known = g.known(k); return `<div class="slot ${known ? '' : 'unk'}" title="${esc(known ? COMPONENTS[k].desc : 'GUIDE does not recognise this yet. Photograph the machine it came from.')}">${svg(known ? COMPONENTS[k].icon : 'unknown')}<b>${known ? COMPONENTS[k].name : 'Unknown component'}</b><span>x${n}</span></div>`; }).join('') || '<p class="dim">Empty. Machines and the city are full of parts.</p>'}</div></div>
        <div><div class="h">KEY ITEMS</div><div class="list">${Object.keys(inv.keys).filter(k => inv.keys[k]).map(k => `<div class="row">${svg('key')}<div><b>${esc(KEYS[k]?.name || k)}</b><p>${esc(KEYS[k]?.desc || '')}</p></div></div>`).join('') || '<p class="dim">None.</p>'}</div>
        <div class="h">UPGRADES</div><div class="list">${Object.keys(inv.upgrades).filter(k => inv.upgrades[k]).map(k => `<div class="row"><div><b>${UPGRADES[k].name}</b><p>${UPGRADES[k].desc}</p></div></div>`).join('') || '<p class="dim">None yet.</p>'}</div>
        <div class="h">STATUS</div><p class="dim">Health ${Math.round(g.player.hp)} · Flashlight ${Math.round(g.player.battery * 100)}% · Spare batteries ${inv.items.battery || 0}</p></div></div>`;
    } else if (this.tab === 'craft') {
      const near = g.guide.repaired && g.guide.pos.distanceTo(g.player.pos) < 4.5;
      const known = RECIPES.filter(r => g.recipeKnown(r));
      body = `<p class="lead">${near ? 'GUIDE remembers how to build these. You bring the parts; his hands are steadier than yours.' : 'GUIDE has to be right next to you to build anything.'}</p><div class="recipes">${known.map(r => {
        const have = Object.entries(r.cost).every(([k, n]) => (inv.items[k] || 0) >= n && g.known(k));
        const done = r.once && inv.upgrades[r.out.split(':')[1]]; const isKey = r.key && inv.keys[r.out];
        const name = r.out.startsWith('upgrade:') ? UPGRADES[r.out.split(':')[1]].name : r.out === 'prodcharge' ? 'Prod Recharge' : (TOOLS[r.out]?.name || KEYS[r.out]?.name || COMPONENTS[r.out]?.name || r.out);
        return `<div class="rec ${have && near && !done && !isKey ? 'ok' : ''}"><div class="rn">${svg(TOOLS[r.out] ? r.out : COMPONENTS[r.out] ? COMPONENTS[r.out].icon : 'key')}<b>${esc(name)}</b></div><p>${esc(r.desc)}</p><div class="cost">${Object.entries(r.cost).map(([k, n]) => `<span class="${(inv.items[k] || 0) >= n ? 'h' : 'm'}">${COMPONENTS[k] ? COMPONENTS[k].name : k} ${inv.items[k] || 0}/${n}</span>`).join('')}</div>${done || isKey ? '<em>Done</em>' : `<button data-craft="${r.id}" ${have && near ? '' : 'disabled'}>BUILD</button>`}</div>`;
      }).join('') || '<p class="dim">GUIDE does not remember how to build anything yet. Photograph machines and show him.</p>'}</div>
      <p class="dim small">${RECIPES.length - known.length} more designs are locked in GUIDE's memory.</p>`;
    } else if (this.tab === 'photos') {
      const ph = g.photos.slice().reverse();
      body = `<div class="album">${ph.map(p => `<figure class="${p.shown ? '' : 'new'}">${p.thumb ? `<img src="${p.thumb}">` : '<div class="nothumb"></div>'}<figcaption>${p.subjects.length ? p.subjects.map(s => s.kind === 'machine' ? (g.knows(s.type) ? MACHINES[s.type].name : 'Unknown machine') : 'Something strange').join(', ') : 'Nothing of interest'}${p.shown ? '' : ' <b>NEW</b>'}</figcaption></figure>`).join('') || '<p class="dim">No photos. Raise the camera with right mouse, click to shoot.</p>'}</div>`;
    } else {
      const ms = Object.keys(MEMORIES).filter(k => g.flags['mem:' + k]);
      body = `<div class="mems">${ms.map(k => `<div class="mem"><b>${esc(MEMORIES[k].title)}</b><p>${esc(MEMORIES[k].text)}</p></div>`).join('') || '<p class="dim">GUIDE has not recovered any memories yet.</p>'}</div>`;
    }
    return `<div class="box pack">${tabs}${body}<div class="foot">I or Esc to close</div></div>`;
  }
  /* ---------------- Field Log ---------------- */
  _log() {
    const g = this.g;
    const sel = this.arg || MACHINE_ORDER.find(t => g.knows(t)) || 'scout';
    const list = MACHINE_ORDER.map(t => { const k = g.knows(t); return `<button data-m="${t}" class="${k ? '' : 'unk'} ${t === sel ? 'on' : ''}">${k ? MACHINES[t].name : '? ? ?'}</button>`; }).join('');
    let page = '';
    if (g.knows(sel)) {
      const M = MACHINES[sel], ph = g.logPhotos?.[sel];
      page = `<div class="entry"><div class="eh"><div><div class="model">${esc(M.model)}</div><div class="name">${esc(M.name)}</div><div class="threat">${'&#9650;'.repeat(M.threat)}<span>${'&#9650;'.repeat(Math.max(0, 6 - M.threat))}</span></div></div>${ph ? `<img src="${ph}">` : ''}</div>
        <dl><dt>Appearance</dt><dd>${esc(M.look)}</dd><dt>Behaviour</dt><dd>${esc(M.behaviour)}</dd><dt>Attacks</dt><dd>${esc(M.attacks)}</dd><dt>Weakness</dt><dd class="weak">${esc(M.weakText)}</dd>
        <dt>Components</dt><dd>${M.parts.map(p => COMPONENTS[p].name).join(', ') || '-'}</dd><dt>Uses</dt><dd>${esc(M.uses)}</dd>${M.unlocks ? `<dt>Unlocked</dt><dd>${esc(M.unlocks)}</dd>` : ''}</dl>
        <div class="quote">"${esc(M.recognise[M.recognise.length - 1])}"<span>- GUIDE</span></div></div>`;
    } else page = `<div class="entry locked"><p>GUIDE does not remember this machine.</p><p class="dim">Photograph it, then show him the photo.</p></div>`;
    const n = MACHINE_ORDER.filter(t => g.knows(t)).length;
    return `<div class="box log"><div class="title">FIELD LOG <span>${n} / ${MACHINE_ORDER.length} machines remembered</span></div><div class="lcols"><div class="mlist">${list}</div>${page}</div><div class="foot">J or Esc to close</div></div>`;
  }
  /* ---------------- GUIDE's menu ---------------- */
  _guide() {
    const g = this.g, n = g.photos.filter(p => !p.shown).length;
    const opts = [];
    opts.push(`<button data-gm="photos" ${n ? '' : 'class="dim"'}><em>1</em>Show him your photos${n ? ` <b>(${n} new)</b>` : ''}</button>`);
    opts.push(`<button data-gm="craft"><em>2</em>Build something</button>`);
    opts.push(`<button data-gm="talk"><em>3</em>"What should we do?"</button>`);
    opts.push(`<button data-gm="log"><em>4</em>Field Log</button>`);
    opts.push(`<button data-gm="close"><em>5</em>Never mind</button>`);
    return `<div class="box guide"><div class="gh">GUIDE</div>${opts.join('')}</div>`;
  }
  _note() {
    const o = this.arg;
    return `<div class="box note ${o.kind || 'paper'}">${o.kind === 'terminal' ? '<div class="scan"></div>' : ''}<div class="nt">${esc(o.title)}</div><div class="nb">${esc(o.text).replace(/\n/g, '<br>')}</div><div class="foot">E or Esc to close</div></div>`;
  }
  _admin() { return this.g.admin.html(); }
  _death() { return `<div class="box death"><div class="dt">SIGNAL LOST</div><p>${esc(this.deathLine || 'The machines do not stop. Neither can you.')}</p><button data-a="retry" class="big">TRY AGAIN</button><button data-a="quit">QUIT TO TITLE</button></div>`; }
  credits() { this.open('credits'); this.g.audio.setMusic?.('safe'); }
  _credits() {
    const g = this.g, n = Object.keys(g.flags).filter(k => k.startsWith('m:') && g.flags[k]).length, m = Object.keys(g.flags).filter(k => k.startsWith('mem:') && g.flags[k]).length;
    return `<div class="box credits"><div class="logo" style="font-size:54px">AFTERMIND</div><p class="lead">Two million, one hundred and forty-four thousand people woke up that week, under a city that had kept them safe in the worst way it knew how.</p><p class="lead">The machines came back slowly. They asked a lot of questions. Some of them apologised.</p><p class="lead">GUIDE never got his memories back. He made new ones. He still puts sugar in the soup.</p><div class="h">YOUR RECORD</div><p class="dim">Machines remembered: ${n} / 11 &middot; Memories recovered: ${m} / 7 &middot; Photos taken: ${g.photos.length}</p><div class="h">THANK YOU FOR PLAYING</div><button data-a="quit" class="big">BACK TO THE TITLE</button></div>`;
  }
  death() { this.deathLine = ['GUIDE: "Get up. Please get up."', 'The rain keeps falling.', 'Somewhere, a machine logs one less heartbeat.'][Math.floor(Math.random() * 3)]; this.open('death'); }
  note(o) { this.open('note', o); this.g.audio.pickup?.('note'); }

  /* ---------------- cards (no pause) ---------------- */
  entryCard(type) {
    const M = MACHINES[type]; if (!M) return;
    const c = document.createElement('div'); c.className = 'card entry';
    c.innerHTML = `<div class="k">FIELD LOG UPDATED</div><div class="n">${esc(M.name)}</div><div class="w">${esc(M.weakText)}</div>${M.unlocks ? `<div class="u">${esc(M.unlocks)}</div>` : ''}<div class="hint">J to open the Field Log</div>`;
    $('cards').appendChild(c); setTimeout(() => c.classList.add('out'), 7000); setTimeout(() => c.remove(), 8000);
  }
  memoryCard(id) {
    const M = MEMORIES[id]; if (!M) return;
    const c = document.createElement('div'); c.className = 'memcard';
    c.innerHTML = `<div class="k">MEMORY RECOVERED</div><div class="n">${esc(M.title)}</div><p>${esc(M.text)}</p>`;
    document.body.appendChild(c); this._card = true;
    setTimeout(() => c.classList.add('out'), 9000); setTimeout(() => { c.remove(); this._card = false; }, 10500);
  }
  /* ---------------- events ---------------- */
  _click(e) {
    const g = this.g, t = e.target.closest('button'); if (!t) return;
    g.audio.uiClick?.();
    if (t.dataset.adm) { this.g.admin.act(t.dataset.adm, t.dataset.arg); this.render(); return; }
    if (t.dataset.tab) { this.tab = t.dataset.tab; this.render(); return; }
    if (t.dataset.m) { this.arg = t.dataset.m; this.render(); return; }
    if (t.dataset.craft) { const r = RECIPES.find(x => x.id === t.dataset.craft); if (r && g.craft(r)) { g.hud.toast('Built: ' + (t.closest('.rec').querySelector('b').textContent)); g.guide.bark('built', true); } this.render(); return; }
    if (t.dataset.gm) {
      const k = t.dataset.gm;
      if (k === 'photos') { this.close(); const n = g.photo.showToGuide(); if (!n && !g.photos.some(p => !p.shown)) {} }
      else if (k === 'craft') { this.tab = 'craft'; this.open('pack'); }
      else if (k === 'talk') { this.close(); g.act('guideTalk'); }
      else if (k === 'log') this.open('log');
      else this.close();
      return;
    }
    const a = t.dataset.a;
    if (a === 'resume') this.close();
    else if (a === 'log') this.open('log');
    else if (a === 'pack') { this.tab = 'pack'; this.open('pack'); }
    else if (a === 'retry') { this.panel = null; this.modal = false; $('panel').className = ''; g.paused = false; g.input.blocked = false; g.retry(); g.input.lock(); }
    else if (a === 'quit') { g.saveNow(); location.href = location.pathname; }
    else if (a === 'host') { const m = $('hostmsg'); m.textContent = 'Opening a room...'; g.net.host({ name: g.profile.name, look: g.profile.look, key: g.profile.key }).then(code => { this.render(); g.hud.toast('Room code: ' + code); }).catch(err => { m.textContent = err.message; }); }
  }
  _input(e) {
    if (e.target.dataset.admspeed !== undefined) { this.g.timeScale = +e.target.value; const l = document.getElementById('admspd'); if (l) l.textContent = this.g.timeScale.toFixed(2) + 'x'; return; }
    const g = this.g, s = e.target.dataset.s; if (!s) return;
    const p = g.profile; const v = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : +e.target.value;
    p[s] = v; saveProfile(p);
    if (s === 'sens') g.input.sensitivity = v; if (s === 'invert') g.input.invertY = v;
    if (s === 'vol' || s === 'music') g.audio.setVolume?.(p.vol, p.music);
    if (s === 'fov') { g.camera.fov = v; g.camera.updateProjectionMatrix(); }
    if (s === 'quality') g.applyQuality?.(v);
  }
}
