/* Audio.js - the AFTERMIND sound engine. Every sound is synthesised live with
   the Web Audio API; there are no audio files.

   Signal flow
     one-shots ─ sfx ─┬───────────────────────────┐
     positional ─ [lowpass by distance/behind] ─ [StereoPanner from listener yaw] ─┤
     beds ─ amb ──────┤                            ├─ mix ─ hp ─ mfilt ─ comp ─ out(volume) ─ limiter ─ speakers
     music/tension ───┤                            │
     (sends) ─ revIn ─┬─ convolver 'small' ─ revS ─┤
                      └─ convolver 'large' ─ revL ─┘
   Both impulse responses are generated noise tails. setSpace() crossfades the
   two returns. Far-away sounds get more reverb, less treble; sounds behind
   you are slightly darker, so a listener can tell front from back.

   Everything is silent (and harmless) before unlock(): every public method
   returns early when there is no AudioContext. guideVoice()/conductor() still
   return their duration so subtitles can be timed.

   PUBLIC API
   core      unlock(ctx?)                 create/resume the AudioContext (call on a user gesture). ctx: optional
                                          existing (Offline)AudioContext, used by the test page.
             setVolume(master, music)     0..1 each
             listener = {x,y,z,yaw}       mutate every frame (yaw = camera rotation.y, 0 looks toward -Z)
             setSpace(name)               'outdoor' | 'room' | 'hall' | 'tunnel'
             update(dt)                   EVERY FRAME: smooths beds, runs music/tension/chase, random
                                          ambience, heartbeat/breath, phone rings, decoy beeps
             reset()                      after death/respawn: un-muffle, clear heartbeat/breath/chase
             strict                       true rethrows synthesis errors (tests); default false swallows
   beds      setBeds({rain, rainIndoor, wind, hum, drip, machinery, generator, servers, factory,
                      tunnel, alarm, elevator})       levels 0..1, missing keys keep their value
   player    step(surface, speed, pos?)   surface 'concrete'|'metal'|'water'|'carpet'|'glass'|'tile'|'grate'|'wood'
                                          speed 0 (sneak) .. 0.5 (walk) .. 1 (sprint); values > 1.5 are read as m/s
             jump(), land(force01), hurt(amount01), death()
             breath(stamina01)            EVERY FRAME (exhausted panting below ~0.55)
             heartbeat(intensity01)       EVERY FRAME (0 = no heartbeat)
   light     flashlight(on), flashlightLow(), flicker()
   camera    cameraRaise(), cameraLower(), shutter(), flashCharge(), photoDevelop()
   ui        uiClick(), uiOpen(), uiClose(), pickup(kind 'item'|'battery'|'component'|'note'), craft(),
             deny(), objective(), discovery(), memory(), keyPress()
   GUIDE     guideVoice(text, mood, delay?) -> seconds   mood 'happy'|'neutral'|'curious'|'sad'|'scared'|'serious'
             guideBlip(), guideScan(durationSec), guideBoot(), guideServo(pos), repairSpark(pos)
   enemies   enemy(type, sound, pos)      type 'scout'|'hunter'|'sentinel'|'crawler'|'stalker'|'construction'|
                                          'medic'|'dog'|'heavy'|'unknown'|'foreman'
                                          sound 'idle'|'step'|'alert'|'attack'|'hurt'|'die'|'special'
   world     metalScrape(pos), distantBang(), door(kind, pos) kind 'slide'|'heavy'|'locked'|'wood'|'shutter',
             elevator('start'|'stop'|'ding'), setElevatorMove(on), generatorStart(), powerDown(), powerUp(),
             breaker(on), phoneRing(pos, on), radioStatic(pos, dur), conductor(text) -> seconds,
             spark(pos), glassBreak(pos), emp(pos), decoy(pos, on), prodZap(pos), hitMetal(pos, heavy),
             explosion(pos), keypad(ok), cableConnect(), valve(), footstepsFake(pos), whisperMachine(pos)
   music     setTension(0..1), setChase(bool), stinger('dread'|'jump'|'reveal'|'boss'|'safe'),
             setMusic('none'|'safe'|'wonder'|'boss')
   helpers   tone(freq, dur, type, vol, att, slide, delay, dest), noise(dur, vol, type, freq, q, sweep, delay,
             dest, buf 'white'|'brown'|'pink'|'crackle', att)  (low level, also usable by game code)

   pos everywhere is any {x, y, z} (a THREE.Vector3 works); omit/null = at the player, unpanned. */
let ctx = null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const F = (f) => clamp(fin(f, 440), 8, 20000);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** bed name -> output scale at level 1 (keeps the beds well under the one-shots) */
const BEDS = { rain: 0.2, rainIndoor: 0.3, wind: 0.22, hum: 0.12, drip: 0.05, machinery: 0.18, generator: 0.2, servers: 0.16, factory: 0.22, tunnel: 0.2, alarm: 0.09, elevator: 0.25 };
const SPACES = { outdoor: [0.05, 0.2], room: [0.5, 0.05], hall: [0.15, 0.5], tunnel: [0.22, 0.75] };
const RANGE = { scout: 14, hunter: 14, sentinel: 24, crawler: 9, stalker: 7, construction: 30, medic: 14, dog: 16, heavy: 34, unknown: 18, foreman: 50 };
/** vowel formants F1..F3 (Hz) */
const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2250, 3000], o: [570, 840, 2410], u: [320, 870, 2240], y: [300, 2000, 2700], x: [500, 1500, 2500] };

