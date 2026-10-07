/* main.js - boot: art, renderer, post effects, the title screen, the loop. */
import * as THREE from '../lib/three.module.js';
import { Input } from './core/Input.js';
import { Audio } from './core/Audio.js';
import { PostFX } from './core/PostFX.js';
import { Net } from './net/Net.js';
import { Game } from './game/Game.js';
import { loadArt } from './art/Art.js';
import { loadProfile, saveProfile, loadWorld, wipeWorld } from './game/State.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
window.__log = (m) => {
  (window.__logs ||= []).push(m); console.log(m);
  const L = $('loading');
  if (L && !L.classList.contains('gone') && /^(ERR|REJ)/.test(m)) (window.__shotReady = true), L.insertAdjacentHTML('beforeend', '<div class="lerr">' + String(m).replace(/</g, '&lt;').slice(0, 600) + '</div>');
  const E = $('errlog'); if (E && /^(ERR|REJ|UPDATE|ART)/.test(m)) { E.style.display = 'block'; E.textContent += m + '\n'; }
};
addEventListener('error', e => window.__log('ERR ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
addEventListener('unhandledrejection', e => window.__log('REJ ' + (e.reason?.stack || e.reason)));

async function boot() {
  const step = t => { $('loadtxt').textContent = t; return new Promise(r => setTimeout(r, 20)); };
  try { await Promise.race([document.fonts.load('40px "Rajdhani"'), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* */ }
  await step('Waking the city...');
  await loadArt();
  const canvas = $('game');
  const profile = loadProfile();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(profile.fov || 72, innerWidth / innerHeight, 0.05, 2600);
  scene.add(camera);
  const post = new PostFX(renderer);
  if (params.has('nopost')) post.enabled = false;
  const input = new Input(canvas);
  input.sensitivity = profile.sens; input.invertY = profile.invert; input.requireLock = true;
  const audio = new Audio(); audio.setVolume(profile.vol, profile.music);
  const net = new Net();
  const game = new Game({ renderer, scene, camera, input, audio, net, profile, post });
  const applyQuality = (q) => {
    const pr = Math.min(devicePixelRatio, q === 'high' ? 1.5 : q === 'medium' ? 1 : 0.8);
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
    post.scale = q === 'low' ? 0.8 : 1; post.setSize(innerWidth, innerHeight);
    game.player.spot.shadow.mapSize.set(q === 'low' ? 512 : 1024, q === 'low' ? 512 : 1024);
    if (game.player.spot.shadow.map) { game.player.spot.shadow.map.dispose(); game.player.spot.shadow.map = null; }
  };
  game.applyQuality = applyQuality; applyQuality(profile.quality);
  await step('Raising the towers...');
  game.buildWorld();
  game.wireNet();
  window.__game = game;
  input.canLock = () => game.phase === 'play' && !game.ui.modal && !game.chatOpen;
  input.onLockChange = (locked) => { if (!locked && game.phase === 'play' && !game.ui.modal && !game.chatOpen) game.ui.open('pause'); };
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  addEventListener('beforeunload', () => { if (game.isHost && game.phase === 'play') game.saveNow(); });

  /* ---------------- title ---------------- */
  $('tname').value = profile.name;
  const save = loadWorld();
  if (!save) $('bcont').style.display = 'none'; else $('bnew').classList.remove('big');
  const keep = () => { profile.name = ($('tname').value || 'Survivor').replace(/[<>]/g, '').slice(0, 16); saveProfile(profile); audio.unlock(); };
  const go = (W) => { keep(); $('title').classList.add('gone'); game.begin(W); input.lock(); };
  $('bcont').onclick = () => go(loadWorld());
  $('bnew').onclick = () => { if (save && !confirm('Start again from the beginning? Your saved game will be lost.')) return; wipeWorld(); go(null); };
  $('bhost').onclick = async () => {
    keep(); $('tmsg').textContent = 'Opening a room...';
    try { const code = await net.host({ name: profile.name, look: profile.look, key: profile.key }); go(loadWorld()); game.hud.toast('ROOM CODE: ' + code + ' - friends press JOIN on the title screen.'); }
    catch (e) { $('tmsg').textContent = e.message; }
  };
  $('bjoin').onclick = async () => {
    keep(); $('tmsg').textContent = 'Connecting...';
    try { const d = await net.join($('tcode').value, { name: profile.name, look: profile.look, key: profile.key }); game.me = d.id; $('title').classList.add('gone'); game.begin(d.save ? { ...d.save, inv: null } : null); input.lock(); }
    catch (e) { $('tmsg').textContent = e.message; }
  };
  $('tcode').addEventListener('keydown', e => { if (e.key === 'Enter') $('bjoin').click(); });
  // chat
  const chat = $('chatbox');
  addEventListener('keydown', e => {
    if (game.phase !== 'play') return;
    if (e.key === 'Enter' && !game.chatOpen && net.isOnline && !game.ui.modal) { game.chatOpen = true; chat.style.display = 'block'; chat.focus(); input.unlock(); e.preventDefault(); }
    else if (e.key === 'Enter' && game.chatOpen) { const t = chat.value.trim().slice(0, 120); chat.value = ''; chat.style.display = 'none'; game.chatOpen = false; if (t) game.emit({ k: 'chat', name: profile.name, t }); input.lock(); }
    else if (e.key === 'Escape' && game.chatOpen) { chat.style.display = 'none'; game.chatOpen = false; }
  });

  // test hooks
  if (params.has('play') || params.has('shot') || params.has('script') || params.has('skip')) {
    $('title').classList.add('gone');
    if (!params.has('keep')) wipeWorld();
    game.begin(params.has('keep') ? loadWorld() : null);
  }
  $('loading').classList.add('gone');
  if (params.has('shot') || params.has('script')) {
    const T = await import('./debug/Tests.js');
    try { if (params.has('shot')) await T.shot(game, params.get('shot'), params); else T.run(game, params.get('script')); }
    catch (e) { window.__log('UPDATE test failed: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 5).join(' | ')); }
  }

  let last = performance.now();
  const overlay = { scene: game.view.scene, camera: game.view.cam };
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { if (!game.paused) game.update(dt * (game.timeScale ?? 1)); } catch (e) { if (!game._errN || game._errN < 6) { game._errN = (game._errN || 0) + 1; window.__log('UPDATE ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')); } }
    if (!game.noRender || now - (game._lastDraw || 0) > 1000) { overlay.camera.fov = 60; post.render(scene, camera, dt, game.phase === 'play' ? overlay : null); game._lastDraw = now; }
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__tick = (dt) => { game.update(dt); input.endFrame(); };
  window.__render = () => post.render(scene, camera, 0.016, overlay);
}
boot();
