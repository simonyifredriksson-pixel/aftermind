/* State.js - the profile (name, look, settings) and the world save, in localStorage. */
const PK = 'aftermind.profile.v1', WK = 'aftermind.world.v1';
const safe = f => { try { return f(); } catch (e) { return null; } };

export function loadProfile() {
  const p = safe(() => JSON.parse(localStorage.getItem(PK))) || {};
  return {
    name: p.name || 'Survivor', look: p.look | 0, key: p.key || Math.random().toString(36).slice(2, 12),
    sens: p.sens ?? 1, invert: !!p.invert, vol: p.vol ?? 0.8, music: p.music ?? 0.6, quality: p.quality || 'high', fov: p.fov ?? 72, subs: p.subs !== false,
  };
}
export function saveProfile(p) { safe(() => localStorage.setItem(PK, JSON.stringify(p))); }
export function loadWorld() { return safe(() => JSON.parse(localStorage.getItem(WK))); }
export function saveWorld(w) {
  if (safe(() => { localStorage.setItem(WK, JSON.stringify(w)); return true; })) return;
  // too big (photos): drop the thumbnails and try again
  w.photos = (w.photos || []).map(p => ({ ...p, thumb: null }));
  safe(() => localStorage.setItem(WK, JSON.stringify(w)));
}
export function wipeWorld() { safe(() => localStorage.removeItem(WK)); }