/** text -> [{v: vowel key, pause: seconds after, end: '.'|'!'|'?'|''}] one per vowel group */
function syllables(text) {
  const out = [];
  const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  for (const w of words) {
    const lw = w.toLowerCase();
    const groups = lw.match(/[aeiouyåäöéü]+/g) || (/[a-z0-9]/.test(lw) ? ['x'] : []);
    for (const g of groups) {
      let v = g[0];
      if (v === 'å') v = 'o'; else if (v === 'ä' || v === 'é') v = 'e'; else if (v === 'ö') v = 'u'; else if (v === 'ü') v = 'y';
      out.push({ v: VOWELS[v] ? v : 'x', pause: 0, end: '' });
    }
    if (!out.length) continue;
    const last = out[out.length - 1];
    if (/[.!?…]["')]*$/.test(w)) { last.pause = 0.28; last.end = (w.match(/[.!?]/g) || ['.']).pop(); }
    else if (/[,;:—-]$/.test(w)) last.pause = 0.14;
    else last.pause = Math.max(last.pause, 0.035);
  }
  return out;
}

export class Audio {
  constructor() {
    this.enabled = false; this.strict = false;
    this.vol = 0.8; this.musicVol = 0.6;
    this.listener = { x: 0, y: 1.6, z: 0, yaw: 0 };
    this.space = 'outdoor';
    this.beds = {};
    for (const k in BEDS) this.beds[k] = { target: 0, level: 0, sent: -1, node: null };
    this.tension = 0; this.tensionLvl = 0; this.chase = false; this.chaseLvl = 0;
    this.musicName = 'none';
    this.hb = 0; this.hbAt = -99; this.stam = 1; this.brAt = -99;
    this.phone = null; this.decoys = []; this.dead = false;
    this.timers = {}; this.clock = 0;
  }

  /* =========================================================== setup */
  unlock(useCtx) {
    if (useCtx) { ctx = useCtx; this._build(); return true; }
    if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {}); return true; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return false; }
    try { this._build(); } catch (e) { ctx = null; this.enabled = false; if (this.strict) throw e; return false; }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  _build() {
    this.enabled = true;
    const sr = ctx.sampleRate, n = Math.floor(sr * 3);
    const mk = (fill, seam) => {
      const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); fill(d);
      if (seam) { const e = d[n - 1] - d[0]; for (let i = 0; i < n; i++) d[i] -= e * i / (n - 1); } // loop without a click
      return b;
    };
    this.bufs = {
      white: mk((d) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }),
      brown: mk((d) => { let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }, true),
      pink: mk((d) => { let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; } }, true),
      crackle: mk((d) => { let v = 0; for (let i = 0; i < n; i++) { if (Math.random() < 0.0016) v = Math.random() * 2 - 1; else v *= 0.62; d[i] = v; } }),
    };
    const curve = (k) => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } return c; };
    this.cSoft = curve(2); this.cHard = curve(7);

    const G = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.limiter.connect(ctx.destination);
    this.out = G(this.vol, this.limiter);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.knee.value = 10; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.comp.connect(this.out);
    this.mfilt = ctx.createBiquadFilter(); this.mfilt.type = 'lowpass'; this.mfilt.frequency.value = 20000; this.mfilt.Q.value = 0.5; this.mfilt.connect(this.comp);
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 24; this.hp.Q.value = 0.7; this.hp.connect(this.mfilt);
    this.mix = G(0.7, this.hp);
    this.revIn = G(1);
    this.convS = ctx.createConvolver(); this.convS.buffer = this._ir(0.9, 3.4, 0.55, 0);
    this.convL = ctx.createConvolver(); this.convL.buffer = this._ir(3.8, 2.3, 0.9, 0.025);
    this.revS = G(0, this.mix); this.revL = G(0, this.mix);
    this.revIn.connect(this.convS); this.convS.connect(this.revS);
    this.revIn.connect(this.convL); this.convL.connect(this.revL);
    this.sfx = G(1, this.mix); this.sfx.connect(G(0.22, this.revIn));
    this.amb = G(1, this.mix); this.amb.connect(G(0.14, this.revIn));
    this.music = G(this.musicVol * 0.55, this.mix); this.music.connect(G(0.35, this.revIn));
    for (const k in this.beds) { this.beds[k].node = null; this.beds[k].sent = -1; }
    this.dr = null; this.cBus = null; this.sBus = null; this.dead = false;
    this.pulseNext = 0; this.hbNext = 0; this.brNext = 0;
    this.setSpace(this.space, true);
    if (this.musicName !== 'none') this._styleSwitch();
  }
  _ir(sec, decay, damp, pre) {
    const sr = ctx.sampleRate, n = Math.max(2, Math.floor(sr * sec)), p = Math.floor(sr * pre);
    const b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = p; i < n; i++) {
        const x = (i - p) / (n - p), a = clamp(1 - damp * Math.pow(x, 0.7), 0.04, 1);
        lp += a * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - x, decay);
      }
      const er = Math.floor(sr * 0.07);
      for (let j = 0; j < 10; j++) { const k = p + Math.floor(Math.random() * er); if (k < n) d[k] += (Math.random() * 2 - 1) * 0.5 * (1 - (k - p) / er); }
    }
    return b;
  }
  setVolume(master, music) {
    this.vol = clamp(fin(master, this.vol), 0, 1); this.musicVol = clamp(fin(music, this.musicVol), 0, 1);
    if (!ctx) return; const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(this.vol, t, 0.03); this.music.gain.setTargetAtTime(this.musicVol * 0.55, t, 0.03);
  }
  setSpace(name, now) {
    if (!SPACES[name]) name = 'outdoor';
    this.space = name; if (!ctx) return;
    const [s, l] = SPACES[name], t = ctx.currentTime, tc = now ? 0.005 : 0.6;
    this.revS.gain.setTargetAtTime(s, t, tc); this.revL.gain.setTargetAtTime(l, t, tc);
  }
  reset() {
    this.dead = false; this.hb = 0; this.stam = 1; this.chase = false;
    if (!ctx) return; const t = ctx.currentTime, p = this.mfilt.frequency;
    p.cancelScheduledValues(t); p.setValueAtTime(clamp(p.value, 20, 20000), t); p.setTargetAtTime(20000, t, 0.3);
  }

  /* =========================================================== low-level helpers */
  _t(dl) { return ctx.currentTime + Math.max(0, fin(dl, 0)); }
  /** one oscillator with an exponential envelope; returns the OscillatorNode (or null) */
  tone(freq, dur, type = 'sine', vol = 0.2, att = 0.005, slide = 0, delay = 0, dest = null) {
    if (!ctx || !(vol >= 0.002)) return null;
    dur = Math.max(0.01, fin(dur, 0.1)); att = clamp(fin(att, 0.005), 0.0005, dur * 0.9);
    const t = this._t(delay), f0 = F(freq);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (slide && slide !== 1) o.frequency.exponentialRampToValueAtTime(F(f0 * slide), t + dur);
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); // value 0 first: no full-gain sample before t
    g.gain.exponentialRampToValueAtTime(Math.min(vol, 1), t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  /** filtered noise burst. buf: 'white'|'brown'|'pink'|'crackle' */
  noise(dur, vol, type = 'lowpass', freq = 1000, q = 1, sweep = 0, delay = 0, dest = null, buf = 'white', att = 0.002) {
    if (!ctx || !(vol >= 0.002)) return null;
    dur = Math.max(0.01, fin(dur, 0.1)); att = clamp(fin(att, 0.002), 0.0005, dur * 0.9);
    const t = this._t(delay);
    const s = ctx.createBufferSource(); s.buffer = this.bufs[buf] || this.bufs.white; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(F(freq), t); f.Q.value = clamp(fin(q, 1), 0.0001, 40);
    if (sweep && sweep !== 1) f.frequency.exponentialRampToValueAtTime(F(freq * sweep), t + dur);
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(vol, 1.5), t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.05);
    return f;
  }
  /** gain node with an attack/hold/exp-release envelope, already connected to dest */
  _env(dest, t, peak, att, dur, hold = 0) {
    const g = ctx.createGain(); peak = clamp(fin(peak, 0.1), 0.0002, 1.5);
    dur = Math.max(0.02, dur); att = clamp(att, 0.001, dur * 0.9); hold = clamp(hold, 0, Math.max(0, dur - att - 0.01));
    g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att);
    if (hold > 0) g.gain.setValueAtTime(peak, t + att + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest); return g;
  }
  _osc(type, f, t, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(F(f), t); o.start(t); o.stop(t + dur + 0.06); return o; }
  _src(buf, t, dur) { const s = ctx.createBufferSource(); s.buffer = this.bufs[buf] || this.bufs.white; s.loop = true; s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.06); return s; }
  _filt(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = F(f); b.Q.value = q; return b; }
  _shaper(hard) { const w = ctx.createWaveShaper(); w.curve = hard ? this.cHard : this.cSoft; return w; }
  _lfo(param, rate, depth, t, dur, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = clamp(fin(rate, 1), 0.01, 2000);
    const g = ctx.createGain(); g.gain.value = fin(depth, 0); o.connect(g); g.connect(param);
    o.start(t); if (dur) o.stop(t + dur + 0.1); return o;
  }
  /** pan/distance chain -> returns its input node */
  _chain(pan, cutoff, wet) {
    const inp = ctx.createGain(); let node = inp;
    if (cutoff < 15000) { const lp = this._filt('lowpass', cutoff, 0.4); node.connect(lp); node = lp; }
    if (ctx.createStereoPanner && Math.abs(pan) > 0.01) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node.connect(p); node = p; }
    node.connect(this.mix);
    const s = ctx.createGain(); s.gain.value = clamp(wet, 0, 1); node.connect(s); s.connect(this.revIn);
    return inp;
  }
  /** where a sound at pos lands for the listener: {d: destination node, a: attenuation 0..1} */
  _place(pos, ref = 12, maxD = 150) {
    if (!pos) return { d: this.sfx, a: 1 };
    const L = this.listener || {};
    const dx = fin(pos.x) - fin(L.x), dy = fin(pos.y) - fin(L.y), dz = fin(pos.z) - fin(L.z);
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxD) return { d: this.sfx, a: 0 };
    const a = 1 / (1 + Math.pow(dist / ref, 1.4));
    if (a < 0.006) return { d: this.sfx, a: 0 };
    const yaw = fin(L.yaw), hd = Math.hypot(dx, dz) || 1;
    const side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / hd;   // right vector (cos, 0, -sin)
    const front = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / hd; // forward (-sin, 0, -cos)
    const pan = side * clamp(dist / 2, 0, 1) * 0.85;
    const cutoff = clamp(16000 / (1 + dist / 22) * (front < -0.3 ? 0.5 : 1), 350, 16000);
    return { d: this._chain(pan, dist < 1 ? 20000 : cutoff, 0.12 + 0.55 * (1 - a)), a };
  }
  _rpan(wet = 0.5, cut = 16000) { return this._chain(rnd(-0.85, 0.85), cut, wet); }

  /* ---- instruments ---- */
  _tick(vol, d, dl = 0, f = 4000) { this.noise(0.01, vol, 'highpass', f, 1, 0, dl, d); this.tone(f * 0.55, 0.012, 'square', vol * 0.25, 0.0008, 0, dl, d); }
  _clank(f, vol, d, dl = 0, dur = 0.3) {
    for (const [r, a] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.9, 0.2]]) this.tone(f * r * rnd(0.985, 1.015), dur * (1.1 - r * 0.08), 'sine', vol * a * 0.5, 0.001, 0, dl, d);
    this.noise(0.03, vol * 0.8, 'bandpass', Math.min(f * 4, 9000), 1.2, 0, dl, d);
  }
  _thud(f, vol, d, dl = 0, dur = 0.35) { this.tone(f, dur, 'sine', vol, 0.003, 0.45, dl, d); this.noise(dur * 0.6, vol * 0.5, 'lowpass', 220, 0.7, 0.5, dl, d, 'brown'); }
  _hiss(dur, vol, d, dl = 0, f = 3500) { this.noise(dur, vol, 'highpass', f, 0.7, 0.7, dl, d, 'white', Math.min(0.04, dur * 0.2)); }
  _crackle(dur, vol, d, dl = 0) {
    this.noise(dur, vol, 'bandpass', 3200, 0.6, 0, dl, d, 'crackle');
    for (let i = 0; i < 3; i++) this._tick(vol * 0.35, d, dl + Math.random() * dur * 0.7, rnd(2500, 6000));
  }
  _chitter(dur, vol, d, dl = 0, n = 14) { for (let i = 0; i < n; i++) this._tick(vol * rnd(0.5, 1), d, dl + Math.random() * dur, rnd(3500, 7500)); }
  _servo(f0, f1, dur, vol, d, dl = 0) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const o = this._osc('sawtooth', f0, t, dur); o.frequency.exponentialRampToValueAtTime(F(f1), t + dur * 0.85);
    this._lfo(o.frequency, rnd(18, 30), f0 * 0.01, t, dur);
    const bp = this._filt('bandpass', Math.max(f0, f1) * 1.4, 2.5);
    o.connect(bp); bp.connect(this._env(d, t, vol * 4, Math.min(0.04, dur * 0.3), dur, dur * 0.5));
  }
  _shriek(f0, f1, dur, vol, d, dl = 0) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const g = this._env(d, t, vol, 0.04, dur, dur * 0.3), ws = this._shaper(false);
    const bp = this._filt('bandpass', (f0 + f1) * 0.8, 2); bp.frequency.setValueAtTime(F(f0 * 1.5), t); bp.frequency.exponentialRampToValueAtTime(F(f1 * 1.5), t + dur * 0.7);
    ws.connect(bp); bp.connect(g);
    for (const m of [1, 1.06, 0.5]) {
      const o = this._osc('sawtooth', f0 * m, t, dur); o.frequency.exponentialRampToValueAtTime(F(f1 * m), t + dur * 0.7);
      this._lfo(o.frequency, 9 + m * 3, f0 * m * 0.03, t, dur); const og = ctx.createGain(); og.gain.value = m === 0.5 ? 0.4 : 0.5; o.connect(og); og.connect(ws);
    }
    this.noise(dur, vol * 0.5, 'bandpass', f0 * 2, 3, f1 / f0, dl, d);
  }
  _roar(base, dur, vol, d, dl = 0, fall = 1) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const g = this._env(d, t, vol, 0.15, dur, dur * 0.45), ws = this._shaper(true);
    const lp = this._filt('lowpass', base * 6, 3);
    lp.frequency.setValueAtTime(F(base * 5), t); lp.frequency.linearRampToValueAtTime(F(base * 14), t + dur * 0.3); lp.frequency.exponentialRampToValueAtTime(F(base * 4), t + dur);
    ws.connect(lp); lp.connect(g);
    [1, 1.51, 2.02].forEach((m, i) => {
      const o = this._osc('sawtooth', base * m, t, dur); if (fall !== 1) o.frequency.exponentialRampToValueAtTime(F(base * m * fall), t + dur);
      if (i === 0) this._lfo(o.frequency, 23, base * 0.15, t, dur);
      const og = ctx.createGain(); og.gain.value = 0.35; o.connect(og); og.connect(ws);
    });
    const ns = this._src('brown', t, dur), nf = this._filt('bandpass', base * 10, 3);
    nf.frequency.setValueAtTime(F(base * 9), t); nf.frequency.linearRampToValueAtTime(F(base * 18), t + dur * 0.3); nf.frequency.exponentialRampToValueAtTime(F(base * 7), t + dur);
    const ng = ctx.createGain(); ng.gain.value = 2; ns.connect(nf); nf.connect(ng); ng.connect(g);
  }
  _whisper(dur, vol, d, dl = 0, inhale = false) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const s = this._src('white', t, dur), hp = this._filt('highpass', 700, 0.7), ws = this._shaper(false);
    const g = this._env(d, t, vol, dur * (inhale ? 0.7 : 0.35), dur, dur * 0.2);
    s.connect(hp);
    for (const [lo, hi, q] of [[1100, 2400, 6], [2400, 4500, 8]]) {
      const f = this._filt('bandpass', rnd(lo, hi), q); hp.connect(f); f.connect(ws);
      for (let k = 0; k < dur; k += 0.08) f.frequency.setTargetAtTime(F(inhale ? lo + (hi - lo) * (k / dur) : rnd(lo, hi)), t + k, 0.03);
    }
    const pre = ctx.createGain(); pre.gain.value = 3; ws.connect(pre); pre.connect(g);
  }
  _creak(dur, vol, d, dl = 0, f = 800) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const o = this._osc('sawtooth', rnd(16, 28), t, dur);
    o.frequency.linearRampToValueAtTime(rnd(30, 70), t + dur * 0.5); o.frequency.linearRampToValueAtTime(rnd(10, 22), t + dur);
    const g = this._env(d, t, vol * 4, dur * 0.2, dur, dur * 0.5);
    for (const [m, q] of [[1, 12], [2.3, 14]]) { const b = this._filt('bandpass', f * m, q); o.connect(b); b.connect(g); }
  }
  _engine(dur, vol, d, dl = 0, f0 = 32, f1 = f0) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const g = this._env(d, t, vol, 0.08, dur, dur * 0.6), lp = this._filt('lowpass', 380, 2), am = ctx.createGain(); am.gain.value = 0.6;
    lp.connect(am); am.connect(g);
    const o = this._osc('sawtooth', f0, t, dur), o2 = this._osc('square', f0 * 0.5, t, dur);
    if (f1 !== f0) { o.frequency.exponentialRampToValueAtTime(F(f1), t + dur * 0.8); o2.frequency.exponentialRampToValueAtTime(F(f1 * 0.5), t + dur * 0.8); }
    const og = ctx.createGain(); og.gain.value = 0.5; o2.connect(og); og.connect(lp); o.connect(lp);
    const l = this._lfo(am.gain, f0 * 0.35, 0.4, t, dur, 'square'); if (f1 !== f0) l.frequency.exponentialRampToValueAtTime(F(f1 * 0.35), t + dur * 0.8);
    this.noise(dur, vol * 0.8, 'lowpass', 160, 0.7, 0, dl, d, 'brown', 0.08);
  }
  _siren(f1, f2, cycles, period, vol, d, dl = 0) {
    if (!(vol >= 0.002)) return; const t = this._t(dl), dur = cycles * period;
    const o = this._osc('square', f1, t, dur);
    for (let i = 0; i < cycles * 2; i++) o.frequency.setValueAtTime(F(i % 2 ? f2 : f1), t + i * period / 2);
    const lp = this._filt('lowpass', 1600, 0.7); o.connect(lp); lp.connect(this._env(d, t, vol, 0.03, dur, dur * 0.85));
  }
  _bowed(f, dur, vol, d, dl = 0) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const g = this._env(d, t, vol * 3, dur * 0.4, dur, dur * 0.2), bp = this._filt('bandpass', f * 3, 5); bp.connect(g);
    for (const m of [1, 1.004]) { const o = this._osc('sawtooth', f * m, t, dur); this._lfo(o.frequency, 4.5, f * 0.006, t, dur); o.connect(bp); }
    this.tone(f * 2.76, dur, 'sine', vol * 0.3, dur * 0.5, 0.98, dl, d);
  }
  _bark(vol, d, dl = 0) {
    const t = this._t(dl);
    const o = this._osc('sawtooth', rnd(330, 370), t, 0.22); o.frequency.exponentialRampToValueAtTime(170, t + 0.16);
    const ws = this._shaper(true), bp = this._filt('bandpass', 1000, 2.5); o.connect(ws); ws.connect(bp); bp.connect(this._env(d, t, vol, 0.006, 0.2, 0.05));
    this.noise(0.12, vol * 0.8, 'bandpass', 1400, 1.5, 0.6, dl, d); this._clank(720, vol * 0.5, d, dl, 0.3);
  }
  _growl(dur, vol, d, dl = 0) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const o = this._osc('sawtooth', 72, t, dur), ws = this._shaper(true), lp = this._filt('lowpass', 700, 1.5), am = ctx.createGain(); am.gain.value = 0.6;
    this._lfo(am.gain, 26, 0.4, t, dur); o.connect(ws); ws.connect(lp); lp.connect(am); am.connect(this._env(d, t, vol, 0.04, dur, dur * 0.5));
  }
  _grunt(vol, d, dl = 0, pitch = 1) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const o = this._osc('sawtooth', 125 * pitch, t, 0.28); o.frequency.exponentialRampToValueAtTime(F(85 * pitch), t + 0.22);
    const lp = this._filt('lowpass', 1100, 0.7), bp = this._filt('bandpass', 620, 2);
    o.connect(lp); lp.connect(bp); bp.connect(this._env(d, t, vol * 2.5, 0.015, 0.26, 0.06));
    this.noise(0.2, vol * 0.5, 'bandpass', 700, 2, 0.8, dl, d, 'pink');
  }
  _bass(f, dur, vol, dl, dest) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const o = this._osc('sawtooth', f, t, dur), ws = this._shaper(true), lp = this._filt('lowpass', 1400, 4);
    lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    o.connect(ws); ws.connect(lp); lp.connect(this._env(dest, t, vol, 0.004, dur, dur * 0.3));
  }
  _brass(midis, dur, vol, dl, dest, att = 0.25) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const lp = this._filt('lowpass', 200, 1); lp.frequency.setValueAtTime(200, t); lp.frequency.linearRampToValueAtTime(2000, t + att); lp.frequency.exponentialRampToValueAtTime(380, t + dur);
    lp.connect(this._env(dest, t, vol, att, dur, dur * 0.35));
    for (const m of midis) for (const c of [-7, 7]) { const o = this._osc('sawtooth', NOTE(m), t, dur); o.detune.value = c; o.connect(lp); }
  }
  _boom(vol, d, dl = 0) {
    this.tone(72, 1.5, 'sine', vol * 0.8, 0.005, 0.35, dl, d);
    this.noise(1.9, vol, 'lowpass', 900, 0.7, 0.15, dl, d, 'brown');
    this.noise(0.45, vol * 0.6, 'bandpass', 1800, 0.8, 0.3, dl, d);
    this._crackle(1.0, vol * 0.4, d, dl + 0.05);
  }
  _scrape(dur, vol, d, dl = 0) {
    if (!(vol >= 0.002)) return; const t = this._t(dl);
    const g = this._env(d, t, vol, 0.06, dur, dur * 0.6);
    const o = this._osc('sawtooth', rnd(150, 220), t, dur), bp = this._filt('bandpass', rnd(1500, 2500), 9);
    const s = this._src('white', t, dur), bp2 = this._filt('bandpass', 3000, 2), ng = ctx.createGain(); ng.gain.value = 0.6;
    for (let k = 0; k < dur; k += 0.07) { o.frequency.setTargetAtTime(rnd(120, 320), t + k, 0.03); bp.frequency.setTargetAtTime(rnd(1200, 2800), t + k, 0.05); ng.gain.setTargetAtTime(rnd(0.2, 1), t + k, 0.02); }
    const og = ctx.createGain(); og.gain.value = 3; o.connect(bp); bp.connect(og); og.connect(g); s.connect(bp2); bp2.connect(ng); ng.connect(g);
    this.tone(rnd(2200, 3200), dur * 0.7, 'sine', vol * 0.12, dur * 0.2, rnd(0.9, 1.1), dl + dur * 0.2, d);
  }
  _bell(f, dur, vol, dl = 0, dest = null, parts = null) {
    for (const [r, a, k] of parts || [[1, 1, 1], [2.76, 0.45, 0.55], [5.4, 0.22, 0.3], [8.93, 0.1, 0.18]]) this.tone(f * r, dur * k, 'sine', vol * a, 0.002, 0, dl, dest);
  }
  _glass(f, dur, vol, dl = 0, dest = null, att = 0.12) {
    for (const [r, a, k] of [[1, 1, 1], [2.32, 0.32, 0.7], [4.25, 0.12, 0.45], [6.63, 0.05, 0.3]]) this.tone(f * r, dur * k, 'sine', vol * a, att * k, 0, dl, dest);
    this.tone(f * 1.0025, dur, 'sine', vol * 0.5, att, 0, dl, dest);
  }
  _piano(f, dur, vol, dl = 0, dest = null) {
    this.tone(f, dur, 'triangle', vol * 0.7, 0.004, 0, dl, dest); this.tone(f * 2.003, dur * 0.5, 'sine', vol * 0.3, 0.003, 0, dl, dest);
    this.tone(f * 3.01, dur * 0.25, 'sine', vol * 0.12, 0.002, 0, dl, dest); this.noise(0.03, vol * 0.15, 'bandpass', Math.min(f * 4, 8000), 1, 0, dl, dest);
  }
  /** a tone that swells and cuts off, like a note played backwards */
  _rev(f, dur, vol, dl = 0, dest = null, type = 'sine') {
    if (!ctx || !(vol >= 0.002)) return; const t = this._t(dl);
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.min(vol, 1), t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.025);
    g.connect(dest || this.sfx);
    const o = this._osc(type, f, t, dur), o2 = this._osc('sine', f * 2, t, dur), g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2); g2.connect(g);
  }
  _pad(freq, dur, vol, dl = 0, dest = null, o = {}) {
    if (!ctx || !(vol > 0.0005)) return; const t = this._t(dl);
    dur = Math.max(0.1, dur); const att = clamp(o.att ?? 1, 0.01, dur * 0.8), rel = clamp(o.rel ?? 1.5, 0.01, dur - att), v = Math.min(vol, 1);
    const lp = this._filt('lowpass', o.cut || 1200, 0.6), g = ctx.createGain();
    g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + att); g.gain.setValueAtTime(v, t + dur - rel); g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(dest || this.music);
    const det = o.det ?? 7;
    for (const c of [-det, det]) { const s = this._osc(o.type || 'triangle', freq, t, dur); s.detune.value = c; s.connect(lp); }
  }

  /* =========================================================== beds */
  setBeds(o) { if (!o) return; for (const k in o) { const b = this.beds[k]; if (b) b.target = clamp(fin(o[k], 0), 0, 1); } }
  setElevatorMove(on) { this.beds.elevator.target = on ? 1 : 0; }
  _buildBed(name) {
    const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0; out.connect(this.amb);
    const N = (buf, type, f, q, g) => {
      const s = ctx.createBufferSource(); s.buffer = this.bufs[buf]; s.loop = true;
      const fl = this._filt(type, f, q), gg = ctx.createGain(); gg.gain.value = g;
      s.connect(fl); fl.connect(gg); gg.connect(out); s.start(t, Math.random() * 2.5); return { s, fl, gg };
    };
    const O = (type, f, g, cut) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g;
      let n = o; if (cut) { n = this._filt('lowpass', cut, 0.8); o.connect(n); } n.connect(gg); gg.connect(out); o.start(t); return { o, gg };
    };
    const L = (param, rate, depth, type) => this._lfo(param, rate, depth, t, 0, type);
    switch (name) {
      case 'rain': N('white', 'highpass', 2200, 0.5, 0.35); N('white', 'bandpass', 5500, 0.8, 0.25); N('brown', 'lowpass', 350, 0.6, 0.5); N('crackle', 'highpass', 1500, 0.5, 0.9); break;
      case 'rainIndoor': N('brown', 'lowpass', 420, 0.7, 0.9); N('crackle', 'bandpass', 1100, 1, 1.2); N('pink', 'bandpass', 800, 0.7, 0.15); break;
      case 'wind': { const a = N('brown', 'bandpass', 380, 1.1, 1.4); L(a.fl.frequency, 0.07, 180); L(a.gg.gain, 0.11, 0.6);
        const w = N('white', 'bandpass', 1300, 7, 0.08); L(w.fl.frequency, 0.05, 500); L(w.gg.gain, 0.09, 0.06); break; }
      case 'hum': { const a = O('sawtooth', 50, 0.3, 350); L(a.gg.gain, 0.3, 0.06); O('square', 100, 0.02, 2600); O('sine', 150, 0.06); break; }
      case 'drip': { const w = N('white', 'bandpass', 2600, 3, 0.1); L(w.fl.frequency, 0.2, 500); break; }
      case 'machinery': N('brown', 'lowpass', 90, 0.7, 1.4); O('sawtooth', 41, 0.14, 160); O('sawtooth', 43.6, 0.14, 160); N('pink', 'bandpass', 220, 1.5, 0.3); break;
      case 'generator': { const e = O('sawtooth', 29, 0.35, 260); L(e.gg.gain, 14.5, 0.2); O('square', 58, 0.08, 420); N('white', 'bandpass', 900, 1, 0.06); break; }
      case 'servers': N('white', 'lowpass', 3800, 0.5, 0.18); N('pink', 'bandpass', 240, 1, 0.3); O('sine', 7400, 0.006); O('sine', 120, 0.04); break;
      case 'factory': { N('brown', 'lowpass', 220, 0.7, 1.0); const p = O('square', 55, 0.06, 300); L(p.gg.gain, 1.1, 0.06); N('pink', 'bandpass', 1500, 1, 0.1); break; }
      case 'tunnel': { N('brown', 'lowpass', 60, 0.8, 1.6); const w = N('white', 'bandpass', 700, 0.8, 0.12); L(w.fl.frequency, 0.13, 250); L(w.gg.gain, 0.21, 0.05); N('brown', 'bandpass', 260, 2, 0.5); break; }
      case 'alarm': {
        const lp = this._filt('lowpass', 1100, 0.7); lp.connect(out); const wet = ctx.createGain(); wet.gain.value = 0.9; out.connect(wet); wet.connect(this.revIn);
        for (const [type, g] of [['triangle', 0.7], ['square', 0.12]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = 600; L(o.frequency, 0.23, 170); const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(lp); o.start(t); }
        break;
      }
      case 'elevator': O('sawtooth', 68, 0.3, 220); O('sine', 136, 0.1); N('white', 'bandpass', 3200, 9, 0.05); N('crackle', 'lowpass', 1400, 0.8, 0.5); break;
    }
    return { out };
  }

  /* =========================================================== per frame */
  update(dt) {
    dt = clamp(fin(dt, 0.016), 0, 0.25);
    this.clock += dt;
    if (!ctx) return;
    const t = ctx.currentTime;
    // beds
    for (const k in this.beds) {
      const b = this.beds[k], rate = k === 'elevator' ? 2 : 0.8;
      b.level += clamp(b.target - b.level, -dt * rate, dt * rate);
      if (!b.node && b.level > 0.001) b.node = this._buildBed(k);
      if (b.node && (Math.abs(b.level - b.sent) > 0.002 || (b.level === b.target && b.sent !== b.level))) { b.node.out.gain.setTargetAtTime(b.level * BEDS[k], t, 0.06); b.sent = b.level; }
    }
    this._ambience(dt);
    // tension / chase smoothing
    const up = this.tension > this.tensionLvl ? 0.6 : 0.15;
    this.tensionLvl = clamp(this.tensionLvl + clamp(this.tension - this.tensionLvl, -up * dt, up * dt), 0, 1);
    this.chaseLvl = clamp(this.chaseLvl + (this.chase ? dt * 2 : -dt * 0.4), 0, 1);
    this._tensionTick(t, dt); this._chaseTick(t); this._styleTick(t);
    // body
    const hbI = this.clock - this.hbAt < 0.5 ? this.hb : 0;
    if (hbI > 0.04 && !this.dead) {
      if (!this.hbNext || this.hbNext < t - 0.5) this.hbNext = t + 0.05;
      while (this.hbNext < t + 0.12) { this._beat(hbI, this.hbNext - t); this.hbNext += 60 / (55 + 95 * hbI); }
    } else this.hbNext = 0;
    const ex = this.clock - this.brAt < 0.5 && !this.dead ? clamp((0.55 - this.stam) / 0.55, 0, 1) : 0;
    if (ex > 0.03) {
      if (!this.brNext || this.brNext < t - 0.5) this.brNext = t + 0.05;
      while (this.brNext < t + 0.12) { const p = 1.9 - 1.15 * ex; this._breathCycle(ex, p, this.brNext - t); this.brNext += p; }
    } else this.brNext = 0;
    // phone
    const ph = this.phone;
    if (ph) {
      if (!ph.next || ph.next < t - 1) ph.next = t + 0.05;
      while (ph.next < t + 0.15) { const P = this._place(ph.pos, 14); if (P.a > 0) { this._ring(P.d, P.a, ph.next - t); } ph.next += 3; }
    }
    // decoys
    for (const dc of this.decoys) {
      if (!dc.next || dc.next < t - 1) dc.next = t + 0.05;
      while (dc.next < t + 0.15) {
        const P = this._place(dc.pos, 16), dl = dc.next - t;
        if (P.a > 0) { this.tone(1900, 0.07, 'square', 0.07 * P.a, 0.002, 1, dl, P.d); this.tone(2500, 0.06, 'square', 0.055 * P.a, 0.002, 1, dl + 0.09, P.d); if (dc.n++ % 4 === 3) this.tone(1500, 0.25, 'sine', 0.05 * P.a, 0.01, 1.6, dl + 0.2, P.d); }
        dc.next += 0.55;
      }
    }
  }
  _every(key, dt, interval, fn) {
    if (this.timers[key] === undefined) this.timers[key] = Math.random() * interval();
    this.timers[key] -= dt;
    if (this.timers[key] <= 0) { this.timers[key] = Math.max(0.05, interval()); fn(); }
  }
  _ambience(dt) {
    const B = this.beds, lv = (k) => B[k].level;
    const wetDrip = lv('drip') + lv('tunnel') * 0.4;
    this._every('drip', dt, () => rnd(0.2, 1.4) / Math.max(0.2, wetDrip), () => {
      if (wetDrip < 0.03) return; const d = this._rpan(0.6, 9000), v = 0.035 * Math.min(1, wetDrip);
      this.tone(rnd(900, 2200), 0.12, 'sine', v, 0.001, rnd(1.3, 1.8), 0, d); this.noise(0.01, v * 0.6, 'highpass', 4000, 1, 0, 0, d);
    });
    this._every('thunder', dt, () => rnd(30, 70), () => {
      const r = lv('rain') + lv('rainIndoor') * 0.6; if (r < 0.35) return;
      const indoor = lv('rainIndoor') > lv('rain'), d = this._rpan(0.7, indoor ? 500 : 3000), dl = rnd(0, 0.5);
      this.noise(4, 0.35 * r, 'lowpass', 280, 0.7, 0.5, dl, d, 'brown', 0.4);
      if (!indoor && Math.random() < 0.4) this.noise(0.8, 0.12 * r, 'highpass', 1500, 0.7, 0.4, dl, d, 'crackle');
    });
    this._every('machinery', dt, () => rnd(5, 14), () => {
      const m = lv('machinery'); if (m < 0.05) return;
      const d = this._rpan(0.9, 900), k = Math.random();
      if (k < 0.35) { this._thud(rnd(32, 48), 0.35 * m, d, 0, 1.2); this.noise(1.5, 0.25 * m, 'lowpass', 300, 0.7, 0.5, 0.05, d, 'brown'); }
      else if (k < 0.6) this._bowed(rnd(60, 110), rnd(2.5, 4.5), 0.05 * m, d);
      else if (k < 0.85) { const f = rnd(65, 90); this.tone(f, 1.6, 'sawtooth', 0.05 * m, 0.4, 0.97, 0, d); this.tone(f * 0.79, 2.2, 'sawtooth', 0.05 * m, 0.4, 0.95, 1.4, d); }
      else this._clank(rnd(90, 160), 0.2 * m, d, 0, 1.4);
    });
    this._every('servers', dt, () => rnd(0.15, 1.5), () => {
      const s = lv('servers'); if (s < 0.05) return; const d = this._rpan(0.2, 12000);
      for (let i = 0, n = 1 + (Math.random() * 4 | 0); i < n; i++) this._tick(0.02 * s, d, i * rnd(0.02, 0.05), rnd(1500, 3000));
      if (Math.random() < 0.12) this.tone(pick([1760, 2093, 2637]), 0.08, 'sine', 0.012 * s, 0.004, 1, 0.1, d);
    });
    this._every('factory', dt, () => rnd(0.8, 2.6), () => {
      const f = lv('factory'); if (f < 0.05) return; const d = this._rpan(0.7, 5000);
      if (Math.random() < 0.2) this._hiss(1.2, 0.05 * f, d, 0, 2500);
      else if (Math.random() < 0.3) this._thud(rnd(45, 60), 0.2 * f, d);
      else this._clank(rnd(150, 400), 0.09 * f, d, 0, 0.5);
    });
    this._every('tunnel', dt, () => rnd(4, 12), () => {
      const u = lv('tunnel'); if (u < 0.05) return; this.noise(4, 0.25 * u, 'lowpass', 120, 0.8, 0.6, 0, this._rpan(0.8, 600), 'brown', 1.5);
    });
    this._every('hum', dt, () => rnd(3, 10), () => {
      const h = lv('hum'); if (h < 0.05) return; const d = this._rpan(0.3);
      this.tone(100, rnd(0.05, 0.15), 'square', 0.012 * h, 0.002, 1, 0, d); this._crackle(0.12, 0.05 * h, d);
    });
    this._every('wind', dt, () => rnd(6, 15), () => {
      const w = lv('wind'); if (w < 0.1) return; const d = this._rpan(0.6, 6000);
      if (Math.random() < 0.6) this.noise(2.5, 0.035 * w, 'bandpass', rnd(700, 1400), 8, 1.3, 0, d, 'white', 1);
      else for (let i = 0; i < 3; i++) this._clank(rnd(300, 600), 0.03 * w, d, i * rnd(0.1, 0.3), 0.3);
    });
  }
  _beat(i, dl) {
    const d = this.mix;
    this.tone(52, 0.14, 'sine', 0.06 + 0.3 * i, 0.004, 0.6, dl, d); this.noise(0.08, 0.1 * i, 'lowpass', 150, 0.7, 0, dl, d, 'brown');
    this.tone(46, 0.16, 'sine', 0.04 + 0.22 * i, 0.004, 0.6, dl + 0.22 - 0.06 * i, d);
  }
  _breathCycle(ex, p, dl) {
    const d = this.mix, v = 0.025 + 0.1 * ex;
    this.noise(p * 0.38, v, 'bandpass', 1300, 1.4, 1.25, dl, d, 'pink', p * 0.2);
    this.noise(p * 0.45, v * 1.2, 'bandpass', 900, 1.2, 0.7, dl + p * 0.45, d, 'pink', 0.03);
    if (ex > 0.6) this.noise(p * 0.3, v * 0.6, 'bandpass', 480, 5, 0.9, dl + p * 0.46, d, 'pink', 0.03);
  }
  _ring(d, a, dl) {
    for (const off of [0, 0.6]) {
      const t = this._t(dl + off);
      const o = this._osc('triangle', 1300, t, 0.42), o2 = this._osc('square', 2600, t, 0.42);
      this._lfo(o.frequency, 20, 90, t, 0.42, 'square'); this._lfo(o2.frequency, 20, 180, t, 0.42, 'square');
      const bp = this._filt('bandpass', 1800, 1), g2 = ctx.createGain(); g2.gain.value = 0.15;
      o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(this._env(d, t, 0.12 * a, 0.01, 0.42, 0.35));
    }
  }

  /* =========================================================== player */
  step(surface = 'concrete', speed = 0.5, pos = null) {
    if (!ctx) return;
    let s = fin(speed, 0.5); if (s > 1.5) s /= 6; s = clamp(s, 0, 1.2);
    const P = this._place(pos, 10); if (P.a <= 0) return;
    this._stepSound(surface, (0.05 + 0.13 * s) * P.a * (pos ? 1 : 0.85), P.d, 0);
  }
  _stepSound(surface, v, d, dl) {
    const r = rnd(0.9, 1.1);
    switch (surface) {
      case 'metal': this._clank(rnd(180, 240) * r, v * 0.7, d, dl, 0.22); this.noise(0.05, v * 0.8, 'bandpass', 1800 * r, 1.2, 0, dl, d); this.tone(70 * r, 0.1, 'sine', v * 0.8, 0.003, 0.6, dl, d); break;
      case 'grate': this._clank(320 * r, v * 0.6, d, dl, 0.2); for (let i = 0; i < 3; i++) this._clank(rnd(500, 800), v * 0.25, d, dl + 0.03 + i * 0.035, 0.08); this.noise(0.03, v * 0.6, 'highpass', 2500, 1, 0, dl, d); break;
      case 'water': this.noise(0.22, v * 1.1, 'bandpass', 1300 * r, 0.9, 0.5, dl, d); this.noise(0.12, v * 0.6, 'highpass', 3500, 0.7, 0, dl + 0.04, d);
        this.tone(rnd(500, 900), 0.08, 'sine', v * 0.25, 0.005, 1.8, dl + 0.05, d); this.noise(0.1, v * 0.6, 'lowpass', 400, 0.7, 0.5, dl, d, 'brown'); break;
      case 'carpet': this.noise(0.09, v * 0.9, 'lowpass', 380 * r, 0.7, 0.6, dl, d, 'brown'); this.noise(0.05, v * 0.15, 'bandpass', 900, 1, 0, dl, d); break;
      case 'glass': this.noise(0.06, v * 0.6, 'lowpass', 900, 0.7, 0.5, dl, d, 'brown');
        for (let i = 0; i < 5; i++) this.noise(0.02, v * rnd(0.3, 0.6), 'highpass', rnd(3000, 6000), 1, 0, dl + i * rnd(0.008, 0.02), d);
        for (let i = 0; i < 2; i++) this.tone(rnd(3000, 6000), 0.06, 'sine', v * 0.15, 0.001, 0, dl + rnd(0, 0.06), d); break;
      case 'tile': this.noise(0.035, v, 'bandpass', 2600 * r, 1.5, 0, dl, d); this.tone(rnd(190, 240), 0.05, 'triangle', v * 0.4, 0.002, 0.8, dl, d); this.noise(0.06, v * 0.5, 'lowpass', 500, 0.7, 0, dl, d, 'brown'); break;
      case 'wood': this.noise(0.07, v * 0.9, 'bandpass', 320 * r, 3, 0.8, dl, d); this.tone(150 * r, 0.12, 'sine', v * 0.5, 0.003, 0.85, dl, d); if (Math.random() < 0.15) this._creak(0.3, v * 0.4, d, dl + 0.05, rnd(500, 800)); break;
      default: this.noise(0.07, v, 'lowpass', 900 * r, 0.8, 0.5, dl, d, 'brown'); this.noise(0.05, v * 0.45, 'highpass', 2200 * r, 0.8, 0, dl + 0.005, d); this.tone(85 * r, 0.08, 'sine', v * 0.5, 0.003, 0.7, dl, d);
    }
  }
  jump() { if (!ctx) return; this.noise(0.18, 0.05, 'bandpass', 700, 1, 1.8); this.noise(0.12, 0.035, 'bandpass', 1400, 2, 0.8, 0.02, this.sfx, 'pink'); }
  land(force = 0.5) {
    if (!ctx) return; const f = clamp(fin(force, 0.5), 0, 1);
    this.tone(60, 0.25 + 0.2 * f, 'sine', 0.15 + 0.3 * f, 0.003, 0.5); this.noise(0.2, 0.15 + 0.25 * f, 'lowpass', 500, 0.7, 0.5, 0, this.sfx, 'brown');
    if (f > 0.5) { for (let i = 0; i < 4; i++) this._tick(0.04 * f, this.sfx, rnd(0.03, 0.2), rnd(2000, 4000)); this._grunt(0.08 * f, this.sfx, 0.02); }
  }
  hurt(amount = 0.3) {
    if (!ctx) return; const a = clamp(fin(amount, 0.3), 0, 1), t = ctx.currentTime;
    this.noise(0.25, 0.25 + 0.3 * a, 'lowpass', 1200, 0.7, 0.4); this.tone(70, 0.3, 'sine', 0.2 + 0.2 * a, 0.003, 0.5);
    this._grunt(0.08 + 0.12 * a, this.sfx, 0.01, 1.15);
    if (a > 0.35) this.tone(rnd(3800, 4300), 1.5 + 2 * a, 'sine', 0.012 + 0.018 * a, 0.05, 0.99, 0.05, this.comp);
    if (!this.dead) {
      const p = this.mfilt.frequency; p.cancelScheduledValues(t); p.setValueAtTime(clamp(p.value, 20, 20000), t);
      p.setTargetAtTime(500 + (1 - a) * 2500, t, 0.02); p.setTargetAtTime(20000, t + 0.15, 0.3 + a * 0.6);
    }
  }
  breath(stamina) { this.stam = clamp(fin(stamina, 1), 0, 1); this.brAt = this.clock; }
  heartbeat(intensity) { this.hb = clamp(fin(intensity, 0), 0, 1); this.hbAt = this.clock; }
  death() {
    if (!ctx) return; this.dead = true; this.chase = false; const t = ctx.currentTime;
    this._thud(55, 0.5, this.mix); this.noise(0.6, 0.3, 'lowpass', 600, 0.7, 0.3, 0, this.sfx, 'brown'); this._grunt(0.12, this.sfx, 0, 0.7);
    [0.5, 1.5, 2.9].forEach((dl, i) => { this.tone(50, 0.16, 'sine', 0.3 - i * 0.08, 0.004, 0.6, dl, this.mix); this.tone(44, 0.18, 'sine', 0.2 - i * 0.05, 0.004, 0.6, dl + 0.24, this.mix); });
    this.tone(4100, 5, 'sine', 0.02, 0.3, 0.97, 0.2, this.comp);
    this._pad(NOTE(28), 6, 0.08, 0.3, this.mix, { type: 'sawtooth', cut: 200, att: 2, rel: 3 });
    const p = this.mfilt.frequency; p.cancelScheduledValues(t); p.setValueAtTime(clamp(p.value, 20, 20000), t); p.setTargetAtTime(280, t, 0.8);
  }

  /* =========================================================== flashlight / camera */
  flashlight(on) {
    if (!ctx) return;
    this.noise(0.012, 0.12, 'highpass', 3000); this.tone(on ? 2200 : 1700, 0.02, 'square', 0.03, 0.001);
    this.noise(0.01, 0.08, 'highpass', 2000, 1, 0, 0.03); if (on) this.tone(120, 0.25, 'sawtooth', 0.01, 0.02, 1, 0.03);
  }
  flashlightLow() { if (!ctx) return; this.tone(1400, 0.07, 'square', 0.05, 0.002); this.tone(1050, 0.1, 'square', 0.05, 0.002, 0, 0.1); }
  flicker() {
    if (!ctx) return; const bp = this._chain(0, 20000, 0.1);
    for (let i = 0; i < 6; i++) { const f = this._filt('bandpass', 1500, 1); f.connect(bp); this.tone(120, rnd(0.02, 0.06), 'square', 0.05, 0.001, 1, Math.random() * 0.35, f); }
    this.noise(0.35, 0.06, 'bandpass', 3000, 0.7, 0, 0, this.sfx, 'crackle');
  }
  cameraRaise() { if (!ctx) return; this.noise(0.2, 0.04, 'bandpass', 900, 1, 0.6, 0, this.sfx, 'pink'); this._servo(700, 1400, 0.25, 0.03, this.sfx, 0.1); this.tone(2600, 0.05, 'sine', 0.03, 0.002, 0, 0.38); }
  cameraLower() { if (!ctx) return; this.noise(0.2, 0.04, 'bandpass', 800, 1, 0.6, 0, this.sfx, 'pink'); this._servo(1300, 600, 0.2, 0.03, this.sfx); this._tick(0.05, this.sfx, 0.22, 3000); }
  shutter() {
    if (!ctx) return;
    this.noise(0.015, 0.25, 'highpass', 2500); this.tone(180, 0.05, 'sine', 0.1, 0.001, 0.5); this.noise(0.04, 0.1, 'bandpass', 1200, 1);
    this.noise(0.015, 0.18, 'highpass', 3500, 1, 0, 0.06); this.tone(1800, 0.02, 'square', 0.03, 0.001, 0, 0.06);
  }
  flashCharge() { if (!ctx) return; this.tone(1800, 1.1, 'sine', 0.012, 0.3, 3.9); this.tone(3600, 1.1, 'sine', 0.004, 0.3, 3.9); this.tone(3200, 0.06, 'sine', 0.025, 0.002, 0, 1.15); }
  photoDevelop() {
    if (!ctx) return; const t = this._t(0);
    const o = this._osc('sawtooth', 160, t, 1.4), bp = this._filt('bandpass', 900, 2); o.connect(bp); bp.connect(this._env(this.sfx, t, 0.05, 0.05, 1.4, 1.1));
    for (let i = 0; i < 12; i++) this._tick(0.02, this.sfx, 0.1 + i * 0.1, 2500);
    this.noise(1.2, 0.03, 'bandpass', 3000, 1, 0.7, 0.1, this.sfx, 'white', 0.2); this._tick(0.06, this.sfx, 1.45, 2000);
  }

  /* =========================================================== UI */
  uiClick() { if (!ctx) return; this.tone(1800, 0.03, 'triangle', 0.04); this.noise(0.01, 0.03, 'highpass', 4000); }
  uiOpen() { if (!ctx) return; this.tone(520, 0.12, 'sine', 0.05, 0.005, 1.5); this.tone(1040, 0.1, 'triangle', 0.03, 0.005, 0, 0.05); this.noise(0.15, 0.02, 'bandpass', 2000, 1, 2); }
  uiClose() { if (!ctx) return; this.tone(780, 0.12, 'sine', 0.045, 0.005, 0.66); this.tone(520, 0.1, 'triangle', 0.025, 0.005, 0, 0.05); this.noise(0.15, 0.02, 'bandpass', 3000, 1, 0.5); }
  keyPress() { if (!ctx) return; this.tone(1400, 0.06, 'square', 0.025, 0.002); this._tick(0.04, this.sfx, 0, 3000); }
  pickup(kind = 'item') {
    if (!ctx) return;
    if (kind === 'battery') { this._tick(0.1, this.sfx, 0, 2500); this._tick(0.08, this.sfx, 0.07, 1800); this.tone(400, 0.22, 'sine', 0.04, 0.01, 4, 0.1); this.tone(60, 0.3, 'sawtooth', 0.012, 0.02, 1, 0.1); }
    else if (kind === 'component') { this._clank(1400, 0.08, this.sfx); this._servo(900, 1300, 0.12, 0.02, this.sfx, 0.06); this.tone(660, 0.15, 'triangle', 0.035, 0.004, 0, 0.12); this.tone(990, 0.25, 'triangle', 0.03, 0.004, 0, 0.2); }
    else if (kind === 'note') { this.noise(0.25, 0.06, 'bandpass', 2500, 0.7, 0.6, 0, this.sfx, 'white', 0.03); this.noise(0.15, 0.04, 'bandpass', 3500, 0.7, 1.4, 0.18); this.tone(330, 0.5, 'sine', 0.035, 0.03, 0, 0.1); }
    else { this._tick(0.06, this.sfx, 0, 2500); this.tone(880, 0.12, 'triangle', 0.045, 0.003, 0, 0.02); this.tone(1320, 0.2, 'triangle', 0.04, 0.003, 0, 0.09); }
  }
  craft() {
    if (!ctx) return;
    for (let i = 0; i < 6; i++) this._tick(0.07, this.sfx, i * 0.05, 2500);
    this._clank(600, 0.08, this.sfx, 0.32, 0.3);
    [523, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.045, 0.004, 0, 0.42 + i * 0.07));
  }
  deny() { if (!ctx) return; this.tone(150, 0.18, 'square', 0.04, 0.005, 0.9); this.tone(110, 0.22, 'square', 0.035, 0.005, 0.9, 0.12); }
  objective() { if (!ctx) return; this.tone(196, 0.9, 'triangle', 0.05, 0.02); this._bell(587, 1.0, 0.045, 0.12); this._bell(784, 1.4, 0.04, 0.3); }
  discovery() {
    if (!ctx) return;
    [69, 72, 76, 79].forEach((m, i) => this._bell(NOTE(m), 1.6, 0.045, i * 0.13));
    this._bell(NOTE(77), 2.6, 0.05, 0.62); this._bell(NOTE(76), 3, 0.035, 1.3);
    for (const m of [41, 45, 52]) this._pad(NOTE(m), 3.6, 0.03, 0.5, this.sfx, { att: 0.6, rel: 2, cut: 1000 });
    this._glass(NOTE(88), 2.5, 0.012, 0.65, this.sfx, 0.2);
  }
  memory() {
    if (!ctx) return; const d = this._chain(0, 3500, 0.8);
    this._rev(NOTE(64), 1.3, 0.05, 0, d); this.noise(1.3, 0.05, 'bandpass', 1800, 2, 2, 0, d, 'white', 1.25);
    [76, 71, 72, 67, 69].forEach((m, i) => { this._glass(NOTE(m), 2.4, 0.045, 1.35 + i * 0.55, d, 0.18); this._glass(NOTE(m) * 1.006, 2.2, 0.015, 1.4 + i * 0.55, d, 0.25); });
    this._pad(NOTE(45), 5.5, 0.03, 1.2, d, { att: 1.5, rel: 2.5, cut: 700 });
  }

  /* =========================================================== GUIDE */
  guideVoice(text, mood = 'neutral', delay = 0) {
    const M = {
      happy: { base: 880, sd: 0.085, set: [0, 2, 4, 7, 9, 12], end: 'up', bend: [1.05, 1.25] },
      neutral: { base: 720, sd: 0.1, set: [0, 2, 4, 5, 7], bend: [0.94, 1.08] },
      curious: { base: 760, sd: 0.1, set: [0, 2, 5, 7], end: 'q', bend: [0.95, 1.12] },
      sad: { base: 470, sd: 0.16, set: [0, -2, -3, -5, -7], end: 'down', bend: [0.8, 0.93], type: 'triangle' },
      scared: { base: 1050, sd: 0.07, set: [0, 1, 3, 6, 8], trem: true, bend: [0.9, 1.15] },
      serious: { base: 560, sd: 0.11, set: [0, 0, -2, 3, 5], bend: [0.97, 1.02] },
    };
    const m = M[mood] || M.neutral, syl = syllables(text).slice(0, 70);
    if (!syl.length) syl.push({ v: 'a', pause: 0, end: '' });
    const lens = syl.map(() => m.sd * rnd(0.85, 1.2));
    let dur = 0; syl.forEach((s, i) => { dur += lens[i] + s.pause; }); dur += m.end ? 0.3 : 0.06;
    if (!ctx) return dur;
    const t0 = this._t(delay) + 0.01, T = dur + 0.1;
    const vg = ctx.createGain(); vg.gain.value = 0.11; vg.connect(this.sfx);
    const env = ctx.createGain(); env.gain.value = 0; env.gain.setValueAtTime(0, t0);
    const fA = this._filt('bandpass', 1200, 4), fB = this._filt('bandpass', 2400, 6), lp = this._filt('lowpass', 2600, 0.7);
    const gA = ctx.createGain(); gA.gain.value = 2.2; const gB = ctx.createGain(); gB.gain.value = 1.4; const gL = ctx.createGain(); gL.gain.value = 0.35;
    env.connect(fA); env.connect(fB); env.connect(lp); fA.connect(gA); fB.connect(gB); lp.connect(gL); gA.connect(vg); gB.connect(vg); gL.connect(vg);
    const o = this._osc(m.type || 'square', m.base, t0, T), o2 = this._osc('sine', m.base * 2, t0, T), g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(env); o2.connect(g2); g2.connect(env);
    if (m.trem) { this._lfo(o.frequency, 13, 35, t0, T); this._lfo(vg.gain, 11, 0.04, t0, T); }
    let ts = t0, prev = m.base;
    syl.forEach((s, i) => {
      const sd = lens[i], last = i === syl.length - 1;
      let p0 = m.base * Math.pow(2, pick(m.set) / 12); if (s.end === '?' || (last && m.end === 'q')) p0 *= 1.1;
      const p1 = p0 * rnd(m.bend[0], m.bend[1]) * (s.end === '?' ? 1.35 : 1);
      o.frequency.setValueAtTime(F(Math.abs(p0 - prev) < 1 ? p0 * 1.01 : p0), ts); o.frequency.exponentialRampToValueAtTime(F(p1), ts + sd * 0.8);
      o2.frequency.setValueAtTime(F(p0 * 2), ts); o2.frequency.exponentialRampToValueAtTime(F(p1 * 2), ts + sd * 0.8);
      const v = VOWELS[s.v];
      fA.frequency.setTargetAtTime(v[0] * 1.6, ts, 0.01); fB.frequency.setTargetAtTime(v[1] * 1.3, ts, 0.01);
      env.gain.setTargetAtTime(s.end === '!' ? 1.3 : 1, ts, 0.006); env.gain.setTargetAtTime(0, ts + sd * 0.72, 0.015);
      if (s.end === '!') this.tone(p1 * 2, 0.05, 'sine', 0.025, 0.002, 1.3, ts - ctx.currentTime + sd * 0.5);
      prev = p1; ts += sd + s.pause;
    });
    const tail = ts - ctx.currentTime;
    if (m.end === 'up') { this.tone(m.base * 1.5, 0.12, 'sine', 0.04, 0.005, 1.6, tail); this.tone(m.base * 2.2, 0.08, 'sine', 0.03, 0.004, 1.3, tail + 0.12); }
    else if (m.end === 'q') this.tone(m.base, 0.22, 'triangle', 0.035, 0.01, 1.5, tail);
    else if (m.end === 'down') this.tone(m.base * 0.9, 0.3, 'triangle', 0.035, 0.03, 0.6, tail);
    return dur;
  }
  guideBlip() { if (!ctx) return; this.tone(1500, 0.06, 'sine', 0.05, 0.004, 1.4); this.tone(2100, 0.07, 'sine', 0.045, 0.004, 0.8, 0.07); this.tone(750, 0.05, 'square', 0.008, 0.003, 1.4); }
  guideScan(durationSec = 2) {
    if (!ctx) return; const dur = clamp(fin(durationSec, 2), 0.2, 30), t = this._t(0);
    const o = this._osc('sine', 1100, t, dur); this._lfo(o.frequency, 3, 450, t, dur, 'triangle');
    const o2 = this._osc('sine', 1650, t, dur); this._lfo(o2.frequency, 3, 600, t, dur, 'triangle');
    const g = this._env(this.sfx, t, 0.025, 0.08, dur, dur * 0.8), g2 = ctx.createGain(); g2.gain.value = 0.3; o.connect(g); o2.connect(g2); g2.connect(g);
    for (let k = 0.1; k < dur; k += 0.15) this._tick(0.015, this.sfx, k, 5000);
    this.tone(1600, 0.06, 'sine', 0.04, 0.003, 0, dur); this.tone(2400, 0.1, 'sine', 0.04, 0.003, 0, dur + 0.08);
  }
  guideBoot() {
    if (!ctx) return; const t = this._t(0);
    const o = this._osc('sawtooth', 40, t, 1.3); o.frequency.exponentialRampToValueAtTime(420, t + 1.2);
    const lp = this._filt('lowpass', 800, 2); o.connect(lp); lp.connect(this._env(this.sfx, t, 0.07, 0.6, 1.3, 0.4));
    this.noise(1.4, 0.03, 'bandpass', 1500, 0.8, 2, 0, this.sfx, 'white', 0.9);
    for (const k of [0.3, 0.5, 0.65]) { this._tick(0.12, this.sfx, k, 1800); this.tone(300, 0.03, 'square', 0.03, 0.001, 0.6, k); }
    [60, 64, 67, 72, 76].forEach((m, i) => this.tone(NOTE(m), 0.9, 'triangle', 0.04, 0.01, 0, 1.15 + i * 0.08));
    this._bell(NOTE(84), 1.2, 0.03, 1.5);
    this.guideVoice('hel lo!', 'happy', 1.9);
  }
  guideServo(pos) { if (!ctx) return; const P = this._place(pos, 8); if (P.a <= 0) return; this._servo(rnd(900, 1300), rnd(1200, 1800), rnd(0.15, 0.3), 0.025 * P.a, P.d); }
  repairSpark(pos) {
    if (!ctx) return; const P = this._place(pos, 8); if (P.a <= 0) return; const d = P.d, a = P.a;
    this.noise(0.08, 0.2 * a, 'highpass', 3000, 1, 0, 0, d); this.tone(3000, 0.06, 'sawtooth', 0.035 * a, 0.001, 0.07, 0, d); this._crackle(0.3, 0.25 * a, d, 0.02);
  }

  /* =========================================================== enemies */
  enemy(type, sound = 'idle', pos = null) {
    if (!ctx) return;
    const fn = this['_e_' + type]; if (typeof fn !== 'function') return;
    const P = this._place(pos, RANGE[type] || 14); if (P.a <= 0) return;
    try { fn.call(this, sound, P.d, P.a); } catch (e) { if (this.strict) throw e; }
  }
  _relay(vol, d, dl = 0) { this.noise(0.02, vol, 'bandpass', 1400, 2, 0, dl, d); this.tone(240, 0.05, 'square', vol * 0.25, 0.001, 0.5, dl, d); }
  /** scout: small flying eye. high servo whirr, camera focus clicks, shrill alarm chirp */
  _e_scout(s, d, A) {
    A *= 1.6;
    switch (s) {
      case 'idle': this._servo(rnd(1700, 2000), rnd(2300, 2700), 0.32, 0.05 * A, d);
        for (let i = 0; i < 3; i++) this._tick(0.06 * A, d, 0.36 + i * rnd(0.05, 0.08), 5200);
        if (Math.random() < 0.4) this.tone(3400, 0.05, 'sine', 0.02 * A, 0.002, 0, 0.62, d); break;
      case 'step': this._tick(0.03 * A, d, 0, 2800); this._servo(1500, 1650, 0.1, 0.018 * A, d); break;
      case 'alert': for (let i = 0; i < 3; i++) { this.tone(2800, 0.07, 'square', 0.08 * A, 0.002, 1.3, i * 0.11, d); this.tone(3700, 0.05, 'square', 0.06 * A, 0.002, 1, i * 0.11 + 0.055, d); }
        this._tick(0.08 * A, d, 0.36, 5000); this._tick(0.08 * A, d, 0.42, 5600); this._servo(2000, 3200, 0.3, 0.04 * A, d, 0.35); break;
      case 'attack': this.tone(3200, 0.25, 'sawtooth', 0.06 * A, 0.002, 0.08, 0, d); this.noise(0.2, 0.15 * A, 'highpass', 2000, 1, 0.5, 0, d); this._crackle(0.25, 0.25 * A, d); break;
      case 'hurt': this._crackle(0.25, 0.3 * A, d); this._servo(2400, 1100, 0.18, 0.05 * A, d); this._servo(1800, 2600, 0.1, 0.03 * A, d, 0.2); break;
      case 'die': this._servo(2400, 60, 1.3, 0.06 * A, d); this._crackle(0.9, 0.3 * A, d);
        [900, 1300, 700, 1100].forEach((f, i) => this._clank(f, 0.08 * A, d, 1.05 + i * 0.11, 0.2)); break;
      case 'special': this.tone(1200, 0.7, 'sine', 0.04 * A, 0.05, 3, 0, d); for (let i = 0; i < 5; i++) this._tick(0.05 * A, d, 0.15 * i, 4500); break;
    }
  }
  /** hunter: fast predator. metallic skittering, hydraulic hiss, rising shriek */
  _e_hunter(s, d, A) {
    switch (s) {
      case 'idle': this._hiss(0.5, 0.05 * A, d, 0, 3500); this._clank(600, 0.04 * A, d, 0.5, 0.1); this._clank(640, 0.035 * A, d, 0.62, 0.1); break;
      case 'step': for (let i = 0; i < 3; i++) this._clank(rnd(900, 1400), 0.11 * A, d, i * rnd(0.025, 0.04), 0.07); this.noise(0.02, 0.05 * A, 'highpass', 4000, 1, 0, 0, d); break;
      case 'alert': this._shriek(380, 2400, 1.0, 0.3 * A, d); this._hiss(0.4, 0.06 * A, d, 0.9); break;
      case 'attack': this.noise(0.15, 0.25 * A, 'highpass', 1500, 1, 0.3, 0, d); this._clank(400, 0.15 * A, d, 0.05, 0.3); this._hiss(0.2, 0.05 * A, d, 0.1); break;
      case 'hurt': this._shriek(1800, 900, 0.3, 0.1 * A, d); this._hiss(0.3, 0.06 * A, d, 0.1); break;
      case 'die': this._shriek(2200, 120, 1.6, 0.11 * A, d); this._hiss(1.8, 0.07 * A, d, 0.3, 2500);
        for (let i = 0; i < 4; i++) this._clank(rnd(500, 1200), 0.07 * A, d, 1.2 + i * rnd(0.06, 0.12), 0.15); break;
      case 'special': { let k = 0; for (let i = 0; i < 12; i++) { this._tick(0.06 * A, d, k, 3500); k += 0.12 - i * 0.008; } break; }
    }
  }
  /** sentinel: big guard. heavy hydraulic stomps, searchlight relays, HALT klaxon */
  _e_sentinel(s, d, A) {
    switch (s) {
      case 'idle': this._relay(0.12 * A, d); this._relay(0.1 * A, d, 0.14); this.tone(85, 1.0, 'triangle', 0.05 * A, 0.2, 1.1, 0.1, d); this._servo(150, 220, 0.8, 0.03 * A, d, 0.2); break;
      case 'step': this._thud(48, 0.35 * A, d); this._hiss(0.35, 0.06 * A, d, 0.08, 2500); this._clank(140, 0.12 * A, d, 0.02, 0.4); break;
      case 'alert': {
        this._relay(0.15 * A, d); const t = this._t(0.08), dur = 0.75;
        const g = this._env(d, t, 0.2 * A, 0.02, dur, 0.6), bp = this._filt('bandpass', 700, 3);
        bp.frequency.setValueAtTime(600, t); bp.frequency.linearRampToValueAtTime(1100, t + 0.15); bp.frequency.setValueAtTime(1100, t + 0.45); bp.frequency.linearRampToValueAtTime(450, t + 0.65);
        bp.connect(g); for (const f of [392, 415, 196]) { const o = this._osc('square', f, t, dur); o.connect(bp); }
        this.noise(0.04, 0.15 * A, 'highpass', 2500, 1, 0, 0.8, d); this._relay(0.12 * A, d, 0.9); break;
      }
      case 'attack': for (let i = 0; i < 5; i++) { this.noise(0.06, 0.3 * A, 'lowpass', 2500, 0.7, 0.4, i * 0.07, d); this.tone(110, 0.08, 'square', 0.06 * A, 0.001, 0.4, i * 0.07, d); } this._thud(60, 0.2 * A, d); break;
      case 'hurt': this._clank(220, 0.2 * A, d, 0, 0.6); this._crackle(0.2, 0.2 * A, d); break;
      case 'die': {
        const t = this._t(0), o = this._osc('sawtooth', 200, t, 2.2); o.frequency.exponentialRampToValueAtTime(30, t + 2.2);
        const lp = this._filt('lowpass', 800, 1); o.connect(lp); lp.connect(this._env(d, t, 0.1 * A, 0.05, 2.2, 1.2));
        this._thud(40, 0.4 * A, d, 1.6, 0.6); this.noise(1, 0.25 * A, 'lowpass', 1200, 0.7, 0.3, 1.6, d, 'brown'); this._hiss(2, 0.06 * A, d, 0.2, 2500); break;
      }
      case 'special': this._relay(0.12 * A, d); this._servo(160, 260, 1.2, 0.05 * A, d, 0.05); this._relay(0.12 * A, d, 1.25); break;
    }
  }
  /** crawler: swarm of tiny clicking legs, chittering */
  _e_crawler(s, d, A) {
    A *= 2.2;
    switch (s) {
      case 'idle': this._chitter(0.5, 0.06 * A, d, 0, 14); this.tone(rnd(2200, 3000), 0.25, 'sawtooth', 0.01 * A, 0.01, 1.2, 0.1, d); break;
      case 'step': this._chitter(0.12, 0.03 * A, d, 0, 6); break;
      case 'alert': {
        this._chitter(0.7, 0.07 * A, d, 0, 22); const t = this._t(0.05), o = this._osc('square', 90, t, 0.55); o.frequency.exponentialRampToValueAtTime(160, t + 0.5);
        const am = ctx.createGain(); am.gain.value = 0.5; this._lfo(am.gain, 40, 0.5, t, 0.55); const bp = this._filt('bandpass', 800, 2);
        o.connect(bp); bp.connect(am); am.connect(this._env(d, t, 0.08 * A, 0.05, 0.55, 0.3)); break;
      }
      case 'attack': this._chitter(0.15, 0.06 * A, d, 0, 8); this.noise(0.05, 0.2 * A, 'highpass', 2000, 1, 0, 0.12, d); this.tone(600, 0.06, 'square', 0.04 * A, 0.001, 0.5, 0.12, d); break;
      case 'hurt': this.tone(2600, 0.2, 'square', 0.03 * A, 0.004, 0.7, 0, d); this._chitter(0.2, 0.05 * A, d, 0, 8); break;
      case 'die': { let k = 0; for (let i = 0; i < 10; i++) { this._tick(0.05 * A, d, k, rnd(3000, 6000)); k += 0.03 + i * 0.02; } this._crackle(0.5, 0.12 * A, d, 0.2); break; }
      case 'special': for (let i = 0; i < 3; i++) this._chitter(0.5, 0.05 * A, d, i * 0.2, 12); break;
    }
  }
  /** stalker: near silence. creaks, a soft distorted whisper-breath */
  _e_stalker(s, d, A) {
    switch (s) {
      case 'idle': if (Math.random() < 0.6) this._creak(rnd(0.4, 0.9), 0.05 * A, d, 0, rnd(600, 1100)); else this._whisper(rnd(0.8, 1.4), 0.035 * A, d); break;
      case 'step': this.noise(0.02, 0.025 * A, 'bandpass', 1200, 2, 0, 0, d); break;
      case 'alert': this._whisper(0.5, 0.07 * A, d, 0, true); this._creak(0.25, 0.06 * A, d, 0.45, 900); break;
      case 'attack': {
        const t = this._t(0), sN = this._src('white', t, 0.45), ws = this._shaper(true), bp = this._filt('bandpass', 1500, 3);
        bp.frequency.setValueAtTime(1500, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.4); sN.connect(bp); bp.connect(ws); ws.connect(this._env(d, t, 0.18 * A, 0.01, 0.45, 0.15));
        this.noise(0.03, 0.25 * A, 'highpass', 2500, 1, 0, 0.05, d); break;
      }
      case 'hurt': this._creak(0.2, 0.1 * A, d, 0, 700); this.noise(0.06, 0.12 * A, 'bandpass', 400, 5, 0, 0, d); break;
      case 'die': this._creak(1.5, 0.08 * A, d, 0, 650); this._whisper(2, 0.05 * A, d, 0.4); break;
      case 'special': this._whisper(2.5, 0.05 * A, d); break;
    }
  }
  /** construction: diesel engine, saw whine, track clanks, reversing beeper */
  _e_construction(s, d, A) {
    switch (s) {
      case 'idle': this._engine(1.4, 0.1 * A, d, 0, 32); this._clank(300, 0.05 * A, d, 0.4, 0.2); this._clank(280, 0.05 * A, d, 0.9, 0.2); break;
      case 'step': for (let i = 0; i < 3; i++) this._clank(rnd(250, 350), 0.08 * A, d, i * 0.09, 0.15); this.noise(0.3, 0.1 * A, 'lowpass', 200, 0.7, 0, 0, d, 'brown'); break;
      case 'alert': this._engine(1.3, 0.13 * A, d, 0, 32, 70); for (let i = 0; i < 3; i++) this.tone(1000, 0.18, 'square', 0.03 * A, 0.005, 1, i * 0.35, d); this._sawWhine(1.0, 0.05 * A, d, 0.35, 600, 2600); break;
      case 'attack': this._sawWhine(0.8, 0.07 * A, d, 0, 2600, 2400); this._crackle(0.6, 0.2 * A, d, 0.1); break;
      case 'hurt': this._clank(300, 0.2 * A, d, 0, 0.5); this._engine(0.3, 0.08 * A, d, 0.05, 30, 20); break;
      case 'die': { let k = 0; for (let i = 0; i < 6; i++) { this._thud(40, (0.25 - i * 0.03) * A, d, k, 0.2); k += 0.12 + i * 0.05; } this._sawWhine(2, 0.05 * A, d, 0, 2400, 150); this._clank(200, 0.2 * A, d, k, 0.8); this._hiss(1.5, 0.06 * A, d, k); break; }
      case 'special': this._hiss(1, 0.07 * A, d, 0, 2500); this._servo(120, 180, 1, 0.05 * A, d); break;
    }
  }
  _sawWhine(dur, vol, d, dl, f0, f1) {
    const t = this._t(dl), o = this._osc('sawtooth', f0, t, dur); o.frequency.exponentialRampToValueAtTime(F(f1), t + dur * 0.8);
    const bp = this._filt('bandpass', Math.max(f0, f1), 2); o.connect(bp); bp.connect(this._env(d, t, vol * 2, 0.08, dur, dur * 0.6));
    this.noise(dur, vol, 'highpass', 3000, 1, 1, dl, d, 'white', 0.08);
  }
  /** medic: gentle hospital chime melody that corrupts, syringe hiss, heart monitor */
  _e_medic(s, d, A) {
    const bell = (m, k, v = 0.05, slide = 0) => { const f = NOTE(m); this.tone(f, 1.2, 'sine', v * A, 0.003, slide, k, d); this.tone(f * 2.01, 0.6, 'sine', v * 0.35 * A, 0.003, slide, k, d); this.tone(f * 3.98, 0.3, 'sine', v * 0.1 * A, 0.002, slide, k, d); };
    switch (s) {
      case 'idle': { const bad = (Math.random() * 4) | 0; [72, 76, 79, 76].forEach((m, i) => bell(i === bad ? m + rnd(-0.7, 0.7) : m, i * 0.32, 0.045, i === bad ? 0.97 : 0)); break; }
      case 'step': this.noise(0.15, 0.07 * A, 'bandpass', 600, 2, 0, 0, d); if (Math.random() < 0.3) this.tone(2400, 0.05, 'sine', 0.02 * A, 0.005, 1.1, 0.05, d); break;
      case 'alert': [72, 76, 79].forEach((m, i) => bell(m, i * 0.22)); bell(78, 0.66, 0.05, 0.94); bell(73, 0.88, 0.05, 0.9); bell(67.5, 0.88, 0.04, 0.9);
        for (let i = 0; i < 3; i++) this.tone(1000, 0.08, 'square', 0.03 * A, 0.002, 1, 1.2 + i * 0.15, d); break;
      case 'attack': this.noise(0.35, 0.12 * A, 'bandpass', 6000, 3, 0.7, 0.05, d, 'white', 0.01); this._tick(0.08 * A, d, 0, 5000); this.tone(4000, 0.04, 'sine', 0.02 * A, 0.002, 1, 0, d); break;
      case 'hurt': this._bell(rnd(600, 900), 0.8, 0.06 * A, 0, d, [[1, 1, 1], [1.41, 0.6, 0.6], [2.9, 0.4, 0.4], [4.1, 0.2, 0.3]]); this._crackle(0.2, 0.15 * A, d); break;
      case 'die': [0, 0.6, 1.3].forEach((k) => this.tone(1000, 0.08, 'sine', 0.04 * A, 0.002, 1, k, d)); this.tone(1000, 2.5, 'sine', 0.035 * A, 0.01, 1, 2.0, d);
        [72, 67, 63, 60].forEach((m, i) => bell(m, i * 0.4, 0.035, 0.97)); break;
      case 'special': for (let i = 0; i < 4; i++) this.tone(1000, 0.08, 'sine', 0.055 * A, 0.002, 1, i * 0.6, d); bell(79, 0.3, 0.04); break;
    }
  }
  /** dog: quadruped. servo panting, sniffs, metal bark */
  _e_dog(s, d, A) {
    if (s === 'idle' || s === 'special' || s === 'step') A *= 1.8;
    switch (s) {
      case 'idle': for (let i = 0; i < 4; i++) { const k = i * 0.32; this.noise(0.09, 0.04 * A, 'bandpass', 1500, 1.5, 0, k, d); this.noise(0.12, 0.05 * A, 'bandpass', 1100, 1.5, 0, k + 0.12, d); this._servo(600, 800, 0.08, 0.015 * A, d, k); } break;
      case 'step': [0, 0.05, 0.13, 0.18].forEach((k) => this._clank(rnd(1100, 1500), 0.04 * A, d, k, 0.05)); break;
      case 'alert': this._bark(0.14 * A, d); this._bark(0.14 * A, d, 0.28); this._growl(0.6, 0.06 * A, d, 0.6); break;
      case 'attack': this.noise(0.05, 0.25 * A, 'highpass', 2000, 1, 0, 0, d); this._clank(900, 0.1 * A, d, 0, 0.2); this._growl(0.4, 0.08 * A, d, 0.03); break;
      case 'hurt': { const t = this._t(0), o = this._osc('sawtooth', 1200, t, 0.25); o.frequency.exponentialRampToValueAtTime(600, t + 0.22); const bp = this._filt('bandpass', 1200, 2); o.connect(bp); bp.connect(this._env(d, t, 0.1 * A, 0.005, 0.25, 0.05)); this._servo(800, 400, 0.15, 0.02 * A, d, 0.2); break; }
      case 'die': this.tone(900, 1.2, 'triangle', 0.04 * A, 0.02, 0.22, 0, d); for (let i = 0; i < 4; i++) this._clank(rnd(400, 900), 0.08 * A, d, 1 + i * 0.08, 0.2); this._hiss(1, 0.05 * A, d, 1.1); break;
      case 'special': for (let i = 0; i < 4; i++) this.noise(0.07, 0.06 * A, 'bandpass', 2500, 2, 1.6, i * 0.11, d); break;
    }
  }
  /** heavy: walking tank. sub thuds, charging whine, cannon boom */
  _e_heavy(s, d, A) {
    switch (s) {
      case 'idle': this.tone(36, 1.6, 'sine', 0.15 * A, 0.3, 1, 0, d); this.tone(72, 1.4, 'triangle', 0.03 * A, 0.3, 1, 0, d); this._creak(0.6, 0.04 * A, d, 0.4, 300); break;
      case 'step': this._thud(34, 0.5 * A, d, 0, 0.5); this.noise(0.6, 0.25 * A, 'lowpass', 180, 0.7, 0, 0, d, 'brown'); this._clank(110, 0.12 * A, d, 0.02, 0.5); break;
      case 'alert': this.tone(180, 1.3, 'sawtooth', 0.035 * A, 0.9, 14, 0, d); this.tone(360, 1.3, 'sine', 0.02 * A, 0.9, 10, 0, d); this.tone(60, 1.2, 'sine', 0.2 * A, 0.02, 0.5, 0, d); this._relay(0.15 * A, d, 1.3); break;
      case 'attack': this.tone(300, 0.5, 'sawtooth', 0.035 * A, 0.4, 8, 0, d); this._boom(0.55 * A, d, 0.5); break;
      case 'hurt': this._clank(160, 0.25 * A, d, 0, 0.9); this._hiss(0.4, 0.06 * A, d, 0.05); break;
      case 'die': { const t = this._t(0), o = this._osc('sawtooth', 400, t, 2.5); o.frequency.exponentialRampToValueAtTime(25, t + 2.5); const lp = this._filt('lowpass', 900, 1); o.connect(lp); lp.connect(this._env(d, t, 0.1 * A, 0.05, 2.5, 1.5)); this._boom(0.5 * A, d, 2.2); break; }
      case 'special': { const o = this.tone(120, 2, 'sawtooth', 0.08 * A, 1.8, 20, 0, d); if (o) this._lfo(o.frequency, 12, 15, ctx.currentTime, 2); break; }
    }
  }
  /** unknown: harmonic glass resonance and reversed tones */
  _e_unknown(s, d, A) {
    switch (s) {
      case 'idle': { const f = NOTE(pick([57, 60, 64])); this._glass(f, 3, 0.03 * A, 0, d, 0.4); this._glass(f * 1.498, 3, 0.02 * A, 0.1, d, 0.5); this._rev(f * 2, 1.2, 0.03 * A, 0.8, d); break; }
      case 'step': { const f = rnd(2500, 3500); this.tone(f, 0.25, 'sine', 0.015 * A, 0.002, 1, 0, d); this.tone(f * 2.32, 0.12, 'sine', 0.006 * A, 0.002, 1, 0, d); break; }
      case 'alert': [64, 70, 75].forEach((m, i) => this._glass(NOTE(m), 3, 0.03 * A, i * 0.08, d, 0.5)); this._rev(NOTE(52), 0.9, 0.06 * A, 0, d, 'triangle'); this.tone(41, 1.5, 'sine', 0.12 * A, 0.3, 1, 0.8, d); break;
      case 'attack': this._rev(NOTE(76), 0.6, 0.05 * A, 0, d); this.noise(0.6, 0.06 * A, 'bandpass', 2000, 2, 2, 0, d, 'white', 0.58); this.noise(0.1, 0.25 * A, 'highpass', 3000, 1, 0, 0.6, d); this._glass(NOTE(88), 0.6, 0.03 * A, 0.6, d, 0.002); break;
      case 'hurt': for (let i = 0; i < 4; i++) this.tone(NOTE(84 - i * 3), 0.6, 'sine', 0.025 * A, 0.01, 0.9, i * 0.06, d); break;
      case 'die': this.glassBreak(null, d, A); this._glass(NOTE(57), 4.5, 0.04 * A, 0.1, d, 0.3); this._glass(NOTE(63), 4.5, 0.03 * A, 0.2, d, 0.3); this._rev(NOTE(69), 2, 0.04 * A, 0.5, d); break;
      case 'special': [76, 75, 71].forEach((m, i) => this._rev(NOTE(m), 0.5, 0.045 * A, i * 0.55, d)); break;
    }
  }
  /** foreman (boss): huge industrial roar, alarms, sub bass */
  _e_foreman(s, d, A) {
    switch (s) {
      case 'idle': this._roar(45, 2, 0.1 * A, d); this.tone(660, 0.2, 'square', 0.015 * A, 0.01, 1, 0.5, d); this.tone(550, 0.2, 'square', 0.015 * A, 0.01, 1, 0.75, d); break;
      case 'step': this._thud(30, 0.6 * A, d, 0, 0.6); this._clank(90, 0.2 * A, d, 0.03, 0.8); for (let i = 0; i < 6; i++) this._clank(rnd(800, 1500), 0.03 * A, d, 0.1 + i * rnd(0.03, 0.05), 0.08); break;
      case 'alert': this._roar(38, 2.6, 0.28 * A, d); this._siren(700, 520, 3, 0.7, 0.05 * A, d, 0.2); this.tone(28, 2.5, 'sine', 0.25 * A, 0.1, 0.9, 0, d); break;
      case 'attack': this._hiss(0.15, 0.08 * A, d, 0, 2000); this._boom(0.6 * A, d, 0.15); this._clank(70, 0.3 * A, d, 0.15, 1.2); break;
      case 'hurt': this._roar(60, 0.8, 0.14 * A, d); this._clank(180, 0.2 * A, d, 0, 0.7); this._crackle(0.4, 0.2 * A, d); break;
      case 'die': {
        this._roar(50, 4, 0.24 * A, d, 0, 0.4); [1.5, 2.6, 3.4].forEach((k) => this._boom(0.4 * A, d, k));
        const t = this._t(0), o = this._osc('sawtooth', 700, t, 4); o.frequency.exponentialRampToValueAtTime(90, t + 4); const lp = this._filt('lowpass', 1500, 1); o.connect(lp); lp.connect(this._env(d, t, 0.04 * A, 0.05, 4, 2)); break;
      }
      case 'special': this._siren(700, 520, 4, 0.7, 0.06 * A, d); this.tone(30, 2.8, 'sine', 0.25 * A, 1.5, 1, 0, d); break;
    }
  }

  /* =========================================================== world */
  metalScrape(pos) { if (!ctx) return; const P = this._place(pos, 16); if (P.a <= 0) return; this._scrape(rnd(1.1, 1.8), 0.1 * P.a, P.d); }
  distantBang() {
    if (!ctx) return; const d = this._rpan(0.9, 1500), f = rnd(90, 160);
    this._clank(f, 0.25, d, 0, 1.2); this.noise(0.8, 0.3, 'lowpass', 400, 0.7, 0.5, 0, d, 'brown'); this._clank(f * 1.1, 0.08, d, rnd(0.35, 0.5), 0.8);
  }
  door(kind = 'slide', pos = null) {
    if (!ctx) return; const P = this._place(pos, 12); if (P.a <= 0) return; const d = P.d, A = P.a;
    switch (kind) {
      case 'heavy': this._engine(2.2, 0.07 * A, d, 0, 45, 50); this.noise(2, 0.1 * A, 'bandpass', 300, 1, 0, 0.1, d, 'brown', 0.3); this._clank(120, 0.2 * A, d, 0, 0.6); this._thud(50, 0.4 * A, d, 2.2); this._clank(90, 0.25 * A, d, 2.2, 1); break;
      case 'locked': for (let i = 0; i < 4; i++) this._clank(rnd(900, 1200), 0.06 * A, d, i * 0.05, 0.06); this._thud(110, 0.12 * A, d, 0.22, 0.15); this.tone(180, 0.15, 'square', 0.03 * A, 0.005, 0.9, 0.3, d); break;
      case 'wood': this._creak(1.0, 0.1 * A, d, 0.05, rnd(500, 700)); this.noise(0.03, 0.12 * A, 'bandpass', 2000, 1, 0, 0, d); this._thud(90, 0.08 * A, d, 1.05, 0.2); break;
      case 'shutter': this._engine(1.4, 0.04 * A, d, 0, 60); for (let i = 0; i < 24; i++) this._clank(rnd(600, 1000), 0.025 * A, d, i * 0.055, 0.06); this._clank(200, 0.2 * A, d, 1.35, 0.5); break;
      default: this._hiss(0.25, 0.08 * A, d); this._servo(400, 700, 0.6, 0.04 * A, d, 0.05); this.noise(0.6, 0.05 * A, 'bandpass', 800, 1, 0.6, 0.05, d);
        this.tone(110, 0.15, 'sine', 0.15 * A, 0.003, 0.6, 0.62, d); this.noise(0.1, 0.1 * A, 'lowpass', 600, 0.7, 0, 0.62, d);
    }
  }
  elevator(state = 'ding') {
    if (!ctx) return; const d = this.sfx;
    if (state === 'start') { this._thud(70, 0.25, d); this._clank(150, 0.1, d, 0, 0.5); this.tone(40, 0.8, 'sawtooth', 0.02, 0.6, 2, 0.05, d); }
    else if (state === 'stop') { this.tone(80, 0.6, 'sawtooth', 0.02, 0.02, 0.5, 0, d); this._thud(60, 0.3, d, 0.5); this._clank(160, 0.12, d, 0.5, 0.5); this._thud(70, 0.1, d, 0.75, 0.2); }
    else { this._bell(NOTE(76), 1.6, 0.06); this._bell(NOTE(72), 2, 0.055, 0.35); }
  }
  generatorStart() {
    if (!ctx) return;
    for (let i = 0; i < 4; i++) this._engine(0.18, 0.08, this.sfx, i * 0.25, 18, 22);
    this._engine(2, 0.12, this.sfx, 1.1, 20, 29);
    for (let i = 0; i < 3; i++) this.noise(0.05, 0.1, 'lowpass', 800, 0.7, 0, 1.2 + i * rnd(0.1, 0.25), this.sfx, 'brown');
  }
  powerDown() {
    if (!ctx) return; const t = this._t(0);
    const o = this._osc('sawtooth', 120, t, 2.5); o.frequency.exponentialRampToValueAtTime(18, t + 2.5); const lp = this._filt('lowpass', 600, 1); o.connect(lp); lp.connect(this._env(this.sfx, t, 0.07, 0.01, 2.5, 0.8));
    this.tone(60, 2.2, 'sine', 0.1, 0.01, 0.3); this._thud(80, 0.2, this.sfx); this._clank(200, 0.12, this.sfx);
    for (let i = 0; i < 3; i++) this._crackle(0.08, 0.1, this.sfx, rnd(0.1, 1.2));
  }
  powerUp() {
    if (!ctx) return; const t = this._t(0);
    for (const k of [0, 0.18, 0.3]) this._relay(0.15, this.sfx, k);
    this.tone(20, 2, 'sine', 0.1, 1.5, 3, 0.2);
    const o = this._osc('sawtooth', 30, t, 2.2); o.frequency.exponentialRampToValueAtTime(120, t + 2); const lp = this._filt('lowpass', 500, 1); o.connect(lp); lp.connect(this._env(this.sfx, t, 0.05, 1.5, 2.2, 0.3));
    for (let i = 0; i < 5; i++) { const k = rnd(0.8, 1.8); this.tone(rnd(2600, 4000), 0.03, 'triangle', 0.02, 0.001, 1, k); this.tone(100, 0.05, 'square', 0.012, 0.002, 1, k); }
  }
  breaker(on) {
    if (!ctx) return; this._clank(260, 0.2, this.sfx, 0, 0.3); this._thud(90, 0.2, this.sfx);
    if (on) { this._crackle(0.2, 0.2, this.sfx, 0.02); this.tone(60, 0.5, 'sawtooth', 0.02, 0.1, 1, 0.05); }
    else this.tone(120, 0.4, 'sawtooth', 0.02, 0.01, 0.4, 0.02);
  }
  phoneRing(pos, on) { if (on) { if (this.phone) this.phone.pos = pos; else this.phone = { pos, next: 0 }; } else this.phone = null; }
  radioStatic(pos, dur = 2) {
    if (!ctx) return; dur = clamp(fin(dur, 2), 0.1, 20); const P = this._place(pos, 10); if (P.a <= 0) return; const d = P.d, A = P.a, t = this._t(0);
    const s = this._src('white', t, dur), bp = this._filt('bandpass', 2200, 0.6), g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t);
    for (let k = 0; k < dur; k += 0.03) g.gain.setValueAtTime(Math.random() < 0.15 ? 0.1 : rnd(0.4, 1), t + k);
    s.connect(bp); bp.connect(g); g.connect(this._env(d, t, 0.12 * A, 0.01, dur, dur * 0.85));
    this.noise(dur, 0.25 * A, 'highpass', 1500, 0.7, 0, 0, d, 'crackle', 0.01);
    for (let k = rnd(0.1, 0.6); k < dur - 0.3; k += rnd(0.5, 1.5)) this.tone(rnd(900, 1500), rnd(0.2, 0.5), 'sine', 0.01 * A, 0.05, rnd(0.6, 1.6), k, d);
  }
  conductor(text) {
    const syl = syllables(text), S = 0.2;
    let vd = 0; for (const s of syl) vd += S + s.pause * 1.2;
    const intro = 1.5, total = intro + vd + 0.6;
    if (!ctx) return total;
    const t0 = this._t(0.02), tv = t0 + intro, tEnd = tv + vd + 0.5;
    // public address chain: soft distortion, band limit, honk, a long city echo
    const pa = ctx.createGain(); pa.gain.value = 1;
    const sh = this._shaper(false), hp = this._filt('highpass', 260, 0.7), lp = this._filt('lowpass', 3600, 0.7), pk = ctx.createBiquadFilter();
    pk.type = 'peaking'; pk.frequency.value = 1600; pk.gain.value = 5; pk.Q.value = 1;
    const out = ctx.createGain(); out.gain.value = 0.55; const wet = ctx.createGain(); wet.gain.value = 0.55;
    pa.connect(sh); sh.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(out); out.connect(this.mix); out.connect(wet); wet.connect(this.revIn);
    const dly = ctx.createDelay(1); dly.delayTime.value = 0.38; const fb = ctx.createGain(); fb.gain.value = 0.28; const dlp = this._filt('lowpass', 2000, 0.7), eo = ctx.createGain(); eo.gain.value = 0.35;
    lp.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(dlp); dlp.connect(eo); eo.connect(this.mix); eo.connect(this.revIn);
    setTimeout(() => { try { for (const n of [pa, sh, hp, pk, lp, out, wet, dly, fb, dlp, eo]) n.disconnect(); } catch (e) { /* gone */ } }, (total + 5) * 1000);
    // intro: static + three descending, beating chimes
    this.noise(0.3, 0.06, 'bandpass', 2000, 0.6, 0, 0, pa); this.noise(0.4, 0.15, 'highpass', 1500, 0.7, 0, 0, pa, 'crackle');
    [76, 72, 68].forEach((m, i) => { this._bell(NOTE(m), 1.4, 0.07, 0.15 + i * 0.32, pa); this._bell(NOTE(m) * 1.012, 1.4, 0.035, 0.15 + i * 0.32, pa); });
    this.tone(39, vd + 1.5, 'sine', 0.07, 0.6, 1, intro - 0.4, this.mix);
    // the voice: carriers -> three formant filters -> syllable gate
    const T = tEnd - t0, base = 78;
    const src = ctx.createGain(); src.gain.value = 1;
    const o1 = this._osc('sawtooth', base, t0, T), o2 = this._osc('sawtooth', base * 0.5, t0, T), o3 = this._osc('square', base * 1.498, t0, T);
    [[o1, 0.5], [o2, 0.45], [o3, 0.12]].forEach(([o, v]) => { const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(src); });
    const nz = this._src('white', t0, T), nf = ctx.createGain(); nf.gain.value = 0; nz.connect(nf);
    const fsum = ctx.createGain(); fsum.gain.value = 1;
    const fl = [[7, 1.6], [11, 1.1], [13, 0.7]].map(([q, g]) => { const f = this._filt('bandpass', 800, q), gg = ctx.createGain(); gg.gain.value = g; src.connect(f); f.connect(gg); gg.connect(fsum); return f; });
    nf.connect(fl[1]); nf.connect(fl[2]);
    const env = ctx.createGain(); env.gain.value = 0; env.gain.setValueAtTime(0, t0); fsum.connect(env); env.connect(pa);
    const rm = ctx.createGain(); rm.gain.value = 0; this._lfo(rm.gain, 31, 1, t0, T); const rmo = ctx.createGain(); rmo.gain.value = 0.5; env.connect(rm); rm.connect(rmo); rmo.connect(pa);
    const dd = ctx.createDelay(0.5); dd.delayTime.value = 0.09; const dg = ctx.createGain(); dg.gain.value = 0.35; env.connect(dd); dd.connect(dg); dg.connect(pa);
    let ts = tv, sent = 0; const sentLen = Math.max(1, syl.length);
    syl.forEach((s) => {
      const v = VOWELS[s.v], k = 0.82, prog = sent / sentLen;
      fl.forEach((f, j) => f.frequency.setTargetAtTime(v[j] * k, ts, 0.025));
      const p = base * pick([1, 1, 1, 1.06, 0.94, 1.12, 0.89]) * (1 - 0.12 * prog);
      o1.frequency.setValueAtTime(p, ts); o2.frequency.setValueAtTime(p * 0.5, ts); o3.frequency.setValueAtTime(p * 1.498, ts);
      env.gain.setTargetAtTime(1, ts, 0.012); env.gain.setTargetAtTime(0.08, ts + S * 0.62, 0.03);
      if (Math.random() < 0.45) { nf.gain.setTargetAtTime(0.5, ts, 0.005); nf.gain.setTargetAtTime(0, ts + 0.05, 0.02); }
      ts += S; sent++;
      if (s.pause > 0.05) { env.gain.setTargetAtTime(0, ts - S * 0.3, 0.04); ts += s.pause * 1.2; }
      if (s.end) sent = 0;
    });
    env.gain.setTargetAtTime(0, ts, 0.05);
    this.noise(0.15, 0.08, 'bandpass', 1500, 0.6, 0, ts - ctx.currentTime + 0.15, pa, 'crackle'); this.tone(NOTE(56), 0.8, 'sine', 0.03, 0.01, 1, ts - ctx.currentTime + 0.2, pa);
    return total;
  }
  spark(pos) {
    if (!ctx) return; const P = this._place(pos, 10); if (P.a <= 0) return; const d = P.d, A = P.a;
    this._crackle(0.3, 0.25 * A, d); this.tone(4000, 0.05, 'sawtooth', 0.04 * A, 0.001, 0.3, 0, d); this.noise(0.1, 0.1 * A, 'highpass', 5000, 1, 0, 0, d);
    for (let i = 0; i < 2; i++) this._tick(0.1 * A, d, rnd(0.05, 0.3), 3000);
  }
  glassBreak(pos, dest, att) {
    if (!ctx) return; let d = dest, A = att;
    if (!d) { const P = this._place(pos, 14); if (P.a <= 0) return; d = P.d; A = P.a; }
    this.noise(0.4, 0.35 * A, 'highpass', 2500, 0.7, 0.6, 0, d); this.noise(0.15, 0.2 * A, 'lowpass', 600, 0.7, 0, 0, d, 'brown');
    for (let i = 0; i < 14; i++) this.tone(rnd(2500, 7000), rnd(0.03, 0.15), 'sine', 0.03 * A, 0.001, rnd(0.95, 1.02), Math.random() * 0.6, d);
  }
  emp(pos) {
    if (!ctx) return; const P = this._place(pos, 22); if (P.a <= 0) return; const d = P.d, A = P.a;
    this.tone(300, 0.5, 'sine', 0.05 * A, 0.4, 6, 0, d);
    const o = this.tone(90, 1.2, 'sine', 0.4 * A, 0.005, 0.3, 0.5, d); if (o) this._lfo(o.frequency, 9, 20, ctx.currentTime + 0.5, 1.2);
    this.noise(0.8, 0.3 * A, 'lowpass', 800, 0.7, 0.3, 0.5, d, 'brown'); this._crackle(1.5, 0.2 * A, d, 0.5); this.tone(6000, 0.4, 'sawtooth', 0.02 * A, 0.002, 0.05, 0.5, d);
  }
  decoy(pos, on) {
    const near = (a, b) => a && b && Math.hypot(fin(a.x) - fin(b.x), fin(a.z) - fin(b.z)) < 1;
    if (on) {
      const e = this.decoys.find((x) => x.pos === pos || near(x.pos, pos));
      if (e) e.pos = pos; else { this.decoys.push({ pos, next: 0, n: 0 }); if (this.decoys.length > 4) this.decoys.shift(); }
    } else if (!pos) this.decoys = [];
    else {
      const i = this.decoys.findIndex((x) => x.pos === pos || near(x.pos, pos));
      if (i >= 0) this.decoys.splice(i, 1);
    }
  }
  prodZap(pos) {
    if (!ctx) return; const P = this._place(pos, 10); if (P.a <= 0) return; const d = P.d, A = P.a, t = this._t(0);
    const o = this._osc('square', 60, t, 0.45), o2 = this._osc('sawtooth', 121, t, 0.45), ws = this._shaper(true), hp = this._filt('highpass', 300, 0.7), am = ctx.createGain(); am.gain.value = 0.6;
    this._lfo(am.gain, 30, 0.4, t, 0.45, 'square'); o.connect(ws); o2.connect(ws); ws.connect(hp); hp.connect(am); am.connect(this._env(d, t, 0.08 * A, 0.003, 0.45, 0.25));
    this._crackle(0.4, 0.25 * A, d); this.noise(0.03, 0.3 * A, 'highpass', 2500, 1, 0, 0, d);
  }
  hitMetal(pos, heavy) {
    if (!ctx) return; const P = this._place(pos, 14); if (P.a <= 0) return;
    if (heavy) { this._clank(rnd(110, 150), 0.3 * P.a, P.d, 0, 1.2); this._thud(60, 0.3 * P.a, P.d); }
    else { this._clank(rnd(300, 500), 0.2 * P.a, P.d, 0, 0.5); this.noise(0.05, 0.1 * P.a, 'highpass', 3000, 1, 0, 0, P.d); }
  }
  explosion(pos) {
    if (!ctx) return; const P = this._place(pos, 40, 400); if (P.a <= 0) return; const d = P.d, A = P.a;
    this._boom(0.7 * A, d); this.noise(3, 0.25 * A, 'lowpass', 200, 0.7, 0.5, 0.2, d, 'brown', 0.3);
    for (let i = 0; i < 5; i++) this._clank(rnd(200, 900), 0.05 * A, d, rnd(0.3, 1.2), 0.2);
  }
  keypad(ok) {
    if (!ctx) return; this.keyPress();
    if (ok) { this.tone(1200, 0.1, 'sine', 0.05, 0.003, 1, 0.12); this.tone(1800, 0.18, 'sine', 0.05, 0.003, 1, 0.22); this._relay(0.1, this.sfx, 0.35); }
    else { this.tone(300, 0.35, 'square', 0.04, 0.005, 1, 0.12); this.tone(290, 0.35, 'square', 0.03, 0.005, 1, 0.12); }
  }
  cableConnect() { if (!ctx) return; this.noise(0.03, 0.2, 'bandpass', 2500, 1); this._clank(1500, 0.05, this.sfx); this.tone(60, 0.4, 'sawtooth', 0.025, 0.01, 1, 0.05); this.tone(880, 0.15, 'sine', 0.03, 0.005, 2, 0.08); }
  valve() {
    if (!ctx) return; const t = this._t(0);
    const o = this._osc('sawtooth', 800, t, 0.6); this._lfo(o.frequency, 7, 60, t, 0.6); o.frequency.linearRampToValueAtTime(700, t + 0.6);
    const bp = this._filt('bandpass', 1600, 6); o.connect(bp); bp.connect(this._env(this.sfx, t, 0.05, 0.05, 0.6, 0.3));
    this._creak(0.6, 0.08, this.sfx, 0, 900); this.noise(1.3, 0.1, 'highpass', 3000, 0.7, 0.5, 0.5, this.sfx, 'white', 0.1);
  }
  footstepsFake(pos) {
    if (!ctx) return; const P = this._place(pos, 10); if (P.a <= 0) return;
    const n = 3 + ((Math.random() * 3) | 0), gap = rnd(0.48, 0.6);
    for (let i = 0; i < n; i++) this._stepSound('concrete', 0.09 * P.a * (1 - i * 0.08), P.d, i * gap + rnd(-0.03, 0.03));
  }
  whisperMachine(pos) {
    if (!ctx) return; const P = this._place(pos, 9); if (P.a <= 0) return;
    this._whisper(1.4, 0.05 * P.a, P.d);
    for (let i = 0; i < 10; i++) this.tone(rnd(900, 2600), 0.04, 'square', 0.008 * P.a, 0.002, rnd(0.8, 1.25), 0.2 + i * 0.07, P.d);
  }

  /* =========================================================== music */
  setTension(v) { this.tension = clamp(fin(v, 0), 0, 1); }
  setChase(on) { this.chase = !!on; }
  setMusic(name) {
    if (!['none', 'safe', 'wonder', 'boss'].includes(name)) name = 'none';
    if (name === this.musicName) return; this.musicName = name;
    if (ctx) this._styleSwitch();
  }
  stinger(kind) {
    if (!ctx) return; const M = this.music;
    switch (kind) {
      case 'jump': {
        const d = this.sfx; this.noise(0.6, 0.35, 'highpass', 1200, 0.7, 0.5, 0, d);
        const g = this._env(d, this._t(0), 0.12, 0.003, 1.3, 0.1), ws = this._shaper(true), lp = this._filt('lowpass', 3000, 1); ws.connect(lp); lp.connect(g);
        for (const m of [52, 53, 58, 59, 64]) { const t = this._t(0), o = this._osc('sawtooth', NOTE(m), t, 1.3); o.frequency.exponentialRampToValueAtTime(NOTE(m) * 0.94, t + 1.3); o.connect(ws); }
        this.tone(55, 0.8, 'sine', 0.35, 0.002, 0.5, 0, d); this._shriek(2600, 1800, 0.7, 0.06, d); break;
      }
      case 'reveal': this._pad(NOTE(28), 4, 0.08, 0, M, { type: 'sawtooth', cut: 300, att: 1, rel: 2 }); this._brass([40, 47, 52, 55], 3.5, 0.06, 0.2, M, 0.4); this._bell(NOTE(64), 3, 0.04, 0.2, M); this._thud(55, 0.3, M, 0.2, 1); break;
      case 'boss': this._boom(0.4, M); this._brass([40, 41, 47, 52, 53], 3, 0.07, 0, M, 0.08); for (const k of [0, 0.35, 0.7]) { this._thud(70, 0.35, M, k, 0.5); this.noise(0.3, 0.2, 'lowpass', 400, 0.7, 0.3, k, M, 'brown'); } break;
      case 'safe': for (const m of [53, 57, 60, 64, 67]) this._pad(NOTE(m), 5, 0.025, 0, M, { att: 1.2, rel: 3, cut: 1500 }); this._piano(NOTE(72), 3, 0.06, 1, M); this._piano(NOTE(76), 3, 0.05, 1.6, M); break;
      default: // dread
        for (const m of [40, 41, 47]) this._pad(NOTE(m), 5.5, 0.06, 0, M, { type: 'sawtooth', cut: 400, att: 3, rel: 1.5, det: 10 });
        this.noise(5, 0.15, 'lowpass', 300, 0.7, 2, 0, M, 'brown', 3.5);
        this.tone(NOTE(95), 5, 'sine', 0.012, 4, 1, 0, M); this.tone(NOTE(96), 5, 'sine', 0.01, 4, 1, 0, M);
    }
  }
  _tensionTick(t, dt) {
    const T = this.tensionLvl;
    if (T > 0.005 && !this.dr) {
      const G = (to) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(to); return g; };
      const gD = G(this.music), lp = this._filt('lowpass', 150, 0.8); lp.connect(gD); this._lfo(lp.frequency, 0.05, 40, t, 0);
      for (const f of [41.2, 41.2 * 1.007]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); }
      const gX = G(this.music), lx = this._filt('lowpass', 320, 0.7); lx.connect(gX);
      for (const [type, f] of [['triangle', 43.65], ['sine', 87.3]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lx); o.start(t); }
      const gH = G(this.music);
      for (const f of [1318.5, 1396.9]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.5; this._lfo(g.gain, rnd(0.1, 0.3), 0.4, t, 0); o.connect(g); g.connect(gH); o.start(t); }
      const s = ctx.createBufferSource(); s.buffer = this.bufs.white; s.loop = true; const bf = this._filt('bandpass', 3000, 20); this._lfo(bf.frequency, 0.07, 600, t, 0); const bg = ctx.createGain(); bg.gain.value = 3; s.connect(bf); bf.connect(bg); bg.connect(gH); s.start(t);
      this.dr = { gD, lp, gX, gH, sent: -1 };
    }
    if (this.dr && Math.abs(T - this.dr.sent) > 0.003) {
      const r = this.dr; r.sent = T;
      r.gD.gain.setTargetAtTime(0.22 * sstep(0, 0.5, T), t, 0.1); r.lp.frequency.setTargetAtTime(120 + 900 * T * T, t, 0.2);
      r.gX.gain.setTargetAtTime(0.09 * sstep(0.35, 0.85, T), t, 0.1); r.gH.gain.setTargetAtTime(0.025 * sstep(0.55, 1, T), t, 0.1);
    }
    if (T > 0.3) {
      if (!this.pulseNext || this.pulseNext < t - 0.5) this.pulseNext = t + 0.05;
      while (this.pulseNext < t + 0.15) {
        const dl = this.pulseNext - t, k = sstep(0.3, 1, T), gap = 1.5 - 1.1 * k;
        this.tone(50, 0.35, 'sine', 0.06 + 0.2 * k, 0.004, 0.6, dl, this.music);
        if (T > 0.72) this._tick(0.03 * k, this.music, dl + gap * 0.5, 3000);
        this.pulseNext += gap;
      }
    } else this.pulseNext = 0;
    this._every('moan', dt, () => rnd(9, 22), () => { if (T > 0.15 && T < 0.9 && Math.random() < 0.7) this._bowed(rnd(180, 420), rnd(3, 6), 0.02 + 0.02 * T, this.music); });
  }
  _chaseTick(t) {
    if (this.chaseLvl <= 0.005 && !this.chase) { if (this.cBus && this.cBus.sent !== 0) { this.cBus.gain.setTargetAtTime(0, t, 0.1); this.cBus.sent = 0; } return; }
    if (!this.cBus) { this.cBus = ctx.createGain(); this.cBus.gain.value = 0; this.cBus.connect(this.music); this.cBus.sent = 0; this.cNext = 0; this.cStep = 0; }
    if (Math.abs(this.cBus.sent - this.chaseLvl) > 0.01) { this.cBus.gain.setTargetAtTime(this.chaseLvl * 0.9, t, 0.05); this.cBus.sent = this.chaseLvl; }
    const sp = 60 / 164 / 4;
    if (!this.cNext || this.cNext < t - 0.5) this.cNext = t + 0.05;
    while (this.cNext < t + 0.2) { this._chaseStep(this.cStep++, this.cNext - t); this.cNext += sp; }
  }
  _chaseStep(i, dl) {
    const B = this.cBus, s = i % 16, bar = ((i / 16) | 0) % 4, sp = 60 / 164 / 4;
    if (s === 0 || s === 6 || s === 10 || (s === 3 && bar % 2)) { this.tone(58, 0.22, 'sine', 0.45, 0.002, 0.45, dl, B); this.noise(0.01, 0.1, 'highpass', 3000, 1, 0, dl, B); }
    if (s === 4 || s === 12) { this.noise(0.14, 0.22, 'bandpass', 1900, 0.9, 0.6, dl, B); this._clank(rnd(380, 420), 0.1, B, dl, 0.18); }
    this.noise(0.03, s % 2 ? 0.05 : 0.025, 'highpass', 7500, 0.7, 0, dl, B);
    const seq = [0, 0, 12, 0, 0, 1, 0, 0, 0, 0, 12, 0, 3, 1, 0, 1], root = [28, 28, 29, 26][bar];
    this._bass(NOTE(root + seq[s]), sp * 0.9, 0.09, dl, B);
    if (s === 0 && bar === 0) this._clank(rnd(150, 200), 0.12, B, dl, 0.6);
    if (s === 8 && bar === 3) this.noise(sp * 8, 0.08, 'bandpass', 800, 2, 6, dl, B, 'white', sp * 7.5);
  }
  _styleSwitch() {
    const t = ctx.currentTime;
    if (this.sBus) {
      const old = this.sBus; old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(old.gain.value, t); old.gain.linearRampToValueAtTime(0, t + 3);
      setTimeout(() => { try { old.disconnect(); } catch (e) { /* gone */ } }, 3500);
    }
    this.sBus = null; if (this.musicName === 'none') return;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 2.5); g.connect(this.music);
    this.sBus = g; this.sNext = t + 0.3; this.sStep = 0; this.sName = this.musicName;
  }
  _styleTick(t) {
    if (!this.sBus) return; const B = this.sBus, name = this.sName;
    const len = name === 'boss' ? 0.14 : name === 'wonder' ? 0.5 : 1.0;
    if (this.sNext < t - 1) this.sNext = t + 0.1;
    while (this.sNext < t + 0.3) {
      const dl = this.sNext - t, s = this.sStep++;
      if (name === 'safe') {
        const ch = [[57, 64, 67, 72], [53, 60, 64, 69], [48, 55, 64, 67], [50, 57, 60, 65]][((s / 8) | 0) % 4];
        if (s % 8 === 0) { for (const m of ch.slice(0, 3)) this._pad(NOTE(m), 9.5, 0.026, dl, B, { att: 2.5, rel: 3, cut: 900 }); this._pad(NOTE(ch[0] - 12), 9.5, 0.04, dl, B, { type: 'sine', att: 2, rel: 3 }); }
        if (s % 8 !== 7 && Math.random() < 0.38) { const m = pick([...ch, ch[0] + 14]) + 12, k = rnd(0, 0.3); this._piano(NOTE(m), 3, 0.05, dl + k, B); if (Math.random() < 0.25) this._piano(NOTE(m), 2, 0.02, dl + k + 0.5, B); }
      } else if (name === 'wonder') {
        const ch = [[50, 57, 64, 66, 69], [52, 59, 64, 68, 71], [47, 54, 62, 66, 69], [43, 50, 57, 62, 66]][((s / 16) | 0) % 4];
        if (s % 16 === 0) { for (const m of ch.slice(0, 4)) this._pad(NOTE(m), 9, 0.02, dl, B, { type: 'sine', att: 2.5, rel: 3, cut: 2400 }); this._pad(NOTE(ch[0] + 12), 9, 0.012, dl, B, { att: 3, rel: 3, cut: 2400 }); }
        if (Math.random() < 0.55) this._glass(NOTE(pick(ch) + pick([12, 24])), 2.5, 0.022, dl, B, 0.01);
        if (s % 16 === 8 && Math.random() < 0.5) this.tone(NOTE(pick(ch) + 36), 3, 'sine', 0.006, 1.2, 1, dl, B);
      } else if (name === 'boss') {
        const st = s % 7, bar = (s / 7) | 0, root = 28 + [0, 0, 1, -2][bar % 4];
        this._bass(NOTE(root + [0, 0, 7, 0, 0, 3, 1][st]), 0.13, 0.08, dl, B);
        if (st === 0 || st === 4) { this._thud(62, 0.3, B, dl, 0.4); this.noise(0.25, 0.12, 'lowpass', 500, 0.7, 0.4, dl, B, 'brown'); }
        if (st === 2 || st === 6) this.noise(0.04, 0.04, 'highpass', 6000, 0.7, 0, dl, B);
        if (st === 0 && bar % 2 === 0) this._brass([40, 47, 52, 55].map((m) => m + root - 28), 0.7, 0.035, dl, B, 0.05);
        if (st === 0 && bar % 8 === 0) this._clank(rnd(70, 90), 0.15, B, dl, 2.5);
      }
      this.sNext += len;
    }
  }
}
